import { Injectable, Logger } from '@nestjs/common';
import { QUEUE_NAME, WORKER_HEARTBEAT_PREFIX, heartbeatAgeSeconds, heartbeatIsFresh, parseHeartbeat, type WorkerHeartbeat } from '@adelaide-sphere/domain';
import { SCHEDULED_TASKS, scheduledTaskStaleAfterMinutes } from '@adelaide-sphere/domain';
import { ScheduledRunOutcome } from '@adelaide-sphere/database';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';

export interface WorkerLiveness {
  /** True only when at least one worker has checked in recently. */
  healthy: boolean;
  /** What an operator should read when it is not: the four states are different problems. */
  detail: string;
  workers: { instanceId: string; version: string; startedAt: string; lastBeatAt: string; ageSeconds: number; queues: string[]; processed: number; failed: number }[];
  oldestHeartbeatAgeSeconds: number | null;
  /** Tasks the product's correctness depends on that have gone quiet. */
  scheduler: { healthy: boolean; detail: string; stale: { code: string; label: string; lastSuccessAt: string | null; staleAfterMinutes: number }[] };
}

/**
 * Reads worker heartbeats (post-audit remediation, SRS MON 001, QMON 005).
 *
 * Redis being healthy and the queue existing say nothing about whether anything
 * is consuming it — the exact gap that let a worker die at start-up unnoticed
 * (audit F-01). This distinguishes: Redis unreachable, no worker at all, a
 * worker that is alive but has stopped finishing work, and a healthy fleet.
 */
@Injectable()
export class WorkerLivenessService {
  private readonly logger = new Logger(WorkerLivenessService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly database: DatabaseService,
  ) {}

  /**
   * A worker can be connected and still not be running the schedule — the
   * repeatable jobs are registered separately from the queue connection. So the
   * evidence for "the scheduler is running" is completed runs, not a socket.
   */
  private async schedulerHealth(): Promise<WorkerLiveness['scheduler']> {
    const required = SCHEDULED_TASKS.filter((task) => task.requiredForCorrectness);
    try {
      const db = await this.database.client();
      const [states, runs] = await Promise.all([
        db.scheduledTaskState.findMany({ where: { taskCode: { in: required.map((task) => task.code) } } }),
        // The registry is six tasks, so one row per task is a bounded read.
        Promise.all(
          required.map(async (task) => ({
            taskCode: task.code,
            finishedAt: (await db.scheduledTaskRun.findFirst({ where: { taskCode: task.code, outcome: ScheduledRunOutcome.succeeded }, orderBy: { finishedAt: 'desc' }, select: { finishedAt: true } }))?.finishedAt ?? null,
          })),
        ),
      ]);
      const disabled = new Set(states.filter((state) => !state.enabled).map((state) => state.taskCode));
      const lastSuccess = new Map(runs.map((row) => [row.taskCode, row.finishedAt]));
      const now = Date.now();
      const stale = required
        .filter((task) => !disabled.has(task.code))
        .map((task) => ({ task, last: lastSuccess.get(task.code) ?? null, staleAfterMinutes: scheduledTaskStaleAfterMinutes(task) }))
        .filter(({ last, staleAfterMinutes }) => last === null || now - last.getTime() > staleAfterMinutes * 60_000)
        .map(({ task, last, staleAfterMinutes }) => ({ code: task.code, label: task.label, lastSuccessAt: last?.toISOString() ?? null, staleAfterMinutes }));
      return {
        healthy: stale.length === 0,
        detail:
          stale.length === 0
            ? 'Every task the product depends on has succeeded within its expected window.'
            : `${stale.length} task${stale.length === 1 ? ' has' : 's have'} not succeeded within the expected window. Scheduled publication and retention may have stopped.`,
        stale,
      };
    } catch {
      return { healthy: false, detail: 'Scheduler history is unavailable, so nothing can be said about whether tasks are running.', stale: [] };
    }
  }

  async liveness(): Promise<WorkerLiveness> {
    let beats: WorkerHeartbeat[] = [];
    try {
      await this.redis.ensureConnected();
      const keyPrefix = (this.redis.client.options.keyPrefix as string | undefined) ?? '';
      const pattern = `${keyPrefix}${WORKER_HEARTBEAT_PREFIX}*`;
      const keys: string[] = [];
      let cursor = '0';
      do {
        // Bounded scan: a heartbeat set is tiny, and an unbounded loop over a
        // shared Redis is not something a status endpoint should ever do.
        const [next, batch] = await this.redis.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        keys.push(...batch.map((key) => (keyPrefix && key.startsWith(keyPrefix) ? key.slice(keyPrefix.length) : key)));
      } while (cursor !== '0' && keys.length < 100);

      const values = keys.length > 0 ? await this.redis.client.mget(...keys) : [];
      beats = values.map((value) => parseHeartbeat(value)).filter((beat): beat is WorkerHeartbeat => beat !== null);
    } catch (error) {
      this.logger.warn(`worker liveness unavailable (${(error as { code?: string })?.code ?? 'error'})`);
      return {
        healthy: false,
        detail: 'Redis is unreachable, so worker liveness is unknown. Nothing can be said about whether jobs are being processed.',
        workers: [],
        oldestHeartbeatAgeSeconds: null,
        scheduler: await this.schedulerHealth(),
      };
    }

    const scheduler = await this.schedulerHealth();
    const fresh = beats.filter((beat) => heartbeatIsFresh(beat));
    const workers = beats
      .map((beat) => ({ ...beat, ageSeconds: heartbeatAgeSeconds(beat) }))
      .sort((a, b) => a.ageSeconds - b.ageSeconds);

    if (fresh.length === 0) {
      return {
        healthy: false,
        detail:
          beats.length === 0
            ? `No worker has checked in. Nothing is consuming ${QUEUE_NAME}: enquiries are stored but not delivered, uploads are not processed and scheduled tasks are not running.`
            : 'Every worker heartbeat has expired. A worker process was running and has stopped.',
        workers,
        oldestHeartbeatAgeSeconds: workers.at(-1)?.ageSeconds ?? null,
        scheduler,
      };
    }
    return {
      healthy: scheduler.healthy,
      detail: scheduler.healthy
        ? `${fresh.length} worker${fresh.length === 1 ? '' : 's'} checked in within the heartbeat window.`
        : `${fresh.length} worker${fresh.length === 1 ? ' is' : 's are'} alive, but ${scheduler.detail.charAt(0).toLowerCase()}${scheduler.detail.slice(1)}`,
      workers,
      oldestHeartbeatAgeSeconds: workers.at(-1)?.ageSeconds ?? null,
      scheduler,
    };
  }
}
