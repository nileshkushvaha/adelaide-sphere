/**
 * Worker configuration. It shares the API's variables (same deployment secrets)
 * but validates only what the worker itself needs, and refuses to run in
 * production with a development transport (SRS ENQ 005, SEC 004).
 */
import { logLevelFromEnv } from './log.js';
import { isMailTransport, mailTransportProblem, productionMailTransportProblem, resendConfigFromEnv, smtpConfigFromEnv, type MailTransport, type ResendConfig, type SmtpConfig } from '@adelaide-sphere/mail';

export interface WorkerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string;
  redisUrl: string;
  fieldEncryptionKey: string;
  mailTransport: MailTransport;
  /** Present only when mailTransport is smtp; validated by @adelaide-sphere/mail. */
  smtp: SmtpConfig | null;
  /** Present only when mailTransport is resend; validated by @adelaide-sphere/mail. */
  resend: ResendConfig | null;
  mailFromAddress: string | undefined;
  siteEnquiryRecipient: string | undefined;
  concurrency: number;
  /** The separate AI queue's consumer (AI plan §E, 1F): small and bounded on its own. */
  aiConcurrency: number;
  /** Metrics/health port; null leaves the worker without any HTTP surface. */
  metricsPort: number | null;
  /** Shared secret for the metrics endpoint; undefined means loopback-only. */
  metricsToken: string | undefined;
  /** Interface the metrics server binds to. Loopback unless deliberately widened. */
  metricsBind: string;
  /**
   * Directory holding the scheduled backup's state files. Null leaves the backup
   * gauges unregistered, which reads as "not measured" rather than "fine".
   */
  backupStateDir: string | null;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /**
   * Server-side text provider credentials (AI Content 1D). Absent means the
   * provider is not configured: generation fails before any request is made.
   * Never logged; read only from the environment or a secret store.
   */
  aiText: { openaiApiKey: string | null };
  /** Server-side image-only provider credentials (provider amendment 01). Absent means that provider cannot be called. */
  aiImage: { xaiApiKey: string | null; geminiApiKey: string | null };
  /** Web tier purge endpoint; null when no cached HTML tier is deployed (SRS CACHE 002). */
  revalidate: { url: string; token: string } | null;
  media: {
    endpoint: string | undefined;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    quarantineBucket: string;
    publicBucket: string;
  };
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const problems: string[] = [];
  const required = (key: string): string => {
    const value = (env[key] ?? '').trim();
    if (!value) problems.push(`  - ${key}: required`);
    return value;
  };
  const nodeEnv = (env.NODE_ENV ?? 'development') as WorkerConfig['nodeEnv'];
  if (!['development', 'test', 'production'].includes(nodeEnv)) problems.push('  - NODE_ENV: must be development, test or production');
  const databaseUrl = required('DATABASE_URL');
  const redisUrl = required('REDIS_URL');
  const fieldEncryptionKey = required('FIELD_ENCRYPTION_KEY');
  // The list is the API's list, imported rather than repeated: a worker that
  // refuses the transport the API accepted cannot deliver the enquiries the API
  // accepted (SRS ENQ 003/005, audit F-02).
  const rawTransport = env.MAIL_TRANSPORT ?? 'none';
  if (!isMailTransport(rawTransport)) problems.push(`  - ${mailTransportProblem()}`);
  const mailTransport: MailTransport = isMailTransport(rawTransport) ? rawTransport : 'none';
  const mailFromAddress = (env.MAIL_FROM_ADDRESS ?? '').trim() || undefined;
  let smtp: SmtpConfig | null = null;
  if (mailTransport === 'smtp') {
    const result = smtpConfigFromEnv(env, { production: nodeEnv === 'production' });
    problems.push(...result.problems.map((line) => `  - ${line}`));
    if (!mailFromAddress) problems.push('  - MAIL_FROM_ADDRESS: required when MAIL_TRANSPORT=smtp (verified sender, SRS ENQ 005)');
    smtp = result.config;
  }
  let resend: ResendConfig | null = null;
  if (mailTransport === 'resend') {
    const result = resendConfigFromEnv(env, { production: nodeEnv === 'production' });
    problems.push(...result.problems.map((line) => `  - ${line}`));
    resend = result.config;
  }
  const revalidateUrl = (env.WEB_REVALIDATE_URL ?? '').trim();
  const revalidateToken = (env.WEB_REVALIDATE_TOKEN ?? '').trim();
  if ((revalidateUrl === '') !== (revalidateToken === '')) {
    problems.push('  - WEB_REVALIDATE_URL / WEB_REVALIDATE_TOKEN: set both or neither');
  }
  if (revalidateUrl !== '' && !/^https?:\/\//.test(revalidateUrl)) problems.push('  - WEB_REVALIDATE_URL: must be an absolute http(s) URL');
  const concurrency = Number(env.WORKER_CONCURRENCY ?? '2');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) problems.push('  - WORKER_CONCURRENCY: must be an integer 1-20');
  const aiConcurrency = Number(env.AI_WORKER_CONCURRENCY ?? '1');
  if (!Number.isInteger(aiConcurrency) || aiConcurrency < 1 || aiConcurrency > 4) problems.push('  - AI_WORKER_CONCURRENCY: must be an integer 1-4');
  const metricsPortRaw = (env.WORKER_METRICS_PORT ?? '').trim();
  const metricsPort = metricsPortRaw === '' ? null : Number(metricsPortRaw);
  if (metricsPort !== null && (!Number.isInteger(metricsPort) || metricsPort < 1 || metricsPort > 65_535)) problems.push('  - WORKER_METRICS_PORT: must be a port number');
  const metricsToken = (env.METRICS_TOKEN ?? '').trim() || undefined;
  if (metricsToken !== undefined && metricsToken.length < 32) problems.push('  - METRICS_TOKEN: must be at least 32 characters');
  const backupStateDir = (env.BACKUP_STATE_DIR ?? '').trim() || null;
  if (backupStateDir !== null && !backupStateDir.startsWith('/')) {
    problems.push('  - BACKUP_STATE_DIR: must be an absolute path (the worker and the backup job run from different directories)');
  }
  const metricsBind = (env.WORKER_METRICS_BIND ?? '127.0.0.1').trim();
  if (!/^[0-9a-fA-F.:]+$/.test(metricsBind)) problems.push('  - WORKER_METRICS_BIND: must be an IP address (127.0.0.1 to keep it loopback-only)');
  if (metricsBind !== '127.0.0.1' && metricsToken === undefined) {
    // Widening the bind without a token would publish the endpoint to whatever
    // can reach the interface, which is exactly what must not happen.
    problems.push('  - WORKER_METRICS_BIND: binding beyond loopback requires METRICS_TOKEN');
  }
  if (!(env.MEDIA_S3_ACCESS_KEY_ID ?? '').trim() || !(env.MEDIA_S3_SECRET_ACCESS_KEY ?? '').trim()) {
    problems.push('  - MEDIA_S3_ACCESS_KEY_ID / MEDIA_S3_SECRET_ACCESS_KEY: required (the worker publishes media variants)');
  }
  if (nodeEnv === 'production') {
    if (revalidateUrl === '') problems.push('  - WEB_REVALIDATE_URL: required in production so cache purges reach the web tier (SRS CACHE 002)');
    if (revalidateUrl !== '' && !revalidateUrl.startsWith('https://')) problems.push('  - WEB_REVALIDATE_URL: must use https in production');
    if (mailTransport === 'console') problems.push('  - MAIL_TRANSPORT: the console transport cannot be used in production');
    if (mailTransport === 'none') problems.push(`  - ${productionMailTransportProblem()} — accepted enquiries cannot be delivered otherwise (SRS ENQ 005)`);
    if (!mailFromAddress) problems.push('  - MAIL_FROM_ADDRESS: required in production (verified sender)');
  }
  if (problems.length > 0) throw new Error(`Invalid worker configuration:\n${problems.join('\n')}`);
  return {
    nodeEnv,
    databaseUrl,
    redisUrl,
    fieldEncryptionKey,
    mailTransport,
    smtp,
    resend,
    mailFromAddress,
    siteEnquiryRecipient: (env.SITE_ENQUIRY_RECIPIENT ?? '').trim() || undefined,
    concurrency,
    aiConcurrency,
    metricsPort,
    metricsToken,
    metricsBind,
    backupStateDir,
    logLevel: logLevelFromEnv(env.LOG_LEVEL, nodeEnv === 'production' ? 'info' : 'debug'),
    aiText: { openaiApiKey: (env.OPENAI_API_KEY ?? '').trim() || null },
    aiImage: { xaiApiKey: (env.XAI_API_KEY ?? '').trim() || null, geminiApiKey: (env.GEMINI_API_KEY ?? '').trim() || null },
    revalidate: revalidateUrl !== '' && revalidateToken !== '' ? { url: revalidateUrl, token: revalidateToken } : null,
    media: {
      endpoint: (env.MEDIA_S3_ENDPOINT ?? '').trim() || undefined,
      region: (env.MEDIA_S3_REGION ?? 'us-east-1').trim(),
      accessKeyId: (env.MEDIA_S3_ACCESS_KEY_ID ?? '').trim(),
      secretAccessKey: (env.MEDIA_S3_SECRET_ACCESS_KEY ?? '').trim(),
      quarantineBucket: (env.MEDIA_QUARANTINE_BUCKET ?? 'adelaide-sphere-quarantine').trim(),
      publicBucket: (env.MEDIA_PUBLIC_BUCKET ?? 'adelaide-sphere-media').trim(),
    },
  };
}
