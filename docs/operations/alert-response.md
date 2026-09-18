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
`as_dependency_up{dependency="database"} == 0` **for 2m**
*Why:* nothing works without it — no page, no sign-in, no enquiry.
*Action:* check MySQL, connection limits and credentials. The API fails safe; it
does not serve stale data.

### C3 — Redis unreachable
`as_dependency_up{dependency="redis"} == 0` **for 5m**
*Why 5m:* sign-in throttling fails safe (refuses) and the queue cannot accept
work, but nothing is lost. Slightly longer than the database rule because the
degradation is narrower.
*Action:* check Redis. Expect sign-in refusals and undelivered enquiries until it
returns; queued work resumes on its own.

### C4 — No worker is processing
`as_worker_heartbeats == 0` **for 3m**
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
`as_scheduled_task_last_success_age_seconds{task=~"content.publish-scheduled|activity.retention|email.retention|media.retention|schedule.run-retention"} > 2 × its window` **for 15m**
*Why:* the worker can be alive and still not be running the schedule. Retention
is a legal obligation and scheduled publication is a promise to an editor.
*Action:* Scheduled Tasks screen shows the last run and its outcome; run the task
manually if it is safe to do so, then find why the repeatable job is missing.

### C6 — Enquiries are not being delivered
`as_enquiry_oldest_undelivered_seconds > 1800` **for 10m**
*Why 30m:* an accepted enquiry is a promise to a visitor and to a business.
Half an hour is well inside a business's expectation and well outside normal
delivery, which is seconds.
*Action:* check the mail provider and the queue's failed jobs. Retry the explicit
selection from the Queue Monitor once the cause is fixed.

### C7 — Email delivery is failing
`rate(as_email_deliveries_total{outcome=~"failed|bounced"}[15m]) / rate(as_email_deliveries_total[15m]) > 0.25` **for 15m**
*Why 25%:* individual bounces are normal; a quarter of traffic failing is a
provider, credential or sender-verification problem.
*Action:* Email Logs shows per-message status without message bodies. Check the
provider's status and the sender domain's verification.

### C8 — Sustained 5xx
`rate(as_http_requests_total{status_class="5xx"}[5m]) / rate(as_http_requests_total[5m]) > 0.05` **for 5m**
*Why 5%:* above the noise of an occasional dependency blip.
*Action:* group by `route` to find which handler; correlate with the `requestId`
in the error envelopes users report.

---

## Warning

### W1 — Queue backlog is growing
`as_queue_jobs{state="waiting"} > 100` **for 15m**, or
`as_queue_oldest_waiting_seconds > 900` **for 10m**
*Why:* the work is arriving faster than one worker can drain it, or a job is
wedged. Not yet user-visible; will be.
*Action:* check worker throughput (`as_worker_jobs_total`) and job duration;
raise `WORKER_CONCURRENCY` or add a replica.

### W2 — Failed jobs accumulating
`increase(as_worker_jobs_total{outcome="failed"}[1h]) > 20` **for 1h**
*Why:* retries hide single failures; twenty in an hour is a pattern.
*Action:* Queue Monitor → Failed. The reason is the first line only, never a
stack trace. Fix the cause, then retry the selection.

### W3 — Worker alive but not finishing work
`as_worker_heartbeats > 0 and increase(as_worker_jobs_total[15m]) == 0 and as_queue_jobs{state="waiting"} > 0` **for 15m**
*Why:* a heartbeat proves a process, not progress. This is the stuck-consumer
state.
*Action:* check for a job blocking the concurrency slots (`state="active"` with a
long age); restart the replica if needed — in-flight jobs return to the queue.

### W4 — Latency regression
`histogram_quantile(0.95, sum by (le, route) (rate(as_http_request_duration_seconds_bucket[10m]))) > 1.5` **for 15m**
*Why 1.5s at p95:* SRS NFR 003's capacity profile is well under this; sustained
breach means a query or a dependency has regressed.
*Action:* identify the route, check the database, compare with the last deploy.

### W5 — Media stuck in quarantine
`as_media_stuck_in_quarantine > 0` **for 30m**
*Why:* uploads accepted but never processed are invisible to the editor who
uploaded them. The original stays private, so this is not a safety problem — it
is a broken promise.
*Action:* check that a worker is running (C4 answers this first) and that the
object storage credentials are valid. Uploads waiting here are visible to
administrators on the Media library, which says plainly when processing is not
running rather than leaving an image on "processing" indefinitely.

### W6 — Authentication failures spiking
`rate(as_auth_events_total{event="login_failure"}[10m]) > 1` **for 10m**, or
`increase(as_auth_events_total{event="lockout"}[15m]) > 3`
*Why:* administrator sign-ins are few. A sustained failure rate is either an
attack or an administrator locked out of their own account.
*Action:* Activity Log shows the attempts without identifying the visitor beyond
what the audit record already holds. Consider network-level blocking; do not
disable throttling.

