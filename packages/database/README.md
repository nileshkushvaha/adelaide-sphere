# @adelaide-sphere/database

Prisma 7 schema, versioned migrations and the **backend-only** database client for Adelaide Sphere. Consumed by `apps/api` (and the future worker). Never import it from `apps/web` or `apps/admin`; browser bundles must not contain the Prisma client or credentials (SRS ARC 002).

## Versions (pinned)

| Package | Version | Why |
| --- | --- | --- |
| `prisma` (CLI) | 7.10.0 | latest stable 7.x; `latest` on npm is an 8.0 release candidate, deliberately not used |
| `@prisma/client` | 7.10.0 | matches the CLI |
| `@prisma/adapter-mariadb` | 7.10.0 | Prisma 7 requires a driver adapter; this is the documented MySQL/MariaDB one (bundles the `mariadb` driver) |

Requirements satisfied: Node `^20.19 || ^22.12 || >=24` (we run 24.19.0), TypeScript `>=5.4` (we compile with 6.0.3), ESM (`moduleFormat = "esm"`), MySQL 8.4 (listed as supported).

## Layout

| Path | Tracked | Purpose |
| --- | --- | --- |
| `prisma/schema.prisma` | yes | models; no URL (Prisma 7 keeps URLs in config) |
| `prisma/migrations/` | yes | version-controlled SQL migrations + lock file |
| `prisma.config.ts` | yes | CLI config: schema/migration paths, `DATABASE_URL`, optional `SHADOW_DATABASE_URL` |
| `.env.example` | yes | placeholders |
| `.env` | **no** | local `DATABASE_URL` / `SHADOW_DATABASE_URL` for the CLI |
| `src/generated/prisma/` | **no** | generated client (`pnpm generate`) |
| `src/url.ts`, `src/client.ts`, `src/index.ts` | yes | public API |
| `dist/` | **no** | build output consumed by the API via `exports` |

## Public API

```ts
import { DatabaseConnection } from '@adelaide-sphere/database';

// One per process (API, worker). Nothing connects until first use.
const connection = new DatabaseConnection({ url: process.env.DATABASE_URL!, allowPublicKeyRetrieval: true });
const db = await connection.getClient();   // PrismaClient, verified with a bounded SELECT 1
const health = await connection.check();   // { ok: true, latencyMs } | { ok: false, reason }
await connection.close();                  // idempotent; disconnects current + superseded clients
```

- `DatabaseConnection` is the managed lifecycle (state machine `idle → connecting → ready → idle … → closed`):
  - `getClient()` creates and verifies the client on demand. Concurrent callers share one in-flight attempt. A failed attempt is **not** cached; it sets a backoff window (1 s doubling to a cap, 15 s in the API) after which the next call retries. Inside the window callers fail immediately with reason `backoff`, so an outage fails fast instead of piling up connection attempts.
  - `check()` runs a bounded ping (2.5 s in the API). After `failuresBeforeReplace` (2) consecutive failures the current client is discarded and disconnected in the background; the next demand creates a fresh one, subject to backoff. This is what lets readiness recover after a database restart without restarting the process, and it bounds replacement to one attempt per backoff window.
  - `close()` waits for any in-flight attempt, disconnects exactly once, tolerates never having connected, and makes later calls fail with `closed`.
  - Errors are `DatabaseUnavailableError` with a `reason`; messages and emitted events never contain the URL, host or credentials.
- `createDatabaseClient()` is the low-level factory (Prisma client on the mariadb adapter; no connection at creation). Use it for short scripts; long-running processes should use `DatabaseConnection`.
- `parseMysqlUrl()` validates `mysql://user:password@host:port/database`; errors never include the URL. Percent-encode reserved characters in credentials.
- Adapter defaults: pool size 10, `utf8mb4`, timezone `Z` (UTC timestamps, SRS DAT 001), `allowPublicKeyRetrieval: false`.

### MySQL 8 authentication and `allowPublicKeyRetrieval`

