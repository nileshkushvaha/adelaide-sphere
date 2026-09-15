import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { DatabaseClient } from '@adelaide-sphere/database';
import { QUEUE_NAME, SCHEDULED_TASKS, SCHEDULED_TASK_JOB, assertQueueJobId, redisConnectionFromUrl, scheduledTaskJobId, scheduledTaskLockKey } from '@adelaide-sphere/domain';
import { runScheduledTask, type ScheduledTaskJobData } from './scheduled-tasks.js';
import { scheduledTaskRuns } from './observability.js';

/** How often the worker re-reads which optional tasks are switched on (TASK 006). */
const SYNC_INTERVAL_MS = 60_000;

/**
 * Owns the schedules and executes the tasks (SRS 1.2 TASK 001–006).
 *
 * The schedules live here, in the worker, and are derived from the code
 * registry — the API can ask for a run and can switch an optional task off, but
 * it cannot create a schedule, and no cron expression ever crosses the wire.
 * The worker re-reads the enable/disable state on a timer, so a change in the
 * admin takes effect without a deployment.
 */
export class ScheduleRunner {
  private readonly queue: Queue;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly db: DatabaseClient,
    redisUrl: string,
    private readonly runnerId: string,
    private readonly log: (line: string) => void,
    private readonly storage?: { delete(bucket: 'quarantine' | 'public', key: string): Promise<void> },
  ) {
    this.queue = new Queue(QUEUE_NAME, { connection: redisConnectionFromUrl(redisUrl) });
  }

  /** Registers the schedules and starts keeping them in step with the admin. */
  async start(): Promise<void> {
    await this.sync();
    // A task whose policy is to run on recovery is dispatched once at start-up,
    // because work that fell due while the process was down is late rather than
    // cancelled (TASK 004).
    for (const task of SCHEDULED_TASKS) {
      if (task.missedRunPolicy !== 'run-on-recovery') continue;
      const jobId = scheduledTaskJobId('recovery', task.code, String(Date.now()));
      assertQueueJobId(jobId, `recovery dispatch for ${task.code}`);
      await this.queue.add(SCHEDULED_TASK_JOB, { taskCode: task.code, trigger: 'scheduled' }, { jobId });
    }
    this.timer = setInterval(() => void this.sync().catch((error: unknown) => this.log(`[schedule] sync failed: ${(error as Error).message}`)), SYNC_INTERVAL_MS);
    this.timer.unref?.();
  }

  /** Adds a scheduler for every enabled task and removes it for a disabled one. */
  async sync(): Promise<void> {
    const states = await this.db.scheduledTaskState.findMany();
    const disabled = new Set(states.filter((state) => !state.enabled).map((state) => state.taskCode));
    for (const task of SCHEDULED_TASKS) {
      // A task the registry requires stays scheduled whatever a row says; the
      // API refuses to write such a row, and this is the second lock on it.
      const enabled = task.requiredForCorrectness || !disabled.has(task.code);
      if (enabled) {
        await this.queue.upsertJobScheduler(
          task.code,
          { pattern: task.cron, tz: task.timezone },
          { name: SCHEDULED_TASK_JOB, data: { taskCode: task.code, trigger: 'scheduled' } },
        );
      } else {
        await this.queue.removeJobScheduler(task.code);
      }
    }
  }

  /** Executes one task job under its lock, recording the outcome. */
  async run(data: ScheduledTaskJobData): Promise<string> {
    // BullMQ 6 keeps the raw client on its Redis backend, so the lock reuses
    // that connection instead of opening one of its own. The published type is
    // narrower than the ioredis client actually returned, which is why the
    // SET NX PX form needs the concrete type.
    const client = (await this.queue.backend.client) as unknown as Redis;
    const { outcome, detail } = await runScheduledTask(data, {
      db: this.db,
      now: new Date(),
      queue: this.queue,
      storage: this.storage,
      runnerId: this.runnerId,
      log: this.log,
      acquireLock: async (key, ttlMs) => (await client.set(key, this.runnerId, 'PX', ttlMs, 'NX')) === 'OK',
      releaseLock: async (key) => {
        // Only the holder clears it, so a slow run cannot release the lock a
        // later run has since taken.
        if ((await client.get(key)) === this.runnerId) await client.del(key);
      },
    });
    scheduledTaskRuns.inc({ task: data.taskCode ?? 'unknown', outcome });
    return `${outcome}: ${detail}`;
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.queue.close();
  }
}

export { scheduledTaskLockKey };
