import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { AI_OPERATION_JOB, CACHE_INVALIDATE_JOB, ENQUIRY_EMAIL_JOB, MEDIA_PROCESS_JOB } from '@adelaide-sphere/domain';
import { EVENT_TYPES, OutboxService } from './outbox.service.js';
import { QueuePort } from './queue.port.js';

const POLL_INTERVAL_MS = 2_000;

/** Which queue job consumes each event type; unlisted types have no consumer yet. */
const JOB_FOR_EVENT: Record<string, string | undefined> = {
  [EVENT_TYPES.enquiryAccepted]: ENQUIRY_EMAIL_JOB,
  [EVENT_TYPES.mediaUploaded]: MEDIA_PROCESS_JOB,
  [EVENT_TYPES.cacheInvalidate]: CACHE_INVALIDATE_JOB,
  [EVENT_TYPES.aiOperationReady]: AI_OPERATION_JOB,
};
const BATCH_SIZE = 25;

/**
 * Moves committed outbox events onto the queue (SRS EVT 002). Enqueue failures
 * leave the row pending, so a Redis outage delays delivery instead of losing an
 * accepted enquiry. The job id is the event id, so a repeat enqueue is ignored
 * by the queue and consumers can deduplicate.
 */
@Injectable()
export class OutboxDispatcher implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly outbox: OutboxService,
    private readonly queue: QueuePort,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return; // tests drive `runOnce` explicitly
    this.timer = setInterval(() => void this.runOnce(), POLL_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One dispatch pass; returns how many events were enqueued. */
  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let dispatched = 0;
    try {
      const events = await this.outbox.claim(BATCH_SIZE);
      for (const event of events) {
        try {
          const jobName = JOB_FOR_EVENT[event.type];
          if (!jobName) {
            // Events with no consumer yet (e.g. post publication, pending cache
            // invalidation) are marked dispatched rather than retried forever.
            await this.outbox.markDispatched(event.id);
            continue;
          }
          await this.queue.enqueue({ id: event.id, name: jobName, data: { eventId: event.id, ...(event.payload as Record<string, unknown>) } });
          await this.outbox.markDispatched(event.id);
          dispatched += 1;
        } catch (error) {
          await this.outbox.markAttemptFailed(event, error);
        }
      }
    } catch (error) {
      this.logger.warn(`outbox pass failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
    return dispatched;
  }
}
