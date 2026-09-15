# Local monitoring stack (optional)

Not part of `pnpm infra:up`. Nothing here is required to run or test Melbourne
Sphere; it exists so the metrics described in `docs/operations/monitoring.md` can
be looked at locally, and so the alert rules in `docs/operations/alert-response.md`
can be tried against real data.

```bash
docker compose -f infrastructure/docker-compose.yml \
               -f infrastructure/monitoring/docker-compose.monitoring.yml \
               --profile monitoring up -d
```

* Prometheus → http://127.0.0.1:9490
* Grafana → http://127.0.0.1:9491 (admin / `GRAFANA_ADMIN_PASSWORD`, a
  placeholder that must be changed in `infrastructure/.env`)

Both publish on the loopback interface only, both images are pinned, both have
health checks, and the ports avoid every port this project already uses.

To stop it without touching the application infrastructure:

```bash
docker compose -f infrastructure/docker-compose.yml \
               -f infrastructure/monitoring/docker-compose.monitoring.yml \
               --profile monitoring stop prometheus grafana
```

## Dashboards to build

Panels are described rather than shipped as JSON, because a dashboard exported
from one Grafana version imports badly into another — and because every panel
below must be built from a metric that actually exists. **Do not invent metric
names**; the list in `docs/operations/monitoring.md` is exhaustive.

**API health.** Request rate by `status_class`; 5xx ratio; p50/p95/p99 from
`ms_http_request_duration_seconds_bucket`; top routes by rate and by p95;
`ms_request_rejections_total` by `kind`.

**Worker and queues.** `ms_worker_heartbeats` (stat, red at 0);
`ms_worker_heartbeat_age_seconds`; `ms_queue_jobs` by `state` (stacked);
`ms_queue_oldest_waiting_seconds`; `ms_worker_jobs_total` rate by `outcome`;
p95 of `ms_worker_job_duration_seconds` by `job`;
`ms_scheduled_task_last_success_age_seconds` by `task` (table, sorted descending).

**Enquiries and email.** `ms_enquiry_events_total` by `event`;
`ms_enquiry_oldest_undelivered_seconds`; `ms_email_deliveries_total` by
`outcome`, and the failure ratio used by alert C7.

**Dependencies.** `ms_dependency_up` by `dependency` (stat row);
`ms_dependency_failures_total` by `reason`.

**Media.** `ms_media_events_total` by `event`; p95 of
`ms_media_processing_duration_seconds`; `ms_media_stuck_in_quarantine`.

**Security.** `ms_auth_events_total` by `event`;
`ms_authorization_rejections_total` by `permission`;
`ms_request_rejections_total{kind=~"throttled|csrf_origin"}`.
