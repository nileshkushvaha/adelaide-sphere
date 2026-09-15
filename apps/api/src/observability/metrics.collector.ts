import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { SCHEDULED_TASKS } from '@adelaide-sphere/domain';
import { ScheduledRunOutcome } from '@adelaide-sphere/database';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';
import { QueueMonitorService } from '../queues/queue-monitor.service.js';
import { WorkerLivenessService } from './worker-liveness.service.js';
import {
  dependencyFailures,
  dependencyUp,
  oldestUndeliveredEnquirySeconds,
  mediaStuckInQuarantine,
  queueDepth,
  queueOldestWaitingSeconds,
  queueWorkers,
  scheduledTaskLastSuccessSeconds,
  workerHeartbeatAgeSeconds,
  workerHeartbeats,
} from './metrics.registry.js';

/** Nothing is refreshed more often than this, however often /metrics is called. */
const MIN_REFRESH_MS = 5_000;
/**
 * A scrape must answer even when a dependency is down — drill D5 found this the
 * hard way: with Redis unreachable the BullMQ read never returned and /metrics
 * hung, so the one endpoint that was supposed to report the outage went silent
 * with it. Each read is bounded; a read that times out leaves its gauges at
 * their last value and the dependency gauge already says the truth.
 */
const COLLECT_TIMEOUT_MS = 4_000;

async function bounded(work: Promise<void>, onTimeout: () => void): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), COLLECT_TIMEOUT_MS);
  });
  try {
    // The slow work is abandoned, not awaited: it holds no lock and its result
    // would be stale by the time it arrived.
    if ((await Promise.race([work.then(() => 'done' as const), timeout])) === 'timeout') onTimeout();
  } catch {
    onTimeout();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fills the gauges that describe state rather than events (post-audit
 * remediation, MON 001).
 *
 * Counters are incremented where the thing happens; a gauge has to be read.
 * Reading happens on scrape, behind a short cache so that pointing two scrapers
 * at the API cannot turn observability into load on Redis and MySQL.
 */
@Injectable()
export class MetricsCollector implements OnModuleInit {
  private readonly logger = new Logger(MetricsCollector.name);
  private lastRefresh = 0;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly queues: QueueMonitorService,
    private readonly liveness: WorkerLivenessService,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    // prom-client calls this on every scrape of the registry.
    for (const gauge of [queueDepth as { collect?: () => Promise<void> }, workerHeartbeats, dependencyUp]) {
      (gauge as { collect?: () => Promise<void> }).collect = () => this.refresh();
    }
  }

  private refresh(): Promise<void> {
    const now = Date.now();
    if (this.inFlight) return this.inFlight;
    if (now - this.lastRefresh < MIN_REFRESH_MS) return Promise.resolve();
    this.inFlight = this.collect().finally(() => {
      this.lastRefresh = Date.now();
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async collect(): Promise<void> {
    await Promise.all([
      bounded(this.collectDependencies(), () => {
        // A ping that does not come back within the budget is a dependency that
        // is down as far as any caller is concerned.
        dependencyUp.set({ dependency: 'database' }, 0);
        dependencyUp.set({ dependency: 'redis' }, 0);
      }),
      bounded(this.collectQueues(), () => this.logger.warn('queue metrics timed out')),
      bounded(this.collectWorkers(), () => {
        workerHeartbeats.set(0);
        this.logger.warn('worker metrics timed out');
      }),
      bounded(this.collectEnquiries(), () => this.logger.warn('enquiry metrics timed out')),
      bounded(this.collectMedia(), () => this.logger.warn('media metrics timed out')),
    ]);
  }

  private async collectDependencies(): Promise<void> {
    const [database, redis] = await Promise.all([this.database.ping(), this.redis.ping()]);
    dependencyUp.set({ dependency: 'database' }, database.ok ? 1 : 0);
    dependencyUp.set({ dependency: 'redis' }, redis.ok ? 1 : 0);
    // The reason is a closed set from the ping result, never a driver message.
    if (!database.ok) dependencyFailures.inc({ dependency: 'database', reason: database.reason });
    if (!redis.ok) dependencyFailures.inc({ dependency: 'redis', reason: redis.reason });
  }

  private async collectQueues(): Promise<void> {
    try {
      for (const queue of await this.queues.overview()) {
        for (const [state, count] of Object.entries(queue.counts ?? {})) queueDepth.set({ queue: queue.name, state }, count);
        // Nothing waiting means no age: the queue's own waiting list can lag the
        // counts by a scrape (observed in drill D9), and a stale age would keep
        // an alert warm after the backlog had drained.
        const waiting = queue.counts?.waiting ?? 0;
        queueOldestWaitingSeconds.set({ queue: queue.name }, waiting === 0 ? 0 : (queue.oldestWaitingSeconds ?? 0));
        queueWorkers.set({ queue: queue.name }, queue.workers.count);
      }
    } catch {
      // A queue that cannot be read is already visible as dependency_up 0.
      this.logger.warn('queue metrics unavailable');
    }
  }

  private async collectWorkers(): Promise<void> {
    const liveness = await this.liveness.liveness();
    workerHeartbeats.set(liveness.workers.filter((worker) => worker.ageSeconds * 1_000 < 45_000).length);
    workerHeartbeatAgeSeconds.set(liveness.workers[0]?.ageSeconds ?? Number.MAX_SAFE_INTEGER);

    try {
      const db = await this.database.client();
      const now = Date.now();
      for (const task of SCHEDULED_TASKS) {
        const last = await db.scheduledTaskRun.findFirst({ where: { taskCode: task.code, outcome: ScheduledRunOutcome.succeeded }, orderBy: { finishedAt: 'desc' }, select: { finishedAt: true } });
        // The label is a registry code, so the set of series is fixed.
        scheduledTaskLastSuccessSeconds.set({ task: task.code }, last?.finishedAt ? Math.round((now - last.finishedAt.getTime()) / 1_000) : Number.MAX_SAFE_INTEGER);
      }
    } catch {
      this.logger.warn('scheduled task metrics unavailable');
    }
  }

  /**
   * The age of the oldest enquiry that has been accepted but not delivered.
   * This is the number that would have risen while F-01 was unnoticed: it says
   * a visitor is waiting, which no queue depth on its own does.
   */
  private async collectEnquiries(): Promise<void> {
    try {
      const db = await this.database.client();
      const oldest = await db.enquiry.findFirst({
        where: { deliveryStatus: { in: ['queued', 'retrying'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      oldestUndeliveredEnquirySeconds.set(oldest ? Math.round((Date.now() - oldest.createdAt.getTime()) / 1_000) : 0);
    } catch {
      this.logger.warn('enquiry metrics unavailable');
    }
  }

  private async collectMedia(): Promise<void> {
    try {
      const db = await this.database.client();
      const cutoff = new Date(Date.now() - 60 * 60 * 1_000);
      mediaStuckInQuarantine.set(await db.mediaAsset.count({ where: { status: 'quarantined', createdAt: { lt: cutoff } } }));
    } catch {
      this.logger.warn('media metrics unavailable');
    }
  }
}
