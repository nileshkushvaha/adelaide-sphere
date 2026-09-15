import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { QUEUE_NAME, assertQueueJobId, defaultJobOptions, redisConnectionFromUrl } from '@adelaide-sphere/domain';
import { QueuePort, type QueuedJob } from './queue.port.js';

/** BullMQ implementation of the queue boundary (SRS ARC 003). */
@Injectable()
export class BullmqQueue extends QueuePort implements OnModuleDestroy {
  readonly name = QUEUE_NAME;
  private readonly logger = new Logger(BullmqQueue.name);
  private queue: Queue | undefined;

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {
    super();
  }

  private client(): Queue {
    this.queue ??= new Queue(QUEUE_NAME, { connection: redisConnectionFromUrl(this.config.get('REDIS_URL', { infer: true })), defaultJobOptions });
    return this.queue;
  }

  async enqueue(job: QueuedJob): Promise<void> {
    // One gate for every job this API dispatches. BullMQ's own refusal happens
    // inside the library at start-up or under load; this one happens at the
    // call site, in tests, with the offending id in the message (audit F-01).
    assertQueueJobId(job.id, `enqueue ${job.name}`);
    await this.client().add(job.name, job.data, { jobId: job.id });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.queue) return;
    try {
      await this.queue.close();
    } catch (error) {
      this.logger.warn(`queue close failed: ${(error as Error).message}`);
    }
    this.queue = undefined;
  }
}
