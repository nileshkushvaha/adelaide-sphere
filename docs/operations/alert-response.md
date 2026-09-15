# Alert definitions and response

Status: added 2026-09-08 as post-audit remediation.
Provider-neutral: each rule is stated as a condition over the metrics in
`docs/operations/monitoring.md`. Express them in Prometheus, Grafana Alerting,
CloudWatch or an OTLP backend — the thresholds and the reasoning transfer.

**No on-call rotation is assigned here.** Naming a person, a phone number or a
paging schedule is a client decision (SRS §23, D01–D08 remain open). Each rule
says what an operator does; who that operator is, and how they are reached, is
still to be agreed.

## Severity meanings

| Severity | Meaning | Expected response |
| --- | --- | --- |
| **Critical** | Something a user relies on is broken now, or data is at risk. | Act immediately. |
| **Warning** | Degradation, or a failure that will become user-visible if ignored. | Act within the working day. |
| **Informational** | Worth knowing; may be normal. | Review in the next operational pass. |

`for:` durations matter as much as thresholds. Every rule below requires the
condition to persist, so a restart, a deploy or a single slow request never
pages anyone.

---

## Critical

### C1 — API is not serving
`up{job="adelaide-sphere-api"} == 0` **for 2m**
*Why 2m:* longer than a rolling restart, shorter than a visitor's patience.
*Action:* check the process and the host; `GET /api/v1/health/ready` names which
dependency is failing. Roll back the last deploy if it correlates.

### C2 — Database unreachable
`ms_dependency_up{dependency="database"} == 0` **for 2m**
*Why:* nothing works without it — no page, no sign-in, no enquiry.
*Action:* check MySQL, connection limits and credentials. The API fails safe; it
does not serve stale data.

### C3 — Redis unreachable
`ms_dependency_up{dependency="redis"} == 0` **for 5m**
*Why 5m:* sign-in throttling fails safe (refuses) and the queue cannot accept
work, but nothing is lost. Slightly longer than the database rule because the
degradation is narrower.
*Action:* check Redis. Expect sign-in refusals and undelivered enquiries until it
returns; queued work resumes on its own.

### C4 — No worker is processing
`ms_worker_heartbeats == 0` **for 3m**
*Why:* this is the audit's F-01 failure. Enquiries are stored but not delivered,
uploads are not processed, scheduled publication does not happen.
*Action:* Queue Monitor → **Workers** names the state. Check the worker's start-up
log: a configuration or job-id refusal appears there as JSON and the process
exits. Nothing is lost — the queue holds the work.
*Restart loops look healthy from outside.* The worker exits deliberately when its
configuration is wrong, so a supervisor set to restart it forever will show a
running unit while nothing is ever consumed. This alert is what tells the
difference: heartbeats stay absent no matter how many times the process starts.

### C5 — A required scheduled task has stopped
`ms_scheduled_task_last_success_age_seconds{task=~"content.publish-scheduled|activity.retention|email.retention|media.retention|schedule.run-retention"} > 2 × its window` **for 15m**
*Why:* the worker can be alive and still not be running the schedule. Retention
is a legal obligation and scheduled publication is a promise to an editor.
*Action:* Scheduled Tasks screen shows the last run and its outcome; run the task
manually if it is safe to do so, then find why the repeatable job is missing.

### C6 — Enquiries are not being delivered
`ms_enquiry_oldest_undelivered_seconds > 1800` **for 10m**
*Why 30m:* an accepted enquiry is a promise to a visitor and to a business.
Half an hour is well inside a business's expectation and well outside normal
delivery, which is seconds.
*Action:* check the mail provider and the queue's failed jobs. Retry the explicit
selection from the Queue Monitor once the cause is fixed.

### C7 — Email delivery is failing
`rate(ms_email_deliveries_total{outcome=~"failed|bounced"}[15m]) / rate(ms_email_deliveries_total[15m]) > 0.25` **for 15m**
*Why 25%:* individual bounces are normal; a quarter of traffic failing is a
provider, credential or sender-verification problem.
*Action:* Email Logs shows per-message status without message bodies. Check the
provider's status and the sender domain's verification.

