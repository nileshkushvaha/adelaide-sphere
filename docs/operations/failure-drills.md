# Failure drills

Status: 2026-09-09, staging closure. All nine drills executed.
Purpose: prove that each failure the audit cared about produces a signal, and
record how long detection takes.

**Environment:** local Docker Compose project `adelaide-sphere` (MySQL 3317,
Redis 6380, Mailpit, MinIO). No other container, database or Homebrew service was
touched; Homebrew MySQL on 3306 was not read, restarted or modified. The
user-started API on port 3001 was left running throughout; drills used a separate
API instance on 3011 and a worker started by the drill, both stopped afterwards.

Each drill records: failure introduced → detection signal → alert condition →
what an admin sees → recovery → time to detection → cleanup.

---

## D1 — Worker never starts (the audit's F-01 shape) — **executed**

* **Failure introduced.** Historically: a job id containing `:`, which BullMQ
  refuses, so the worker exited during scheduler registration. Now reproduced
  structurally by enqueuing an id containing `:`.
* **Detection signal.** `assertQueueJobId` throws at the enqueue boundary with
  `enqueue enquiry.email: a job id must not contain ":" (got …)`. The worker's
  start-up failure is a single JSON line on stderr before exit.
* **Alert condition.** C4 (`ms_worker_heartbeats == 0` for 3m).
* **What an admin sees.** Queue Monitor → **Workers**: "Nothing is processing
  work — No worker has checked in. Nothing is consuming adelaide-sphere:
  enquiries are stored but not delivered, uploads are not processed and scheduled
  tasks are not running."
* **Recovery.** Fix the id (or the configuration), restart the worker. Queued work
  drains; nothing is lost.
* **Time to detection.** Immediate in tests
  (`apps/api/test/queue-dispatch.integration-spec.ts`, six cases against real
  BullMQ); ≤ 3 minutes in production via C4.
* **Cleanup.** Test database dropped by the runner; no queue state left behind.

## D2 — Running worker stops — **executed**

* **Failure introduced.** `SIGTERM` to a running worker replica.
* **Detection signal.** Heartbeat key removed on clean shutdown (expires within
  45 s if the process is killed). Observed on the API's `/metrics`:
  `ms_worker_heartbeats` 1 → 0, `ms_worker_heartbeat_age_seconds` rising to the
  sentinel.
* **Alert condition.** C4.
* **What an admin sees.** As D1, plus the replica disappearing from the Workers
  table.
* **Recovery.** Start the worker; the heartbeat and the gauges return within one
  scrape.
* **Time to detection.** ≤ 45 s for the key to expire, plus the scrape interval;
  observed at 0 heartbeats on the first scrape after shutdown.
* **Cleanup.** Worker stopped; no key left in Redis.

## D3 — Worker configuration refuses a production mail provider (F-02) — **executed**

* **Failure introduced.** `MAIL_TRANSPORT=resend` against a worker that did not
  know the value.
* **Detection signal.** Start-up refusal naming the variable, now impossible:
  API and worker read one list (`MAIL_TRANSPORTS` in `packages/mail`), asserted
  from both sides (`apps/api/src/config/env.validation.spec.ts`,
  `apps/worker/src/config.spec.ts`).
* **Alert condition.** C4 (the worker exits, so no heartbeat).
* **What an admin sees.** As D1.
* **Recovery.** Correct the variable; the message names the accepted values.
* **Time to detection.** Immediate — the process refuses to start.
* **Cleanup.** None needed.

## D4 — Metrics endpoint exposed without protection — **executed**

* **Failure introduced.** Unauthorised requests to `/metrics`, with and without a
  configured token.
* **Detection signal.** 404 in both the missing-token and wrong-token cases;
  200 only on loopback (no token) or with the exact bearer token.
* **Alert condition.** Not an alert — a test
  (`apps/api/src/observability/metrics.endpoint.spec.ts`), which also asserts no
  address, password, token, secret or session value appears in any sample line.
* **Time to detection.** Immediate, in the unit suite.

---

## D5 — Redis unreachable — **executed 2026-09-09**

* **Failure introduced.** A TCP forwarder (`127.0.0.1:6399 → 6380`) sat between a
  drill API instance and Redis; stopping the forwarder made Redis unreachable for
  that instance only. The shared container was never stopped, so nothing else on
  the machine was affected.
