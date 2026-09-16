# Monitoring and observability

Status: added 2026-09-08 as post-audit remediation (audit findings F-01, F-04, F-09).
Scope: what the system emits, where it emits it, and what is deliberately not emitted.

The audit's first finding was a worker that refused every scheduled job at start-up
because of an invalid job id. Nothing reported it. The queue was reachable, Redis
was healthy and the admin screens were green; enquiries simply stopped being
delivered. Everything below exists to make that class of failure visible without a
user complaining.

## Principles

1. **Provider-neutral.** Metrics are OpenMetrics text from `prom-client` 15. Any
   Prometheus-compatible scraper reads them directly, and an OpenTelemetry
   collector can scrape the same endpoint with its Prometheus receiver. Nothing
   in the code names a vendor.
2. **No personal data in telemetry.** No recipient address, message body, reset
   token, session id, administrator identity or visitor-supplied path is ever a
   metric label or a log field. Identifiers that appear in logs are internal ones
   (job id, enquiry id, request id) that mean nothing outside this system.
3. **Bounded label sets.** Every label is drawn from a fixed vocabulary: an HTTP
   route *pattern*, a job name from the registry, a scheduled-task code, a state,
   an outcome. A label whose values a request could invent is a memory leak in
   the scraper and a data leak in the store.
4. **Established packages.** `prom-client` for metrics; the platform's own logging
   for the rest. No bespoke monitoring framework.

## What emits what

| Process | Endpoint | Default binding | Registry |
| --- | --- | --- | --- |
| API (`apps/api`) | `GET /metrics` | loopback only | `apps/api/src/observability/metrics.registry.ts` |
| Worker (`apps/worker`) | `GET /metrics`, `GET /health` | loopback only, and only when `WORKER_METRICS_PORT` is set | `apps/worker/src/observability.ts` |

Both endpoints are outside the product API: `/metrics` on the API is Express-level
middleware registered before the `/api/v1` prefix guard, so it is not in the
OpenAPI document, not under the admin guard chain, and not reachable through any
public route.

### Protection

Two ways in, both closed by default:

* a request arriving on the loopback interface — a scraper sidecar on the same
  host;
* `Authorization: Bearer <METRICS_TOKEN>`, when `METRICS_TOKEN` (≥ 32 characters)
  is configured — the only way in for a scraper that is not on the loopback
  interface, which includes a Prometheus container talking to a separate
  application container.

The worker's bind address is a separate, explicit decision: `WORKER_METRICS_BIND`
defaults to `127.0.0.1`, and binding wider is **refused** unless `METRICS_TOKEN`
is set, so widening the bind alone can never expose the endpoint
(`apps/worker/src/config.spec.ts`).

Anything else receives **404**, not 401: an unauthorised caller does not learn
that the endpoint exists. The token comparison is constant-time.

`apps/api/src/observability/metrics.endpoint.spec.ts` asserts the refusals and
asserts that the exposition contains no `@`, no `password`, `token`, `secret`,
`Bearer ` or `session=` in any sample line.

## Metrics

### API — requests and dependencies

| Metric | Type | Labels | Reads as |
| --- | --- | --- | --- |
| `as_http_requests_total` | counter | `method`, `route`, `status_class`, `status` | request volume and error rate |
| `as_http_request_duration_seconds` | histogram | `method`, `route`, `status_class` | latency distribution (p50/p95/p99) |
| `as_request_rejections_total` | counter | `kind` | throttling, CSRF origin refusals, oversized bodies, 401/403 |
| `as_dependency_up` | gauge | `dependency` | MySQL and Redis reachability |
| `as_dependency_failures_total` | counter | `dependency`, `reason` | dependency errors by cause |
| `as_auth_events_total` | counter | `event` | sign-in success/failure, lockout, reset requested |
| `as_authorization_rejections_total` | counter | `permission` | which permission is refusing requests |

`route` is the pattern Nest matched (`/api/v1/businesses/:slug`), never the URL. A
request that matched no route is labelled `unmatched`.

