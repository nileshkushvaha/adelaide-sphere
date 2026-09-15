# Melbourne Sphere

Melbourne, Australia business directory and blog. pnpm monorepo containing a Next.js public site and a NestJS REST API, with a Refine admin application and a BullMQ worker to follow.

AI/session context: [CLAUDE.md](CLAUDE.md), [docs/ai/current-state.md](docs/ai/current-state.md) and [docs/ai/srs-index.md](docs/ai/srs-index.md).

Requirements source of truth: [docs/Melbourne_Sphere_Technical_SRS_v1.md](docs/Melbourne_Sphere_Technical_SRS_v1.md). (It was converted from a Word document that is not kept in this repository; the Markdown file is the working reference and is not synchronised with anything automatically.) Setup history and decisions: [docs/setup-progress.md](docs/setup-progress.md).

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 24.19.0 | pinned in `.nvmrc`; `engines.node >=24.19.0` |
| pnpm | 12.3.4 | pinned in root `package.json` (`packageManager`, `devEngines`). With Corepack or pnpm's own version management the right version is selected automatically; do not add a second `packageManager` in an app. |

There is exactly one workspace (`pnpm-workspace.yaml`) and one lockfile (`pnpm-lock.yaml`), both at the repository root. Always run `pnpm` commands from the root, or via `pnpm --filter <app>`; nested lockfiles and workspace files are not expected anywhere else.

## Setup

```bash
nvm use            # or: fnm use — reads .nvmrc
pnpm install --frozen-lockfile
```

## Applications and ports

| App | Path | Stack | Dev port | Notes |
| --- | --- | --- | --- | --- |
| web | `apps/web` | Next.js 16, React 19, TypeScript 5.9, Tailwind 4 | 4000 | public site; see `apps/web/README.md` |
| api | `apps/api` | NestJS 12, TypeScript 6, Vitest 4 | 4001 | REST API under `/api/v1` |
| admin | `apps/admin` | React 19, TypeScript 6, Vite 8, Refine 5, Ant Design 5 | 4002 | admin UI at `http://127.0.0.1:4002/admin/`; see `apps/admin/README.md` |
| worker | `apps/worker` | Node 24, BullMQ 6 | none (queue consumer) | durable enquiry delivery; `pnpm dev:worker`, see `apps/worker/README.md` |

## Root commands

| Command | What it runs |
| --- | --- |
| `pnpm dev:web` | Next.js dev server on http://localhost:4000 |
| `pnpm dev:api` | NestJS watch mode on http://localhost:4001 |
| `pnpm dev:admin` | admin dev server on http://127.0.0.1:4002/admin/ (proxies `/api/v1` to 4001) |
| `pnpm dev:worker` | BullMQ worker in watch mode (needs the Compose Redis and MySQL) |
| `pnpm build` / `pnpm build:web` / `pnpm build:api` / `pnpm build:admin` | production builds |
| `pnpm lint` | ESLint (web, admin) and oxlint (api); `lint:admin` for the admin app alone |
| `pnpm typecheck` | web: `next typegen && tsc --noEmit`; api and database: `tsc --noEmit`; admin: app + node configs (`typecheck:admin`) |
| `pnpm test` | unit tests: database package + API + admin + web (Vitest, no database needed); `test:admin` for the admin app alone |
| `pnpm test:e2e` | API end-to-end tests (Vitest + supertest, no database) |
| `pnpm test:integration` | database + API integration tests against the local MySQL and Redis (`pnpm infra:up` first); the API suite targets the isolated `melbourne_sphere_test` database (refuses any name not ending in `_test`) and Redis logical database 1 |
| `pnpm contracts:generate` / `pnpm contracts:check` | regenerate / verify the OpenAPI document and generated types in `packages/contracts` (`check` runs the verification) |
| `pnpm --filter api admin:bootstrap` | one-time creation of the first Super Admin (see below); `admin:seed-rbac` re-seeds permissions/roles |
| `pnpm --filter api taxonomy:seed` | idempotent baseline fixtures: City of Melbourne council-area local areas (SRS SCP 004 baseline until D01) plus starter categories/services; audited |
| `pnpm check` | db build, migration policy check, lint, typecheck, unit, e2e, build, contract check in sequence |
| `pnpm infra:up` / `infra:down` / `infra:status` / `infra:logs` / `infra:validate` | local MySQL + Redis via Docker Compose (see below); `down` keeps data |
| `pnpm db:build` / `db:generate` / `db:validate` | Prisma client generation and compile of `packages/database` (`check` runs `db:build` first) |
| `pnpm db:migrate:status` / `db:migrate:dev` / `db:migrate:deploy` / `db:introspect` | migration workflow, see `packages/database/README.md` |
| `pnpm db:test:integration` | database integration tests against the local MySQL |

The web type check runs `next typegen` first because the scaffold uses the generated `LayoutProps`/`PageProps` helpers from `.next/types`; plain `tsc` fails on a fresh checkout until those exist.

## Environment files

Each app reads environment variables from its **own** directory; nothing reads a root `.env`. `.env` and `.env.*` are git-ignored; `*.example` files are tracked and contain placeholders/defaults only. Never put secrets in `NEXT_PUBLIC_*` variables.