### W7 — Authorization refusals spiking
`rate(as_authorization_rejections_total[15m]) > 0.5` **for 15m**
*Why:* the admin UI does not offer actions a role cannot take, so a stream of
403s means either a probe or a permission that was changed under someone.
*Action:* the `permission` label names which. Check recent role changes first.

### W8 — Rate limiting or CSRF refusals spiking
`rate(as_request_rejections_total{kind=~"throttled|csrf_origin"}[10m]) > 2` **for 15m**
*Why:* legitimate traffic rarely trips either. A spike is a misconfigured client,
a new origin that should be trusted, or an attack.
*Action:* if a legitimate origin is being refused, fix `TRUSTED_ORIGINS` — do not
widen it to a wildcard.

---

## Informational

### I1 — Deployment observed
`changes(as_worker_up[10m]) > 0` or a change in the heartbeat `version`.
*Action:* none. Provides the correlation line on dashboards.

### I2 — Single worker replica
`as_worker_heartbeats == 1` **for 1h**
*Why:* not a fault — it is the current deployment — but it means one process
failing stops all background work. Worth raising when volume grows.

### I3 — Queue paused
`as_queue_jobs{state="paused"} > 0`, or the Queue Monitor showing paused.
*Why:* pausing is a deliberate operator action that is easy to forget to undo.
*Action:* confirm it is still intended.

---

## Coverage validated against recorded drill metrics (2026-09-09)

Each row was checked against the series a drill actually produced, not against an
expectation. "Validated" means the expression evaluates true on the recorded
values during the failure and false again after recovery.

| Condition an operator must be told about | Rule | Evidence | Status |
| --- | --- | --- | --- |
| Worker process missing | C4 | D1, D2: `as_worker_heartbeats` 1 → 0, key expiry ≤ 45 s | Validated |
| Worker alive but scheduled execution stopped | C5 + fresh heartbeats | D8: heartbeat age 4 s while four tasks past their window | Validated |
| Enquiry backlog growing | C6, W1 | D9: `as_queue_jobs{state="waiting"}` 0 → 5, oldest waiting 8 s → 66 s | Validated |
| Permanent email failures | C7 | D7: `as_email_deliveries_total{outcome="failed_permanent_provider"}` 1 within 6.5 s | Validated |
| Redis unavailable | C3 | D5: `as_dependency_up{redis}` → 0 in 11.1 s, readiness 503 in 1.1 s | Validated |
| MySQL unavailable | C2 | D6: `as_dependency_up{database}` → 0 in 7.6 s, readiness 503 in 0.9 s | Validated |
| Object storage unavailable | C9 (below) | Not drilled: MinIO was left running. The gauge is fed by the same collector as the other dependencies | **Staging task** |
| Backup failure | C10, C10b (below) | `as_backup_last_run_success{tier}` / `as_backup_last_success_timestamp_seconds{tier}`, written by `run-scheduled-backup.sh` and published by the worker | Emitting; **not yet drilled on the VPS** |
| Backup not reaching off-site | C10c (below) | `as_backup_offsite_last_success_timestamp_seconds{tier}`, gated on `as_backup_offsite_configured` | Emitting; needs a remote (D07) |
| Backups filling the disk | C11 (below) | `as_backup_disk_free_bytes{tier}`, sampled once per backup run | Emitting; sampled, not continuous |
| Binary logs not reaching off-site | C13 (below) | `as_binlog_archive_last_success_timestamp_seconds`, gated on `as_binlog_archive_configured` | Emitting; needs a remote (D07) |
| Media not reaching off-site | C12 (below) | `as_media_mirror_last_success_timestamp_seconds`, gated on `as_media_mirror_configured` | Emitting; needs a target (D07) |
| Overdue restore drill | I4 (below) | `as_restore_drill_last_success_timestamp_seconds`, written by `restore-drill.sh --state-dir` | Emitting; one drill on record |
| API readiness failure | C1 | D5/D6: readiness 503 in under 1.5 s in both | Validated |

### C9 — Object storage unavailable
`as_dependency_up{dependency="object_storage"} == 0` **for 5m**
*Why 5m:* uploads fail and media processing stalls, but published variants are
already served from the public bucket or the CDN, so the site keeps working.
*Action:* check the bucket credentials and endpoint. Uploads refuse; nothing that
is already published is affected.
*Not yet emitting:* the collector reads database and Redis today. Adding the
storage probe is a staging task, recorded in the launch-readiness report.

