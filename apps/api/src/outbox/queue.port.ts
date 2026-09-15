import { Injectable } from '@nestjs/common';

export interface QueuedJob {
  /** Stable job id: the outbox event id, so a repeat enqueue is deduplicated by the queue (SRS EVT 002). */
  id: string;
  name: string;
  data: Record<string, unknown>;
}

/**
 * Boundary between the API and the job queue (SRS MOD 002). The API never
 * imports BullMQ directly, so tests can substitute a recording queue and the
 * worker owns the consumer side.
 */
@Injectable()
export abstract class QueuePort {
  abstract enqueue(job: QueuedJob): Promise<void>;
  abstract readonly name: string;
}
