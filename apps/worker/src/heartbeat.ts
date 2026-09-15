import type { Redis } from 'ioredis';
import { WORKER_HEARTBEAT_INTERVAL_MS, WORKER_HEARTBEAT_TTL_SECONDS, workerHeartbeatKey, type WorkerHeartbeat as HeartbeatPayload } from '@adelaide-sphere/domain';

/**
 * Publishes this worker's liveness (post-audit remediation, SRS MON 001).
 *
 * The audit's F-01 was a worker that exited at start-up and was never missed.
 * A heartbeat makes the difference between "nothing to do" and "nothing
 * running" observable: the key expires on its own, so a dead worker disappears
 * without anything having to notice it first, and each replica writes its own.
 *
 * Nothing sensitive is written — an instance id, a version, timestamps, the
 * queues consumed and two counters. Not the host, not the environment, not one
 * byte of configuration.
 */
export class WorkerHeartbeatPublisher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private processed = 0;
  private failed = 0;
  private readonly startedAt = new Date().toISOString();

  constructor(
    private readonly redis: Redis,
    private readonly instanceId: string,
    private readonly version: string,
    private readonly queues: string[],
    private readonly log: (line: string) => void = () => undefined,
  ) {}

  recordCompleted(): void {
    this.processed += 1;
  }

  recordFailed(): void {
    this.failed += 1;
  }

  /** Writes immediately, then on a timer, so a just-started worker is visible at once. */
  async start(): Promise<void> {
    await this.beat();
    this.timer = setInterval(() => {
      void this.beat().catch((error: unknown) => this.log(`[heartbeat] write failed: ${(error as Error).message}`));
    }, WORKER_HEARTBEAT_INTERVAL_MS);
    this.timer.unref?.();
  }

  async beat(): Promise<void> {
    const payload: HeartbeatPayload = {
      instanceId: this.instanceId,
      version: this.version,
      startedAt: this.startedAt,
      lastBeatAt: new Date().toISOString(),
      queues: this.queues,
      processed: this.processed,
      failed: this.failed,
    };
    await this.redis.set(workerHeartbeatKey(this.instanceId), JSON.stringify(payload), 'EX', WORKER_HEARTBEAT_TTL_SECONDS);
  }

  /**
   * Removes the key on a clean shutdown, so a planned stop reads as gone
   * immediately rather than as a worker that died three intervals ago.
   */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.redis.del(workerHeartbeatKey(this.instanceId)).catch(() => undefined);
  }
}