### C10 — Daily backup did not succeed
`time() - as_backup_last_success_timestamp_seconds{tier="daily"} > 26h`
*Why 26h:* one daily backup may be missed for a slow run; two may not.
**The `{tier="daily"}` selector is not optional.** There are two tiers, and the
weekly series is older than 26 hours on six days out of seven: without the
selector this rule pages every day and is switched off within a week.
*Action:* `systemctl status adelaide-sphere-backup@daily` and
`journalctl -u adelaide-sphere-backup@daily -n 50`. Nothing else takes this
backup, so the gap is real until it is fixed. `as_backup_last_run_success{tier="daily"} == 0`
distinguishes "ran and failed" from "never ran at all"; a sharp fall in
`as_backup_size_bytes{tier="daily"}` means a dump that completed but was
truncated. The same age is on `GET /api/v1/admin/operations/status` as
`backup_age`, for an operator without Prometheus.

### C10b — Weekly archive did not succeed
`time() - as_backup_last_success_timestamp_seconds{tier="weekly"} > 8d`
*Why 8d:* the archive runs on Sundays, so anything past eight days has missed a
whole cycle.
*Action:* as C10, against `adelaide-sphere-backup@weekly`. The weekly tier
promotes the most recent daily file, so a weekly failure is usually a daily
failure first: check C10 before looking any further. It also refuses to promote a
daily older than 48 hours, which is a deliberate refusal to make the archive look
fresh when it is not.

### C10c — Backups are not reaching off-site storage
`as_backup_offsite_configured == 1 and time() - as_backup_offsite_last_success_timestamp_seconds{tier="daily"} > 26h`
*Why gated:* a host with no remote configured is not failing at it, so the rule
must not fire there — but that host is also not meeting BACK 002, which is a
launch item rather than an alert.
*Action:* check the rclone remote and its credentials. The backup job never
deletes off-site; expiry there is the remote's own lifecycle policy.

### C11 — The backup filesystem is filling up
`as_backup_disk_free_bytes < 5e9` (5 GB), or a downward trend over a week
*Why it matters more than a failed backup:* MySQL on a full filesystem stops
accepting writes, so the site goes down with it. The backup job refuses to start
when free space is below `BACKUP_MIN_FREE_MB` (default 1 GB) or below three times
the last backup's size, which stops a backup being the thing that fills the disk
— but it cannot stop anything else filling it.
*Caveat:* this is sampled once per backup run, so it is up to a day stale and
says nothing between runs. Treat it as a trend, not a live reading.
*Action:* `df -h /srv/adelaide-sphere`. Retention keeps up to 30 daily, 26 weekly
and 20 pre-deploy files; the weekly tier shares inodes with the daily one for its
first 30 days, so it costs far less than the file count suggests. If the database
has simply grown, raise the disk rather than shortening retention.

### C12 — Uploaded media is not reaching off-site storage
`as_media_mirror_configured == 1 and time() - as_media_mirror_last_success_timestamp_seconds > 3h`
*Why 3h:* the mirror runs hourly and BACK 001 allows at most an hour of lag, so
three missed runs is a real gap.
*Why it is separate from C10:* **the database backup contains no uploaded
files**, only rows pointing at them. A perfect database restore with no media is
a site full of broken images, and nothing in C10 would have warned about it.
*Action:* `journalctl -u adelaide-sphere-media-mirror -n 30`. The most common
cause is the `mc` alias: it lives inside the MinIO container's filesystem, so
re-creating that container loses it and the mirror fails every hour until
`mc alias set offsite …` is run again.

### C13 — Binary logs are not reaching off-site storage
`as_binlog_archive_configured == 1 and time() - as_binlog_archive_last_success_timestamp_seconds > 90m`
*Why it matters:* this is the one-hour RPO. The daily dump alone recovers to the
last dump; everything since then exists only in binary logs, and until they are
off-site it is lost with the server.
*Why 90m:* the archive runs every 30 minutes, so this is three missed runs.
*Action:* `journalctl -u adelaide-sphere-binlog-archive -n 30`. **"Binlog gap"
is the serious one**: logs expired on the server before they were archived, so
point-in-time recovery cannot cross them until the next daily dump. Find out why
the job stopped for that long, then take a daily backup by hand to start a new
recoverable chain.

### I4 — Restore drill overdue
`time() - as_restore_drill_last_success_timestamp_seconds > 90d`
*Why 90d:* BACK 002 requires a drill before launch and quarterly thereafter.
*Action:* run `infrastructure/backup/restore-drill.sh --state-dir
/srv/adelaide-sphere/backups/state` against a scratch `_restore` database and
record the result in `docs/operations/restore-drills.md`. A drill that restores a
**weekly** archive must replay privacy deletion records for the whole period back
to the backup point — up to 180 days (SRS PRIV 002); the script prints this.

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
