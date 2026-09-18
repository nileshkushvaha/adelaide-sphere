# worker — background job runtime

Standalone BullMQ consumer (SRS ARC 003). It reads jobs from Redis, uses the same MySQL database and field-encryption key as the API, and is deployed and restarted independently. Its only HTTP surface is an optional metrics and health endpoint (see Supervision).

## The worker is not optional

Nothing else consumes the queue. While no worker is running:

* accepted enquiries are stored but **never delivered** — the visitor is told their message is on its way, and it is not;
* uploaded images stay unprocessed, so they cannot be used on a page;
* scheduled articles do not publish and retention never runs;
* cache purges are not applied, so the public site can serve stale pages.

None of that raises an error anywhere. It simply does not happen, which is why the worker must be supervised and monitored rather than started by hand — this is exactly the failure the audit recorded as F-01.

## Supervision (required in production)

Run the worker as a **separately supervised process**, not as a child of the API and not in the same container.

* **Restart policy: always.** Compose `restart: unless-stopped`; Kubernetes a `Deployment` with the default `Always`; systemd `Restart=always` with `RestartSec=5`. A configuration error makes the worker exit at start-up on purpose, so pair the restart policy with the start-up alert below — an endless restart loop must page someone rather than look healthy.
* **At least one replica, and a plan for two.** Every job is idempotent by its job id, so a second replica is safe and removes the single point of failure. `WORKER_CONCURRENCY` (1–20, default 2) sets how many jobs one replica runs at once.
* **Health**: set `WORKER_METRICS_PORT` and use `GET /health` as the liveness probe. It answers from the process itself, so it fails when the process is gone or wedged.
* **Liveness beyond the process**: each replica writes a heartbeat to Redis every 15 seconds under `as:worker:heartbeat:<instance>`, with a 45-second expiry. The API reads those keys, so "is anything consuming the queue?" is answered by the system rather than by looking at a process list. `GET /api/v1/admin/system/queues/workers` returns the summary, and the Queue Monitor shows it.
* **Graceful shutdown**: `SIGTERM` stops taking new work, finishes what is in flight, closes the metrics server, removes the heartbeat and disconnects. Give the supervisor at least 30 seconds before it sends `SIGKILL`.
* **Alerts**: C4 (no worker heartbeat for 3 minutes) is the one that must page a human. W3 (heartbeats fresh but nothing completing) catches a wedged consumer, and W5 catches uploads that never finish processing. The rules and their thresholds are in `docs/operations/alert-response.md`.

`docs/operations/monitoring.md` holds the metrics, and `docs/operations/failure-drills.md` records the drills that prove each signal fires.

## Jobs

| Job | Source | Behaviour |
| --- | --- | --- |
| `enquiry.email` | the API's transactional outbox (`outbox_events`) | Re-reads the enquiry and its listing, suppresses when the listing is no longer published or has lost its recipient, otherwise sends through the mailer port and records the delivery state |

Retries follow the shared policy in `@adelaide-sphere/domain`: five attempts with exponential backoff and jitter, failures left visible. The job id is the outbox event id, so a repeated enqueue is ignored and the consumer tolerates repeats (SRS EVT 002).

## Delivery states

`queued → retrying → providerAccepted` on success; `failed` when a permanent error occurs or the attempts are exhausted; `suppressed` when routing is no longer valid. "Accepted by the provider" is never presented as proof of delivery (SRS ENQ 004).

## Configuration

Reads the same variables as the API (`DATABASE_URL`, `REDIS_URL`, `FIELD_ENCRYPTION_KEY`, `MAIL_TRANSPORT`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`, `MAIL_FROM_NAME`, `MAIL_FROM_ADDRESS`, `SITE_ENQUIRY_RECIPIENT`, `MEDIA_S3_*`, `WORKER_CONCURRENCY`, `WEB_REVALIDATE_*`). Startup validation lists every problem at once, names variables but never values, and **refuses to run in production** unless `MAIL_TRANSPORT=smtp` with an authenticated, TLS-protected, non-loopback relay and a verified sender.

Transports: `console` prints the message (development only); `smtp` sends through `@adelaide-sphere/mail`, the provider-independent adapter that any relay chosen under decision D03 plugs into. Locally `smtp` points at the Compose Mailpit catcher (inbox at http://127.0.0.1:8025). One attempt per job: the adapter classifies the failure and the queue decides whether to retry. The `Message-ID` is the enquiry's stable id, so a retry after an ambiguous timeout carries the same identifier. Error text stored on the enquiry is redacted of addresses before it is thrown.

## Commands

`pnpm dev:worker` (watch) · `pnpm --filter worker build` · `pnpm --filter worker test` · `pnpm --filter worker lint` · `pnpm --filter worker typecheck`.

Message construction and validation (header injection, address shape, subject and body bounds) live in `@adelaide-sphere/mail`; mail composition and queue policy live in `packages/domain` so the API and the worker apply the same rules (SRS ARC 002).

## Scheduled article publication

`content.publish-scheduled` (every minute) is the **only** scheduled publisher since 14 Sep 2026 (SRS 1.10 BLOG 002); the API no longer runs a timer. For each due article it checks the publication requirements again (`@adelaide-sphere/domain/posts`). A qualifying article is published under its version guard, with `firstPublishedAt`, an audit entry (`blog.post.publish`, system actor) and a `cache.invalidate` event. One that no longer qualifies — for example its author was deactivated after scheduling — returns to draft with `posts.publishFailure` set and a `blog.post.schedule_blocked` audit entry; the editor, the article list and the dashboard show the reason. Without a running worker, scheduled articles wait, and the dashboard's "Scheduled articles past their time" says so.

## AI Content Phase 1B

The article seam shared by the API and the worker lives in `@adelaide-sphere/database/editorial` (sanitiser, media references, revisions, material hash, the AI publication policy used by both the publish/schedule commands and the scheduled publisher). Durable AI work (control epoch, leased and fenced operations, recovery, applying a generation run to its one canonical article) lives in `@adelaide-sphere/database/automation`. Both subpaths are backend-only. The additive migration `20260918150000_ai_content_editorial_foundation` has been applied only to the isolated test database. See the [Phase 1B completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1b-completion.md).

## AI Content Phase 1C

Free public research (SSRF-safe retrieval in the worker, evidence, typed claims, freshness), Needs Fact Review, local novelty admission with the inventory epoch, feed discovery and the research source registry. Shared rules are in `@adelaide-sphere/domain` (`ai-novelty`, `ai-research`); the database seam is in `@adelaide-sphere/database/automation`. Migration `20260918170000_ai_content_research` has been applied only to the isolated test database. See the [Phase 1C completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1c-completion.md).
