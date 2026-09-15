# Local infrastructure (MySQL, Redis, MinIO, Mailpit)

Docker Compose definition for the local development database, Redis, S3-compatible object storage and an SMTP catcher. Nothing here is used in production; production uses managed/private services per the SRS (ARC 004, OPS 003).

## Prerequisites

- Docker CLI and Docker Compose v2 (verified: Docker 29.7.2, Compose 5.4.0).
- A running Docker daemon. On this machine Docker is provided by **Colima**; start it with `colima start` (the `colima` Docker context is already selected). Docker Desktop, OrbStack or Rancher Desktop work equally well.
- Apple Silicon: both images are multi-arch (arm64 + amd64); no emulation needed.

## Files

| File | Tracked | Purpose |
| --- | --- | --- |
| `docker-compose.yml` | yes | services, volumes, network, health checks |
| `mysql-init/10-shadow-database.sh` | yes | first-start-only: creates `<MYSQL_DATABASE>_shadow` (Prisma Migrate shadow database) and `<name>_test` (integration tests) and grants the app user on those two only |
| `.env.example` | yes | placeholder template |
| `.env` | **no** (git-ignored, mode 600) | real local credentials; create by copying the example and replacing every placeholder |

## What runs

| Service | Image | Container | Host port (loopback only) | Volume |
| --- | --- | --- | --- | --- |
| MySQL | `mysql:8.4.11` (8.4 LTS) | `adelaide-sphere-mysql` | `127.0.0.1:3317` (`MYSQL_HOST_PORT`) | `adelaide-sphere_mysql-data` |
| Redis | `redis:8.4.6` | `adelaide-sphere-redis` | `127.0.0.1:6390` (`REDIS_HOST_PORT`) | `adelaide-sphere_redis-data` |
| MinIO (S3 API + console) | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | `adelaide-sphere-minio` | `127.0.0.1:9020` / `127.0.0.1:9021` (`MINIO_HOST_PORT`, `MINIO_CONSOLE_PORT`) | `adelaide-sphere_minio-data` |
| Mailpit (SMTP catcher + inbox) | `axllent/mailpit:v1.31.1` | `adelaide-sphere-mailpit` | `127.0.0.1:1035` SMTP / http://127.0.0.1:8035 inbox (`MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT`) | `adelaide-sphere_mailpit-data` |

- Compose project name: `adelaide-sphere`; internal network `adelaide-sphere_local`.
- MySQL runs with `utf8mb4` / `utf8mb4_unicode_ci` server defaults (project collation policy, see `packages/database/README.md`), creates `MYSQL_DATABASE` and a non-root `MYSQL_USER` with privileges on that database only. Root is restricted to `localhost` inside the container.
- Redis runs with AUTH (`REDIS_PASSWORD`), AOF persistence (`appendfsync everysec`) plus RDB snapshots, and `maxmemory-policy noeviction` as BullMQ requires. One instance serves both cache and queue locally; separating them in production is a later decision (SRS CACHE 003).
- Host port 3317 is the default for MySQL because a Homebrew MySQL already listens on 3306 on the original development machine. Change `MYSQL_HOST_PORT` in `.env` if 3317 is taken; nothing else needs editing.

## Mail catcher (Mailpit)

The API (password resets, account set-up) and the worker (enquiry delivery) use the same SMTP adapter locally as in production, pointed at Mailpit: `MAIL_TRANSPORT=smtp`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, no credentials, no TLS. Every message they send appears at http://127.0.0.1:8035 with its headers (including the stable `Message-ID` an enquiry carries across retries) and never leaves the machine — Mailpit stores mail, it does not relay it. Captured mail persists in the named volume and is capped at 5,000 messages. Production refuses this shape of configuration: the relay must be authenticated and TLS-protected, and a loopback host is rejected at start-up.

## Commands (run from the repository root)

| Command | Effect |
| --- | --- |
| `pnpm infra:validate` | validates the Compose file and `.env` without printing resolved values |
| `pnpm infra:up` | starts every service in the background and waits for their health checks |
| `pnpm infra:status` | shows containers, health and published ports |
| `pnpm infra:logs` | follows the last 100 log lines of every service |
| `pnpm infra:down` | stops and removes the containers and network. **Volumes (data) are kept.** |

Restarting with `pnpm infra:down && pnpm infra:up` preserves all data.

## Browsing the database (Adminer)

