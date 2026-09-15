# Setup progress archive — Phases 1–7 (complete, 2026-09-05 → 2026-09-06)

Moved verbatim from `docs/setup-progress.md` on 2026-09-06 to keep the active
record short. Nothing was rewritten. The verified toolchain table, the roadmap
and Phases 8 onwards remain in `docs/setup-progress.md`; the compact handoff
for AI sessions is `docs/ai/current-state.md`.

## Phase 1 — Dependency cleanup and backend verification (complete, 2026-09-05)

Checks run from the workspace root, all passing:

- `pnpm --filter api build` — exit 0.
- `pnpm --filter api exec vitest run` — 1 file, 1 test passed.
- `pnpm --filter api test:e2e` — 1 file, 1 test passed.
- `pnpm exec tsc --noEmit -p tsconfig.json` (in `apps/api`) — clean after the fix below.
- Both Vitest config files type-check with TypeScript 6 (`tsc --noEmit --ignoreConfig ...`).
- `pnpm --filter api lint` — clean.
- `pnpm peers check` — "No peer dependency issues found".
- `pnpm install --frozen-lockfile --offline` — lockfile up to date.

Changes made in this phase:

- Confirmed `vite-tsconfig-paths` was already removed from `apps/api/package.json` and `pnpm-lock.yaml`. Neither it nor `tsconfck` appears in the dependency graph (`pnpm why` returns nothing). Ran `pnpm prune` to delete the orphaned virtual-store directories left under `node_modules/.pnpm`.
- Confirmed Vite 8.2.2 declares `resolve.tsconfigPaths?: boolean` natively (`vite/dist/node/index.d.ts`), so `resolve: { tsconfigPaths: true }` in both Vitest configs is supported and no plugin is needed.
- Fixed `apps/api/test/app.e2e-spec.ts`: `import { App } from 'supertest/types'` did not resolve under `moduleResolution: nodenext` in ESM mode (the same error occurs with TypeScript 5.9.3, so this is a Nest scaffold issue, not a TypeScript 6 regression). Replaced with `import type { App } from 'supertest/types.js'`, which maps to `@types/supertest/types.d.ts`. Vitest had passed before only because it does not type-check.

Decisions:

- **Keep TypeScript 6.0.3 for the API.** Build, both test suites, lint and a full `tsc --noEmit` pass. Nest CLI 12 and schematics resolve against it without peer warnings. This proves initial compatibility only; re-verify when Prisma, class-validator/transformer and the shared config package are added.
- **Native tsconfig path resolution** over the plugin: fewer dependencies and removes the only TypeScript `^5` peer constraint (tsconfck) from the graph.

Deprecation warnings from earlier installs:

- `tsconfck@3.1.6` — resolved; no longer installed.
- `eslint@9.39.5` — belongs to `apps/web` (via `eslint-config-next@16.3.4`). Not touched in this phase; investigate in Phase 2 against the installed Next.js tooling before changing major versions.

Unresolved issues: none for the backend.

## Phase 2 — Frontend verification (complete, 2026-09-05)

Checks run from the workspace root, all passing:

- `pnpm --filter web lint` — `eslint` (flat config, `eslint.config.mjs`) — clean. Note: `next lint` no longer exists in Next 16; the script correctly calls ESLint directly.
- `pnpm --filter web exec next typegen` then `pnpm --filter web exec tsc --noEmit` — clean. The global `LayoutProps`/`PageProps` helpers used by the scaffold live in `.next/types`, so `tsc` alone fails on a fresh checkout until `next typegen` (or `next build`) has run. This is documented Next 15.5+ behaviour, not an error in the project.
- `pnpm --filter web build` — compiled successfully; routes `/` and `/_not-found` prerendered as static.
- Dev server: `pnpm --filter web dev` on port 3000 — ready in ~300 ms, `GET /` returned 200, starter page rendered in the in-app browser. Console showed no errors: only the React DevTools info line, `[HMR] connected`, and a benign "preloaded but not used" warning for the starter template's `next.svg`. The server was stopped afterwards.

Changes made in this phase:

- **Removed `apps/web/pnpm-workspace.yaml`** (created by create-next-app; it contained only `allowBuilds: { sharp: false, unrs-resolver: false }`) and **removed `packageManager: pnpm@11.22.0` from `apps/web/package.json`**. Why: with both present, any `pnpm` command run from inside `apps/web` treated that folder as its own workspace root, downloaded pnpm 11.22.0, installed a separate 356-package virtual store under `apps/web/node_modules/.pnpm` and wrote a second `pnpm-lock.yaml`. This happened once during verification. The stray nested lockfile and `apps/web/node_modules` were deleted and `pnpm install --frozen-lockfile` from the root relinked `apps/web` to the root store; the root lockfile was not modified. The root `package.json` and root `pnpm-workspace.yaml` remain the single source of pnpm configuration. Build-script approvals stay as recorded at the root (`unrs-resolver: true`; `sharp` is not approved, which is the same effective outcome as the deleted nested file).
- Added `.claude/launch.json` with a `web` entry so the dev server can be started from the assistant's browser tooling (an `api` entry was added in Phase 3).