| App | File | Loaded by | Variables |
| --- | --- | --- | --- |
| api | `apps/api/.env` (copy `apps/api/.env.example`) | the API itself, via `@nestjs/config`, from a path resolved relative to the app (so `pnpm dev:api` from the root and `pnpm start:dev` from `apps/api` behave the same). Real environment variables override the file. The file is ignored when `NODE_ENV=test`. | `NODE_ENV` (development \| test \| production, default development), `PORT` (integer 1–65535, default 3001), `DATABASE_URL` (required, `mysql://…`, validated structurally; never echoed), `DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL` (true/false, default false; true locally, see `packages/database/README.md`), `TRUST_PROXY` (integer proxy hops, default 0; 1 behind the production reverse proxy), `REDIS_URL` (required), `APP_SECRET_KEY` (required, ≥32 random chars), `TRUSTED_ORIGINS`, `SESSION_COOKIE_SECURE`, `SESSION_IDLE_MINUTES`, `SESSION_ABSOLUTE_HOURS`, `ARGON2_*`, `PUBLIC_ADMIN_URL`, `MAIL_TRANSPORT`, `OPENAPI_ENABLED`, `FIELD_ENCRYPTION_KEY` (required, base64 of 32 random bytes) — see `apps/api/.env.example`; production refuses insecure values |
| database | `packages/database/.env` (copy `packages/database/.env.example`) | the Prisma CLI via `prisma.config.ts`, only when `DATABASE_URL` is not already in the environment; path resolved relative to the config file | `DATABASE_URL`, `SHADOW_DATABASE_URL` (migrate dev only) |
| web | `apps/web/.env.local` (see `apps/web/.env.example`) | Next.js, from `apps/web/.env*`, when the server starts | `API_ORIGIN` (server-only, default `http://127.0.0.1:4001`) |
| admin | `apps/admin/.env` (see `apps/admin/.env.example`) | `vite.config.ts` only (dev server / preview); never the browser bundle | `ADMIN_API_PROXY_TARGET` (default `http://127.0.0.1:4001`) |

Invalid API configuration aborts startup with exit code 1 and a message naming the offending variable and rule; values are never printed.

## API conventions (`apps/api`)

