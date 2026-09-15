# Operations runbook

Covers SRS OPS 001–004, BACK 001–002 and MON 001–002. It documents the
procedures the product needs before launch; the accounts, DNS, TLS certificates
and monitoring subscriptions themselves are client decisions (D01–D08) and are
not provisioned from this repository.

## 1. Environments (OPS 001)

| Environment | Purpose | Data | Access |
| --- | --- | --- | --- |
| development | Local work | Seeded fixtures | Developer machine only; Compose stack in `infrastructure/` |
| staging | Pre-release verification | Synthetic or anonymised copies, never production personal data | Access controlled; `noindex` on every page and `Disallow: /` in robots |
| production | The live site | Real data | Least-privilege credentials, separate database, bucket, queue and secrets |

Each environment has its **own** MySQL database, Redis instance, object storage
buckets and secrets. Nothing is shared between them, and no production
credential is ever used from a developer machine.

Region: prefer an Australian region for primary data. Record any cross-border
processing — email delivery, CDN edges, error tracking — in the register below
before launch.

| Provider | Purpose | Data that leaves Australia | Approved by | Date |
| --- | --- | --- | --- | --- |
| _(pending D03)_ | Transactional email | Recipient address and message body | | |
| _(pending)_ | CDN | Public page and media requests | | |
| _(pending)_ | Error tracking | Redacted stack traces and request IDs | | |

## 2. Deployment (OPS 002)

The complete single-server procedure — provisioning, services, environment
files, nginx/TLS, first data, backups, releases and rollback — is in
[deployment-vps.md](deployment-vps.md). The rules below apply to any target.

1. CI (`.github/workflows/ci.yml`) installs from the frozen lockfile, lints,
   typechecks, tests, builds, checks the bundle budget and verifies the
   generated contracts match the API.
2. Build immutable images: `docker build -f apps/api/Dockerfile .`, the same for
   `apps/worker` and `apps/web`. Tag each with the commit SHA; never `latest`.
3. Apply migrations **once** per release, from a job — never from application
   startup: `pnpm db:migrate:deploy`.
4. Deploy the API first, then the worker, then the web and admin bundles. The
   API is backward compatible with the previous client build, so a client
   deployed a few minutes later is never broken.
5. Wait for readiness (`GET /api/v1/health/ready`) before shifting traffic; roll
   replicas rather than replacing them all at once.
6. Roll back by redeploying the previous image tag. **A destructive migration
   has no automatic undo**: correct it with a reviewed forward migration, or
   restore from backup (section 4).

## 3. Runtime health (OPS 003)

- **Liveness**: `GET /api/v1/health` — the process is up.
- **Readiness**: `GET /api/v1/health/ready` — MySQL and Redis are reachable.
- **Operational signals**: `GET /api/v1/admin/operations/status` (permission
  `audit.read`) returns queue age, failed events, failed enquiries, scheduled
  publishing lateness, moderation backlog and stuck uploads, each with the
  threshold from MON 002. Counts and ages only — no message content.
- **Graceful shutdown**: the worker drains on SIGTERM (`worker.close()` finishes
  or releases in-flight jobs, then the database pool closes). Give orchestrators
  at least 30 seconds before SIGKILL.
- **Pools**: size `DATABASE_CONNECTION_LIMIT` per replica so that
  `(api replicas + worker replicas) × limit` stays below the server's
  `max_connections` with headroom for migrations and admin sessions.
- **Database transport**: `DATABASE_URL` must carry `?sslmode=verify-identity` (or `verify-ca` with `&sslca=<percent-encoded PEM path>`) in production — the API refuses to start otherwise, because an unverified MySQL handshake can be downgraded and the account password read in clear (`docs/security/dependency-advisories.md`). `DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL` must stay `false`.
- **Networking**: MySQL and Redis listen on private networks only, with TLS
  where the provider supports it. Redis runs with AOF persistence and
  `noeviction` — BullMQ requires it, and the outbox stays the recovery source.

## 4. Backups and restore (BACK 001–002)

- **Daily**: `infrastructure/backup/backup-database.sh` writes a gzipped,
  encrypted dump plus a SHA-256 file. Store it where production credentials
  cannot delete it, retain daily points for 30 days.
- **Point in time**: keep binlogs for at least the one-hour RPO. The dump
  records its binlog position (`--source-data=2`).
- **Media**: enable object versioning on the media bucket; replication or backup
  lag must stay under one hour.
- **Secrets**: back up recovery procedures through the managed secret store,
  never as plaintext copies.
- **Drill** (before launch, then quarterly):
  `infrastructure/backup/restore-drill.sh` restores into an isolated
  `*_restore` database and prints row counts, collation checks and the measured
  restore time. Complete the manual steps it lists (privacy deletions, media
  checksums, cache/queue rebuild, outbound mail disabled) and record the result
  in `docs/operations/restore-drills.md`.

## 5. Monitoring and alerting (MON 001–002)

Structured logs carry a request ID on every request and never contain
passwords, tokens, session cookies, private form bodies or full email addresses.

| Alert | Condition | Source |
| --- | --- | --- |
| Site down | Public probe fails for 3 minutes | External uptime check on `/` and `/api/v1/health` |
| Error rate | 5xx above 2% for 5 minutes | Reverse proxy or APM |
| Queue stalled | `oldest_pending_job_age` ≥ 300 s | `/api/v1/admin/operations/status` |
| Purge failed | `failed_events` ≥ 1 | same (investigate immediately, SRS CACHE 002) |
| Delivery failed | `failed_enquiries` ≥ 1 | same |
| Publishing late | `scheduled_publishing_lateness` ≥ 300 s | same |
| Moderation backlog | `moderation_backlog` ≥ 50 | same |
| Media stuck | `stuck_media_age` ≥ 900 s | same |
| Backup stale | Latest backup older than 26 hours | Backup job's own reporting |