MySQL 8.4 accounts use `caching_sha2_password`. On a **non-TLS** connection the first authentication of an account after a server start needs an RSA key exchange; once it succeeds the server caches the account and later connections use the fast path. The mariadb driver refuses to fetch the server's RSA public key over an unencrypted connection unless `allowPublicKeyRetrieval` is true. Without it, every driver connection fails with `ER_CANNOT_RETRIEVE_RSA_KEY` after each MySQL restart until some other client (for example the `mysql` CLI) warms the cache; this was the root cause of readiness never recovering in Phase 6 testing. Locally the API sets `DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL=true` (loopback only). In production, connect over TLS (SRS OPS 003) instead of enabling this flag; TLS support in the client options is a deployment-phase addition.

## Environment

`prisma.config.ts` uses `DATABASE_URL` from the process environment. If it is unset, it loads `packages/database/.env` (relative to the config file, so the working directory does not matter). The API reads its own `apps/api/.env`; the two files carry the same URL locally. Shadow-database URL is only needed for `migrate dev`.

## Commands (from the repository root)

| Command | Purpose |
| --- | --- |
| `pnpm db:validate` | validate the schema |
| `pnpm db:generate` | (re)generate the client into `src/generated/prisma` |
| `pnpm db:build` | generate + compile to `dist/` (the API's typecheck/build/tests need this first; `pnpm check` runs it) |
| `pnpm db:migrate:status` | compare `prisma/migrations` with the database |
| `pnpm db:migrate:dev` | **development only**: create/apply a migration (prompts for a name; uses the shadow database) |
| `pnpm db:migrate:deploy` | apply pending migrations without generating new ones (deployment job / CI) |
| `pnpm db:introspect` | print the schema as introspected from the live database (no secrets) |
| `pnpm db:migrations:check` | migration policy lint (collation/charset, reviewed destructive statements) |
| `pnpm db:test:integration` | integration tests against the local MySQL dev database (requires `pnpm infra:up`) |
| `pnpm test:integration` | database + API integration tests; the API suite uses the isolated `<name>_test` database |
| `pnpm --filter @adelaide-sphere/database test` | unit tests (no database; lifecycle is tested with fake clients) |

No reset/drop script is provided on purpose. `prisma migrate reset` and `db push` are not part of the workflow (SRS DAT 006).

## Migration workflow

**Development**
1. Edit `prisma/schema.prisma`.
2. `pnpm db:migrate:dev` → name the migration (e.g. `add_business_table`). Prisma diffs against the shadow database, writes `prisma/migrations/<timestamp>_<name>/migration.sql`, applies it to the dev database and regenerates the client.
3. Review the SQL; commit schema + migration together. Never hand-edit an applied migration.
4. `pnpm db:build` so the API sees the new types.

**Deployment**: run `pnpm db:migrate:deploy` **once**, as a dedicated deployment job, before the new API/worker replicas start. Do not run migrations from API startup: multiple replicas would race, and a failed migration would take every replica down. Use expand → backfill → contract across compatible releases; destructive changes have no automatic undo (SRS DAT 006, OPS 002).

## Shadow database (why `migrate dev` works without CREATE DATABASE)

`prisma migrate dev` needs a scratch database. The application user deliberately has no global privileges, so `infrastructure/mysql-init/10-shadow-database.sh` creates `<MYSQL_DATABASE>_shadow` on first volume initialisation and grants the app user rights **on that database only**; `SHADOW_DATABASE_URL` points at it. For a volume created before Phase 6 the same statements were applied once as root (see `infrastructure/README.md`).

## Naming policy

Models are PascalCase singular (`AdminUser`); tables are snake_case **plural** via `@@map` (`admin_users`); columns keep camelCase field names; indexes/constraints use Prisma's generated names. The `plural_table_names` migration renamed the Phase 6–9 tables non-destructively.

## Notes

- **Collation policy (Phase 8, SRS DAT 001 / DIR 004):** every database and table uses `utf8mb4` with **`utf8mb4_unicode_ci`**. Rationale: it is Prisma Migrate's fixed MySQL default (so generated migrations need no manual edits and cannot drift), it is case- and accent-insensitive (so "Café" matches "cafe" in searches and unique slugs cannot collide by case), and the Compose server default, the dev/shadow/test databases (`ALTER DATABASE` migration `collation_policy_utf8mb4_unicode_ci`) all match it, so raw temporary tables and joins never mix collations. Deterministic ordering therefore means: string sorts are case/accent-insensitive and ties are broken by the stable ID (SRS DIR 004). `pnpm db:migrations:check` fails any migration that introduces another collation/charset or an unreviewed destructive statement (`pnpm check` runs it).
- The mariadb driver returns integer literals from raw queries as `BigInt`.
- Integration tests refuse to run unless the database name ends in `_dev` or `_test`, and only touch rows whose key starts with `integration-test:`.

## AI Content Phase 1A

The existing admin/API now supports disabled automation configuration and a manual topic queue with versioned actions, request replay protection, active-title deduplication and transactional audit. No provider, article generation or scheduler execution is included. The additive `20260918120000_ai_content_topics` migration and existing RBAC synchronization are required on rollout; neither has been run against retained environments in this implementation session. See the [Phase 1A completion report](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1a-completion.md) for exact routes, permissions, checks and rollback instructions.

## AI Content Phase 1B

The article seam shared by the API and the worker lives in `@adelaide-sphere/database/editorial` (sanitiser, media references, revisions, material hash, the AI publication policy used by both the publish/schedule commands and the scheduled publisher). Durable AI work (control epoch, leased and fenced operations, recovery, applying a generation run to its one canonical article) lives in `@adelaide-sphere/database/automation`. Both subpaths are backend-only. The additive migration `20260918150000_ai_content_editorial_foundation` has been applied only to the isolated test database. See the [Phase 1B completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1b-completion.md).

## AI Content Phase 1C

Free public research (SSRF-safe retrieval in the worker, evidence, typed claims, freshness), Needs Fact Review, local novelty admission with the inventory epoch, feed discovery and the research source registry. Shared rules are in `@adelaide-sphere/domain` (`ai-novelty`, `ai-research`); the database seam is in `@adelaide-sphere/database/automation`. Migration `20260918170000_ai_content_research` has been applied only to the isolated test database. See the [Phase 1C completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1c-completion.md).

## AI Content Phase 1D

Budgeted, reviewed text generation from the verified research packet:

- a provider-neutral text seam, with the OpenAI Responses adapter in the worker (built only when `OPENAI_API_KEY` is set in the server environment);
- approved models as code constants;
- versioned approved prices and day/month/workflow reservations, with the paid-call halt on discrepancy;
- fact and name coverage;
- proposals with CAS apply;
- research-bound approval and unknown-outcome resolution.

New permissions: `ai_content.generate` and `ai_content.approve`. Migration `20260918190000_ai_content_generation` has been applied only to the isolated test database. No live provider call has been made. See the [Phase 1D completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1d-completion.md).

## AI Content Phase 1E

Featured images: hybrid and prompt-only by default. A paid image is made only through an explicit Generate image action; automatic mode is not approved.

- **Provider:** a provider-neutral image seam with the OpenAI Image API adapter in the worker, using the same server-side `OPENAI_API_KEY`.
- **Cost:** versioned image prices with a per-image output-token bound, and a separate image budget.
- **Media:** intake through the existing quarantine and media processing; a provider URL is never kept.
- **Approval and publication:** human approval with alt text written from the actual image; a required featured image in the shared publication policy.

Migration `20260919100000_ai_content_images` has been applied only to the isolated test database. See the [Phase 1E completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1e-completion.md).

## AI Content Phase 1F

The daily slot:

- one slot at a configured local time (07:00 Australia/Adelaide) with a monthly ceiling;
- it starts free research for the next topic a person approved for it (`approve_for_slot`), and never generates, spends or publishes;
- missed slots are held for review, never caught up.

The slot is unique per local date (registered task `ai-content.plan-slots`). AI operations run on their own queue, `adelaide-sphere-ai`, with a bounded consumer (`AI_WORKER_CONCURRENCY`, default 1). Migration `20260919140000_ai_content_schedule` has been applied only to the isolated test database. See the [Phase 1F completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1f-completion.md).

## AI Content Phase 1G

Hardening, with auto-publishing not approved:

- final novelty and internal-link checks at publication (both paths);
- retry of a failed first draft;
- operator signals (`as_ai_*` gauges, alert rules AI1–AI6, and the dashboard "Needs attention" card);
- 180-day retention of private AI working data (task `ai-content.retention`).

Operations: `docs/operations/ai-content-runbook.md`. Migration `20260919180000_ai_content_retention` has been applied only to the isolated test database. See the [Phase 1G completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1g-completion.md).