### Queues, workers and scheduled tasks

| Metric | Type | Labels | Reads as |
| --- | --- | --- | --- |
| `as_queue_jobs` | gauge | `queue`, `state` | depth by state |
| `as_queue_oldest_waiting_seconds` | gauge | `queue` | how far behind the queue is |
| `as_queue_workers` | gauge | `queue` | worker connections Redis reports (an estimate) |
| `as_worker_heartbeats` | gauge | — | replicas whose heartbeat has not expired |
| `as_worker_heartbeat_age_seconds` | gauge | — | age of the most recent heartbeat |
| `as_scheduled_task_last_success_age_seconds` | gauge | `task` | silence per task |
| `as_scheduled_task_runs_total` | counter | `task`, `outcome` | run outcomes |
| `as_worker_up` | gauge | — | worker process alive (worker registry) |
| `as_worker_jobs_total` | counter | `job`, `outcome` | jobs finished per replica |
| `as_worker_job_duration_seconds` | histogram | `job` | job runtime |

Gauges are read on scrape by `apps/api/src/observability/metrics.collector.ts`,
behind a five-second cache so that two scrapers cannot turn observability into
load on MySQL and Redis.

### Enquiries, email, media

`as_enquiry_events_total`, `as_email_deliveries_total`,
`as_enquiry_oldest_undelivered_seconds`, `as_media_events_total`,
`as_media_processing_duration_seconds`, `as_media_stuck_in_quarantine`.

Labels are `kind`/`outcome`/`provider`/`event` — closed vocabularies. **No
recipient address, subject or body is ever a label.**

## Worker liveness

Redis answering, and the queue existing, say nothing about whether anything is
consuming it. Each worker replica writes a heartbeat to
`as:worker:heartbeat:<instanceId>` every 15 seconds with a 45-second expiry:

```json
{"instanceId":"20671-bbe0ac6e","version":"dev","startedAt":"…","lastBeatAt":"…",
 "queues":["adelaide-sphere"],"processed":42,"failed":1}
```

Nothing else. No host name, no environment values, no configuration, no secrets.
One key per replica, so multiple replicas are supported and each is visible
separately. A replica that stops writing disappears within 45 seconds; a replica
that shuts down cleanly deletes its own key.

`WorkerLivenessService` (`apps/api/src/observability/worker-liveness.service.ts`)
turns those keys into the five states an operator has to tell apart:

| State | How it is detected | What it means |
| --- | --- | --- |
| Redis unreachable | scan throws | liveness unknown; nothing can be said |
| No worker ever checked in | no heartbeat keys | nothing is consuming the queue |
| Every heartbeat expired | keys existed, all stale | a worker was running and has stopped |
| Alive but not finishing work | heartbeats fresh, `as_worker_jobs_total` flat while depth rises | a worker is stuck |
| Alive but the schedule has stopped | heartbeats fresh, a required task past its window | repeatable jobs are not being registered — the F-01 shape |

The last one is derived from run history: a task that is `requiredForCorrectness`
and has not *succeeded* within `scheduledTaskStaleAfterMinutes` (two missed
windows plus fifteen minutes) is reported as stale, by name.

Exposed to operators at `GET /api/v1/admin/system/queues/workers`
(`system.queues.view`, default-deny like every admin route) and rendered as the
**Workers** card on the Queue Monitor screen.

## Logging

The worker logs one JSON object per line in production
(`apps/worker/src/log.ts`), and a readable line in development:

```json
{"time":"…","level":"error","service":"worker","message":"job failed",
 "jobId":"enquiry.email-cmts4od…","jobName":"enquiry.email","attempt":2,"error":"…"}
```

Correlation fields are `jobId`, `jobName`, `runnerId`, `taskCode` and `enquiryId`.
`LOG_LEVEL` (`debug|info|warn|error`) controls verbosity; production defaults to
`info`. Start-up failure is logged as JSON before exit, so a crash loop is
readable in a collector.