* **Detection signal.** `/api/v1/health/ready` → **503 in 1.1 s**, body
  `{"error":{"code":"SERVICE_UNAVAILABLE","message":"Redis unavailable"}}`.
  `ms_dependency_up{dependency="redis"}` → **0 after 11.1 s**;
  `ms_dependency_failures_total{dependency="redis",reason="error"|"timeout"}` rose.
* **Alert condition.** C3 (`ms_dependency_up{dependency="redis"} == 0` for 5m) —
  true throughout the outage on the recorded series.
* **What an admin sees.** Queue Monitor: queue unreachable; Workers card:
  "Redis is unreachable, so worker liveness is unknown."
* **Failed safely.** Sign-in fails closed (the throttle cannot be consulted); no
  request served stale data; the API stayed up and answered every probe.
* **Recovery.** Forwarder restarted: readiness 200 and `ms_dependency_up` back to
  1 **after 7.2 s**, with no restart of the API.
* **Time to detection.** 1.1 s (readiness), 11.1 s (metric).
* **Defect found and fixed by this drill.** With Redis down, `/metrics` **hung
  indefinitely** — the endpoint that exists to report the outage went silent with
  it (measured: no response in 231 s). Every collection is now bounded to 4 s
  (`apps/api/src/observability/metrics.collector.ts`); after the fix the same
  scrape answered in **4 ms** with `redis 0`.
* **Cleanup.** Forwarder stopped; drill API stopped; no keys or rows left.

## D6 — Database unreachable — **executed 2026-09-09**

* **Failure introduced.** The same technique on MySQL (`127.0.0.1:3399 → 3307`).
  Homebrew MySQL on 3306 was not touched, and the Compose container kept running.
* **Detection signal.** Readiness **503 in 0.9 s** naming the database;
  `ms_dependency_up{dependency="database"}` → **0 after 7.6 s**;
  `ms_dependency_failures_total{dependency="database",reason="backoff"}` 1.
* **Alert condition.** C2 — true on the recorded series.
* **What an admin sees.** Every admin screen fails with the standard envelope and
  a request id; nothing renders stale content.
* **Recovery.** Forwarder restarted: readiness 200 and the gauge back to 1 **after
  6.3 s**, without restarting the API (the connection pool reconnects).
* **Time to detection.** 0.9 s (readiness), 7.6 s (metric).
* **Cleanup.** As D5.

## D7 — Mail provider failing — **executed 2026-09-09**

* **Failure introduced.** A local provider stub answered `503` twice and then
  `422`, echoing the API key back in its message. The drill API ran with
  `MAIL_TRANSPORT=resend` pointed at it; a password-reset request drove the real
  send path over real HTTP.
* **Detection signal.** `ms_email_deliveries_total{provider="api",outcome=
  "failed_permanent_provider"}` 1 within **6.5 s** of the request;
  `ms_auth_events_total{event="password_reset_requested"}` 1.
* **Classification.** Over a real round trip: 503 → `TransientDeliveryError`
  (retried), 422 → `PermanentDeliveryError` (not retried).
* **Redaction, checked on the wire.** The provider echoed the key; the resulting
  message read `Resend responded 503: upstream unavailable for key
  [redacted-credential]`. Neither the key, nor the recipient address, nor the
  message body appeared in any error.
* **Alert condition.** C7 (permanent failures) — true on the recorded series;
  C6 would follow as undelivered enquiries aged.
* **What an admin sees.** Email Logs row: `status=failed`, `provider=resend`,
  `failureCode=permanent_provider`, `failureSummary="Mail delivery is
  unavailable"`, recipient withheld. No credential, no address, no stack trace.
* **Failed safely.** The reset request still answered `202`; account existence was
  not disclosed by the failure.
* **Recovery.** Point the transport back at the real provider; the next send
  succeeds and the counter stops rising.
* **Time to detection.** 6.5 s.
* **Cleanup.** Provider stub stopped; drill API stopped; the drill database was
  dropped, taking the email-log row with it.

## D8 — Scheduler stops while the worker lives — **executed 2026-09-09**

