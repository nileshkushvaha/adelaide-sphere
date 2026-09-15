import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type Job } from 'bullmq';
import { QUEUE_NAME, redisConnectionFromUrl, redactFailureSummary } from '@adelaide-sphere/domain';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import {
  CLEANABLE_STATES,
  LISTABLE_STATES,
  MAX_BULK_ITEMS,
  MAX_CLEAN_JOBS,
  MAX_JOBS_PER_PAGE,
  MIN_CLEAN_AGE_HOURS,
  QUEUES,
  REMOVABLE_STATES,
  RETRYABLE_STATES,
  queueDescriptor,
  redactJobData,
  type CleanableState,
  type ListableState,
  type QueueDescriptor,
} from './queue-registry.js';

export interface QueueSummary {
  name: string;
  label: string;
  purpose: string;
  pausable: boolean;
  pauseConsequence: string;
  paused: boolean;
  counts: Record<'waiting' | 'active' | 'delayed' | 'completed' | 'failed', number> | null;
  /** Age in seconds of the oldest job still waiting, or null when nothing is waiting. */
  oldestWaitingSeconds: number | null;
  workers: { count: number; estimated: boolean; detail: string };
  available: boolean;
  detail: string;
  jobs: { name: string; label: string; purpose: string }[];
}

export interface QueueJobView {
  id: string;
  name: string;
  label: string;
  state: ListableState;
  attemptsMade: number;
  createdAt: string;
  processedAt: string | null;
  finishedAt: string | null;
  /** Present for failed jobs; the first line of the error, never a stack trace. */
  failedReason: string | null;
  progress: number | null;
  data: { fields: { label: string; value: string }[]; unrecognised: boolean };
  canRetry: boolean;
  canRemove: boolean;
}

