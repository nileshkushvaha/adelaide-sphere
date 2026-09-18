import { Worker, type Job } from 'bullmq';
import { createDatabaseClient, type DatabaseClient } from '@adelaide-sphere/database';
import { loadWorkerConfig } from './config.js';
import { deliverEnquiry, markDeliveryFailed, type DeliveryJobData } from './enquiry-delivery.js';
import { ConsoleEnquiryMailer } from './mailer/console-mailer.js';
import { EnquiryMailerPort } from './mailer/mailer.port.js';
import { ResendEnquiryMailer } from './mailer/resend-mailer.js';
import { SmtpEnquiryMailer } from './mailer/smtp-mailer.js';
import { randomBytes } from 'node:crypto';
import { AI_OPERATION_JOB, AI_QUEUE_NAME, CACHE_INVALIDATE_JOB, ENQUIRY_EMAIL_JOB, MEDIA_PROCESS_JOB, QUEUE_NAME, SCHEDULED_TASK_JOB, buildEnquiryMail, redisConnectionFromUrl } from '@adelaide-sphere/domain';
import { OpenAiImageProvider } from './ai-content/openai-image-provider.js';
import type { ImageProvider } from './ai-content/image-provider.js';
import { OpenAiTextProvider } from './ai-content/openai-provider.js';
import type { TextProvider } from './ai-content/text-provider.js';
import { runAiOperation, type AiOperationJobData } from './ai-content/operations.js';
import { ScheduleRunner } from './schedule-runner.js';
import { WorkerHeartbeatPublisher } from './heartbeat.js';
import { Redis } from 'ioredis';
import type { ScheduledTaskJobData } from './scheduled-tasks.js';
import { processMediaAsset, type MediaJobData } from './media-processing.js';
import { invalidateCache, type CacheInvalidationJobData } from './cache-invalidation.js';
import { S3Storage } from './s3-storage.js';
import { createLogger } from './log.js';
import { registerBackupMetrics } from './backup-status.js';
import { jobDuration, jobsProcessed, startMetricsServer, workerRegistry, workerUp } from './observability.js';
import { decryptField, encryptField } from './field-encryption.js';

/**
 * Worker entrypoint (SRS ARC 003): an independently operable process that
 * consumes queue jobs. It shares the database and encryption key with the API
 * but exposes no HTTP surface.
 */