* **Failure introduced.** A worker was run against a database in which no
  scheduled task had ever succeeded — the observable shape of a live worker whose
  schedule is not running.
* **Detection signal.** With no worker: `healthy=false`, "No worker has checked
  in…", five tasks stale. With the worker running: heartbeat fresh
  (`ms_worker_heartbeats` 1, age 4 s) **and** `scheduler.healthy=false` —
  the fourth state, told apart from the other three:

  > "1 worker is alive, but 4 tasks have not succeeded within the expected
  > window. Scheduled publication and retention may have stopped."
* **Alert condition.** C5 (`ms_scheduled_task_last_success_age_seconds` past the
  task's window while heartbeats are fresh) — true on the recorded series.
* **What an admin sees.** Workers card lists the replica (instance, version, last
  report) and names every stale task with its last success and expected window.
* **Recovery.** Each task run from the Scheduled Tasks screen (`202` dispatch);
  `ms_scheduled_task_runs_total{task=…,outcome="succeeded"}` 1 for all five, and
  the card returned to "1 worker checked in within the heartbeat window", stale
  list empty.
* **Time to detection.** Immediate on the first read after the window passes;
  ≤ 25 minutes in production for the five-minute task.
* **Cleanup.** Drill worker stopped, heartbeat key removed, drill database dropped.

## D9 — Backlog with a stuck consumer — **executed 2026-09-09**

* **Failure introduced.** The queue was paused from the admin API while five task
  jobs were dispatched — a live worker that is not draining, which is what a
  wedged consumer looks like from the outside.
* **Detection signal.** `ms_queue_jobs{state="waiting"}` 0 → **5**;
  `ms_queue_oldest_waiting_seconds` rising (8 s, then 66 s);
  `ms_worker_jobs_total{outcome="completed"}` flat at 5 throughout;
  `ms_worker_heartbeats` 1 (the worker was alive the whole time).
* **Alert condition.** W1 (depth and age) then W3 (`increase(ms_worker_jobs_total
  [15m]) == 0` while heartbeats are fresh) — both true on the recorded series.
* **What an admin sees.** Queue Monitor: paused state, waiting 5, oldest waiting
  37 s, workers reporting — the operator can tell "nothing is arriving" from
  "nothing is being processed".
* **Failed safely.** Nothing was lost: every job stayed queued.
* **Recovery.** Resumed from the same screen; **drained in 10 s**, waiting back to
  0 and completions 5 → 10.
* **Time to detection.** 8 s to a visible backlog signal.
* **Defect found and fixed by this drill.** `ms_queue_oldest_waiting_seconds` kept
  its last value after the backlog drained (the queue's waiting list lags the
  counts by a scrape), which would have held an alert warm. The gauge is now
  forced to 0 whenever the waiting count is 0.
* **Cleanup.** Queue resumed and empty; drill worker stopped; drill database
  dropped.

---

## How D5–D9 were isolated (2026-09-09)

Dependencies were broken with a **TCP forwarder** between the drill process and
the service, never by stopping a container. Stopping the forwarder is
indistinguishable from the dependency being unreachable, and affects only the
process that was pointed at it — so the shared MySQL, Redis, Mailpit and MinIO
containers ran untouched throughout, as did the user's own API on port 3001 and
Homebrew MySQL on 3306.

The drills ran against their own database (`melbourne_sphere_drill`), Redis
database 9, a drill API on port 3012, a drill worker on metrics port 9466, and a
temporary Super Admin created for the run.

## Cleanup performed after this session's drills

* Drill worker and drill API stopped; heartbeat keys removed with them.
* `melbourne_sphere_drill` dropped, taking the temporary administrator, its
  session and the email-log row with it.
* Redis database 9 flushed (queue and heartbeat keys from the drills).
* TCP forwarders and the provider stub stopped; their scratch files hold no
  credential that outlives the run.
* Earlier drill API instance on port 3011 and the two metrics workers stopped.
* The user's API on port 3001, the admin dev server on 3002 and every Compose
  container were left running and unmodified. Homebrew MySQL on 3306 was never
  read, restarted or modified.
* Two defects the drills found (a hanging `/metrics` under a Redis outage, a
  sticky oldest-waiting gauge) were fixed in the application, not in the drill.