Decisions:

- **Keep TypeScript 5.9.3 for the frontend.** Lint, typegen, type-check and build all pass. `eslint-config-next` and `typescript-eslint` accept it. There is no concrete reason to move it, and it need not match the API's TypeScript 6.
- **Keep `eslint@9.39.5` for now; the upgrade is blocked upstream.** Findings from the registry and eslint.org/version-support:
  - ESLint 9.x reached end-of-life on 2026-08-06; 9.39.5 is the final 9.x release (npm `maintenance` tag). Current line is 10.x (`latest` 10.10.0, Node `^20.19 || ^22.13 || >=24`, so Node 24 is fine).
  - `eslint-config-next@16.3.4` (the latest release) declares `eslint: >=9.0.0`, and its `typescript-eslint@8.69.0` and `eslint-plugin-react-hooks@7.1.1` accept `^10`.
  - But three plugins it depends on cap their peer range at ESLint 9, and their **latest published versions** still do: `eslint-plugin-react@7.37.5` (`^9.7` max), `eslint-plugin-jsx-a11y@6.10.2` (`^9` max), `eslint-plugin-import@2.32.0` (`^9` max).
  - Installing ESLint 10 today would therefore produce unmet-peer warnings and run those plugins outside their declared support, which the phase rules prohibit. The deprecation warning is informational and does not affect lint results.
  - Re-check when those plugins or `eslint-config-next` publish ESLint 10 support: `npm view eslint-plugin-react peerDependencies.eslint` etc. (run from outside the workspace, because npm refuses to run under the root `devEngines` pnpm pin).

Remaining issues / follow-ups (not blockers):

- ESLint 9 EOL as above; revisit periodically.
- `apps/web` pins `@types/node@^20` while the toolchain runs Node 24; harmless for now, consider aligning in Phase 3.
- `apps/web/AGENTS.md` and `CLAUDE.md` are generated by `next dev` (the block says it re-adds itself); decide in Phase 3 whether to commit them.

## Phase 3 — Repository conventions (complete, 2026-09-05)

Changes made:

- **Git**: no repository existed at any level (no root or nested `.git`). Initialised one at the monorepo root on branch `main`. Nothing has been committed or pushed; the initial commit is left for the user.
- **Single workspace / package manager**: confirmed one `pnpm-workspace.yaml` and one `pnpm-lock.yaml`, both at the root, and one `packageManager`/`devEngines` authority (`pnpm@12.3.4`) in the root `package.json`. No child manifest pins a package manager or engines (the conflicting web pin was removed in Phase 2). Added root `engines.node: ">=24.19.0"`.
- **Root `.gitignore`**: dependencies, `dist/`, `build/`, `out/`, `.next/`, `*.tsbuildinfo`, generated `apps/web/next-env.d.ts`, coverage, caches, logs, `.env` and `.env.*` (with `!.env.example` / `!.env.*.example` re-allowed), `*.pem`/`*.key`/`*.p12`, OS/editor files, `.claude/settings.local.json`. The existing `apps/web/.gitignore` was left in place (it overlaps but does no harm). `git status --ignored` confirmed `node_modules`, `.next`, `dist`, tsbuildinfo files and `.DS_Store` are ignored; no credential or `.env` file exists in the tree and none is trackable.
- **Node version file**: `.nvmrc` = `24.19.0` (read by nvm and fnm). TypeScript versions unchanged: api 6.0.3, web 5.9.3.
- **Scripts** (root): `dev:web`, `dev:api`, `build`, `build:web`, `build:api`, `lint`, `typecheck`, `test`, `test:e2e`, `check` (lint → typecheck → unit → e2e → build). App scripts added: web `typecheck` = `next typegen && tsc --noEmit`; api `typecheck` = `tsc --noEmit -p tsconfig.json`. Web `dev`/`start` now pass `--port 3000` explicitly. Nothing references the not-yet-created admin app.
- **Ports**: web 3000, api 3001 (default in `apps/api/src/main.ts` changed from 3000 to 3001; `PORT` still overrides), admin 3002 reserved in the README only.
- **Environment examples**: `apps/api/.env.example` containing only `PORT=3001` with a note that the API does not load `.env` automatically yet (validated loading is Phase 4 work; until then variables come from the shell). No web example: the web app consumes no variables yet, and Next.js loads `apps/web/.env*` itself when it does. README documents that nothing reads a root `.env`.
- **`@types/node` (web)** bumped from `^20` (20.19.43) to `^24.13.3`, matching the Node 24 runtime and the version the API already used, so no new package entered the store. Lockfile updated by `pnpm install` (+2 −4 packages); nothing else changed.
- **Generated instruction files reviewed**: `apps/web/AGENTS.md` (Next 16 "read `node_modules/next/dist/docs`" notice, regenerated by `next dev`) and `apps/web/CLAUDE.md` (`@AGENTS.md` include) contain no machine-specific paths and no instructions conflicting with this project; kept and tracked. `.claude/launch.json` uses only `pnpm dev:web` / `pnpm dev:api` with relative invocation and no absolute paths, so it is portable; kept and tracked as documented tooling. No removals proposed.
- **Root `README.md`** created: prerequisites, setup, ports, root commands, environment-loading behaviour per app, status.

