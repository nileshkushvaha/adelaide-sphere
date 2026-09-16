# Local monitoring stack (optional)

Not part of `pnpm infra:up`. Nothing here is required to run or test Adelaide
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
`as_http_request_duration_seconds_bucket`; top routes by rate and by p95;
`as_request_rejections_total` by `kind`.

**Worker and queues.** `as_worker_heartbeats` (stat, red at 0);
`as_worker_heartbeat_age_seconds`; `as_queue_jobs` by `state` (stacked);
`as_queue_oldest_waiting_seconds`; `as_worker_jobs_total` rate by `outcome`;
p95 of `as_worker_job_duration_seconds` by `job`;
`as_scheduled_task_last_success_age_seconds` by `task` (table, sorted descending).

**Enquiries and email.** `as_enquiry_events_total` by `event`;
`as_enquiry_oldest_undelivered_seconds`; `as_email_deliveries_total` by
`outcome`, and the failure ratio used by alert C7.

**Dependencies.** `as_dependency_up` by `dependency` (stat row);
`as_dependency_failures_total` by `reason`.

**Media.** `as_media_events_total` by `event`; p95 of
`as_media_processing_duration_seconds`; `as_media_stuck_in_quarantine`.

**Security.** `as_auth_events_total` by `event`;
`as_authorization_rejections_total` by `permission`;
`as_request_rejections_total{kind=~"throttled|csrf_origin"}`.