async function main(): Promise<void> {
  const config = loadWorkerConfig();
  const log = createLogger({ json: config.nodeEnv === 'production', level: config.logLevel });
  const db: DatabaseClient = createDatabaseClient({ url: config.databaseUrl, allowPublicKeyRetrieval: process.env.DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL === 'true' });
  // Configuration has already refused console/none in production, so the
  // fallback sender below can only ever appear in a development transport.
  const mailer: EnquiryMailerPort = config.resend
    ? new ResendEnquiryMailer(config.resend)
    : config.smtp
      ? new SmtpEnquiryMailer(config.smtp)
      : new ConsoleEnquiryMailer();
  const fromAddress = config.mailFromAddress ?? 'no-reply@adelaidesphere.local';

  const storage = new S3Storage(config.media);
  // One identity per replica, so a run record says which process did the work
  // and a lock can only be released by its holder (SRS TASK 004/005).
  const runnerId = `${process.pid}-${randomBytes(4).toString('hex')}`;
  const schedules = new ScheduleRunner(db, config.redisUrl, runnerId, (line) => log.line(line), storage);

  // Only a provider with a server-side credential exists; the key never leaves this process except to the provider.
  const textProviders: Record<string, TextProvider> = {};
  if (config.aiText.openaiApiKey) textProviders.openai = new OpenAiTextProvider(config.aiText.openaiApiKey);
  // The same server-side credential serves images; without it no image request is ever sent.
  const imageProviders: Record<string, ImageProvider> = {};
  if (config.aiText.openaiApiKey) imageProviders.openai = new OpenAiImageProvider(config.aiText.openaiApiKey);
  const aiDeps = { textProviders, imageProviders, storage };
  const worker = new Worker<DeliveryJobData & MediaJobData & CacheInvalidationJobData & ScheduledTaskJobData>(
    QUEUE_NAME,
    async (job: Job<DeliveryJobData & MediaJobData & CacheInvalidationJobData & ScheduledTaskJobData>) => {
      const started = process.hrtime.bigint();
      const finish = () => jobDuration.observe({ job: job.name }, Number(process.hrtime.bigint() - started) / 1e9);
      try {
        return await route(job);
      } finally {
        finish();
      }
    },
    { connection: redisConnectionFromUrl(config.redisUrl), concurrency: config.concurrency },
  );

  // AI operations have their own queue and a small consumer (AI plan §E, 1F): a slow provider or research
  // call never takes the capacity mail, media and cache work need. The main consumer still accepts an AI
  // job left on the main queue by an earlier release; either way the database row decides everything.
  const aiWorker = new Worker<AiOperationJobData>(
    AI_QUEUE_NAME,
    async (job: Job<AiOperationJobData>) => {
      const started = process.hrtime.bigint();
      try {
        if (job.name !== AI_OPERATION_JOB) throw new Error(`Unknown AI job ${job.name}`);
        return await runAiOperation(db, job.data, runnerId, aiDeps);
      } finally {
        jobDuration.observe({ job: job.name }, Number(process.hrtime.bigint() - started) / 1e9);
      }
    },
    { connection: redisConnectionFromUrl(config.redisUrl), concurrency: config.aiConcurrency },
  );
  aiWorker.on('completed', (job, result) => {
    jobsProcessed.inc({ job: job.name, outcome: 'completed' });
    log('info', 'job completed', { jobId: job.id, jobName: job.name, outcome: String(result) });
  });
  aiWorker.on('failed', (job, error) => {
    jobsProcessed.inc({ job: job?.name ?? 'unknown', outcome: 'failed' });
    log('error', 'job failed', { jobId: job?.id, jobName: job?.name, attempt: job?.attemptsMade ?? 0, error: error.message });
  });

  /** One job to one handler; the timing wrapper above stays out of the way. */
  async function route(job: Job<DeliveryJobData & MediaJobData & CacheInvalidationJobData & ScheduledTaskJobData>): Promise<unknown> {
    if (job.name === SCHEDULED_TASK_JOB) return schedules.run(job.data);
    if (job.name === CACHE_INVALIDATE_JOB) return invalidateCache(job.data, { target: config.revalidate });
    if (job.name === AI_OPERATION_JOB) return runAiOperation(db, job.data as AiOperationJobData, runnerId, aiDeps);
    if (job.name === MEDIA_PROCESS_JOB) {
      return processMediaAsset(job.data, {
        db,
        storage,
        randomKey: () => randomBytes(12).toString('hex'),
        onError: (_assetId, error) => log('error', 'media processing failed', { jobId: job.id, jobName: job.name, error: error instanceof Error ? error.message : String(error) }),
      });
    }
    if (job.name !== ENQUIRY_EMAIL_JOB) throw new Error(`Unknown job ${job.name}`);
    return deliverEnquiry(job.data, {
      db,
      mailer,
      decrypt: (stored, aad) => decryptField(config.fieldEncryptionKey, stored, aad),
      encrypt: (plaintext, aad) => encryptField(config.fieldEncryptionKey, plaintext, aad),
      buildMail: buildEnquiryMail,
      fromAddress,
      siteRecipient: config.siteEnquiryRecipient,
    });
  }

  worker.on('completed', (job, result) => {
    jobsProcessed.inc({ job: job.name, outcome: 'completed' });
    log('info', 'job completed', { jobId: job.id, jobName: job.name, outcome: String(result) });
  });
  worker.on('failed', (job, error) => {
    jobsProcessed.inc({ job: job?.name ?? 'unknown', outcome: 'failed' });
    log('error', 'job failed', { jobId: job?.id, jobName: job?.name, attempt: job?.attemptsMade ?? 0, error: error.message });
    // Attempts exhausted: record a visible failure so an admin can retry (SRS EVT 002).
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1) && job.data?.enquiryId) {
      markDeliveryFailed(db, job.data.enquiryId, 'Delivery failed after every retry. Check the mail provider, then retry.').catch((cause: unknown) =>
        log('error', 'could not record delivery failure', { jobId: job.id, enquiryId: job.data.enquiryId, error: cause instanceof Error ? cause.message : String(cause) }),
      );
    }
  });

  // Liveness, published for the API and the Queue Monitor to read. A worker
  // that dies stops writing and its key expires; a worker that never starts
  // never writes one at all, which is the signal audit F-01 lacked.
  // Same 'as:' namespace the API reads under, so a heartbeat written here is
  // found there. BullMQ keeps its own prefix and is unaffected.
  const heartbeatRedis = new Redis({ ...redisConnectionFromUrl(config.redisUrl), keyPrefix: 'as:' });
  const heartbeat = new WorkerHeartbeatPublisher(heartbeatRedis, runnerId, process.env.APP_VERSION ?? 'dev', [QUEUE_NAME, AI_QUEUE_NAME], (line) => log.line(line));
  await heartbeat.start();
  for (const consumer of [worker, aiWorker] as Worker[]) {
    consumer.on('completed', () => heartbeat.recordCompleted());
    consumer.on('failed', () => heartbeat.recordFailed());
  }

  await schedules.start();
  workerUp.set(1);
  // Backup freshness comes from files on disk, written by a systemd oneshot that
  // has no metrics surface of its own (SRS MON 002 alert C10).
  registerBackupMetrics(workerRegistry, config.backupStateDir);
  const metricsServer = config.metricsPort === null ? null : startMetricsServer(config.metricsPort, config.metricsToken, (line) => log.line(line), config.metricsBind);

  log('info', 'worker listening', { runnerId, jobName: `${QUEUE_NAME}, ${AI_QUEUE_NAME}`, outcome: `${mailer.describe?.() ?? mailer.transportName}, concurrency ${config.concurrency}, AI concurrency ${config.aiConcurrency}` });

  const shutdown = async (signal: string) => {
    log('info', `${signal} received, draining`, { runnerId });
    // Order matters: stop taking work, then let the last metrics be scraped and
    // the heartbeat be removed, so a shutdown is not read as a crash.
    workerUp.set(0);
    await Promise.all([worker.close(), aiWorker.close()]);
    await new Promise<void>((resolve) => (metricsServer ? metricsServer.close(() => resolve()) : resolve()));
    await heartbeat.stop();
    await heartbeatRedis.quit().catch(() => undefined);
    await schedules.close();
    mailer.close?.();
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// A promise nobody awaited, or an exception nobody caught, leaves the worker in
// an unknown state: log one structured line and exit so systemd restarts it.
const fatal = (message: string) => (error: unknown) => {
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'error', service: 'worker', message, error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exit(1);
};
process.on('unhandledRejection', fatal('unhandled promise rejection'));
process.on('uncaughtException', fatal('uncaught exception'));

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'error', service: 'worker', message: 'failed to start', error: (error as Error).message })}\n`);
  process.exit(1);
});