Verification (from the root):

- `pnpm install --frozen-lockfile --offline` — lockfile up to date.
- `pnpm check` — exit 0: web ESLint clean; api oxlint clean; web `next typegen && tsc --noEmit` clean; api `tsc --noEmit` clean; API unit (1) and e2e (1) tests pass; `nest build` and `next build` succeed.
- `pnpm dev:api` listened on :3001 and `GET /` returned 200 "Hello World!"; `pnpm dev:web` listened on :3000 and `GET /` returned 200. Both were started by the assistant and stopped afterwards; ports confirmed released.

Maintenance items carried forward:

- **ESLint 9.x is end-of-life (2026-08-06) and `eslint@9.39.5` prints a deprecation warning on install.** Not resolved: `eslint-config-next@16.3.4`'s `eslint-plugin-react`, `eslint-plugin-jsx-a11y` and `eslint-plugin-import` still cap their ESLint peer at 9.x in their latest releases. Upgrade when they (or `eslint-config-next`) publish ESLint 10 support. Do not suppress the warning.
- Initial Git commit not yet made.

## Phase 4 — API foundation and frontend connection (complete, 2026-09-05)

Dependencies added to `apps/api` (peer check clean, lockfile updated): `@nestjs/config@12.0.0` (matches Nest 12), `class-validator@0.15.1`, `class-transformer@0.5.1` (required by Nest's `ValidationPipe`; also used for env validation so there is one validation library).

Changes:

- **Validated configuration** — `src/config/env.validation.ts` declares `NODE_ENV` (development|test|production, default development) and `PORT` (integer 1–65535, default 3001; only strictly numeric strings are accepted, so `3001.5`, `abc`, ` 3001`, `-1` are rejected). Errors list key + rule only, never values. `src/config/app-config.module.ts` wires `ConfigModule.forRoot` with `envFilePath` resolved from the module's own location (`apps/api/.env`) so `pnpm dev:api` from the root and `pnpm start:dev` from `apps/api` behave identically; real env vars override the file; the file is ignored under `NODE_ENV=test` (Vitest configs set that explicitly). `main.ts` catches startup failure, prints `[api] startup failed: ...` and exits 1.
- **Routing** — global prefix `/api/v1`; scaffold `AppController`/`AppService` and their tests removed. Requests outside the prefix get the JSON 404 envelope from an Express-level guard; unknown routes under it get it from the global filter.
- **Health** — `GET /api/v1/health` → `{"data":{"status":"ok"}}`, `Cache-Control: no-store`, no env/paths/versions. Liveness only; readiness checks are deferred until MySQL/Redis exist (SRS OPS 003, MOD 002).
- **Validation & errors** — global `ValidationPipe` (whitelist + forbidNonWhitelisted + forbidUnknownValues, no implicit conversion) with a custom exception producing `fields: { "path.to.field": [messages] }`; `HttpExceptionFilter` maps everything to `{error:{code,message,fields,requestId}}`, keeps status codes (400/404/413/415/500…), and returns a generic 500 with server-side logging only. JSON bodies capped at 64 KB (SRS API 004); body-parser errors are handled by an Express error middleware so malformed JSON → 400 `BAD_REQUEST` "Malformed JSON body", oversize → 413. `X-Powered-By` disabled.
- **Request IDs** — Express-level middleware generates a UUID per request, sets `X-Request-Id` and puts it in every error envelope. Client-supplied IDs are ignored (trusted-proxy correlation is future work).
- **Shared initialisation** — `src/app.setup.ts` (`configureApp`, `APP_CREATE_OPTIONS`) is used by `main.ts` and by `test/create-test-app.ts`, so e2e tests exercise the real prefix, parsers, validation and filter.
- **Frontend proxy** — `apps/web/next.config.ts` rewrites `/api/v1/:path*` → `${API_ORIGIN}/api/v1/:path*`; `API_ORIGIN` is server-only (not `NEXT_PUBLIC_`), default `http://127.0.0.1:3001`, validated to be a bare http(s) origin, read when the Next server starts. `apps/web/.env.example` added. No CORS configured. No route handlers or domain logic in Next.js.
- **Env examples** — `apps/api/.env.example` now documents `NODE_ENV` and `PORT` with defaults and loading behaviour.

Framework quirks found and handled (worth knowing):

- Nest 12's Express adapter mounts its not-found router with the raw global prefix; `setGlobalPrefix('api/v1')` (no leading slash) silently leaves unknown routes to Express's HTML 404 page. Using `'/api/v1'` fixes it; routes are unaffected either way.
- `ConfigModule.forRoot` is async in `@nestjs/config` 12 and runs validation when called (at import time for a static module). The promise is given a no-op rejection handler so an invalid environment surfaces through `NestFactory.create` (with `abortOnError: false`) instead of as an unhandled rejection / `process.abort()`.
- Nest rewraps body-parser `SyntaxError`s into a bare `BadRequestException` and drops the parser's `type`, hence the dedicated error middleware right after the parsers.
- Nest still logs the configuration error once via its own logger (with a stack, server-side only) before `main.ts` prints the concise line; values are not included in either.

Tests: unit 16 (env validation incl. range/format/no-leak cases, config module options and rejection with env restored after each test, health controller); e2e 12 (health body/headers/prefix, 404 envelope for `/`, `/api/v1`, `/api/v1/nope`, request ID generated/ignored/unique, generic 500 without leaked text, DTO accept/unknown-field/multi-field/nested/no-coercion via a test-only fixture controller registered only by the e2e suite, malformed JSON 400, 64 KB 413).

Verification (root):

- `pnpm --filter api typecheck|lint|test|test:e2e|build` — all pass; `pnpm --filter web typecheck|lint|build` — all pass; `pnpm peers check` clean; `pnpm install --frozen-lockfile --offline` up to date.
- `PORT=abc node dist/main.js` and `NODE_ENV=<secret-like> node dist/main.js` → exit 1, message names the key and constraint, value absent from output.
- Live: API on 3001 → `GET /api/v1/health` 200 with `no-store` and `X-Request-Id`; via Next on 3000 → identical body/headers, 404 and 400 envelopes pass through unchanged; browser `fetch('/api/v1/health')` from `http://localhost:3000` → 200 with no console/CORS errors; with the API stopped, the same fetch/curl → `500 Internal Server Error` (plain text from Next.js), i.e. a visible failure, not a fake success. Both servers were started and stopped by the assistant.

Limitations:

- The backend-down response through the dev rewrite is Next.js's own plain-text 500, not the SRS JSON envelope; in production the reverse proxy fronts NestJS directly and would return its own 502/503. Acceptable for local development; documented in the README.
- Health is liveness only; no readiness endpoint yet.
- Request-ID correlation with an upstream trusted proxy is not implemented.
- No frontend unit test for the rewrite (the web app has no test runner yet); it was verified live.

Maintenance items carried forward:

- **ESLint 9.x EOL** (`eslint@9.39.5` deprecation on install) — still blocked by `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import` peer caps via `eslint-config-next@16.3.4`. Re-check periodically; do not suppress.
- Initial Git commit not yet made.

## Phase 5 — Local MySQL and Redis (complete, 2026-09-06)

Prerequisite check:

- Docker CLI 29.7.2 and Docker Compose 5.4.0 are installed. The Docker daemon is provided by **Colima 0.10.3** (profile `default`, aarch64, 2 CPU / 4 GiB / 100 GiB, runtime docker), and it was **stopped** at the time of this phase; the `colima` Docker context is selected. Per the phase rules, no dependent work (pulling images, starting containers, data verification) was run. To continue: `colima start`, then `pnpm infra:up`.
- A native Homebrew MySQL (`homebrew.mxcl.mysql`, `/opt/homebrew/opt/mysql`) is running and listening on `127.0.0.1:3306`. It was left untouched; the Compose MySQL publishes on **3307** instead. Port 6379 was free at that moment, but once the daemon was running an unrelated Compose project (`docker`: `docker-redis-1`, `docker-postgres-1`, `docker-adminer-1`, `docker-mailpit-1`, all exited, restart policy `no`) turned out to publish `0.0.0.0:6379`; to avoid clashing whenever that project runs, Redis uses **6380**. Those containers and their volumes were not touched.
- Host is Apple Silicon (arm64). Both selected images publish arm64 and amd64 manifests (checked on Docker Hub).

Image selection and rationale:

- **MySQL `8.4.11`** — 8.4 is an LTS line (endoflife.date: premier support to 2029-04-30, EOL 2032-04-30; latest patch 8.4.11 published 2026-07-28) and is listed explicitly on Prisma's supported-databases page. MySQL 9.7 is the newer LTS but is not yet on that list, so 8.4 is the conservative choice for the Phase 6 Prisma setup. MySQL 8.4 defaults to `caching_sha2_password`, which Prisma's MySQL driver supports.
- **Redis `8.4.6`** — Redis 8.x lines (8.2–8.10) are all maintained; 8.4 has received patches through 2026-08-27 and is older than the current `latest` (8.10.1), giving a mature target for BullMQ's Lua scripts. BullMQ's documented minimum is Redis 6.2 (the docs site is client-rendered and could not be re-read by curl here; the `bullmq@6.3.4` package declares no Redis engine constraint), so any 7.x/8.x line satisfies it. Configured with `noeviction`, AOF `everysec` plus RDB snapshots, as SRS OPS 003 requires for the queue store.
- Both are pinned to exact patch versions; no `latest`/`lts` aliases.

Files and scripts:

- `infrastructure/docker-compose.yml` — project `melbourne-sphere`; services `mysql` and `redis`; named volumes `melbourne-sphere_mysql-data` and `melbourne-sphere_redis-data`; bridge network `melbourne-sphere_local`; health checks (`mysqladmin ping`, `redis-cli ping` using `REDISCLI_AUTH`); ports bound to `127.0.0.1` only; MySQL server charset `utf8mb4` / `utf8mb4_0900_ai_ci`, `MYSQL_DATABASE` + non-root `MYSQL_USER` (privileges on that database only), `MYSQL_ROOT_HOST=localhost`; Redis `--requirepass`.
- `infrastructure/.env.example` — placeholders only. `infrastructure/.env` — generated locally (random 32-char values via `openssl rand`, mode 600), git-ignored (`git check-ignore` confirmed), never printed.
- `infrastructure/README.md` — commands, connection details, first-start-only initialisation note, destructive-operation warning, troubleshooting.
- Root scripts: `infra:validate`, `infra:up` (`up -d --wait`), `infra:down` (keeps volumes), `infra:status`, `infra:logs`. All pass `-f infrastructure/docker-compose.yml --env-file infrastructure/.env` explicitly so behaviour does not depend on the working directory.

Verified so far (without the daemon):

- `pnpm infra:validate` (`docker compose config --quiet`) passes; the resolved configuration was reviewed with passwords masked: loopback host IPs, published ports 3307/6379, named volumes, network and health checks are as intended.
- Trackable files contain none of the generated credential values (checked by searching for each value; only counts were printed).

Live verification (after `colima start`, Docker server 29.5.2 linux/aarch64):

- `docker info` / `docker compose version` talk to the Colima daemon; ports 3307 and 6380 were free; Homebrew `mysqld` still on 3306.
- `pnpm infra:validate` passes; resolved config reviewed with secrets masked.
- `docker pull mysql:8.4.11` and `redis:8.4.6` → native `linux/arm64` images.
- `pnpm infra:up` → both containers `healthy`; `docker ps`: `127.0.0.1:3307->3306/tcp`, `127.0.0.1:6380->6379/tcp` (loopback only; `lsof` shows Colima's `ssh` forwarder on 127.0.0.1).
- MySQL (host client over 3307, app user, password via `MYSQL_PWD` from the env file, never printed): `CURRENT_USER()` = app user, database = dev database, version 8.4.11; `character_set_server`/`character_set_database` = utf8mb4, collations `utf8mb4_0900_ai_ci`; `SHOW GRANTS` = `USAGE ON *.*` + `ALL PRIVILEGES ON <dev db>.*` only; visible databases = own + information_schema + performance_schema; `CREATE DATABASE` → 1044 denied, `SELECT mysql.user` → 1142 denied, `CREATE USER` → 1227 denied, wrong password → 1045.
- Redis: unauthenticated command → `WRONGPASS`; authenticated `PING` → `PONG`; `appendonly yes`, `appendfsync everysec`, `save 60 1000`, `maxmemory-policy noeviction`, `maxmemory 0`; `aof_enabled:1`, `rdb_last_bgsave_status:ok`; host connection over 127.0.0.1:6380 with AUTH → PONG; version 8.4.6.
- Persistence: created table `phase5_verification_tmp` (with a 4-byte emoji, verified 1 char / 4 bytes) and key `phase5:verification:tmp`; ran `pnpm infra:down` (containers and network removed, both volumes retained) then `pnpm infra:up`; both records were present afterwards; both were then removed (`DROP TABLE`, `DEL`), leaving the database with no tables and Redis `dbsize 0`.
- `pnpm check` (lint, typecheck, unit 16, e2e 12, builds) passes; frozen offline install up to date. Trackable files contain none of the credential values; `infrastructure/.env` is not trackable.

Limitation noted: the Homebrew `mysql` command-line client defaults to a `latin1` connection charset, so ad-hoc inserts of 4-byte characters need `--default-character-set=utf8mb4` (documented in `infrastructure/README.md`). This is a client setting; the server and database are utf8mb4 and drivers negotiate utf8mb4 themselves.

MySQL initialisation caveat: `MYSQL_*` variables are consumed only when the data volume is empty. Changing them later requires `ALTER USER` inside MySQL (then updating `.env`) or recreating the volume, which is destructive.

Maintenance items carried forward: ESLint 9.x EOL (blocked upstream, not suppressed); Phase 4 limitations (dev-rewrite backend-down response is Next's plain 500; liveness-only health; no trusted-proxy request-ID correlation; no web test runner); initial Git commit not yet made.

## Phase 6 — Prisma and backend database foundation (complete, 2026-09-06)

Toolchain decision (evidence from npm and the Prisma 7 docs at prisma.io/docs, ORM version v7):

- **Prisma 7.10.0** for `prisma`, `@prisma/client` and `@prisma/adapter-mariadb`, pinned exactly. On npm, `@prisma/client`/`@prisma/config`/adapters are at 7.10.0 while the `prisma` CLI's `latest` tag points at `8.0.0-rc.13` (a release candidate; the docs site also announces Prisma 8). A pre-release is not acceptable for the foundation, so the matched stable 7.10.0 set is used. Engines: `node ^20.19 || ^22.12 || >=24` (Node 24.19.0 ok), `typescript >=5.4` (6.0.3 ok), ESM (`moduleFormat = "esm"`, `importFileExtension = "js"`). Prisma's supported-databases page lists MySQL 8.4.
- Prisma 7 **requires a driver adapter**; `@prisma/adapter-mariadb` is the documented MySQL/MariaDB one. Prisma 7 config model: `prisma.config.ts` (`defineConfig`, `datasource.url`, `migrations.path`, `schema`), `generator client { provider = "prisma-client", output = ... }` with an explicit output; no `url` in the schema. The CLI does not auto-load `.env`; `prisma.config.ts` loads `packages/database/.env` with `process.loadEnvFile` only when `DATABASE_URL` is unset (real env wins).
- Build scripts `prisma` and `@prisma/engines` (schema-engine download for `migrate`) were approved explicitly in `pnpm-workspace.yaml`. `pnpm peers check` clean.

Package `packages/database` (`@melbourne-sphere/database`, private, ESM, TS 6.0.3): schema with one technical model `SystemProbe` → table `system_probe` (cuid id, unique `key`, `value`, `createdAt`, `updatedAt`); `prisma.config.ts`; `src/url.ts` (URL parsing, percent-decoding, safe errors), `src/client.ts` (`createDatabaseClient`, adapter with utf8mb4, timezone Z, bounded timeouts, `allowPublicKeyRetrieval`), `src/connection.ts` (`DatabaseConnection` lifecycle), narrow `src/index.ts`; `exports` point at `dist/`; generated client (`src/generated/`), `dist/` and `.env` are git-ignored. Scripts: generate, validate, build, typecheck, migrate:dev/status/deploy, introspect, test, test:integration. Root scripts `db:*` added; `pnpm check` now runs `db:build` first (the API's typecheck/tests need the compiled package). No reset/drop script.

Environment: `apps/api/.env` and `packages/database/.env` (both ignored, mode 600) were generated from `infrastructure/.env` with percent-encoding; examples hold placeholders. API validation requires `DATABASE_URL` (structural check via the package parser; errors name the key and rule only) and accepts `DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL` (true/false/1/0, default false).

Shadow database for `migrate dev`: the app user has no `CREATE DATABASE`; `infrastructure/mysql-init/10-shadow-database.sh` (first-start-only) creates `<db>_shadow` and grants the app user on it only; applied once to the existing volume as root. `SHOW GRANTS` afterwards: `USAGE ON *.*`, `ALL ON melbourne_sphere_dev.*`, `ALL ON melbourne_sphere_dev_shadow.*`; `CREATE DATABASE` still denied.

Migration: `prisma migrate dev --name init_system_probe` (as the app user, via the shadow database) created `prisma/migrations/20260905185049_init_system_probe/migration.sql` and applied it; `migrate status` → "Database schema is up to date"; `_prisma_migrations` shows it applied and not rolled back; `system_probe` has 0 rows after tests. Prisma emits `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` for tables while the server default is `utf8mb4_0900_ai_ci`; both are utf8mb4 (SRS ARC 003). Implication: mixed collations across tables/joins would be avoided by keeping Prisma's default for all Prisma-managed tables; revisit deliberately before product tables (a schema-level `@@` collation is not available in Prisma; a reviewed migration could align it).

API integration: `DatabaseModule` (global) + `DatabaseService` wrapping `DatabaseConnection` (`client()`, `ping()`, `onModuleDestroy → close()`); `GET /api/v1/health` unchanged (liveness, never touches the DB); `GET /api/v1/health/ready` → 200 `{data:{status:'ready',checks:{database:'ok'}}}` or 503 envelope `SERVICE_UNAVAILABLE` "Database unavailable"; both `no-store` with request IDs. Controllers never import the generated client. Redis is not checked (not consumed yet).

### Readiness recovery investigation (root cause and fix)

Initial measurement (API run from `dist`, no watch mode; only `melbourne-sphere-mysql`, port 3307): liveness stayed 200 and readiness was a safe 503 (~0.8 s) during `compose stop mysql`; after `compose start` the container was healthy in 5.5 s but readiness **never recovered in 84 s**, and readiness had also failed at baseline. A 2-second probe loop with a raw single driver connection, a persistent driver pool and the API showed the raw connection failing with **`ER_CANNOT_RETRIEVE_RSA_KEY` — "RSA public key is not available client side"** for the whole window, while the `mysql` CLI worked. Cause: MySQL 8.4 `caching_sha2_password` needs an RSA key exchange on non-TLS connections until the account is cached, the cache empties on every server restart, and the mariadb driver refuses to fetch the key unless `allowPublicKeyRetrieval` is set. Proof: default connection FAIL → `allowPublicKeyRetrieval: true` OK → default again OK (cache warmed). The stuck API's pool went to 200 the instant the cache was warmed, so the driver pool itself was not poisoned; the earlier "recoveries" happened only because CLI checks had warmed the cache.

Fix and hardening: `allowPublicKeyRetrieval` exposed through the package and `DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL` (true locally, default false; production is to use TLS). Independently, `DatabaseConnection` gives the process a bounded, serialized lifecycle: on-demand connect with a verification query (3 s), shared in-flight attempt, no cached rejections, exponential backoff (1 s → 15 s in the API) so outages fail fast, replacement of the client after 2 consecutive failed checks (old client disconnected in the background), and idempotent close. Timeouts: driver connect 1 s / acquire 0.8 s (a refused connection surfaces in ~1.6 s), ping 2.5 s.

Measured with the fix (same procedure): baseline readiness 200 (0.1 s); during outage liveness 200, readiness 503 in 0.8–1.6 s; database startup to Docker-healthy 5.6 s; **readiness 200 0.1 s after healthy (5.6 s after `compose start`)**, steady state 2–5 ms; API log shows check-failed ×2 → replaced → one backed-off failed reconnect → connected; no URL or password in logs. API was not restarted.

Tests: package unit 23 (URL parsing, client creation without connecting, lifecycle: initial success, initial failure + recovery after backoff, reuse without reconnect, replacement after consecutive failures closing the old client, concurrent callers sharing one attempt, at-most-one replacement per burst, repeated failed replacements with capped backoff, close idempotent/partial-init/in-flight race, events without secrets); package integration 5 against local MySQL (guarded: DB name must end `_dev`/`_test`; keys prefixed `integration-test:`; cleaned up); API unit 36; API e2e 13 (readiness 503 envelope when unreachable, no leaked details). Root `pnpm check` (db:build, lint, typecheck, all tests, builds) passes; frozen offline install up to date. Web build output contains no `@prisma`, `@melbourne-sphere/database`, adapter or `mysql://` strings and `apps/web` has no dependency on the package.

Limitations / maintenance:

- Production TLS to MySQL is not configured yet (client option to be added at deployment); until then `allowPublicKeyRetrieval` must stay false outside loopback development.
- Readiness during the backoff window returns 503 immediately (by design); orchestrators should probe at ≥ 2 s intervals.
- Prisma CLI `latest` is an 8.0 RC; upgrade to Prisma 8 deliberately once GA, following its upgrade guide.
- Collation note above; Homebrew `mysql` client charset note from Phase 5 still applies.
- ESLint 9.x EOL item and Phase 4 proxy limitation carried forward; initial Git commit not yet made.

Addendum (2026-09-06): added `adminer:5.5.1` as `melbourne-sphere-adminer` on `127.0.0.1:8082` (`ADMINER_HOST_PORT`), attached to the internal network, development-only; login uses server `mysql` and the app user. Documented in `infrastructure/README.md`.

## Phase 7 — Admin application foundation (complete, 2026-09-06)

Research gate (npm registry + Refine docs; no prereleases used):

- `@refinedev/core` 5.0.12, `@refinedev/antd` 6.0.3, `@refinedev/react-router` 2.0.4 (all latest stable; Refine 5 adds React 19 support per its migration guide). Their peers decide the rest: `@refinedev/antd` requires **antd ^5.23** (Ant Design 6.6.2 is latest but unsupported by Refine), `@refinedev/react-router` requires **react-router ^7** (8.3.1 is latest but unsupported), core requires `@tanstack/react-query ^5.81.5`. Chosen: antd 5.29.3, react-router 7.18.3, @tanstack/react-query 5.102.8, @ant-design/icons 5.6.1 (matches Refine's own range), dayjs 1.11.23.
- React/React DOM 19.2.8 (already in the workspace). Vite 8.2.2 and Vitest 4.1.11 reuse the workspace versions (Vitest 5.0.0 was released days ago; 4.1.11 is the tested line here). `@vitejs/plugin-react` 6.1.1 (peer vite ^8). jsdom 30.0.1 (engine `^24.15`, satisfied by 24.19.0). Testing Library: react 16.3.3, dom 10.4.1, jest-dom 7.0.1, user-event 14.6.7.
- TypeScript 6.0.3: typescript-eslint 8.69.0 supports `>=4.8.4 <6.1.0`, Refine/antd only need ≥5; TypeScript 7.0.2 (latest) is outside that range. ESLint 10.10.0 with eslint-plugin-react-hooks 7.1.1 (flat `recommended-latest`) and eslint-plugin-react-refresh 0.5.6; `eslint-plugin-jsx-a11y` is omitted because its latest release still caps ESLint at 9 (same blocker as the web app's ESLint 9 item). All packages: Node 24 / ESM / Apple Silicon fine (pure JS). `pnpm peers check`: no issues. Exact versions pinned in `apps/admin/package.json`.

Workspace integrity: `apps/admin` was authored by hand (no generator), so there is no nested Git repo, lockfile, workspace file or `packageManager` pin; the root remains the only pnpm authority (`pnpm ls -r` shows 5 projects). No absolute paths, no credentials.

Runtime contract: Vite `base: '/admin/'`; dev/preview on `127.0.0.1:3002` (strict); router basename derived from `import.meta.env.BASE_URL`; browser calls relative `/api/v1`; dev/preview proxy `/api/v1 → ADMIN_API_PROXY_TARGET` (default `http://127.0.0.1:3001`), read server-side by `vite.config.ts` via `loadEnv(mode, dir, '')` and validated as a bare http(s) origin; no `VITE_*` variables. `index.html` carries `noindex, nofollow`.

Architecture: `src/app` (App/BrowserRouter, AppProviders = ConfigProvider theme → antd App → ErrorBoundary → Refine with router/data/notification providers, `resources={[]}`, telemetry disabled, routes), `src/config` (public constants, theme tokens), `src/api` (errors, typed http client, health, Refine data provider), `src/layouts/AdminShell`, `src/pages` (Dashboard, NotFound), `src/components` (ApiStatus, ErrorBoundary, Brand), `src/shared` hooks, `src/styles/global.css`, `src/test` helpers. Extension points: Refine `resources`, `AppRoutes` (wrap with `<Authenticated>`/protected route + `/login` later), `NAV_ITEMS`, per-resource sort/filter mapping in the data provider (currently `ApiContractError`).

Security boundary: no login, users, roles, tokens or storage; no auth headers in the transport; dashboard and footer state the shell is unprotected; README carries the deployment restriction. Bundle scan: no Prisma/adapter/`mysql://`/env names/backend origin strings in `dist`.

Accessibility/theme: tokens in `theme.ts` (primary #0369A1, navy #0B1F3A, focus #B45309 with white halo; contrast asserted by `theme.test.ts`: white/primary 5.9:1, nav text/navy 14:1, focus ≥3:1 on both surfaces); 44 px menu items, 40 px controls; skip link, landmarks, one h1 per page, document titles; drawer with `aria-expanded`/`aria-controls`, Escape (explicit document listener; Ant Design's own handler did not fire in the browser) and focus restore; `prefers-reduced-motion` disables antd motion and CSS transitions.

Tests (Vitest + jsdom, 38 passing in 7 files): http client (headers, no auth headers, 204, every status → kind, envelope + request ID from header and body, non-JSON/malformed bodies, network, timeout, abort), data provider (pagination/envelopes, REST verbs, contract refusal, path encoding/traversal), ApiStatus (loading → available with request ID, no polling, unavailable safe state, envelope reference), ErrorBoundary (fallback without leaking), App (base path rendering, landmarks, title, 404 route, no auth UI), AdminShell (desktop collapse aria state, mobile drawer open/Escape/focus restore by keyboard, skip link first in tab order), theme contrast.

Browser verification (API on 3001 + admin on 3002, both stopped afterwards): `http://127.0.0.1:3002/admin/` renders the dashboard; direct load of `/admin/does-not-exist` renders the 404 page with the right title; `fetch('/api/v1/health')` and `/health/ready` from the page reach the API through the proxy (200, request ID present); desktop shows the sider and "Collapse navigation", mobile (375 px) shows the drawer; first Tab focuses the skip link; drawer opens by keyboard, focus moves inside, Escape closes it and focus returns to the toggle; with the API stopped, "Check again" shows "API unavailable · The server encountered an unexpected problem." (the Vite proxy answers 502 Bad Gateway; the client maps it to a generic server message and no raw detail leaks); console had no application errors (only the expected failed network request log while the API was down).

Root validation: `pnpm install --frozen-lockfile --offline` up to date; `pnpm peers check` clean; `pnpm check` passes (db:build, lint ×3, typecheck ×4, unit: database 23 + api 36 + admin 38, api e2e 13, builds ×4). Production build: `dist/index.html` + one CSS (3.7 kB) + one JS chunk (1.10 MB raw / 351 kB gzip), assets referenced under `/admin/`.

Decisions/limitations: single JS chunk for now (code-splitting and a bundle budget come after the first vertical slice, SRS NFR 013); Ant Design 6 and React Router 8 deferred until Refine supports them; no jsx-a11y lint until it supports ESLint 10; the not-found link href renders as `/admin` (basename) — fine for routing. Files: `apps/admin/**` (new), root `package.json` scripts (`dev:admin`, `build:admin`, `lint:admin`, `typecheck:admin`, `test:admin`, `test` aggregate), `.claude/launch.json` (admin entry), root `README.md`, this file.

Maintenance items carried forward: ESLint 9 EOL for `apps/web`; Phase 4 dev-proxy limitation; Prisma 8 upgrade when GA; production TLS to MySQL; collation note; initial Git commit not yet made.
