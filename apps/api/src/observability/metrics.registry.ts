import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * The metric registry (post-audit remediation, SRS MON 001/002).
 *
 * Provider-neutral on purpose: `prom-client` produces the OpenMetrics text a
 * Prometheus-compatible scraper reads, and an OTLP collector can scrape the
 * same endpoint, so choosing a vendor later is a configuration change rather
 * than a code change.
 *
 * **Label discipline.** Every label on every metric here is drawn from a closed
 * set — a route *pattern*, an HTTP method, a status class, a queue name, a task
 * code, an outcome. Nothing carries an email address, an administrator id, a
 * token, a recipient, a message, a raw URL or any other value a request can
 * choose. That is not tidiness: an unbounded label is both a memory leak in the
 * scraper and a way for personal data to reach a system that is not designed to
 * hold it (SRS PRIV 001).
 */
export const metricsRegistry = new Registry();

metricsRegistry.setDefaultLabels({ service: 'api' });
collectDefaultMetrics({ register: metricsRegistry, prefix: 'ms_' });

/** Buckets in seconds, chosen around the NFR 003 targets rather than by default. */
const LATENCY_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export const httpRequests = new Counter({
  name: 'ms_http_requests_total',
  help: 'HTTP requests handled, by route pattern, method and status class.',
  labelNames: ['method', 'route', 'status_class', 'status'] as const,
  registers: [metricsRegistry],
});

export const httpDuration = new Histogram({
  name: 'ms_http_request_duration_seconds',
  help: 'HTTP request duration by route pattern.',
  labelNames: ['method', 'route', 'status_class'] as const,
  buckets: LATENCY_BUCKETS,
  registers: [metricsRegistry],
});

/** Refusals worth alerting on, separated from ordinary 4xx. */
export const requestRejections = new Counter({
  name: 'ms_request_rejections_total',
  help: 'Requests refused by a protective control, by kind.',
  labelNames: ['kind'] as const, // throttled | csrf_origin | unauthorized | forbidden | captcha_unavailable | payload_too_large
  registers: [metricsRegistry],
});

export const dependencyUp = new Gauge({
  name: 'ms_dependency_up',
  help: '1 when a dependency answered its last check, 0 when it did not.',
  labelNames: ['dependency'] as const, // database | redis | object_storage | mail_provider
  registers: [metricsRegistry],
});

export const dependencyFailures = new Counter({
  name: 'ms_dependency_failures_total',
  help: 'Failed calls to a dependency, by dependency and a bounded reason.',
  labelNames: ['dependency', 'reason'] as const,
  registers: [metricsRegistry],
});

// ---- authentication and authorization (SRS AUTH 001–003, RBAC 010, SEC 003) --

export const authEvents = new Counter({
  name: 'ms_auth_events_total',
  help: 'Authentication outcomes. No administrator, address or token is ever a label.',
  labelNames: ['event'] as const, // login_success | login_failure | lockout | password_reset_requested | session_revoked | session_revoke_failed | totp_failure
  registers: [metricsRegistry],
});

export const authorizationRejections = new Counter({
  name: 'ms_authorization_rejections_total',
  help: 'Requests refused by the permissions guard, by the permission that was missing.',
  labelNames: ['permission'] as const,
  registers: [metricsRegistry],
});

// ---- enquiries and email (SRS ENQ 003–006, MAIL 004–008) ---------------------

export const enquiryEvents = new Counter({
  name: 'ms_enquiry_events_total',
  help: 'Enquiry lifecycle counts. Never a recipient, a visitor address or a message.',
  labelNames: ['event'] as const, // accepted | enqueued | delivered | failed | suppressed
  registers: [metricsRegistry],
});

export const emailDeliveries = new Counter({
  name: 'ms_email_deliveries_total',
  help: 'Transactional email outcomes, by provider and a bounded outcome.',
  labelNames: ['provider', 'outcome'] as const, // queued | accepted | delivered | failed | bounced | complained | suppressed
  registers: [metricsRegistry],
});

export const oldestUndeliveredEnquirySeconds = new Gauge({
  name: 'ms_enquiry_oldest_undelivered_seconds',
  help: 'Age of the oldest accepted enquiry that has not been delivered.',
  registers: [metricsRegistry],
});

// ---- queues and scheduled tasks, read from the queue itself ------------------

export const queueDepth = new Gauge({
  name: 'ms_queue_jobs',
  help: 'Jobs in the queue by state, as the queue reports them.',
  labelNames: ['queue', 'state'] as const, // waiting | active | delayed | completed | failed | paused
  registers: [metricsRegistry],
});

export const queueOldestWaitingSeconds = new Gauge({
  name: 'ms_queue_oldest_waiting_seconds',
  help: 'Age of the oldest job still waiting.',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

export const queueWorkers = new Gauge({
  name: 'ms_queue_workers',
  help: 'Worker connections the queue reports. An estimate, as the Queue Monitor says.',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

export const workerHeartbeats = new Gauge({
  name: 'ms_worker_heartbeats',
  help: 'Worker instances whose heartbeat has not expired.',
  registers: [metricsRegistry],
});

export const workerHeartbeatAgeSeconds = new Gauge({
  name: 'ms_worker_heartbeat_age_seconds',
  help: 'Age of the most recent worker heartbeat. Rises without bound when every worker is gone.',
  registers: [metricsRegistry],
});

export const scheduledTaskLastSuccessSeconds = new Gauge({
  name: 'ms_scheduled_task_last_success_age_seconds',
  help: 'Seconds since a registered task last succeeded, by task code.',
  labelNames: ['task'] as const,
  registers: [metricsRegistry],
});

// Scheduled task runs and media processing duration are recorded by the worker,
// where those things happen: see apps/worker/src/observability.ts. Declaring
// them here as well would publish two series that are always zero, which reads
// as "nothing is failing" rather than "nothing is measured".

// ---- media (SRS MED 001–004) -------------------------------------------------

export const mediaEvents = new Counter({
  name: 'ms_media_events_total',
  help: 'Media pipeline outcomes.',
  labelNames: ['event'] as const, // upload_requested | upload_rejected | processed | processing_failed
  registers: [metricsRegistry],
});

export const mediaStuckInQuarantine = new Gauge({
  name: 'ms_media_stuck_in_quarantine',
  help: 'Assets accepted but not processed for longer than the processing window.',
  registers: [metricsRegistry],
});