export interface BulkOutcome {
  requested: number;
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

const unavailable = (error: unknown) =>
  new HttpException(
    { code: 'QUEUE_UNAVAILABLE', message: `The queue is unavailable, so nothing was changed (${(error as { code?: string })?.code ?? 'error'}).` },
    HttpStatus.SERVICE_UNAVAILABLE,
  );

/**
 * Queue monitor (SRS 1.2 QMON 001–005).
 *
 * Everything is read through BullMQ's supported interfaces — no Redis keys, no
 * `eval`, no store internals — and every action names a registered queue and an
 * existing job in a state where that action is meaningful. There is no route
 * that creates a job, edits a payload or replays arbitrary work: the only ways
 * to make work here are the application's own paths.
 *
 * Correct with several worker replicas: counts and worker information come from
 * the queue itself rather than from anything this process remembers, and each
 * bulk item is applied independently so a job another replica has already taken
 * fails on its own without hiding the rest.
 */
@Injectable()
export class QueueMonitorService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueMonitorService.name);
  private readonly queues = new Map<string, Queue>();

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly audit: AuditService,
  ) {}

  private client(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: redisConnectionFromUrl(this.config.get('REDIS_URL', { infer: true })) });
      this.queues.set(name, queue);
    }
    return queue;
  }

  private descriptorOrThrow(name: string): QueueDescriptor {
    const descriptor = queueDescriptor(name);
    if (!descriptor) throw new NotFoundException({ code: 'UNKNOWN_QUEUE', message: 'No such queue' });
    return descriptor;
  }

  async onModuleDestroy(): Promise<void> {
    for (const queue of this.queues.values()) {
      try {
        await queue.close();
      } catch (error) {
        this.logger.warn(`queue close failed: ${(error as Error).message}`);
      }
    }
    this.queues.clear();
  }

  // ---- reading ---------------------------------------------------------------

  async overview(): Promise<QueueSummary[]> {
    return Promise.all(QUEUES.map((descriptor) => this.summary(descriptor)));
  }

  private async summary(descriptor: QueueDescriptor): Promise<QueueSummary> {
    const base = {
      name: descriptor.name,
      label: descriptor.label,
      purpose: descriptor.purpose,
      pausable: descriptor.pausable,
      pauseConsequence: descriptor.pauseConsequence,
      jobs: descriptor.jobs.map((job) => ({ name: job.name, label: job.label, purpose: job.purpose })),
    };
    try {
      const queue = this.client(descriptor.name);
      const [counts, paused, workers, oldest] = await Promise.all([
        queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed'),
        queue.isPaused(),
        queue.getWorkers(),
        queue.getJobs(['waiting'], 0, 0, true),
      ]);
      const oldestWaiting = oldest[0]?.timestamp ?? null;
      return {
        ...base,
        paused,
        counts: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
        },
        oldestWaitingSeconds: oldestWaiting === null ? null : Math.max(0, Math.round((Date.now() - oldestWaiting) / 1000)),
        // BullMQ reports the clients Redis currently sees as workers. It is a
        // live reading rather than a guarantee, so it is labelled an estimate
        // (QMON 005) — a worker that has just died can still be listed until
        // Redis notices.
        workers: {
          count: workers.length,
          estimated: true,
          detail: workers.length === 0 ? 'No worker is connected, so nothing is being processed.' : `${workers.length} worker connection${workers.length === 1 ? '' : 's'} reported by Redis.`,
        },
        available: true,
        detail: 'Connected',
      };
    } catch (error) {
      this.logger.warn(`queue status unavailable for ${descriptor.name} (${(error as { code?: string })?.code ?? 'error'})`);
      return {
        ...base,
        paused: false,
        counts: null,
        oldestWaitingSeconds: null,
        workers: { count: 0, estimated: true, detail: 'Unknown while the queue is unreachable.' },
        available: false,
        detail: 'The queue is unreachable. Accepted work is still stored and will be dispatched when it returns.',
      };
    }
  }

  /** One page of jobs in one state, redacted (QMON 001/002). */
  async jobs(name: string, state: ListableState, page: number, pageSize: number): Promise<{ rows: QueueJobView[]; total: number }> {
    const descriptor = this.descriptorOrThrow(name);
    const size = Math.min(Math.max(1, pageSize), MAX_JOBS_PER_PAGE);
    const start = (Math.max(1, page) - 1) * size;
    try {
      const queue = this.client(name);
      const [jobs, counts] = await Promise.all([queue.getJobs([state], start, start + size - 1, false), queue.getJobCounts(state)]);
      return { rows: jobs.filter((job): job is Job => Boolean(job)).map((job) => this.view(descriptor, job, state)), total: counts[state] ?? 0 };
    } catch (error) {
      throw unavailable(error);
    }
  }

  private view(descriptor: QueueDescriptor, job: Job, state: ListableState): QueueJobView {
    const label = descriptor.jobs.find((entry) => entry.name === job.name)?.label ?? job.name;
    return {
      id: String(job.id),
      name: job.name,
      label,
      state,
      attemptsMade: job.attemptsMade,
      createdAt: new Date(job.timestamp).toISOString(),
      processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      // Redacted, not merely truncated: the first line of a transport or driver
      // error still carries the recipient's address, a host and port, or a path
      // on the server, and the monitor tells the reader it shows none of those
      // (QMON 002, MON 001).
      failedReason: job.failedReason ? redactFailureSummary(job.failedReason) : null,
      progress: typeof job.progress === 'number' ? Math.max(0, Math.min(100, Math.round(job.progress))) : null,
      data: redactJobData(descriptor, job.name, job.data),
      canRetry: RETRYABLE_STATES.includes(state),
      canRemove: REMOVABLE_STATES.includes(state),
    };
  }

  // ---- actions ---------------------------------------------------------------

  /** Retries an explicit, bounded set of failed jobs; each independently (QMON 003/004). */
  async retry(name: string, ids: string[], actor: AdminPrincipal, ctx: RequestContext): Promise<BulkOutcome> {
    return this.applyToEach(name, ids, 'system.queue.retry', actor, ctx, async (job) => {
      const state = await job.getState();
      if (state !== 'failed') throw new Error(`This job is ${state}, so it cannot be retried`);
      await job.retry();
    });
  }

  /** Removes an explicit, bounded set of jobs that have not been completed. */
  async remove(name: string, ids: string[], actor: AdminPrincipal, ctx: RequestContext): Promise<BulkOutcome> {
    return this.applyToEach(name, ids, 'system.queue.cancel', actor, ctx, async (job) => {
      const state = await job.getState();
      if (state === 'active') throw new Error('This job is running; wait for it to finish or fail');
      if (!REMOVABLE_STATES.includes(state as ListableState)) throw new Error(`This job is ${state}, so it cannot be removed`);
      await job.remove();
    });
  }

  private async applyToEach(
    name: string,
    ids: string[],
    action: string,
    actor: AdminPrincipal,
    ctx: RequestContext,
    apply: (job: Job) => Promise<void>,
  ): Promise<BulkOutcome> {
    this.descriptorOrThrow(name);
    const unique = [...new Set(ids.map((id) => String(id).trim()).filter((id) => id.length > 0))];
    if (unique.length === 0 || unique.length > MAX_BULK_ITEMS) {
      throw new HttpException(
        { code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { jobIds: [`Select between 1 and ${MAX_BULK_ITEMS} jobs`] } },
        HttpStatus.BAD_REQUEST,
      );
    }

    const queue = this.client(name);
    const outcome: BulkOutcome = { requested: unique.length, succeeded: [], failed: [] };
    for (const id of unique) {
      try {
        const job = await queue.getJob(id);
        // Another replica may have taken or removed it between the listing and
        // this call; that is one item's outcome, not the batch's.
        if (!job) throw new Error('This job no longer exists');
        await apply(job);
        outcome.succeeded.push(id);
      } catch (error) {
        outcome.failed.push({ id, reason: redactFailureSummary((error as Error).message, 200) });
      }
    }

    await this.audit.record({
      action,
      actorAdminId: actor.id,
      targetType: 'queue',
      targetId: name,
      metadata: { requested: outcome.requested, succeeded: outcome.succeeded.length, failed: outcome.failed.length },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return outcome;
  }

  /** Pause or resume a queue whose registry entry permits it (QMON 003). */
  async setPaused(name: string, paused: boolean, actor: AdminPrincipal, ctx: RequestContext): Promise<{ paused: boolean }> {
    const descriptor = this.descriptorOrThrow(name);
    if (!descriptor.pausable) throw new HttpException({ code: 'QUEUE_NOT_PAUSABLE', message: 'This queue cannot be paused' }, HttpStatus.CONFLICT);
    try {
      const queue = this.client(name);
      if (paused) await queue.pause();
      else await queue.resume();
    } catch (error) {
      throw unavailable(error);
    }
    await this.audit.record({
      action: paused ? 'system.queue.pause' : 'system.queue.resume',
      actorAdminId: actor.id,
      targetType: 'queue',
      targetId: name,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return { paused };
  }

  /**
   * Removes finished job metadata older than a stated age (QMON 003). Bounded
   * in both directions: never younger than a day, never more than a fixed
   * number in one call, and never a state that still has work to do.
   */
  async clean(name: string, state: CleanableState, olderThanHours: number, actor: AdminPrincipal, ctx: RequestContext): Promise<{ removed: number }> {
    this.descriptorOrThrow(name);
    if (!CLEANABLE_STATES.includes(state)) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { state: ['Only completed or failed job metadata can be cleaned'] } }, HttpStatus.BAD_REQUEST);
    }
    if (!Number.isFinite(olderThanHours) || olderThanHours < MIN_CLEAN_AGE_HOURS) {
      throw new HttpException(
        { code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { olderThanHours: [`Must be at least ${MIN_CLEAN_AGE_HOURS} hours, so a recent failure cannot be erased`] } },
        HttpStatus.BAD_REQUEST,
      );
    }

    let removed = 0;
    try {
      const ids = await this.client(name).clean(olderThanHours * 3_600_000, MAX_CLEAN_JOBS, state);
      removed = ids.length;
    } catch (error) {
      throw unavailable(error);
    }
    await this.audit.record({
      action: 'system.queue.clean',
      actorAdminId: actor.id,
      targetType: 'queue',
      targetId: name,
      metadata: { state, olderThanHours, removed },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return { removed };
  }
}

export { LISTABLE_STATES, QUEUE_NAME };