### C8 — Sustained 5xx
`rate(ms_http_requests_total{status_class="5xx"}[5m]) / rate(ms_http_requests_total[5m]) > 0.05` **for 5m**
*Why 5%:* above the noise of an occasional dependency blip.
*Action:* group by `route` to find which handler; correlate with the `requestId`
in the error envelopes users report.

---

## Warning

### W1 — Queue backlog is growing
`ms_queue_jobs{state="waiting"} > 100` **for 15m**, or
`ms_queue_oldest_waiting_seconds > 900` **for 10m**
*Why:* the work is arriving faster than one worker can drain it, or a job is
wedged. Not yet user-visible; will be.
*Action:* check worker throughput (`ms_worker_jobs_total`) and job duration;
raise `WORKER_CONCURRENCY` or add a replica.

### W2 — Failed jobs accumulating
`increase(ms_worker_jobs_total{outcome="failed"}[1h]) > 20` **for 1h**
*Why:* retries hide single failures; twenty in an hour is a pattern.
*Action:* Queue Monitor → Failed. The reason is the first line only, never a
stack trace. Fix the cause, then retry the selection.

### W3 — Worker alive but not finishing work
`ms_worker_heartbeats > 0 and increase(ms_worker_jobs_total[15m]) == 0 and ms_queue_jobs{state="waiting"} > 0` **for 15m**
*Why:* a heartbeat proves a process, not progress. This is the stuck-consumer
state.
*Action:* check for a job blocking the concurrency slots (`state="active"` with a
long age); restart the replica if needed — in-flight jobs return to the queue.

### W4 — Latency regression
`histogram_quantile(0.95, sum by (le, route) (rate(ms_http_request_duration_seconds_bucket[10m]))) > 1.5` **for 15m**
*Why 1.5s at p95:* SRS NFR 003's capacity profile is well under this; sustained
breach means a query or a dependency has regressed.
*Action:* identify the route, check the database, compare with the last deploy.

### W5 — Media stuck in quarantine
`ms_media_stuck_in_quarantine > 0` **for 30m**
*Why:* uploads accepted but never processed are invisible to the editor who
uploaded them. The original stays private, so this is not a safety problem — it
is a broken promise.
*Action:* check that a worker is running (C4 answers this first) and that the
object storage credentials are valid. Uploads waiting here are visible to
administrators on the Media library, which says plainly when processing is not
running rather than leaving an image on "processing" indefinitely.

### W6 — Authentication failures spiking
`rate(ms_auth_events_total{event="login_failure"}[10m]) > 1` **for 10m**, or
`increase(ms_auth_events_total{event="lockout"}[15m]) > 3`
*Why:* administrator sign-ins are few. A sustained failure rate is either an
attack or an administrator locked out of their own account.
*Action:* Activity Log shows the attempts without identifying the visitor beyond
what the audit record already holds. Consider network-level blocking; do not
disable throttling.

### W7 — Authorization refusals spiking
`rate(ms_authorization_rejections_total[15m]) > 0.5` **for 15m**
*Why:* the admin UI does not offer actions a role cannot take, so a stream of
403s means either a probe or a permission that was changed under someone.
*Action:* the `permission` label names which. Check recent role changes first.

### W8 — Rate limiting or CSRF refusals spiking
`rate(ms_request_rejections_total{kind=~"throttled|csrf_origin"}[10m]) > 2` **for 15m**
*Why:* legitimate traffic rarely trips either. A spike is a misconfigured client,
a new origin that should be trusted, or an attack.
*Action:* if a legitimate origin is being refused, fix `TRUSTED_ORIGINS` — do not
widen it to a wildcard.

---

## Informational