The API keeps Nest's logger and the request-id middleware; every error envelope
carries `requestId`, which is the correlation key between a user report and the
logs.

Redaction: `packages/mail/src/errors.ts` strips recipient addresses **and**
provider credentials (`re_…`, `whsec_…`, `Bearer …`, `sk_live_…`) from provider
error text before it reaches a log, an admin screen or a stored failure reason.

## Shutdown

On `SIGTERM`/`SIGINT` the worker sets `as_worker_up` to 0, closes the queue
consumer, closes the metrics server, removes its heartbeat, closes the scheduler
and mailer, and disconnects the database — in that order, so a planned shutdown
is not read as a crash and the last scrape is served before the port closes.

## Configuration

| Variable | Where | Default | Meaning |
| --- | --- | --- | --- |
| `METRICS_TOKEN` | api, worker | unset | ≥ 32 chars; unset means loopback-only |
| `WORKER_METRICS_BIND` | worker | `127.0.0.1` | wider binds require `METRICS_TOKEN` |
| `WORKER_METRICS_PORT` | worker | unset | worker metrics/health port; unset means no HTTP surface |
| `LOG_LEVEL` | worker | `info` in production | `debug｜info｜warn｜error` |
| `APP_VERSION` | worker | `dev` | reported in the heartbeat |

## Deployment verification (2026-09-09)

Verified on a production-shaped local stack: an API on 4011 with `METRICS_TOKEN`
set, two worker replicas on 9464/9465, and Prometheus **in its own container**
reading the token from a mounted file.

| Check | Evidence |
| --- | --- |
| API metrics, loopback, no token | `200`, 131 `as_*` series |
| API metrics from the host's LAN address, no token | `404` |
| API metrics with the token (loopback and LAN) | `200` |
| API metrics with a wrong token | `404` |
| Worker metrics, no token | `404`; with token `200`; `/health` `200` |
| Prometheus targets | api `up`, worker 9464 `up`, worker 9465 `up` |
| Two replicas | two heartbeat keys, one per instance id |
| Stale heartbeat expiry | key TTL 45 s; `as_worker_heartbeats` falls to 0 |
| Restart recovery | heartbeat and gauges return on the first scrape |
| Public exposure | `/metrics` through the public edge returns the site's
  not-found page — the API's endpoint is not routed publicly at all |
| Published ports | every container port is published to `127.0.0.1` only |

**Token handling.** The token lives in `infrastructure/monitoring/metrics-token`
(mode 0600, git-ignored, mounted read-only into Prometheus). It is never inlined
in `prometheus.yml`, which is tracked. Rotate by replacing the file and restarting
both the application processes and Prometheus.

**Container networking.** A metrics endpoint bound to container loopback is
unreachable from a separate Prometheus container. The supported arrangement is:
bind the metrics server to the container's internal interface
(`WORKER_METRICS_BIND=0.0.0.0` **with** a token), attach both containers to the
same internal network, and **do not publish the metrics port on the host**. The
product API's port is published only to the reverse proxy; `/metrics` rides on it
but is refused without the token from any non-loopback source.

## Known gaps (as of 2026-09-09)

* **The API reports no build or version.** The worker publishes `APP_VERSION` in
  its heartbeat and the Workers card shows it; the API has no equivalent, so
  "which build is serving?" cannot be answered from a probe. Adding it to
  `/api/v1/health` is small and deliberate work, not done here.
* **Three alert conditions have no series behind them yet**: object storage
  reachability, backup success and restore-drill age (C9, C10, I4 in
  `alert-response.md`). Each names what would have to emit it.
* **Nothing pages a human.** The rules exist and are validated; a destination and
  a responder are a client decision (D07).

## Deliberately not collected

* No metric or log field contains a recipient address, an enquiry message, a
  password reset token, a session identifier or an administrator's identity.
* No metric is labelled by business slug, article slug, media key or any other
  value a visitor controls.
* `/metrics` is not in the OpenAPI document and is not linked from the admin UI.
