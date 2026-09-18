import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { QUEUE_NAME, assertQueueJobId, defaultJobOptions, queueForJob, redisConnectionFromUrl } from '@adelaide-sphere/domain';
import { QueuePort, type QueuedJob } from './queue.port.js';

/**
 * BullMQ implementation of the queue boundary (SRS ARC 003). Each job goes to
 * its queue (`queueForJob`): AI operations to their own bounded queue (AI
 * plan §E, 1F), everything else to the main queue.
 */
@Injectable()
export class BullmqQueue extends QueuePort implements OnModuleDestroy {
  readonly name = QUEUE_NAME;
  private readonly logger = new Logger(BullmqQueue.name);
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {
    super();
  }

  private client(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: redisConnectionFromUrl(this.config.get('REDIS_URL', { infer: true })), defaultJobOptions });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async enqueue(job: QueuedJob): Promise<void> {
    // One gate for every job this API dispatches. BullMQ's own refusal happens
    // inside the library at start-up or under load; this one happens at the
    // call site, in tests, with the offending id in the message (audit F-01).
    assertQueueJobId(job.id, `enqueue ${job.name}`);
    await this.client(queueForJob(job.name)).add(job.name, job.data, { jobId: job.id });
  }

  async onModuleDestroy(): Promise<void> {
    for (const [name, queue] of this.queues) {
      try {
        await queue.close();
      } catch (error) {
        this.logger.warn(`queue ${name} close failed: ${(error as Error).message}`);
      }
    }
    this.queues.clear();
  }
}