### I1 — Deployment observed
`changes(ms_worker_up[10m]) > 0` or a change in the heartbeat `version`.
*Action:* none. Provides the correlation line on dashboards.

### I2 — Single worker replica
`ms_worker_heartbeats == 1` **for 1h**
*Why:* not a fault — it is the current deployment — but it means one process
failing stops all background work. Worth raising when volume grows.

### I3 — Queue paused
`ms_queue_jobs{state="paused"} > 0`, or the Queue Monitor showing paused.
*Why:* pausing is a deliberate operator action that is easy to forget to undo.
*Action:* confirm it is still intended.

---

## Coverage validated against recorded drill metrics (2026-09-09)

Each row was checked against the series a drill actually produced, not against an
expectation. "Validated" means the expression evaluates true on the recorded
values during the failure and false again after recovery.

| Condition an operator must be told about | Rule | Evidence | Status |
| --- | --- | --- | --- |
| Worker process missing | C4 | D1, D2: `ms_worker_heartbeats` 1 → 0, key expiry ≤ 45 s | Validated |
| Worker alive but scheduled execution stopped | C5 + fresh heartbeats | D8: heartbeat age 4 s while four tasks past their window | Validated |
| Enquiry backlog growing | C6, W1 | D9: `ms_queue_jobs{state="waiting"}` 0 → 5, oldest waiting 8 s → 66 s | Validated |
| Permanent email failures | C7 | D7: `ms_email_deliveries_total{outcome="failed_permanent_provider"}` 1 within 6.5 s | Validated |
| Redis unavailable | C3 | D5: `ms_dependency_up{redis}` → 0 in 11.1 s, readiness 503 in 1.1 s | Validated |
| MySQL unavailable | C2 | D6: `ms_dependency_up{database}` → 0 in 7.6 s, readiness 503 in 0.9 s | Validated |
| Object storage unavailable | C9 (below) | Not drilled: MinIO was left running. The gauge is fed by the same collector as the other dependencies | **Staging task** |
| Backup failure | C10 (below) | `infrastructure/backup/backup-database.sh` exit status; no metric yet — the script is run by the host's scheduler, not the worker | **Staging task** |
| Overdue restore drill | I4 (below) | `docs/operations/restore-drills.md` records the last drill by hand | **Staging task** |
| API readiness failure | C1 | D5/D6: readiness 503 in under 1.5 s in both | Validated |

### C9 — Object storage unavailable
`ms_dependency_up{dependency="object_storage"} == 0` **for 5m**
*Why 5m:* uploads fail and media processing stalls, but published variants are
already served from the public bucket or the CDN, so the site keeps working.
*Action:* check the bucket credentials and endpoint. Uploads refuse; nothing that
is already published is affected.
*Not yet emitting:* the collector reads database and Redis today. Adding the
storage probe is a staging task, recorded in the launch-readiness report.

### C10 — Backup did not succeed
`time() - ms_backup_last_success_timestamp_seconds > 26h`
*Why 26h:* one daily backup may be missed for a slow run; two may not.
*Action:* run `infrastructure/backup/backup-database.sh` by hand and read its
output. *Not yet emitting:* the backup runs outside both application processes;
publishing its result needs either a push gateway or a small exporter, which is a
staging decision.

### I4 — Restore drill overdue
`time() - ms_restore_drill_last_success_timestamp_seconds > 90d`
*Action:* run `infrastructure/backup/restore-drill.sh` against a scratch database
and record the result. *Not yet emitting:* as C10.

---

## Response notes that apply to every alert

* **Nothing is lost while the worker is down.** Jobs wait in Redis. Resist
  clearing a queue to make an alert stop.
* **Never widen a security control to silence an alert** — throttling, CSRF
  origins, permissions and the metrics endpoint's protection included.
* **The Queue Monitor shows what the server chose to show.** No raw Redis keys,
  no full payloads, no message bodies, no tokens, no stack traces. If an
  investigation seems to need one of those, it needs a log with a request id or
  a job id instead.