1. `pnpm infra:up`
2. Open http://127.0.0.1:8092
3. Log in: System **MySQL**, Server **mysql** (prefilled; this is the container's name on the internal network, not 127.0.0.1), Username **the `MYSQL_USER` from `.env`**, Password **the `MYSQL_PASSWORD` from `.env`**, Database **the `MYSQL_DATABASE` from `.env`**.

Adminer is a development convenience only; it is never deployed.

## Connecting

- MySQL: host `127.0.0.1`, port `3317`, database/user/password from `.env`. Example: `mysql -h 127.0.0.1 -P 3317 -u <MYSQL_USER> -p`.
- Redis: `redis-cli -h 127.0.0.1 -p 6379` then `AUTH <REDIS_PASSWORD>` (or set `REDISCLI_AUTH`).
- From inside the Compose network (future containerised API/worker) use hostnames `mysql:3306` and `redis:6379`.

## Important: first-start-only initialisation

The `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER` and `MYSQL_PASSWORD` variables are consumed by the MySQL image **only when the data volume is empty**. Editing them in `.env` later does not alter existing accounts. To change a password on an existing volume, do it in MySQL (`ALTER USER ...`) and then update `.env` to match.

## Shadow and test databases

`prisma migrate dev` needs a scratch database and the integration tests need an isolated one. `mysql-init/10-shadow-database.sh` runs automatically on a **fresh** volume and creates `<MYSQL_DATABASE>_shadow` and `<name>_test` (e.g. `melbourne_sphere_test`) with `GRANT ALL PRIVILEGES ON <that db>.*` to the application user; no global privileges are granted and the app user still cannot create other databases. For a volume initialised before this script existed, apply the same statements once as root (values come from `.env`, never type them inline):

```bash
set -a; . ./infrastructure/.env; set +a
docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env \
  exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -uroot -e \
  "CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}_shadow\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE%_dev}_test\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}_shadow\`.* TO '${MYSQL_USER}'@'%'; GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE%_dev}_test\`.* TO '${MYSQL_USER}'@'%'; FLUSH PRIVILEGES;"
```

This was done on 2026-09-06 for the existing local volume (shadow in Phase 6, test database and the collation defaults in Phase 8).

## Destructive operations (never part of routine setup)

Deleting data is a separate, deliberate action. None of the `infra:*` scripts do it.

- `docker compose -f infrastructure/docker-compose.yml --env-file infrastructure/.env down --volumes` removes the containers **and every data volume**; the next `infra:up` starts from an empty database and re-runs MySQL initialisation from `.env`.
- Do not run `docker system prune` on a machine with other projects' containers/volumes unless you have checked what it will remove.

## Troubleshooting

- `Cannot connect to the Docker daemon` → start Colima/Docker Desktop first.
- `Bind for 127.0.0.1:3317 failed: port is already allocated` → change `MYSQL_HOST_PORT` (or `REDIS_HOST_PORT`) in `.env`.
- MySQL unhealthy for >60 s on first start → check `pnpm infra:logs`; first initialisation on a slow disk can exceed the start period, Compose keeps retrying.
- `Access denied` for the app user after changing `.env` → see the first-start-only note above.

## Reverse-proxy reference configuration (`edge/`)

`edge/nginx.conf` is the deployment answer to audit F-05: Next.js 16 streams the
response body before `notFound()` can replace it, so a 404 from a matched route
arrives with the right status and an empty body. The proxy intercepts that 404
and answers it with the document Next.js itself prerendered.

```bash
# Build the web app first: the not-found document is a build artefact.
pnpm --filter web build
MS_WEB_UPSTREAM=host.docker.internal:4000 \
MS_API_UPSTREAM=host.docker.internal:4001 \
MS_ADMIN_UPSTREAM=host.docker.internal:4002 \
docker compose -f infrastructure/edge/docker-compose.edge.yml --profile edge up -d
```

Two things must survive any adaptation to another edge:

* `error_page 404 @not_found` **without** `=` — with `=` nginx answers 200, which
  is worse than the empty body it replaces;
* `proxy_intercept_errors off` under `/api/v1/`, `/admin/` and `/_next/` — the API
  owns its JSON envelopes, the admin app resolves its own routes, and a missing
  asset must stay a missing asset.

Re-mount `_not-found.html` on every deploy; a stale copy is a stale page.

## Monitoring profile (`monitoring/`)

```bash
docker compose -f infrastructure/docker-compose.yml \
  -f infrastructure/monitoring/docker-compose.monitoring.yml \
  --env-file infrastructure/.env --profile monitoring up -d prometheus
```

Pass the base file **first**: relative volume paths resolve against the first
compose file's directory. Prometheus reads its scrape credential from
`monitoring/metrics-token` (mode 0600, git-ignored, never inlined in the tracked
`prometheus.yml`). Every published port in this project is bound to `127.0.0.1`.