On-call ownership, escalation channel and the named responder must be recorded
below before launch — a dashboard without a responder does not satisfy MON 002.

| Role | Name | Contact | Hours |
| --- | --- | --- | --- |
| Primary responder | _(to be recorded)_ | | |
| Escalation | _(to be recorded)_ | | |

## 6. Common procedures

**Rotate the admin bootstrap**: create the additional administrator through the
admin application; never re-run the bootstrap command against a database that
already has an administrator.

**Purge a page immediately**: publication changes enqueue a purge automatically.
To force one, POST to the web tier's `/api/revalidate` with the shared token and
the affected tags.

**Reprocess a stuck upload**: quarantined assets are never publicly reachable.
Confirm the worker is running and object storage credentials are valid, then
re-run the media job; processing is idempotent.

**Retry a failed enquiry**: use the Enquiries queue in the admin. The original
message is stored, so a retry never loses the sender's text.

**Failed email (OPS 004)**. Trigger: the operations status reports failed
enquiries, the oldest queued job exceeds five minutes, or the worker log shows
`enquiry.email … failed`. Owner: the on-call responder (§5). Diagnose: read the
enquiry's `lastError` in the admin (addresses are redacted; the SMTP code and
response are kept) — a 4xx or a connection/timeout error is transient and the
queue retries it five times with backoff; a 5xx, `EAUTH` or envelope error is
permanent and the job stops. Contain: for permanent authentication failures,
rotate the relay credentials in the secret store and restart the worker (it
refuses to start with an unauthenticated or plaintext production relay);
for provider outages, nothing is lost — accepted enquiries stay in the outbox
and the queue. Recover: retry from the Enquiries queue with a reason once the
relay answers; a retry reuses the original `Message-ID`, so a duplicate after
an ambiguous timeout is recognisable to the recipient's mail server. Do not
resend by hand from a mailbox. Record: the incident, the count of affected
enquiries and the time to recovery.

## Authorization

Changing, inspecting or recovering administrator access — including the emergency database procedure and `pnpm --filter api authz:verify` — is in [authorization-runbook.md](authorization-runbook.md).

## Edge (reverse proxy)

The public edge terminates TLS, routes to the three upstreams and — this part is
load-bearing — answers a 404 from the web application with the not-found document
that application prerendered. Without it, a 404 from a matched route (a business
slug that does not exist, an unpublished article) arrives with the correct status
and an **empty body**: a browser recovers by hydrating, a crawler or a text
client does not. See `infrastructure/edge/nginx.conf`, and audit F-05 for why.

Checks after any edge change, against the deployed environment:

```bash
for path in / /business /about /business/x-not-real /blog/x-not-real \
            /api/v1/health /api/v1/does-not-exist /admin/ /_next/static/nope.js; do
  curl -s -o /dev/null -w "%{http_code} %{size_download} %{content_type} $path\n" "https://<host>$path"
done
```

Expected: 200 for real pages; 404 with a full HTML body for unknown public
routes; 404 **JSON** for `/api/v1/*`; 200 for `/admin/`; a small plain 404 for a
missing asset. Anything that turns an API 404 into HTML, or a missing asset into
the not-found page, is a misconfiguration.

## Metrics

`/metrics` on the API and on the worker answer a loopback caller, or a caller
presenting `Authorization: Bearer $METRICS_TOKEN`; everything else gets 404. Never
publish the metrics port on a public interface, and never put the token in a
tracked file. `docs/operations/monitoring.md` holds the deployment verification
and the rotation procedure.

## The worker

The worker is a **separately supervised production process**. It is not started
by the API, it is not a sidecar of the web tier, and it is not something an
operator runs by hand.

| Requirement | Setting |
| --- | --- |
| Restart policy | always (`restart: unless-stopped`, `Restart=always`, or the Kubernetes default) |
| Replicas | at least one; two is safe — every job is idempotent by its job id |
| Liveness probe | `GET :$WORKER_METRICS_PORT/health` |
| Readiness beyond the process | the heartbeat in Redis, read by `GET /api/v1/admin/system/queues/workers` |
| Shutdown grace | ≥ 30 seconds after `SIGTERM` |
| Paging alert | C4, no heartbeat for 3 minutes |

**What stops while no worker runs:** enquiry delivery, image processing,
scheduled publication, retention, and cache purges. Nothing errors; it simply
does not happen. Two things make that visible rather than silent — the C4 alert,
and the admin screens, which say that background processing is not running
instead of leaving work in an unexplained "processing" state.

**A worker that restarts forever is not a working worker.** Configuration errors
make it exit at start-up on purpose, so pair the restart policy with C4 and read
the first JSON line on stderr, which names the variables at fault without
printing their values.

### If uploads are stuck

1. Queue Monitor → **Workers**: is anything checking in?
2. No: start or restart the worker, then confirm heartbeats return within a
   minute. Images that were waiting are processed automatically; nothing needs to
   be re-uploaded.
3. Yes, but nothing completes: W3. Check the object storage credentials, then
   restart the replica — in-flight jobs return to the queue.