- All routes live under `/api/v1`. Requests outside it, and unknown routes inside it, get a JSON 404 envelope.
- Responses: single resources use `{ "data": ... }`. Errors use `{ "error": { "code", "message", "fields", "requestId" } }` with meaningful status codes; unexpected failures are a generic 500 with no stack trace.
- Every response carries a server-generated `X-Request-Id`. Incoming request IDs are ignored.
- Security headers (helmet: strict CSP for JSON, nosniff, frame denial, no-referrer, same-origin resource policy, HSTS) on every response; client IP is trusted from `X-Forwarded-For` only for `TRUST_PROXY` hops.
- Request bodies are validated against DTO classes; unknown fields are rejected (400 `VALIDATION_ERROR` with per-field messages). JSON bodies are capped at 64 KB (413).
- `GET /api/v1/health` returns `{ "data": { "status": "ok" } }` with `Cache-Control: no-store`. Liveness only; it never touches the database.
- `GET /api/v1/health/ready` runs a bounded `SELECT 1` through the managed database connection and returns `{ "data": { "status": "ready", "checks": { "database": "ok" } } }`, or a `503` error envelope (`SERVICE_UNAVAILABLE`, "Database unavailable") with no connection details. During an outage it fails within about a second; after MySQL returns it recovers automatically (measured 0.1 s after the container's health check) without restarting the API. Redis is not checked until the API actually uses it.
- Database access goes through `DatabaseModule`/`DatabaseService` (`apps/api/src/database`), which wraps `@adelaide-sphere/database`; controllers and future domain modules never import the generated Prisma client directly.
- `src/app.setup.ts` holds the shared HTTP setup (prefix, parsers, validation, error filter, request IDs) and is used by both `main.ts` and the e2e tests.

## Administrator authentication (Phase 9)

- **Model**: `admin_users`, `roles`, `permissions`, `role_permissions`, `admin_roles`, `admin_sessions`, `password_reset_tokens`, `audit_logs` (Prisma, plural snake_case tables). One system role `super_admin` holds every permission in the catalogue (`apps/api/src/identity/permissions.ts`).
- **Passwords**: Argon2id (`@node-rs/argon2`), OWASP-minimum parameters enforced by config, 12–256 characters, automatic rehash on login when parameters are raised.
- **Sessions**: opaque 256-bit token in the `ms_admin_session` cookie (`HttpOnly`, `Secure` in production, `SameSite=Strict`, `Path=/api/v1/admin`); SHA-256 hash stored server-side; 30 min idle / 12 h absolute; logout and password reset revoke server records. No tokens in web storage.
- **CSRF**: mutations under `/api/v1/admin` must carry a trusted `Origin` (else `Referer`, else `Sec-Fetch-Site: same-origin`); `TRUSTED_ORIGINS` lists the allowed browser origins.
- **Throttling**: Redis counters, 5 failed logins per 15 min per IP and per account (escalating to 1 h), `429` + `Retry-After`; if Redis is unavailable sign-in returns `503` rather than skipping the check.
- **Authorisation**: global guards on every `/api/v1/admin/*` route: session → `@RequirePermissions(...)`; a route without a declaration is denied. Hiding UI is never authorisation.
- **Audit**: `auth.login.success|failure`, `auth.logout`, `auth.password_reset.requested|completed`, `admin.bootstrap` with actor, target, request ID and IP; never passwords, tokens or cookies.
- **Endpoints** (`/api/v1/admin/auth`): `POST login` (200 session, or 202 `{requires:'totp', challenge}`), `POST totp/challenge`, `POST logout`, `GET me`, `POST forgot-password` (always 202), `POST reset-password`, `POST accept-setup`, `POST change-password`, `GET/DELETE sessions[/{id}]`, `POST totp/enroll|verify|disable`. Administrators (`admins.manage`): `GET/POST /admin/admins`, `GET/PATCH /admin/admins/{id}` (expectedVersion, 409 on stale), `POST …/disable|enable|resend-setup`, `GET/DELETE …/sessions[/{sessionId}]`. Audit (`audit.read`): `GET /admin/audit` with action/actor/target/date filters. OpenAPI: `packages/contracts/openapi/api.json` (served at `/api/v1/openapi.json` when `OPENAPI_ENABLED=true`).
- **Account lifecycle** (Phase 10): new administrators start `invited` with a single-use 24 h setup link; disabling revokes every session; the last active Super Admin can never be disabled or demoted; role changes rotate sessions. **TOTP** is optional per admin (SRS D06 pending): enrol via QR/manual key, confirm with a code, keep 10 hashed single-use recovery codes; enrolling/disabling requires recent authentication (≤ 5 min) or the current password. Secrets are AES-256-GCM encrypted with `FIELD_ENCRYPTION_KEY`.

**First administrator (one-time, operator-run; never a default credential):**

```bash
ADMIN_BOOTSTRAP_EMAIL=you@example.com ADMIN_BOOTSTRAP_DISPLAY_NAME="Your Name" ADMIN_BOOTSTRAP_PASSWORD='choose-a-long-passphrase' pnpm --filter api admin:bootstrap
```

It seeds permissions/roles, refuses to run if any administrator exists, and records an `admin.bootstrap` audit row. Additional admins are created through admin flows (next phase). Password-reset email delivery needs an email provider (SRS D03); locally `MAIL_TRANSPORT=console` prints the message to the API's stdout.

## Directory taxonomy (Phase 11)

- Fixed Melbourne context from `GET /api/v1/site/context` (city, state, country, timezone, locale, boundary note); no city/state/country selectors or CRUD exist anywhere (SRS SCP 001).
- Public reads, active items only, `Cache-Control: public, max-age=300`: `GET /api/v1/categories` (two-level tree), `/services` (with synonyms), `/areas` (approved local areas).
- Admin (`taxonomy.manage`): `/api/v1/admin/categories|services|areas` list (`q`, `status`, `sort` allowlist, `order`, `page`, `pageSize ≤ 50`), create (slug generated from the name unless given; lowercase-hyphen; unique even when inactive), PATCH with `expectedVersion` (409 `STALE_VERSION`), explicit `activate`/`deactivate` actions. Rules: categories nest at most two levels (409 `CATEGORY_DEPTH`/`CATEGORY_CYCLE`), a parent with active children cannot be deactivated, a child cannot be activated under an inactive parent, and terms referenced by active listings cannot be deactivated (409 `TERM_IN_USE`; the listing reference check is wired in Phase 12). Every change is audited.
- Admin screens: Categories, Services, Local areas (search/status/sort in the URL, create/edit dialog with field errors and stale-edit handling, activate/deactivate with confirmation).

## Business listings (Phase 12)

- Admin API under `/api/v1/admin/businesses`: list (`q`, `status`, `categoryId`, `localAreaId`, `sort` ∈ name/status/createdAt/updatedAt/publishedAt, `order`, `page`, `pageSize ≤ 50`; `listings.read`), create/PATCH with `expectedVersion`, nested `address` (VIC postcode), secondary `secondaryCategoryIds` and `serviceIds` (`listings.write`), explicit `POST …/{id}/publish|unpublish|archive|restore` (`listings.publish` for publish/unpublish). Publishing enforces SRS BUS 002 and answers 409 `PUBLICATION_BLOCKED` with `fields.publication` listing each unmet requirement; a suspected duplicate needs `duplicateOverrideReason` (409 `DUPLICATE_SUSPECTED` otherwise). The slug is generated from the name and locked after first publication (409 `SLUG_LOCKED`). The private enquiry email is encrypted at rest and returned only on the detail endpoint to `listings.write` holders.
- Taxonomy terms referenced by non-archived listings cannot be deactivated (409 `TERM_IN_USE`).
- Admin screens: Businesses list (filters/sort in the URL) and editor (nested address, taxonomy selectors, compliance panel, state actions with reasons, blocker/duplicate/stale handling).

## Listing hours, links and contacts (Phase 13)

- `GET/PUT /api/v1/admin/businesses/{id}/hours`: weekly schedule keyed `monday`…`sunday`, each `closed`, `open24` or `intervals` (`HH:MM` wall-clock times in Australia/Melbourne, `24:00` = end of day, `endNextDay` for overnight trading), plus date exceptions (`closed`, `open24`, `custom`). `mode: unknown` means "not recorded" and is never rendered as open or closed. PUT replaces the whole schedule atomically with `expectedVersion` and returns the status evaluated now (`open | closed | unknown`, `until`, `source`). Validation errors carry field paths such as `weekly.monday.intervals.1.start`.
- `publicPhone` must be an Australian number (landline, mobile, 13/1300/1800); it is stored in national display form and `telHref` is derived for the public "Call" action. `publicUrl` and `links[]` (facebook, instagram, x, linkedin, youtube, tiktok, other) must be http(s) URLs without credentials; known kinds must point at their own domain, one per kind, at most 8.
- Admin: hours editor (per-day state, intervals with "closes next day", exceptions, evaluated status) and link rows on the business page.

## Public directory (Phase 14)

- Public API: `GET /api/v1/businesses` (`q`, `category`, `area`, `minRating`, `sort` ∈ relevance/rating/newest/name, `page`, `pageSize ≤ 50`, result window ≤ 10 000) returning `{data, meta}` with category and area facets; `GET /api/v1/businesses/{slug}` (404 unless published) and `GET /api/v1/businesses/{id}/related` (≤ 4). Keyword search covers public fields only and ranks exact name, name prefix, name contains, category/service/synonym labels, then description. Published projections omit every private field; the street address appears only when the listing publishes it, with a directions link built from coordinates or the address.
- Public site (`apps/web`): home, `/business` with URL-driven filters, chips, sort and pagination, curated `/business/category/{slug}` and `/business/area/{slug}` pages, and `/business/{slug}` with hours, contact actions, links and related listings. Design tokens and primitives live in `packages/ui` (Tailwind v4 + shadcn-style); public bundles contain no Refine or Ant Design.
- New web environment variables: `SITE_ORIGIN` (absolute public origin for canonical URLs) and `SITE_CONTACT_EMAIL` (receives listing requests and hours corrections). See `apps/web/README.md`.

## Hero, home settings and suggestions (Phase 15)

- `GET /api/v1/home`: hero headline, 2–5 rotating phrases and optional counters (published businesses, categories and areas), returned only when an administrator enables them.
- `GET/PUT /api/v1/admin/settings/home` (`settings.manage`): validated, versioned (`expectedVersion`, 0 before the first save) and audited site settings stored in `site_settings`.
- `GET /api/v1/search/suggestions?q=` (≥ 2 characters): grouped category, service (label or synonym) and published-business suggestions, at most eight, with a per-IP ceiling of 30 requests a minute (429 + `Retry-After`; 503 if the limiter is unavailable).
- Home page: server-rendered hero with a stable H1, a rotating phrase that respects `prefers-reduced-motion`, pauses when the tab is hidden and has a pause/resume control, plus the fixed-Melbourne search panel (GET to `/business`) with progressive suggestions. Admin: the Site settings screen edits the headline, phrases and counter toggle.

## Reviews, ratings and moderation (Phase 16)

- Public: `POST /api/v1/businesses/{id}/reviews` and `POST /api/v1/reports` require an `Idempotency-Key` header (replays return the original receipt), pass a honeypot, server-verified Cloudflare Turnstile and per-IP ceilings (5 per 15 minutes and 20 per day for reviews, 5 per hour for reports), and always answer with a neutral receipt. `GET /api/v1/businesses/{id}/reviews` returns approved reviews only.
- Without `TURNSTILE_SECRET_KEY` the API refuses public submissions with 503 rather than accepting unverified content, and production start-up requires both that key and `PUBLIC_SITE_URL`. The web form shows an honest "submissions are closed" notice when `TURNSTILE_SITE_KEY` is unset.
- Moderation (`reviews.moderate`, `reports.manage`): `/api/v1/admin/reviews` with `approve|reject|spam` (reason, `expectedVersion`) and `PATCH …/redaction` (published text only; the original text and the rating are never changed), plus `/api/v1/admin/reports` with `investigate|resolve`. Approved counts and sums change inside the same transaction as the decision, so totals never double count. Every action is audited.

## Enquiries and the worker (Phase 17)

- `POST /api/v1/businesses/{id}/enquiries` and `POST /api/v1/contact` return 202 with a receipt once the enquiry and its outbox event commit together. The recipient always comes from the listing (or `SITE_ENQUIRY_RECIPIENT`); a listing without one answers 409 `NO_ENQUIRY_ROUTE`. Same protections as reviews: `Idempotency-Key`, Turnstile, honeypot, and 3 per 15 minutes / 10 per day per IP.
- The outbox dispatcher inside the API hands events to BullMQ using the event id as the job id; a Redis outage leaves events pending rather than losing them. `apps/worker` consumes `enquiry.email` jobs, re-checks the listing and recipient at dispatch time (suppressing with a reason when routing is no longer valid), sends through the mailer port with the visitor address as Reply-To only, and records `queued → retrying → providerAccepted`, `failed` or `suppressed`.
- Admin (`enquiries.read` / `enquiries.manage`): the Enquiries screen shows delivery state and handling state separately, and offers an audited retry for failed or suppressed deliveries. Closing an enquiry never implies the email arrived.
- Run the worker with `pnpm dev:worker`. Locally `MAIL_TRANSPORT=console` prints the message; production refuses to start without a real provider adapter and `MAIL_FROM_ADDRESS` (decision D03).

## Blog and editorial content (Phase 18)

- Admin API (`posts.write` / `posts.publish`): `/api/v1/admin/authors`, `/blog-categories`, `/blog-tags` (slugs, sanitised landing content, `expectedVersion`, activate/deactivate blocked by `TERM_IN_USE`) and `/api/v1/admin/posts` with explicit `publish`, `schedule`, `unpublish`, `archive`, `restore`. Publishing enforces the BLOG 002 requirements (409 `PUBLICATION_BLOCKED`), locks the slug after first publication and writes an outbox event in the same transaction.
- Articles are written in **Markdown**; the server renders and sanitises them with an allowlist (`sanitize-html`), so scripts, inline styles, iframes and unsafe URL schemes never reach a page or an admin preview. The stored HTML is exactly what the preview and the public page will show.
- `GET /api/v1/admin/posts/{id}/preview` is admin-only, `no-store, private` and `X-Robots-Tag: noindex, nofollow`; there is no public draft route.
- Scheduled articles publish through a periodic catch-up scan: admins choose Melbourne time, the API stores UTC, and a late or repeated scan publishes each due article exactly once.

## Public blog and comments (Phase 19)

- Public API: `GET /api/v1/posts` (12 per page, newest first, `category`/`tag`/`q`), `GET /api/v1/posts/{slug}` (404 for drafts, related articles ≤ 4), `GET /api/v1/blog-categories` and `/tags`, `GET /api/v1/posts/{id}/comments` (approved only) and `POST /api/v1/posts/{id}/comments` (moderated, `Idempotency-Key`, Turnstile, honeypot, per-IP ceilings; 409 `COMMENTS_CLOSED` when comments are turned off). Abuse reports accept a review **or** a comment.
- Public pages: `/blog`, `/blog/category/{slug}`, `/blog/tag/{slug}` (a tag with no landing content and no articles is `noindex, follow`) and `/blog/{slug}` with byline, tags, share links (plain URLs, no third-party widgets), related articles and approved comments.
- Admin: the Comments queue mirrors Reviews (`comments.moderate`), and Abuse reports show whether the target is a review or a comment.

## Media (Phase 20)

- Upload flow (SRS MED 002): `POST /api/v1/admin/media/uploads` returns a short-lived signed PUT for a **server-generated** key in the private quarantine bucket; the browser uploads directly; `POST /api/v1/admin/media/{id}/complete` verifies the checksum, detects the real type from the file's magic bytes, checks dimensions (10 MB and 40 megapixels maximum, JPEG/PNG/WebP only) and queues processing. Rejected uploads are deleted immediately and never become addressable.
- The worker re-encodes thumbnail (320), card (800) and hero (1600) WebP renditions, which strips EXIF including location, publishes them to the media bucket and marks the asset ready. Only ready assets with alt text can be placed on a page.
- Usage records carry gallery order, caption, contextual alt text and the cover flag; deleting an asset is refused (409 `MEDIA_IN_USE`) while any usage exists. Retention removes abandoned quarantine objects after 24 hours and unused ready assets after 30 days.
- Locally MinIO provides the S3 API (ports 9020/9021). The API creates the buckets and makes only the media bucket readable; the quarantine bucket stays private.

## SEO, sitemaps and redirects (Phase 21)

- `GET /robots.txt` points at `/sitemap.xml`, and disallows `/admin`, `/api/` and query-filtered paths. It is crawl guidance, never access control.
- `/sitemap.xml` is an index over `/sitemaps/businesses.xml`, `/sitemaps/editorial.xml` and `/sitemaps/taxonomies.xml`, built from `GET /api/v1/seo/sitemap/{section}`. Only canonical pages that return 200 are listed: drafts, archived rows, inactive terms and taxonomies without their own editorial content or a published item are excluded, and every entry carries a real last-modified time.
- Changing the slug of published content goes through `POST /api/v1/admin/businesses/{id}/slug` or `POST /api/v1/admin/posts/{id}/slug`, which writes the 301 in the same transaction. Older aliases are repointed at the newest address (never chained), and reusing a path removes its outgoing rule (never a cycle). `apps/web/src/middleware.ts` applies the rules: 301 for a move, 410 for a page marked permanently removed, and pass-through otherwise so a missing page renders its own 404.
- Redirect administration lives under **Configuration → SEO redirects** and requires the `redirects.manage` permission. Run `pnpm --filter api admin:seed-rbac` once after pulling a new permission.
- Structured data (`apps/web/src/lib/structured-data.ts`): Organization and WebSite on the home page, BreadcrumbList wherever breadcrumbs are shown, the closest LocalBusiness subtype on a listing (address, geo, phone, hours and rating only when the page shows them) and BlogPosting with a Person author. All values are escaped so editor text cannot close the script element.

## Editorial depth and the admin interface (Phase 22)

- **Author profiles** are full public profiles: role, short bio, sanitised long biography, pronouns, location, editorial contact email, website, topics and per-network links (one per network, host-checked), plus a profile photo chosen from the media library. Authors are attribution only — they never grant a login and never expose an administrator's email. The public article page shows a real byline and author card, and the article's JSON-LD credits the same Person.
- **Articles** are written in a rich-text editor (headings, emphasis, lists, quotes, code, links, media-library images, tables) with word count and reading time. Bodies carry a `bodyFormat`: existing Markdown articles keep working and convert in one click. Both formats pass the same server-side allowlist, so the editor is a convenience and never the security boundary.
- **Dashboard**: `GET /api/v1/admin/dashboard` returns counts only — pending reviews and comments, open reports, failed and new enquiries, draft listings, uploads still processing, overdue scheduled articles — each omitted unless the caller holds the permission that owns its screen, plus upcoming scheduled articles and recent audit activity. No enquiry, review or comment text ever appears.
- **Interface**: one design system (`apps/admin/src/config/theme.ts` and `src/components/ui/*`), grouped navigation (Overview, Directory, Editorial, Community, Configuration), and route-level code splitting so the editor and the heaviest screens load on demand.

## Information pages, featured listings and caching (Phase 22)

- **Information pages** (`Configuration → Information pages`): About, Contact, Privacy, Terms and Review guidelines. Content is sanitised rich text with a revision on every change to published text. Publishing is refused while the copy is a stub, contains placeholder wording, or — on the contact page — the contact address is missing, invalid or on an example domain. The public footer links only pages that are actually published.
- **Featured listings** (`Directory → Featured listings`): manual editorial placements with a position and an optional end date. At most three appear for any search, they must still match the visitor's filters and be published, and they are excluded from the organic results, their count and their pagination. There are no payment fields anywhere.
- **Home banner**: up to six Melbourne photographs chosen in Site settings, shown behind the hero with a navy overlay, per-slide focal points and captions. They cross-fade with previous/next, pause and per-image controls, and anyone who prefers reduced motion sees only the first. Without images the hero falls back to the solid navy panel.
- **Caching**: public search results are cached in Redis under a publication namespace, so a publish, unpublish, moderation decision, feature change, page or settings edit retires them at once. The same change writes a `cache.invalidate` event in its own transaction; the worker purges the web tier through `POST /api/revalidate` (shared secret, tag allowlist) and retries until it succeeds, so a removal never waits for a TTL.

## Operations (Phase 24)

- **CI** (`.github/workflows/ci.yml`): frozen-lockfile install, migration policy lint, lint, typecheck, unit, e2e, build, bundle budget, contract check; integration tests against real MySQL and Redis with migrations applied exactly once; a dependency audit that fails on high or critical advisories.
- **Images**: non-root multi-stage Dockerfiles for `apps/api`, `apps/worker` and `apps/web`, pinned to the same Node and pnpm versions as development.
- **Monitoring**: `GET /api/v1/admin/operations/status` (permission `audit.read`) returns queue age, failed events, failed enquiries, publishing lateness, moderation backlog and stuck uploads with the thresholds from the alerting policy — counts and ages only, never message content.
- **Backups**: `infrastructure/backup/backup-database.sh` (encrypted, checksummed, binlog position recorded) and `restore-drill.sh` (restores into an isolated `*_restore` database and verifies it). Procedures live in `docs/operations/runbook.md`; drill results in `docs/operations/restore-drills.md`.

## Verification: journeys, capacity and restore drills (Phase 25)

- **UAT journeys** (`e2e/`, Playwright): the four QA 003 flows plus keyboard, landmark and 320 px checks, run at desktop and phone widths.
  ```bash
  pnpm --filter @adelaide-sphere/e2e install:browsers   # once
  pnpm --filter @adelaide-sphere/e2e test               # needs the stack running
  ```
  Point them elsewhere with `E2E_WEB_URL`, `E2E_API_URL` and `E2E_ADMIN_URL`. The authenticated admin journeys skip themselves unless `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` are set, so no credential ever lives in the suite.
- **Capacity** (`tools/load/`): seed an isolated database with the NFR 003 volume, then run the profile.
  ```bash
  DATABASE_URL='mysql://user:pass@127.0.0.1:3317/adelaide_sphere_load'     node tools/load/seed-load-data.mjs --businesses 10000 --posts 2000 --reviews 100000
  node tools/load/run-load.mjs --api --target http://127.0.0.1:3021 --duration 1800
  ```
  The seeder refuses any database whose name does not end in `_load`. Captcha-protected form POSTs are excluded by design and measured separately on staging.
- **Restore drill** (`infrastructure/backup/`): `backup-database.sh` writes an encrypted, checksummed dump (`age` or `gpg`, whichever is installed); `restore-drill.sh` restores it into a database whose name must end in `_restore`, verifies schema, collation and row counts, and prints the measured restore time. Results go in `docs/operations/restore-drills.md`.

## How the web app reaches the API

The browser only ever calls **relative** `/api/v1/...` URLs on the web app's own origin (same-origin by design, SRS ARC 004; no CORS is configured or needed).

- **Local development**: `apps/web/next.config.ts` defines a rewrite from `/api/v1/:path*` to `${API_ORIGIN}/api/v1/:path*`. `API_ORIGIN` is read once when the Next.js server starts (`next dev`, `next build`, `next start`), so change it and restart. It is deliberately not a `NEXT_PUBLIC_` variable; the internal backend address never reaches the browser. If the API is down, the rewrite fails with a plain `500 Internal Server Error` from Next.js, never a fake success.
- **Admin app**: same principle. `vite.config.ts` proxies `/api/v1` to `ADMIN_API_PROXY_TARGET` in development and preview; the built assets contain only relative `/api/v1` calls.
- **Production** (per the SRS): one HTTPS reverse proxy routes `/` to Next.js, `/admin/` to the admin static build (with `index.html` fallback) and `/api/v1` straight to NestJS, so neither dev proxy is on the request path.
- **Admin access control** is enforced by the API (sessions + permissions); the admin app only reflects it. Public exposure still awaits the remaining hardening phases (TLS, headers/CSP on the web tier, monitoring).
## Test hygiene: authentication artifacts

A test or a manual runtime check that requests a password-reset link and signs in leaves two credentials in the development database: a single-use link that was mailed but never consumed, and an open session. Both are retired by:

```bash
pnpm --filter api auth:revoke-test-artifacts   # revoke, then report what remains
pnpm --filter api auth:artifacts:check         # report only; exits 1 if anything is still live
```

It marks every unused token used (so the real reset flow answers with its ordinary "invalid or expired") and revokes every live session with a recorded reason. It prints counts only, never a token, a session id or an address, and it refuses `NODE_ENV=production` or any database not named `*_dev`, `*_test` or `*_e2e`. The Playwright journeys run the same cleanup from `e2e/global-teardown.ts`, so a failed or interrupted UAT run leaves nothing usable behind. `apps/api/test/auth-artifacts.integration-spec.ts` proves it end to end against the real database.

## Transactional email

One provider-independent boundary serves every outbound message: `packages/mail` (`SmtpTransport` on nodemailer, bounded DNS/connection/greeting/socket timeouts, no pooling, plain text only, header-injection refusal, a caller-owned stable `Message-ID`, failures classified as transient or permanent with addresses redacted). The API uses it for password-reset and account set-up mail; the worker uses it for enquiry delivery, where the queue owns the retries (five attempts, exponential backoff) and an already-accepted enquiry is never sent twice.

The boundary refuses anything a caller could turn into a second recipient: multi-address, display-name and bracketed values are rejected for `to`, `from` and `replyTo`, the subject is bounded at 998 characters and the body at 256 KB, TLS is pinned to 1.2 or newer with certificate verification left on, and nothing but plain text is ever sent. The relay host, the sender and the recipient come from configuration or from the listing's own encrypted field — never from a request. `Reply-To` is the only visitor-supplied header value and it is validated twice.

`MAIL_TRANSPORT` is `none`, `console` or `smtp`. Locally, `smtp` points at the Compose Mailpit catcher (inbox at http://127.0.0.1:8035). **Production requires `smtp`** with `SMTP_HOST`, `SMTP_USER`/`SMTP_PASSWORD`, STARTTLS or implicit TLS, a non-loopback relay and a verified `MAIL_FROM_ADDRESS`; the API and the worker both refuse to start otherwise, and start-up errors name variables but never values. Choosing the provider is decision D03 (`docs/launch/client-decisions.md`); every candidate offers an authenticated SMTP endpoint, so it is a credential change. Bounce and complaint webhooks (SRS ENQ 006) are provider-specific and follow that decision.

## Local infrastructure (MySQL, Redis, MinIO, Mailpit)

Defined in [infrastructure/docker-compose.yml](infrastructure/docker-compose.yml); full details in [infrastructure/README.md](infrastructure/README.md).

| Service | Image (pinned) | Host address | Volume |
| --- | --- | --- | --- |
| MySQL 8.4 LTS | `mysql:8.4.11` | `127.0.0.1:3317` | `adelaide-sphere_mysql-data` |
| Redis | `redis:8.4.6` | `127.0.0.1:6390` | `adelaide-sphere_redis-data` |
| Adminer (browser DB UI, dev only) | `adminer:5.5.1` | http://127.0.0.1:8092 (server `mysql`) | none |
| MinIO (S3-compatible media storage) | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | `127.0.0.1:9020` (API), http://127.0.0.1:9021 (console) | `adelaide-sphere_minio-data` |
| Mailpit (SMTP catcher, dev only) | `axllent/mailpit:v1.31.1` | `127.0.0.1:1035` (SMTP), http://127.0.0.1:8035 (inbox) | `adelaide-sphere_mailpit-data` |

1. Start the Docker daemon (this machine uses Colima: `colima start`).
2. Create `infrastructure/.env` from `infrastructure/.env.example` and replace every placeholder. The file is git-ignored; it holds the only copy of the local credentials.
3. `pnpm infra:up` starts every service and waits for their health checks. `pnpm infra:down` stops them and **keeps the data volumes**.

MySQL uses `utf8mb4`, creates the development database and a non-root application user limited to that database. Redis runs with a password, AOF persistence and `noeviction` (required by BullMQ). Host ports 3317 and 6390 are used because a native MySQL (3306) and another project's Redis container (6379) occupy the standard ports on the original machine. The `MYSQL_*` values are applied only when the data volume is first created; editing them later does not change existing accounts. Deleting data (`down --volumes`) is a deliberate, destructive step and is not part of any script.

The API connects to MySQL through Prisma (`packages/database`); Redis is not consumed yet. Before starting the API, apply migrations: `pnpm db:migrate:status` then `pnpm db:migrate:dev` locally (or `pnpm db:migrate:deploy` in a deployment job, exactly once per release, never from API startup).

## Status

Setup phases 1–4 are complete (dependency cleanup, frontend and backend verification, repository conventions, API foundation and frontend connection); Phases 5–21 are complete and verified (local MySQL/Redis; Prisma foundation; admin shell; collation/test-database foundation; administrator authentication, sessions and RBAC; account lifecycle, audit log and optional TOTP; directory taxonomy and Melbourne local areas; business listings core; listing hours, links and contact validation; the public directory; the hero, home settings and search suggestions; reviews, ratings, abuse reports and moderation; enquiries with the transactional outbox and the BullMQ worker; the blog editorial core; public blog pages and comment moderation; the media pipeline; SEO with sitemaps, structured data and redirects). Phases 22–24 are complete (editorial depth and interface quality, information pages, featured placements, caching and invalidation; accessibility and performance; operations, CI, images, monitoring and backups), Phase 25 adds the UAT journeys, the capacity profile and a rehearsed restore drill, Phases 26–27 recompose the public site (home page, contact page and form, blog and listing detail with the published rating distribution), and Phase 28 adds the General settings screen and the states around them, described below. `docs/pre-audit-report.md` records the internal pre-audit and the remaining launch gates. See `docs/setup-progress.md` for verified versions, decisions and the maintenance list (including the ESLint 9 end-of-life item).

## General settings, brand marks, loading and error states (Phase 28)

- `GET/PUT /api/v1/admin/settings/general` (`settings.manage`) and the public `GET /api/v1/site/settings`: the application's own identity — name, short and organisation name, tagline, default meta description, support email and Australian phone, website, postal address, logo, browser icon and default share image from the media library, the header contact bar, one profile URL per social platform (Facebook, Instagram, X, YouTube, Pinterest) and the footer copyright template (`{year}`, `{name}`) and text. Validated server-side, versioned with `expectedVersion` and audited by shape only. A support address on a development domain is refused rather than published, and each social URL must be on that platform's own domain, so a link in the site header cannot become a redirect on every page.
- The public shell (header, footer, page metadata and browser icon) is built from those settings; anything unset is omitted rather than rendered blank, and a failed settings read falls back to the shipped defaults so no page fails because of the shell.
- Every profile link — the site's own, a listing's and an author's — is shown as that platform's brand mark with the platform name as its accessible name and hover title, at a 44 px target (36 px inside the slim contact strip). LinkedIn keeps a neutral globe: Simple Icons withdrew that mark at the trademark owner's request.
- The review rating is a star radio group (five radios, filled up to the choice, each named "N stars"), and rating displays draw star icons rather than the ★ character.
- Waiting is visible: the public site shows a navigation indicator during client-side page changes (additive, so pages still render with JavaScript disabled), and the admin has one loading screen for route code, session checks and record loads plus a boot loader in the document itself.
- Failures are designed: 404 and 500 share one treatment with the status named, a quotable reference and real destinations out; `global-error.tsx` covers a failure in the root layout; the admin boundary tells a stale build apart from a genuine fault and offers the reload that fixes it. The API answers every failure with its `{error:{code,message,fields,requestId}}` envelope.

## Administrator roles and permissions (Phase 29, SRS 1.1 RBAC 002–012)

- Permissions are declared in application code (`resource.action`, with a label, description and module) and synchronised into the database by `pnpm --filter api admin:seed-rbac`. Administrators assign registered permissions; they never invent codes, so a misspelling cannot become a silent grant.
- A role carries permissions, an administrator holds roles, and permissions can also be granted directly to one administrator. Effective access is the union of both, restricted to active roles, active permissions and an active account. There are no deny rules in this revision — the absence of a grant is denial.
- Every admin route declares its permission and the guard defaults to deny: 401 without authentication, 403 without the permission, with no hint about which one was missing. Hiding interface elements is a courtesy; a URL typed by hand still gets 403.
- Effective permissions are cached in Redis under an authorization version that every access change increments in the same transaction, so withdrawn access is gone on the next request; if Redis is unavailable the resolver reads MySQL, and a cache failure never grants access.
- The admin has a roles list, a role editor with a permission matrix grouped by module, a read-only permission catalogue, and an access editor per administrator showing inherited and direct permissions and the source of every effective capability. Refused by design: editing your own access, granting what you do not hold, demoting or disabling the last active Super Admin, and deleting, deactivating or hand-editing the protected Super Admin role. Every change is audited.

Developer guide: [docs/authorization.md](docs/authorization.md). Decision: [docs/decisions/0001-authorization-casl.md](docs/decisions/0001-authorization-casl.md).
