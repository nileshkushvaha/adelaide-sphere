# Adelaide Sphere — Setup Progress

Source of truth: `docs/Adelaide_Sphere_Technical_SRS_v1.md` (SRS v1). This Markdown file is the repository's working requirements reference. It was converted from a Word document that is **not present in the repository** and is not synchronised with the Markdown automatically; if the Word file is edited elsewhere, the Markdown must be re-exported deliberately. (A word-level comparison on 2026-09-05, against text extracted from the Word file while it was still present, found the two substantively identical apart from a table of contents, angle-bracketed URLs and straight quotes.)
Architecture: pnpm monorepo; `apps/web` (Next.js), `apps/api` (NestJS), `apps/admin` (Refine, later), `apps/worker` (BullMQ, later); Prisma + MySQL; Redis; S3-compatible storage.

## Verified toolchain

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 24.19.0 | pinned in `.nvmrc`; root `engines.node >=24.19.0` |
| pnpm | 12.3.4 | pinned via `packageManager` and `devEngines` in root `package.json` |
| TypeScript (api) | 6.0.3 | kept; see decisions below |
| TypeScript (web) | 5.9.3 | kept; verified in Phase 2, need not match the API |
| NestJS core / CLI | 12.0.1 / 12.0.0 | ESM, strict mode |
| @nestjs/config | 12.0.0 | env loading + validation (Phase 4) |
| class-validator / class-transformer | 0.15.1 / 0.5.1 | DTO and env validation (Phase 4) |
| Vitest / Vite | 4.1.11 / 8.2.2 | Vite is a peer of Vitest, not a direct dependency |
| oxlint | 1.81.0 | API linter chosen by Nest scaffold |
| supertest / @types/supertest | 7.2.2 / 7.2.1 | |
| Docker / Docker Compose | 29.7.2 client, 29.5.2 server / 5.4.0 | daemon provided by Colima 0.10.3 (`colima start`) |
| MySQL image | mysql:8.4.11 | 8.4 LTS, arm64+amd64 (Phase 5) |
| Prisma CLI / @prisma/client / @prisma/adapter-mariadb | 7.10.0 (exact) | Phase 6; `mariadb` driver 3.4.5 via the adapter |
| Redis image | redis:8.4.6 | 8.4 line, arm64+amd64 (Phase 5) |
| Admin: React / Refine core / Refine antd / Refine router | 19.2.8 / 5.0.12 / 6.0.3 / 2.0.4 | Phase 7 |
| Admin: Ant Design / icons / React Router / TanStack Query | 5.29.3 / 5.6.1 / 7.18.3 / 5.102.8 | constrained by Refine peers (antd ^5.23, react-router ^7) |
| Admin: Vite / plugin-react / Vitest / jsdom / Testing Library | 8.2.2 / 6.1.1 / 4.1.11 / 30.0.1 / react 16.3.3, dom 10.4.1, jest-dom 7.0.1, user-event 14.6.7 | Phase 7 |
| Admin: TypeScript / ESLint / typescript-eslint | 6.0.3 / 10.10.0 / 8.69.0 | typescript-eslint peer `<6.1.0` |
| Next.js / create-next-app | 16.3.4 | Turbopack; App Router; `src/` layout |
| React / react-dom | 19.2.8 | |
| ESLint / eslint-config-next | 9.39.5 / 16.3.4 | ESLint 9.x is EOL; see Phase 2 notes |
| Tailwind CSS / @tailwindcss/postcss | 4.3.3 | |
| @types/node (web / api) | 24.13.3 | web aligned to `^24.13.3` in Phase 3; same store entry as the API |

## Phases 1–7 (archived)

Dependency cleanup, frontend/backend verification, repository conventions, API foundation, local MySQL/Redis, Prisma foundation (incl. the readiness-recovery root cause) and the admin application foundation are complete. Their full records moved unchanged to [docs/history/setup-progress-phases-1-7.md](history/setup-progress-phases-1-7.md). Do not re-read them during normal development; `docs/ai/current-state.md` carries what still matters.

## Remaining roadmap (set 2026-09-06 at the start of the autonomous run; re-checked against the SRS before each phase)

Ordering follows SRS section 22 gates and the mandated dependency order; security enforcement precedes CRUD. Phase numbers continue this document's numbering (SRS phase numbers differ and are cited in brackets).

| Phase | Scope | SRS traced | Depends on |
| --- | --- | --- | --- |
| 8 | Foundation gaps: collation policy applied through migrations; dedicated `<db>_test` database + API integration-test harness against real MySQL; traceability document; security middleware baseline (security headers, trusted-proxy config) | DAT 001/004/006, DIR 004 (collation), SEC 001/003, QA 001, MOD 002 | 1–7 |
| 9 | Administrator identity, sessions and RBAC: AdminUser/Role/Permission/Session/ResetToken/AuditLog tables, Argon2id, login/logout/me/forgot/reset, opaque cookie sessions, CSRF, Redis-backed login throttling, guards + permission decorator, bootstrap procedure, audit events, admin route protection in `apps/admin`, OpenAPI for auth routes | ADM 001, AUTH 001–002, RBAC 001, SEC 001–004, API 001/002/005, MON 001 [SRS phase 5] | 8 |
| 10 | Admin account lifecycle: create/disable/enable admins, setup links, session revocation, last-Super-Admin protection, optional TOTP (AUTH 003), audit read API | ADM 001, AUTH 003, RBAC 001, ADM 003 (audit widget) | 9 |
| 11 | Adelaide taxonomy and location model: categories (2 levels), services + synonyms, local areas allowlist; admin CRUD with deactivation rules | CFG 003, BUS 008, SCP 001/004, DAT 001–004 [SRS phase 6] | 9 |
| 12 | Business listings core: Business/BusinessAddress/BusinessRating shells, draft→published→archived, versions/409, eligibility verification, duplicates, admin list/form (Refine vertical slice) | BUS 002/006/007, API 005, ARC 005, DAT 005 | 11 |
| 13 | Listing media, hours, contacts, links: OpeningInterval/HoursException with DST tests, contact validation, address visibility, media usage (with the media foundation) | BUS 001/003/004, MED 001–004 (foundation), DAT 001 | 12 |
| 14 | Public directory (web): shadcn/ui + design tokens, directory/category/area pages, SearchService, filters/sort/pagination, related listings, business detail | DIR 001–008, BUS 001/005, UX 001–003, CACHE 001 [SRS phase 7] | 13 |
| 15 | Hero and fixed-Adelaide search with accessible rotating headline and suggestions | HERO 001–007 | 14 |
| 16 | Reviews, ratings, abuse reports and moderation (pending by default, aggregates, idempotency, Turnstile, rate limits) | REV 001–005, REP 001–002, API 003/004, SEC 002/003 | 12, 9 |
| 17 | Enquiries: outbox, BullMQ worker (`apps/worker`), email adapter, delivery states, webhooks | ENQ 001–007, EVT 001–002, ARC 003 | 16 |
| 18 | Blog: categories/tags/authors/posts, scheduling, revisions, preview | BLOG 001–005, DAT 005 | 13 |
| 19 | Public blog pages, comments and moderation | BLOG 004–005, COM 001–002 | 18, 16 |
| 20 | Media pipeline completion: S3-compatible quarantine flow, variants, lifecycle | MED 001–004 | 13, 17 |
| 21 | SEO: metadata, canonical, sitemap, robots, JSON-LD, redirects | SEO 001–007 | 14, 19, 20 |
| 22 | Caching and invalidation: Redis cache, Next.js revalidation, urgent purge, featured placements | CACHE 001–003, DIR 007, CFG 001 | 14–21 |
| 23 | Accessibility, performance, responsive and browser hardening | NFR 001, 006–008, 011–013 | 14–22 |
| 24 | Deployment, backups, monitoring, recovery, runbooks | OPS 001–004, BACK 001–002, MON 001–002, NFR 004/009 | 22 |
| 25 | Traceability review and internal pre-audit | QA 001–003, section 21 | all |

Blocking client decisions carried from SRS section 23 (D01–D08) are recorded in `docs/requirements-traceability.md`; work proceeds with the SRS baselines (council-area boundary, TOTP optional, etc.) until decided.

## Phase 8 — Foundation gaps before authentication (complete, 2026-09-06)

SRS covered: DAT 001/004/006 and DIR 004 (collation policy and deterministic ordering), SEC 001 (security headers, CSP) and SEC 003 (trusted proxy / X-Forwarded-For), QA 001 and MOD 002 (integration tests against real MySQL), ARC 001 (decision register).

Acceptance criteria: (1) one collation applied to server, databases and tables and enforced by a migration lint; (2) an isolated `_test` database with an API integration harness that refuses any other target; (3) security headers on every API response and a validated trusted-proxy setting; (4) roadmap and traceability documents exist; (5) root check, unit, e2e and integration suites pass.

Decisions:

- **Collation: `utf8mb4_unicode_ci` everywhere.** Prisma Migrate hard-codes it for MySQL tables, so choosing it removes any need to hand-edit migrations (which would also break Prisma's checksum tracking) and eliminates mixed-collation joins. It is case- and accent-insensitive, which is what directory search and unique slugs want. Applied through: Compose `--collation-server=utf8mb4_unicode_ci` (container recreated normally, volume kept), `ALTER DATABASE` on the shadow database as root, migration `20260905201937_collation_policy_utf8mb4_unicode_ci` (`ALTER DATABASE ... COLLATE utf8mb4_unicode_ci` on the app database), and the new test database created with it. `packages/database/scripts/check-migrations.mjs` (`pnpm db:migrations:check`, part of `pnpm check`) rejects any other collation/charset and any `DROP/TRUNCATE` without a `-- reviewed:` comment. Documented tie rule for DIR 004: case/accent-insensitive string order, ties broken by stable ID.
- **Test database.** `<name>_test` (`adelaide_sphere_test`) is created by the first-start init script (and was created once as root on the existing volume) and granted to the app user only. `apps/api/test/integration/*` derives its URL from `DATABASE_URL_TEST` or from `DATABASE_URL` with `_dev → _test`, refuses names not ending in `_test`, runs `prisma migrate deploy` in global setup, and truncates only application tables. `pnpm test:integration` runs the database package suite (dev DB, prefixed keys) and the API suite (test DB). It is deliberately outside `pnpm check` because it needs `pnpm infra:up`.
- **Security baseline.** `helmet` 8.3.0 in `configureApp`: CSP `default-src 'none'; frame-ancestors 'none'`, nosniff, frame denial, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`, HSTS. `TRUST_PROXY` (integer 0–10, default 0) sets Express `trust proxy`; 0 locally, 1 behind the production reverse proxy; wildcards are impossible by validation.
- Deferred to the phases that need them: `packages/config`, `packages/contracts` (with OpenAPI in Phase 9), `packages/ui`/shadcn (Phase 14), `apps/worker` (Phase 17), Redis client (Phase 9 login throttling).

Files: `infrastructure/docker-compose.yml`, `infrastructure/mysql-init/10-shadow-database.sh`, `infrastructure/README.md`, `packages/database/prisma/migrations/20260905201937_collation_policy_utf8mb4_unicode_ci/migration.sql`, `packages/database/scripts/check-migrations.mjs`, `packages/database/package.json`, `packages/database/README.md`, `apps/api/src/app.setup.ts`, `apps/api/src/main.ts`, `apps/api/src/config/env.validation.ts` (+spec), `apps/api/test/app.e2e-spec.ts`, `apps/api/vitest.config.integration.ts`, `apps/api/test/integration/{test-database-url,global-setup,setup-env,harness}.ts`, `apps/api/test/database.integration-spec.ts`, `apps/api/package.json`, `apps/api/.env.example`, root `package.json`, `README.md`, `docs/requirements-traceability.md` (new), this file.

Evidence: `pnpm db:migrations:check` OK; `pnpm check` passes (api unit 41, e2e 14 incl. security headers, admin 38, database 23); `pnpm test:integration` passes (database 5, api 3: readiness 200 against the test DB, migrations applied with unicode_ci everywhere, guarded truncation); `migrate status` up to date on dev; collations verified via information_schema for dev/shadow/test databases and both tables; frozen install and peer check clean.

Limitations: Prisma cannot express collation in the schema, so the policy relies on the migration lint plus the server default; `helmet`'s HSTS header is emitted over plain HTTP locally (browsers ignore it there).

Next: Phase 9 — administrator identity, sessions and RBAC.

## Phase 9 — Administrator identity, sessions and RBAC (complete, 2026-09-06)

SRS: ADM 001 (bootstrap, no registration, last-Super-Admin rule prepared), AUTH 001 (email/password, Argon2id, generic responses, throttling, reset tokens hashed/single-use/30 min, reset revokes sessions), AUTH 002 (opaque hashed server sessions, Secure/HttpOnly/SameSite cookie scoped to `/api/v1/admin`, rotation on login, 30 min idle / 12 h absolute, server-side logout, no localStorage tokens), RBAC 001 (permission catalogue, roles, joins, seeded Super Admin, guards on every admin endpoint, default deny), API 001/002/005 (OpenAPI, envelopes, explicit DTOs), SEC 001 (CSRF/Origin checks for session mutations), SEC 002/003 (login limits: 5 failed per 15 min per IP + account throttling, fail-safe when the limiter store is down), SEC 004 (secrets validated, never logged), MON 001 (redacted audit/log records), DAT 001/014 table (AdminUser, Role, Permission, joins, Session, ResetToken, AuditLog).

Acceptance criteria:
1. Migration adds admin_user, role, permission, role_permission, admin_role, admin_session, password_reset_token, audit_log with the SRS constraints; `pnpm db:migrations:check` passes.
2. `pnpm --filter api admin:bootstrap` creates the first Super Admin exactly once (refuses when any admin exists), never from default credentials; permissions/roles seed idempotently.
3. `POST /api/v1/admin/auth/login` returns the admin + session summary and sets the cookie; wrong password, unknown email and disabled accounts all return the same 401 envelope; 5 failures per 15 min (per IP and per account) → 429 with `Retry-After`; Redis outage → 503, never a bypass.
4. `GET /me`, `POST /logout` (204, server record revoked, cookie cleared), `POST /forgot-password` (always 202), `POST /reset-password` (single use, 30 min, revokes all sessions).
5. Every `/api/v1/admin/*` route except the declared public auth routes requires a valid session; a route without a permission declaration is denied; missing permission → 403 envelope; idle/absolute expiry and revocation → 401.
6. Mutating admin requests without a trusted `Origin`/`Referer` (or `Sec-Fetch-Site: same-origin`) → 403.
7. Audit rows for login success/failure, logout, reset requested/completed, session revocation; no passwords, tokens or cookies in logs or audit.
8. OpenAPI document generated for the auth routes and served in development; `packages/contracts` holds the generated spec and types.
9. Admin app: login page, Refine auth provider on the cookie session, protected routes, current-admin display and logout; no tokens in web storage.
10. Unit + integration (real MySQL test DB + Redis) + e2e + admin tests pass; root check passes; secret scan clean.

Decisions and implementation (all acceptance criteria met):

- **Toolchain**: `@node-rs/argon2` 2.2.0 (Argon2id, prebuilt N-API binaries for darwin-arm64/linux-x64/linux-arm64, no build script), `ioredis` 5.11.1 (BullMQ's peer is `>=5`; 6.0 was released weeks ago and was not adopted), `@nestjs/swagger` 12.0.1, `cookie` 2.0.1, `openapi-typescript` 7.13.0 (TS 5.9.3 pinned inside `packages/contracts` for its `^5` peer), `@ant-design/v5-patch-for-react-19` 1.0.3 (official antd v5 + React 19 compatibility). `@scarf/scarf` (install-time telemetry via swagger-ui-dist) is explicitly denied in `pnpm-workspace.yaml`.
- **Schema/migrations**: `admin_identity_sessions_rbac_audit` adds AdminUser, Role, Permission, RolePermission, AdminRole, AdminSession, PasswordResetToken, AuditLog with unique normalised email, unique token hashes (SHA-256 hex), composite join keys, FK deletion rules (sessions/tokens/joins cascade with the admin; permissions/roles restrict; audit actor SET NULL), indexes on status/expiry/actor/action/target. `plural_table_names` (hand-written, non-destructive `RENAME TABLE` + index/constraint renames, reviewed instead of Prisma's drop/create) adopts the **snake_case plural table policy** raised by the client; `prisma migrate dev` confirms no drift.
- **Identity**: permission catalogue in code (`identity/permissions.ts`, SRS RBAC 001 keys), seeded idempotently with one system role `super_admin`; `IdentityService.getPrincipal` resolves roles → permissions.
- **Passwords**: Argon2id with configured `m=19456,t=2,p=1` minimums (validation refuses weaker), 12–256 chars (documented bound), rehash-on-login when parameters rise, timing-equalising dummy verify for unknown accounts.
- **Sessions**: 256-bit random token, SHA-256 hash stored, cookie `as_admin_session` HttpOnly/Secure(prod)/SameSite=Strict/Path=`/api/v1/admin`/Max-Age=absolute; idle 30 min (sliding, persisted at most once a minute) and absolute 12 h; revocation reasons recorded (`logout`, `idle_timeout`, `expired`, `password_reset`, `account_disabled`). Redis session caching deferred (MySQL authoritative).
- **Throttling**: Redis (`as:` prefix) counters per IP and per HMAC(email) with `APP_SECRET_KEY`; 5/15 min, account window escalates to 1 h after 10 failures; `429` + `Retry-After`; Redis failure → `503` (fail safe). `TRUST_PROXY` governs client IP.
- **CSRF**: `CsrfOriginGuard` (Origin → Referer → `Sec-Fetch-Site`) on every mutating admin request including login; `TRUSTED_ORIGINS` validated (https-only in production).
- **Guards**: global `SessionAuthGuard` → `PermissionsGuard` (default deny; `@Public`, `@SessionOnly`, `@RequirePermissions`), applied by path prefix so every future admin controller inherits them.
- **Audit**: append-only `audit_logs` with metadata sanitisation (keys matching password/token/secret/cookie/hash dropped).
- **Reset**: token 256-bit random, hashed, 30 min, single use (atomic consume), revokes all sessions, password policy + not-the-email rule; `MailerPort` with `NullMailer` (prod default until D03) and dev-only `ConsoleMailer`; forgot-password always 202 and throttled.
- **Bootstrap**: `pnpm --filter api admin:bootstrap` (env-provided credentials, refuses when any admin exists, audit `admin.bootstrap`); `admin:seed-rbac`.
- **OpenAPI/contracts**: `packages/contracts` with `openapi/api.json` (7 paths) generated from the running Nest metadata (`pnpm contracts:generate`), types via openapi-typescript; `pnpm contracts:check` (in `pnpm check`) regenerates to a temp file and fails on drift. Admin app types for auth come from the contract. Document served at `/api/v1/openapi.json` when `OPENAPI_ENABLED=true` (JSON only; no UI, so the strict CSP stays).
- **Readiness** now checks MySQL and Redis (both consumed).
- **Admin app**: Refine auth provider on the cookie session (in-memory identity only; concurrent checks share one `/me` call), `<Authenticated>` around the shell with redirect to `/login`, login/forgot/reset pages (public), header shows the admin and Sign out; 401 anywhere logs out.

Tests: API unit 69 (password params/verify/rehash/bounds, throttle limits/escalation/keyed keys/fail-safe, CSRF guard, permissions default-deny, session cookie/hash, audit sanitisation, env incl. production refusals), API e2e 18 (401 before backends, login CSRF, 503 fail-safe when Redis unreachable, DTO validation, headers), API integration 16 (login cookie/audit, email normalisation, generic 401 ×3 with audit reasons, CSRF/unknown fields, per-IP and per-account throttling, `/me`, forged cookie, permission allow/forbid/undeclared/session-only, mutation origin, idle expiry revocation, disabled account, logout, reset flow incl. weak/expired/reused tokens), database 23+5, admin 46 (auth provider incl. dedup, login page error surfacing, anonymous redirect, reset page guard). `pnpm check` and `pnpm test:integration` pass; frozen install and peer check clean.

Runtime verification (API 4001 + admin 4002, stopped afterwards): bootstrap created the dev Super Admin once and refused a second run; readiness `{database: ok, redis: ok}`; `/api/v1/openapi.json` served; login without Origin → 403 `CSRF_ORIGIN_REJECTED`; wrong password → 401 `INVALID_CREDENTIALS`; login via the admin proxy → 200 with `Set-Cookie … Path=/api/v1/admin; HttpOnly; SameSite=Strict`; `/me` 200 with cookie, 401 without; logout 204 then `/me` 401; five bad logins → sixth 429 `Retry-After: 900`; forgot-password 202 with the dev console mail printed; reset with weak password → 400 field error, reset → 204, token reuse → 400 `INVALID_RESET_TOKEN`, old password 401, new password 200; audit rows for every action; browser: `/admin/` redirects to the login page, no web storage, session cookie invisible to JavaScript; the initial burst of `/me` checks was deduplicated.

Limitations / deferred: reset-link delivery needs an email provider (D03); TOTP, admin CRUD, session listing/revocation UI and last-Super-Admin protection are Phase 10; Redis session cache not implemented (MySQL only); `check()` results are shared for 1 s only, so Refine's multiple consumers still cause a couple of `/me` calls per navigation; antd React 19 patch is the vendor-recommended shim, not native support.

Files: `packages/database/prisma/schema.prisma`, migrations `20260905203242_admin_identity_sessions_rbac_audit`, `20260905204557_plural_table_names`, `packages/database/src/index.ts`, `packages/contracts/**` (new), `apps/api/src/{auth,identity,audit,redis,cli}/**`, `apps/api/src/{app.module,app.setup,main,openapi}.ts`, `apps/api/src/config/env.validation.ts` (+spec), `apps/api/src/health/*`, `apps/api/test/**`, `apps/api/vitest.config*.ts`, `apps/api/package.json`, `apps/api/.env.example`, `apps/admin/src/{auth,api/auth.ts,pages/{Login,ForgotPassword,ResetPassword}Page.tsx,app/*,layouts/AdminShell.tsx,test/render.tsx,main.tsx}`, `apps/admin/package.json`, `pnpm-workspace.yaml`, root `package.json`, `README.md`, `apps/admin/README.md`, `packages/database/README.md`, `docs/requirements-traceability.md`, this file.

Next: Phase 10 — admin account lifecycle and security (admins CRUD with setup links, session revocation, last Super Admin protection, optional TOTP, audit read API, `apps/admin` screens).

## Phase 10 — Admin account lifecycle, sessions, audit and optional TOTP (complete, 2026-09-06)

SRS: ADM 001 (additional admins created by an authorised Super Admin with a short-lived setup link; prevent disabling/deleting the last active Super Admin), AUTH 001 (session revocation), AUTH 002 (rotate on privilege change), AUTH 003 (optional TOTP enrol/verify/disable/recovery codes; recent authentication for enrol/disable; encrypted secrets; hashed single-use recovery codes; no public bypass), RBAC 001 (`admins.manage`, `audit.read`), ADM 002 (account security screen, confirmations for destructive actions), ADM 003 (audit activity), section 16 (`/admins`, `/admins/{id}/sessions`, `/auth/totp/*`, `/audit`), DAT 002 (encrypted sensitive fields), MON 001.

Acceptance criteria:
1. `GET/POST /api/v1/admin/admins`, `GET/PATCH /admins/{id}`, `POST /admins/{id}/disable|enable`, `GET/DELETE /admins/{id}/sessions[/{sessionId}]`, all behind `admins.manage`, paginated with the `{data, meta}` envelope, `expectedVersion` on PATCH (409 on stale), explicit allowlisted DTO fields, audit rows for every change.
2. Creating an admin issues a setup token (hashed, single use, 24 h) delivered through the mailer port; `POST /auth/accept-setup` sets the password and activates the account. Accounts start in `invited` status and cannot sign in until set up.
3. Disabling an admin revokes all sessions immediately; the last active Super Admin cannot be disabled, demoted or have `super_admin` removed (409 `LAST_SUPER_ADMIN`); an admin cannot disable themselves.
4. Own account: `POST /auth/change-password` (current password required; revokes other sessions), `GET /auth/sessions`, `DELETE /auth/sessions/{id}`.
5. TOTP: `POST /auth/totp/enroll` (recent authentication ≤ 5 min or password re-entry; returns otpauth URI + provisional secret encrypted at rest), `POST /auth/totp/verify` (activates, returns 10 hashed single-use recovery codes once), `POST /auth/totp/disable` (recent auth), login for TOTP-enabled admins returns `202 {data:{challenge}}` and `POST /auth/totp/challenge` with a code or recovery code completes it; challenges expire in 5 min and are throttled.
6. `GET /api/v1/admin/audit` behind `audit.read`: filters by action/actor/target/date, paginated, newest first, never exposing sensitive metadata.
7. Admin app: Administrators list/create/edit/disable with confirmations and stale-edit warning, sessions revocation, Account security page (change password, TOTP enrol/disable with QR), Audit log page, TOTP challenge step on login, accept-setup page.
8. Unit + integration + e2e + admin tests; runtime verification; secret scan; root check.

Decisions: encryption of TOTP secrets uses AES-256-GCM with a dedicated `FIELD_ENCRYPTION_KEY` (32 random bytes, base64) so rotating the throttle secret never touches encrypted fields; the key is required (validated at startup).

Implementation (all acceptance criteria met):

- **Toolchain**: `otpauth` 9.5.2 (RFC 6238, SHA-1/6 digits/30 s, ±1 step), `qrcode.react` 4.2.0 (client-side QR of the otpauth URI; the secret never goes through an image service). Encryption: Node `crypto` AES-256-GCM (`common/field-encryption.service.ts`, versioned `v1:iv:tag:ct` format, admin id as AAD) with `FIELD_ENCRYPTION_KEY` (32 random bytes, validated; generated locally, placeholder in the example).
- **Schema** (`admin_lifecycle_totp`, additive): `AdminUserStatus` gains `invited`; `admin_users` gains `totpSecretEncrypted`, `totpPendingSecretEncrypted`, `totpEnabledAt`; `password_reset_tokens.purpose` (`reset|setup`); new `admin_recovery_codes` (unique adminId+codeHash) and `admin_login_challenges` (hashed single-use, 5 min, attempt counter).
- **Administrators API** (`admins.manage`): list with `page/pageSize(≤50)/q/status/sort(allowlist)/order` and stable id tie-break; create → `invited` + 24 h single-use setup link via the mailer port; get; PATCH with `expectedVersion` (409 `STALE_VERSION`), role change rotates sessions; disable (revokes all sessions, refuses self and the last active Super Admin with 409 `LAST_SUPER_ADMIN`), enable, resend-setup; sessions list/revoke one/revoke all. All audited (`admin.create|update|disable|enable|setup_link.resent|session.revoke|session.revoke_all|setup.completed`).
- **Own account** (`@SessionOnly`): change-password (current password required; other sessions revoked), sessions list/revoke, TOTP enrol (recent auth ≤5 min or current password → 403 `REAUTHENTICATION_REQUIRED` otherwise), verify (activates, returns 10 hashed single-use recovery codes once), disable (recent auth + valid TOTP or recovery code). Login for TOTP-enabled admins returns **202** `{requires:'totp', challenge, expiresAt}` (no cookie) and `POST /auth/totp/challenge` completes it; challenges are single use with 5 attempts and audited failures; recovery codes are consumed atomically.
- **Audit read** (`audit.read`): `GET /admin/audit` with `action` (exact or `prefix*`), actor/target/date filters, newest first, actor email/name joined, no sensitive metadata.
- **Admin app**: Administrators list (URL-persisted search/status/page), create dialog with field errors, detail page (edit with expectedVersion + stale-edit message, disable/enable confirmations, resend link, session revocation), Account security (change password, sessions, TOTP enrol QR + manual key, recovery codes shown once, disable with re-auth prompt), Audit log, Accept-setup page, TOTP step on the login page, permission-gated navigation (courtesy only). Contract types regenerated (23 paths).

Tests: API unit 75 (+ field encryption round-trip/tamper/AAD/key, TOTP verify window/recovery codes), e2e 18, integration 27 (+11: create/list/filters/sort allowlist/unknown fields, invited login blocked, setup single-use, expectedVersion/stale 409, self-disable, disable revokes sessions, enable, last-Super-Admin demotion refused, session listing/revocation, audit filters/injection rejection, change-password, TOTP enrol/verify/challenge/wrong code/single-use challenge/recovery code spend/disable with re-auth), admin 50 (+ administrators page list/create/conflict, TOTP login step, accept-setup validation). `pnpm check`, `pnpm test:integration`, frozen install and peers pass.

Runtime verification (live API 4001 + admin 4002, stopped afterwards): create invited admin → console mail with setup link; list sorted by email with meta; audit shows `admin.create` by the actor; TOTP enrol → verify with a generated code → 10 recovery codes → login 202 challenge → wrong code 401, right code 200 with cookie → disable 204 → plain login 200; invited login 401 → accept-setup 204 → reuse 400 → new admin login 200 → self-disable 409 `SELF_DISABLE` → Super Admin disables it (session immediately 401) → stale enable 409 `STALE_VERSION`. Browser: `/admin/admins` and `/admin/account` redirect anonymous visitors to login with `?to=`; `/admin/accept-setup?token=…` renders the activation form.

Limitations / deferred: setup and reset links need an email provider (D03); whether TOTP is mandatory is D06 (optional now); no admin UI for role editing beyond `super_admin` (SRS ADM 003 out of MVP); lost-factor recovery is by another Super Admin disabling TOTP after identity verification — currently that means disabling the account and re-inviting; a dedicated audited "reset second factor" action is recorded as follow-up; recovery codes cannot be regenerated without disabling and re-enrolling.

Files: `packages/database/prisma/{schema.prisma,migrations/20260906020806_admin_lifecycle_totp}`, `packages/database/src/index.ts`, `packages/contracts/**` (regenerated), `apps/api/src/{admins/**,audit/audit.controller.ts,audit/audit.module.ts,auth/account.service.ts,auth/totp/**,auth/dto/account.dto.ts,auth/auth.controller.ts,auth/auth.service.ts,auth/auth.module.ts,common/field-encryption.service.ts,common/pagination.ts,config/env.validation.ts,identity/identity.service.ts,app.module.ts}` (+specs), `apps/api/test/{admins.integration-spec.ts,integration/harness.ts}`, `apps/api/vitest.config*.ts`, `apps/api/.env.example`, `apps/admin/src/{api/admins.ts,api/auth.ts,auth/auth-provider.ts,pages/**,layouts/AdminShell.tsx,app/routes.tsx,shared/{useAsync,format}.ts}` (+tests), `apps/admin/package.json`, `README.md`, `apps/admin/README.md`, `docs/requirements-traceability.md`, this file.

Next: Phase 11 — Adelaide taxonomy and location model.

## Phase 11 — Adelaide taxonomy and location model (complete, 2026-09-06)

SRS: CFG 003 (active status, stable slugs, two-level categories, no cycles/orphans, deactivation preserves history), BUS 008 (local areas as allowlisted Adelaide subdivisions with unique slug, optional editorial intro, active flag, eligibility source/date recorded by admins; no state/country expansion), SCP 001/004 (server-owned Adelaide constants; council-area baseline until D01), DIR 002 (category descendants), HERO 005 (services with synonyms for search), DAT 001–004 (opaque ids, versions, unique slugs incl. archived, indexes), API 005 (expectedVersion, explicit state actions), RBAC 001 (`taxonomy.manage`), section 15/16 (`GET /categories /services /areas` public, `/admin/categories /services /areas` CRUD/deactivation), MOD 001 (TaxonomyModule).

Acceptance criteria:
1. Migration adds `categories` (name, slug unique, parentId nullable self-FK with two-level limit enforced in service, sortOrder, active, description), `services` (name, slug unique, active) + `service_synonyms` (unique per service, indexed for search), `local_areas` (name, slug unique, active, editorialIntro, eligibilityNote/source, verifiedAt) — all with version/createdAt/updatedAt and the plural snake_case policy; `pnpm db:migrations:check` passes.
2. Public `GET /api/v1/categories` (tree of active), `/services` (active with synonyms), `/areas` (active), cacheable (`Cache-Control: public, max-age=300`), never exposing inactive items.
3. Admin CRUD under `taxonomy.manage` with `expectedVersion`, slug generation/validation (lowercase-hyphen, immutable once published-referenced), explicit `deactivate`/`activate` actions, cycle/depth prevention (409), and deactivation blocked while active listings reference the term (prepared: the check exists and is exercised once Business exists in Phase 12).
4. Adelaide constants exposed by `GET /api/v1/site/context` (`city: Adelaide`, `state: SA`, `country: AU`, `timezone: Australia/Adelaide`); no city CRUD anywhere.
5. Seed fixture command for a conservative council-area local-area allowlist and starter categories/services, run explicitly (`pnpm --filter api taxonomy:seed`), idempotent, audited.
6. Admin app: Categories, Services, Local areas screens (list/search, create/edit with stale-edit handling, activate/deactivate with confirmation) registered as Refine resources with the data provider extended for the documented list contract (`q`, `status`, `sort`, `order`).
7. Unit + integration (constraints: unique slugs, parent depth, cycle) + e2e + admin tests; root check; runtime verification; secret scan.

Implementation (all acceptance criteria met; criterion 6 uses the typed clients rather than Refine resources, see decision):

- **Schema** (`directory_taxonomy_and_local_areas`, additive): `categories` (unique slug, self-FK `parentId` RESTRICT, sortOrder, active, description, version), `services` + `service_synonyms` (unique per service, indexed `term`), `local_areas` (unique slug, editorialIntro, eligibilitySource, eligibilityVerifiedAt, active, sortOrder, version). Two-level nesting and cycles are enforced in the service (409 `CATEGORY_DEPTH`/`CATEGORY_CYCLE`), because MySQL cannot express the depth rule declaratively.
- **API**: `TaxonomyModule` (`taxonomy.service.ts`, public + admin controllers), `SiteModule` (`GET /site/context` with server-owned Adelaide constants and the D01 boundary note). Shared `common/slug.ts` (NFKD + transliteration of ß/æ/ø/œ/đ/ł, lowercase-hyphen, ≤100) and `common/pagination.ts`. Public reads expose only active items (children of inactive parents are hidden), cache 5 min. Admin lists share one contract (`q`, `status`, `sort` allowlist, `order`, pagination) with stable id tie-break. Deactivation guards: active children, inactive parent, `referencedByActiveListings` hook (returns 0 until Phase 12 adds Business). `HttpExceptionFilter` now maps `DatabaseUnavailableError` to 503 `SERVICE_UNAVAILABLE` (SRS API 002) instead of a generic 500.
- **Seed**: `pnpm --filter api taxonomy:seed` (idempotent by slug, audited `taxonomy.seed`): 14 inner-city localities as the conservative allowlist (baseline pending D01, each with `eligibilitySource` and verification timestamp), 5 starter root categories with 4 children, 3 services with synonyms. Ran twice on the dev database: first run created 14/9/3, second created 0.
- **Admin app**: one generic `TermsPage` driven by per-resource configs (`pages/taxonomy/configs.tsx`) for Categories, Services and Local areas; navigation entries gated by `taxonomy.manage`. Decision: the screens call the typed clients (`api/taxonomy.ts`, contract types) directly instead of registering Refine `resources`, because the Refine data provider still refuses undocumented sort/filter serialisation; the list contract is now documented, so Phase 12's listing slice will move these onto the provider (SRS ARC 005 vertical slice) rather than duplicating that work here.

Tests: API unit 85 (+ slugify incl. transliteration and length cap, isValidSlug, normaliseSynonyms), e2e 19 (+ public taxonomy → 503 envelope without a database; site context cacheable), integration 32 (+5: anonymous/cacheable public reads and 401 admin reads; category slug generation/uniqueness/invalid slug/depth/cycle/orphan parent/rename/stale/public tree; deactivation rules and audit actions; services synonym normalisation/replace/public/limit; local areas eligibility timestamps/ordering/unknown expansion fields/context/deactivate), admin 53 (+3: URL-driven list, create with envelope field errors + confirmed deactivation, stale-version message). `pnpm check` passes; contracts regenerated (39 paths). One transient integration failure (readiness test, Redis ping) was observed once in a full run and passed on two reruns; recorded as a flake to watch.

Runtime verification (live API on 4001 — a `nest start --watch` process the client started, left running — and the admin dev server on 4002, stopped afterwards): `/categories` via the admin proxy → 200 with `cache-control: public, max-age=300`, 5 roots with children counts; `/services` with synonyms; `/areas` 14 entries with no private fields; admin list anonymous → 401; login → create “Pets & Vets” under Home Services (slug `pets-and-vets`) → nesting under it 409 `CATEGORY_DEPTH` → deactivate (v1) → stale activate 409 `STALE_VERSION` → public tree excludes it → reactivate (v2) → public again; audit trail create → deactivate → activate. Browser: `/admin/categories` redirects anonymous visitors to login.

Files: `packages/database/prisma/{schema.prisma,migrations/20260906022638_directory_taxonomy_and_local_areas}`, `packages/database/src/index.ts`, `packages/contracts/**` (39 paths), `apps/api/src/{taxonomy/**,site/**,common/{slug,pagination}.ts,common/http-exception.filter.ts,cli/seed-taxonomy.ts,app.module.ts,package.json}` (+specs), `apps/api/test/{taxonomy.integration-spec.ts,app.e2e-spec.ts,integration/harness.ts}`, `apps/admin/src/{api/taxonomy.ts,pages/taxonomy/**,app/routes.tsx,layouts/AdminShell.tsx,test/render.tsx}` (+tests), `README.md`, `docs/requirements-traceability.md`, this file.

Next: Phase 12 — business listings core.

## Phase 12 — Business listings core (complete, 2026-09-06)

SRS: BUS 002 (publication requirements: name, unique stable slug, useful description, active primary category, verified Adelaide eligibility, at least one contact route, content rights reviewed, admin verification timestamp; private enquiry destination separate from public contact), BUS 006 (draft → published → archived, unpublish returns to draft, explicit permission-protected publication with `firstPublishedAt`, versions and 409 on stale edits), BUS 007 (duplicate warning on normalised name + address/phone; logged override reason; taxonomy removal blocked while referenced), SCP 004 (eligibility against the approved local-area allowlist; never “Adelaide” in an address), DAT 001/004/005 (opaque ids, indexes on status + primary category/local area + firstPublishedAt, transactional state transitions), DAT 002 (encrypted private enquiry email), API 005 (expectedVersion, explicit state actions; documented Refine filters/sort allowlist), ARC 005 (Refine vertical slice: nested fields, publishing, permission denial, stale edit — image upload deferred to the media phase), RBAC 001 (`listings.read/write/publish`), section 16 (`/admin/businesses`, `/{id}/publish|unpublish|archive`), MOD 001 (DirectoryModule owns eligibility and publication).

Acceptance criteria:
1. Migration: `businesses` (name, slug unique incl. archived, description, status enum draft/published/archived, primaryCategoryId FK RESTRICT, localAreaId FK RESTRICT, publicPhone, publicEmail?, publicUrl, addressVisibility enum, privateEnquiryEmailEncrypted, eligibilityVerifiedAt/Source, contentRightsReviewedAt, firstPublishedAt, publishedAt, archivedAt, duplicateOverrideReason, version, timestamps), `business_addresses` (1:1, lines, suburb label, postcode, lat/lng decimals, fixed AU/SA context), `business_categories` (secondary joins, unique pair), `business_services` (unique pair), `business_ratings` shell (approvedCount, ratingSum, one per business, created with the business). Indexes per DAT 004. `db:migrations:check` passes.
2. Admin API: list with `q`, `status`, `categoryId`, `localAreaId`, `sort` allowlist (`name`, `updatedAt`, `createdAt`, `firstPublishedAt`, `status`), `order`, pagination; create/get/PATCH (nested address, secondary categories, services; `expectedVersion`), explicit `publish` (validates every BUS 002 gate and returns a field-level 409 `PUBLICATION_BLOCKED` listing unmet requirements), `unpublish` (→ draft), `archive`, `restore` (archived → draft); duplicate detection on create/update returns `warnings` and publishing a flagged duplicate requires `duplicateOverrideReason` (audited).
3. Taxonomy deactivation now checks references (`referencedByActiveListings`), with a test proving a term used by a published listing cannot be deactivated.
4. Private enquiry email is AES-256-GCM encrypted at rest and never returned by list endpoints; the detail endpoint returns it only to `listings.write` holders.
5. Refine vertical slice in the admin app: `businesses` registered as a Refine resource on the data provider with the documented list contract (sorters/filters serialised to `sort`/`order`/`q`/`status`/…), list page (server pagination, filters, sort), create/edit form with nested address, category/service selectors, publish/unpublish/archive actions with confirmations, stale-edit handling, permission denial surfaced from the API (403 → message, not hidden UI only).
6. Tests: unit (slug/duplicate normalisation, publication gate), integration (constraints, transitions, gates, duplicate override, stale edits, private field exposure, taxonomy reference block, permission denial for a read-only role fixture), admin (list/filters mapping, publish blocked message), e2e unchanged; root check; runtime verification; secret scan.
Out of scope here: opening hours, media/gallery, external link validation beyond URL shape (Phase 13); public pages (Phase 14).

Delivered:
- **Schema/migration** `20260906024051_business_listings_core`: `businesses`, `business_addresses` (1:1), `business_categories` and `business_services` (composite PK joins), `business_ratings` (shell, created with the business). Enums `BusinessStatus {draft, published, archived}` and `AddressVisibility {full, areaOnly}`. Taxonomy FKs are `RESTRICT` (a term in use can never be deleted underneath a listing); indexes on `status+primaryCategoryId`, `status+localAreaId`, `status+firstPublishedAt`, `normalizedName`, `normalizedPhone`, `name`. Applied to the dev database; the test database receives it through `migrate deploy` in the integration global setup. `db:migrations:check` passes.
- **API** `DirectoryModule` (`apps/api/src/business/`): `business-rules.ts` (name/phone/address normalisation, `publicationBlockers` implementing every BUS 002 gate, explicit transition table), `directory.service.ts` (list with `q`/`status`/`categoryId`/`localAreaId`/sort allowlist, create with generated slug, PATCH with `expectedVersion` and nested address/secondary categories/services, `publish|unpublish|archive|restore` with 409 `PUBLICATION_BLOCKED` carrying `fields.publication`, 409 `DUPLICATE_SUSPECTED` unless `duplicateOverrideReason` ≥ 10 chars, `SLUG_LOCKED` after first publication, `STALE_VERSION`), `directory-admin.controller.ts` (`listings.read` / `listings.write` / `listings.publish`). Private enquiry email is AES-256-GCM encrypted with the business id as associated data and only decrypted on the detail endpoint for `listings.write` holders; list rows never carry it. Every mutation is audited (`listing.<action>` with the reason/override reason). `TaxonomyService.referencedByActiveListings` is now backed by real counts (non-archived listings referencing a category, service or area), so `TERM_IN_USE` is enforced end to end.
- **Error envelope fix**: `HttpExceptionFilter` previously dropped `fields` from `HttpException` object bodies (taxonomy 409s lost their field detail); it now passes through validated `{ field: string[] }` maps only.
- **Contracts**: OpenAPI regenerated (45 paths); nullable string DTO properties now declare `type: String` so generated types are `string | null` rather than `Record<string, never>`; the list endpoint documents `BusinessListItemDto`.
- **Admin app (Refine vertical slice)**: `businesses` is the first resource registered on `<Refine resources>`; the data provider gains a per-resource `LIST_CONTRACTS` registry (`businesses`: sort allowlist and `q/status/primaryCategoryId→categoryId/localAreaId` filters; anything else still throws `ApiContractError`). `pages/businesses/BusinessesPage` (Refine `useList`, URL-driven filters/sort/pagination, duplicate and incomplete flags, write controls hidden without `listings.write`), `pages/businesses/BusinessEditorPage` (`useOne` + typed mutations, nested address with SA postcode rule, taxonomy selectors, compliance panel, publish/unpublish/archive/restore dialog with reason, blocker list from `fields.publication`, duplicate override prompt on `DUPLICATE_SUSPECTED`, `STALE_VERSION`/`SLUG_LOCKED` handling, archived → read-only). A 401 during a direct mutation is routed through Refine `useOnError` (auth provider → sign-in redirect) in the listings and taxonomy screens. Navigation entry gated by `listings.read`.

Verification (all green, 2026-09-06):
- Unit: database 23, API 89 (incl. `business-rules.spec.ts`), admin 59 (data-provider contract, list mapping, read-only role, create with nested field errors, stale edit, publish blocked → duplicate override → published, session expiry redirect). E2E 19.
- Integration (real MySQL/Redis): API 39 — `directory.integration-spec.ts` covers anonymous 401, a real read-only role fixture (403 on create/publish, no private email on detail or list), create with encrypted private email and rating shell, validation (unknown field, non-SA postcode, inactive taxonomy, non-http URL), publication gate with field-level reasons, `firstPublishedAt` set once across unpublish/republish, stale 409, slug lock, archived edit refusal, unique slug incl. archived, audit trail order, duplicate warning + override, `TERM_IN_USE` for category/area with archived references not blocking, inactive area rejected.
- Root `pnpm check` green (lint, typecheck, unit, e2e, builds, contracts in sync); `pnpm install --frozen-lockfile --offline` clean.
- Runtime: the API on 4001 (started for verification and stopped afterwards; the user's watch process had already exited) served the 45 documented paths; authenticated curl flow create → publish → stale PATCH 409 → list (no private email) → archive → audit `listing.create/publish/archive`. Admin app in the browser: Businesses list from the live API, New business form, archived detail read-only with Restore dialog. The archived listing `runtime-check-cafe` remains in the dev database as verification data.
- Secrets: the dev admin's password was rotated after being typed in the browser (reset flow, then the temporary value confirmed rejected); trackable-file scan clean; env files ignored.

Decisions:
- Duplicate detection is name-based (normalised name, then address/phone corroboration) and non-blocking on create; only publication requires an override reason (SRS BUS 007).
- Eligibility is recorded by an admin statement (`eligibilitySource`) against the active local-area allowlist; no geocoding in MVP (pending D01 boundary decision).
- Taxonomy selectors load up to 50 active terms per kind (the API page cap); a larger taxonomy needs a search-as-you-type selector (noted for Phase 13/23).

Limitations / follow-ups: opening hours, media, richer contact validation → Phase 13; public exposure → Phase 14; the admin bundle is still a single chunk (NFR 013 item stands); antd Select option tests use `title` matching under jsdom.


## Phase 13 — Listing hours, links and contact validation (complete, 2026-09-06)

SRS: BUS 004 (weekly hours with multiple intervals per weekday, explicit next-day flag for overnight closing, closed days, open 24 hours and unknown as distinct states; date-specific exceptions override weekly hours; wall-clock hours stored for Australia/Adelaide and evaluated with timezone-aware dates; unknown is never shown as open/closed), BUS 003 (valid `tel:` link, http(s)-only website/social links, directions from validated address/coordinates, service-area visibility), BUS 001 (social links, operating hours on the detail page — data side here, presentation in Phase 14), DIR 008 ("Open now" stays disabled until hours data quality and DST tests pass — evaluator and tests land here, the filter is a Phase 14 decision), API 001 (local operating hours are separately identified wall-clock values, not ISO instants), DAT 001 table row "OpeningInterval and HoursException" (validate non-overlap and exception priority), NFR 012 (Australia/Adelaide with DST rules), QA T04 (overnight/DST hours tests).

Roadmap adjustment (recorded, not silent): the original Phase 13 line also carried "media usage". Media needs the S3-compatible quarantine pipeline (MED 001–004) and the D03 provider decision; building a `BusinessMedia` table without the upload flow would be a placeholder. Media moves wholesale to Phase 20 (already "media pipeline completion"), where the usage record (`BusinessMedia`: order, caption, alt override, one cover) is created together with the pipeline. BUS 002's "fallback image when no gallery" is a static web asset in Phase 14.

Acceptance criteria:
1. Migration: `opening_intervals` (business FK cascade, ISO weekday 1–7, `allDay` or `startMinute`/`endMinute` 0–1440 with `endNextDay`), `hours_exceptions` (date, kind closed/open24/custom, optional interval, note), `business_links` (kind allowlist facebook/instagram/x/linkedin/youtube/tiktok/other, http(s) URL, label, order), `businesses.hoursMode` (`unknown` default / `scheduled`). `db:migrations:check` passes.
2. Hours domain (`apps/api/src/business/hours/`): pure `validateWeeklyHours` (interval bounds, non-overlap within a day including overnight spill into the next day, at most 4 intervals a day, `allDay` exclusive), `validateExceptions` (unique dates, custom needs intervals), and `evaluateHours(schedule, instant)` returning `unknown | open | closed` with `until` (next change instant) and `source` (`exception` | `weekly`), using an Intl-based Australia/Adelaide converter with explicit DST gap/overlap policy (gap → shifted forward, overlap → first occurrence). Unit tests cover: normal day, overnight interval across midnight, open-24, closed day, exception override (closed on a public holiday, custom hours), the 2026-04-05 ACDT→ACST and 2026-10-04 ACST→ACDT transitions (an interval spanning the change keeps wall-clock semantics), and unknown mode.
3. Admin API: `GET/PUT /admin/businesses/{id}/hours` (`listings.read` / `listings.write`; PUT replaces the weekly schedule and exceptions atomically with `expectedVersion`, bumps the business version, audits `listing.hours.update`; response includes the evaluated status "now" for admin preview). Links are part of the business create/PATCH body (`links[]`, replace semantics) and the `BusinessDto`; validation: http(s) only, no credentials in URL, known kinds must point at their host (e.g. instagram.com), at most one link per known kind, ≤ 8 links. Phone: `publicPhone` must be a plausible Australian number (landline, mobile, 13/1300/1800); the DTO exposes `telHref` (E.164 `tel:+61…` or `tel:1300…`).
4. Admin app: hours editor on the business page (per-weekday state: closed / open 24 hours / intervals with time inputs and "closes next day", exceptions table with date, kind, interval and note; save with `expectedVersion`; shows the evaluated status), links editor (kind + URL rows), field errors mapped from the envelope; tests for the mapping and validation display.
5. Tests: unit (hours rules/evaluator/DST, phone/link rules), integration (hours round trip, overlap 400 with field paths, exception priority through the API status, stale 409, permission denial, links validation, cascade on business rows), admin tests; root `pnpm check`, integration, runtime verification, secret scan, docs and traceability.
Out of scope: media/galleries (Phase 20), public rendering of hours/links/directions (Phase 14), "Open now" search filter (Phase 14 decision per DIR 008).

Delivered:
- **Schema/migration** `20260906031034_listing_hours_and_links` (additive, reviewed): `opening_intervals` (ISO weekday, `allDay`, `startMinute`/`endMinute`, `endNextDay`), `hours_exceptions` (DATE, kind closed/open24/custom, optional interval, note), `business_links` (kind enum, url, label, sortOrder), `businesses.hoursMode` (`unknown` default). All child tables cascade on business delete; `db:migrations:check` passes.
- **Hours domain** `apps/api/src/business/hours/`: `adelaide-time.ts` (Intl-based Australia/Adelaide conversion: `toLocal`, `fromLocal` with explicit DST policy — gap → moved forward, overlap → first occurrence — `offsetMinutesAt`, calendar helpers), `hours-rules.ts` (HH:MM parsing incl. `24:00`, per-day validation with field paths, overnight spill check against the next weekday, exceptions validation, `evaluateHours` → `open | closed | unknown` with `until` and `source`), `hours.service.ts` (GET/PUT with `expectedVersion`, atomic replace in a transaction, audit `listing.hours.update`, status evaluated at request time). Unknown is a distinct state that is never rendered as open or closed (SRS BUS 004).
- **Contacts/links** (`business-rules.ts`): `parseAustralianPhone` (landline, mobile, 13/1300/1800; +61 and 0011 61 forms) — `publicPhone` is now stored in national display form and the DTO exposes `telHref`; `validatePublicUrl` (http(s), no credentials, real host) applied to `publicUrl`; `validateLinks` (kind allowlist, host allowlist per known kind, one per known kind, ≤ 8) with `links[]` on create/PATCH (replace semantics) and in `BusinessDto`.
- **API**: `GET/PUT /admin/businesses/{id}/hours` (`listings.read` / `listings.write`), DTOs in `dto/hours.dto.ts` (`WeeklyHoursDto` keyed monday…sunday, `HoursExceptionDto`, `PutHoursDto`, `HoursDto` with `status`/`evaluatedAt`/`version`). Contracts regenerated (46 paths).
- **Admin app**: `pages/businesses/HoursEditor.tsx` (mode select, per-weekday closed / open 24 hours / intervals with native time inputs and "closes next day", date exceptions with kind/note/custom intervals, save with the business version, evaluated status tag; API field paths such as `weekly.monday.intervals.1.start` mapped onto form fields; `24:00` shown as `00:00` + next day because native time inputs cannot display 24:00); links rows (kind/URL/label) in the business editor; `toNamePath` helper for nested envelope errors.

Verification (all green, 2026-09-06):
- Unit: API 106 (incl. `adelaide-time.spec.ts` — ACDT/ACST offsets, gap 2026-10-04 02:30 → 03:30 ACDT, overlap 2026-04-05 02:30 → first occurrence; `hours-rules.spec.ts` — multiple intervals, overnight, open-24, closed, spill conflicts, exception override, both DST transitions with wall-clock semantics, unknown mode; phone/link rules), admin 60, database 23, e2e 19.
- Integration (real MySQL/Redis): 43 API + 5 database — `hours.integration-spec.ts`: phone/link/website rejection with field paths and DB row replacement, unknown default, 401/403/409 on hours, validation paths for overlaps/format/exception duplicates/empty custom, full schedule round trip (overnight Thursday, `24:00` Friday, open-24 Saturday, closed + custom exceptions), version bump, audit metadata, and clearing back to unknown.
- Root `pnpm check` green; `pnpm install --frozen-lockfile --offline` clean; contracts in sync.
- Runtime: against the user's running API (port 4001, watch process left untouched) — restore of the verification listing, PUT hours 200 with evaluated status, overlap → 400 `weekly.monday.intervals.1.start`, links + `1300` phone → `telHref tel:+611300123456`. Browser (private API instance on 3011 + temporary admin dev server, both stopped afterwards): hours editor loaded the stored schedule, "Save hours" → PUT 200 and toast, links rows populated. The dev admin password was rotated again afterwards (temporary value confirmed rejected).
- Secrets: trackable-file scan clean; env files ignored.

Decisions:
- Hours are stored as wall-clock minutes and evaluated with Intl (Node 24 has no Temporal); the converter is the single place that encodes the DST gap/overlap policy.
- `publicPhone` is normalised to the national display form on save so the public "Call" action is always a valid `tel:` link; non-Australian numbers are rejected (Adelaide-only directory).
- Media re-scoped to Phase 20 (see the scope note above).

Limitations / follow-ups: cross-date overlap between a custom exception's overnight interval and the following day's hours is not checked (within-day and weekly spill are); "Open now" search filter remains off pending Phase 14 (DIR 008); the public rendering of hours/links/directions comes with the public detail page (Phase 14).


## Phase 14 — Public directory (complete, 2026-09-06)

SRS: DIR 001–006 (published-only cards with fallback image, name, primary category, area, rating or "No reviews yet"; AND-combined keyword/category (incl. active descendants)/area/minRating filters; SearchService with indexed name prefix ranking and description fallback; sorts relevance/rating/newest/name with documented tie rules; page-numbered pagination ≤ 50, window ≤ 10,000, `total`/`pageCount`, unknown slug → empty result, invalid enum/range → field error; URL-persisted state with chips, reset, counts, loading/retry/no-result states; a failed request is never shown as zero results), DIR 008 (no "Open now" filter yet), BUS 001/003/005 (public detail: description, categories, services, approved address or service area, phone `tel:`, website, social links with safe `rel`, hours with accuracy note, directions link from validated coordinates/address, related listings ≤ 4 same category preferring same area, hidden when none), UX 001–003 (Tailwind + shadcn-style components in `packages/ui`, sky-blue/navy tokens, public nav with Home/Directory + email "Add or update a business" action, route contract `/business`, `/business/category/{slug}`, `/business/area/{slug}`, `/business/{slug}`; no city route), API 002/004 (envelopes, 404 for unpublished, bounded pagination/sort keys), CACHE 001 (explicit Next.js data-cache configuration per fetch), SEO 001/003 basics (one H1, title/description, absolute canonical, `noindex,follow` for filtered searches — full SEO in Phase 21), NFR 006/007/011/013 (WCAG-minded markup, no horizontal scroll at 320 px, no Refine/antd in public JS), ARC 002 (web reads through the API only).

Acceptance criteria:
1. API `SearchService` (`apps/api/src/business/search/`): `GET /businesses` with `q` (0–120, whitespace/case normalised), `category` (slug; active descendants included), `area` (slug), `minRating` (1–5), `sort` (`relevance | rating | newest | name`; relevance default with `q`, name otherwise; relevance without `q` behaves as name), `page`, `pageSize ≤ 50`, window ≤ 10,000 → 400 `page`. Ranking: exact name < name prefix < name contains < category/service/synonym label match < description match, then name, then id. Rating sort: rated before unrated, average desc, count desc, id. Newest: `firstPublishedAt` desc, id. Name: `utf8mb4_unicode_ci` order, id. `meta` carries `total`, `pageCount` and `facets` (category and area counts from the same publication scope and the other active filters). Keyword search never touches private fields (encrypted enquiry email, notes).
2. `GET /businesses/{slug}` public projection (404 unless published): card fields + description, secondary categories, services, contact (phone display + `telHref`, email, website), links, address only when `addressVisibility = full` (with `directionsUrl` built from coordinates, else the address text), otherwise `serviceArea` only, hours (`mode`, weekly, upcoming exceptions, status now), rating summary or null, `related` (≤ 4). `GET /businesses/{id}/related` exposes the same list. Public responses carry `Cache-Control: public, max-age=60` (short, pending Phase 22 invalidation).
3. `packages/ui`: Tailwind v4 + `class-variance-authority`/`clsx`/`tailwind-merge` shadcn-style primitives (Button with `asChild`, Card, Badge, Input, Select, Chip), design tokens (sky-blue/navy, surfaces, focus ring) as CSS variables; no admin coupling.
4. `apps/web`: public shell (header nav Home/Directory + mailto action from `SITE_CONTACT_EMAIL`, footer, skip link, landmarks), pages `/` (intro, category and area discovery), `/business` (GET filter form, chips, count, sort, pagination, empty/error/loading states, `noindex,follow` when filtered), `/business/category/[slug]`, `/business/area/[slug]` (editorial intro + listings, 404 for unknown/inactive), `/business/[slug]` (BUS 001 sections, hours table with today highlighted and accuracy note, contact actions, related, "No reviews yet"), `not-found`, `error` (retry) and `loading` boundaries. Server components fetch through `API_ORIGIN` with explicit `next.revalidate` (taxonomy 300 s, search 30 s, detail 60 s) and tags for later invalidation; metadata with absolute canonical from `SITE_ORIGIN`.
5. Tests: API unit (query normalisation/ranking helpers), API integration (`search.integration-spec.ts`: publication scope, descendant categories, AND filters, minRating, each sort's tie rules, pagination/window errors, unknown slug empty, facets, detail projection without private fields, address visibility, related preference/limit, 404 for draft/archived); web Vitest unit tests (search-param parsing/serialisation, chips, hours display); root `pnpm check` incl. web build; runtime browser verification at 320 px and desktop; secret scan; docs/traceability.
Out of scope: hero/search suggestions (Phase 15), reviews (Phase 16), enquiries (Phase 17), blog/about/contact/policy pages (Phases 18–19, 22), media (Phase 20), sitemap/JSON-LD/redirects (Phase 21), cache purge (Phase 22), "Open now" (DIR 008 decision after Phase 14 data review).

Delivered:
- **Public API** (`apps/api/src/business/search/`, `dto/public-business.dto.ts`, `directory-public.controller.ts`): `GET /businesses` (q ≤ 120 normalised, `category` incl. active descendants, `area`, `minRating`, `sort` relevance/rating/newest/name with DIR 004 defaults and tie rules, `page`/`pageSize ≤ 50`, window ≤ 10 000 → 400, `meta.facets` for categories and areas computed in the same publication scope), `GET /businesses/{slug}` (404 unless published) and `GET /businesses/{id}/related` (≤ 4, same primary category, same area first, never padded). Keyword matching is a ranked LIKE over public fields only (name exact → prefix → contains → category/service/synonym labels → description); LIKE metacharacters are escaped. Address is returned only when `addressVisibility = full`, with a `directionsUrl` from coordinates or the address text; private fields are never serialised. `Cache-Control: public, max-age=60`.
- **`packages/ui`** (new workspace package, SRS ARC 001 table): Tailwind v4 tokens (`src/styles.css`: sky/navy palette, light and dark surfaces, `--as-link`/`--as-hero-text`, focus ring, reduced-motion rule, documented contrast pairs) and shadcn-style primitives (Button with `asChild`, Card*, Badge, Input, Select, Label, Chip) on `class-variance-authority`/`clsx`/`tailwind-merge`/`@radix-ui/react-slot`. Server-component safe, no admin coupling.
- **`apps/web`**: shell with skip link, landmarks, nav (Home, Directory, mailto "Add or update a business") and footer; `/` discovery home; `/business` (route group `(list)` so its loading boundary cannot mask sibling 404s) with a plain GET filter form, removable chips, result count, sort, pagination, empty/past-the-end/error states; `/business/category/[slug]` and `/business/area/[slug]` (editorial intro, breadcrumbs, 404 for unknown/inactive); `/business/[slug]` (BUS 001 sections, hours table with today highlighted, upcoming exceptions and a correction mailto, tel/directions/website actions with `rel="noopener noreferrer nofollow"`, service-area fallback, "No reviews yet", related listings); `not-found` and `error` boundaries. Server-side fetching through `API_ORIGIN` with explicit `next.revalidate` per resource (taxonomy 300 s, search 30 s, detail 60 s) and cache tags for Phase 22. Metadata: one H1, title template, absolute canonical from `SITE_ORIGIN`, `noindex, follow` on filtered searches.
- New env variables (documented in `apps/web/.env.example`, ignored `.env.local` locally): `SITE_ORIGIN`, `SITE_CONTACT_EMAIL` (both validated at use; no sample fallback address, CFG 002).

Verification (all green, 2026-09-06): `pnpm check` — database 23, API 110, admin 60, web 6, e2e 19, builds, contracts in sync (49 paths); `pnpm test:integration` — database 5, API 50 including `search.integration-spec.ts` (publication scope incl. archived, ranking, synonym and description matches, literal `%`, AND filters with descendants, rating/newest/name tie rules, facets, pagination bounds and six invalid-input 400s, detail projection with no private fields, hidden address, related preference and limit, 404 for draft). Runtime: every public route's status code (unknown category/area/business → 404), canonical and `robots` metadata, `tel:`/directions/`rel` attributes, no Refine or Ant Design in any public chunk; browser at 1280 px and 320 px (no horizontal overflow, 44 px targets in the header) in light and dark schemes.

Decisions: search stays on indexed LIKE with a rank expression rather than FULLTEXT (DIR 003 permits a bounded indexed fallback; revisit under NFR 003 load); facets are returned with the results so the UI never issues a second count query; the cover image is `null` until the media pipeline (Phase 20) and clients render the tracked fallback SVG.

Limitations / follow-ups: `/business` streams, so an API failure there renders the error boundary with HTTP 200 (curated and detail pages return true 404s); featured placements (DIR 007), "Open now" (DIR 008), reviews, hero and suggestions, and the sitemap/JSON-LD arrive in Phases 15, 16, 21 and 22.


## Phase 15 — Hero, home settings and search suggestions (complete, 2026-09-06)

SRS: HERO 001–007 (Adelaide hero with solid-colour fallback and no unlicensed photography; one stable semantic H1 with 2–5 admin-managed rotating phrases, initial text in server HTML, 4 s dwell / 300 ms transition, reserved height; keyboard-accessible pause/resume, static under `prefers-reduced-motion`, paused while hidden, no per-phrase live-region announcements; rounded search panel with a fixed "Adelaide, Australia" text label, labelled keyword input, category control and named Search button, stacked on mobile; keyword covers names, categories and services incl. synonyms; grouped suggestions with 250 ms debounce, 2-character minimum, cap of 8, stale-response guard, arrows/Enter/Escape, no auto-navigation on focus; GET to `/business` with `q` and optional `category`, empty submission opens all listings, works without client JavaScript; no cities counter, optional admin-enabled counters from published records only, hidden when unavailable), CFG 001 (editable site settings, server-side validation, versioned edits, recorded actor, secrets never in content settings), API 002/004 (`GET /site and /home` row of the §15 table; conservative public GET rate ceiling; allowlisted inputs), RBAC 001 (`settings.manage`), SEC 002 (rate limiting in Redis), NFR 001/006/011 (no layout shift, WCAG pause requirement, keyboard operation, 320–1440 px and 200 % zoom).

Acceptance criteria:
1. Migration `site_settings` (singleton row per key, JSON payload, `version`, `updatedByAdminId`, timestamps) with the harness table list updated.
2. `SettingsModule`: typed home settings (stable `heroHeadline`, 2–5 `heroPhrases` ≤ 60 chars each, `countersEnabled`) validated server-side; admin `GET/PUT /api/v1/admin/settings/home` (`settings.manage`, `expectedVersion` → 409 `STALE_VERSION`, audited `settings.home.update`); public `GET /api/v1/home` returning the hero payload plus counters only when enabled and computed from published/active records (omitted otherwise, never invented). Defaults are the SRS's own example wording, not sample content.
3. `GET /api/v1/search/suggestions?q=` (2–120 chars): grouped `categories`, `services`, `businesses` from active/published records only, at most 8 in total, name-prefix ranked, service synonyms matched, no private content; per-IP fixed-window ceiling in Redis (30/min) returning 429 with `Retry-After`, 503 when the limiter is unavailable (suggestions are progressive; the search form keeps working).
4. Web hero: server-rendered H1 and first phrase, rotating phrase in a reserved-height slot with a pause/resume button, static first phrase under `prefers-reduced-motion`, rotation paused when the document is hidden, rotating text `aria-hidden` behind one stable accessible headline; search panel with fixed location text, labelled input, optional category select and Search button submitting GET to `/business`; counters rendered only when the API provides them.
5. Web suggestions: progressive-enhancement combobox (ARIA 1.2 pattern) with 250 ms debounce, 2-character minimum, ≤ 8 grouped options, arrow/Enter/Escape handling, stale responses ignored, failures silent (form still submits), no navigation on focus alone.
6. Admin: Site settings screen (`settings.manage`) editing the headline, phrases (2–5) and counter toggle with `expectedVersion` and field errors.
7. Tests: API unit (settings validation, suggestion ranking), integration (settings round trip, permission denial, stale 409, audit row; suggestions grouping/cap/minimum/rate limit/published scope), admin unit (settings screen), web unit (hero rotation helpers, suggestion state machine); root gate plus runtime checks at 320/375/768/1024/1440 px, 200 % zoom, keyboard only and reduced motion.
Out of scope: the licensed hero photograph and focal-point controls (needs the media pipeline in Phase 20 and a client asset — the solid navy gradient fallback required by HERO 001 ships now), featured placements (Phase 22), latest posts on `/home` (Phase 18), static pages and the rest of CFG 001/002 (Phase 22).

Delivered:
- **Migration** `20260906081252_site_settings`: `site_settings` (key PK, validated JSON payload, `version`, `updatedByAdminId` FK `SET NULL`, timestamps); added to the integration harness truncation list.
- **`SettingsModule`** (`apps/api/src/settings/`): `home-settings.ts` (server-side validation of headline, 2–5 unique phrases ≤ 60 chars, counters toggle; SRS wording as the default document), `settings.service.ts` (version check → 409 `STALE_VERSION`, actor recorded, `settings.home.update` audited, stored documents that fail validation fall back to defaults rather than breaking the site), admin `GET/PUT /api/v1/admin/settings/home` (`settings.manage`, `expectedVersion` accepts 0 before the first save) and public `GET /api/v1/home` (hero content plus counters only when enabled, counted from published/active records, silently omitted if the count fails).
- **Suggestions**: `GET /api/v1/search/suggestions` (`SuggestionsService`) returning grouped categories, services (matched on label or synonym, with the matched synonym as the hint) and published businesses (hint: local area), name-prefix ranked, capped at eight overall with every group represented, minimum two characters, LIKE metacharacters escaped. `PublicRateLimitService` adds a fixed-window per-IP ceiling (30/min) in Redis → 429 with `Retry-After`, and 503 when the limiter is unavailable (suggestions are progressive; the form still works).
- **Web hero**: `hero-headline.tsx` (server-rendered first phrase, `useSyncExternalStore` for reduced-motion and page visibility so no motion is implied before hydration, 4 s dwell / 300 ms fade, invisible longest phrase reserves width and height, one stable `sr-only` headline with the rotating text `aria-hidden`, pause/resume button with `aria-pressed`), `hero-search.tsx` (GET form to `/business`, fixed "Adelaide, Australia" text, labelled keyword combobox, optional category select, Search button; suggestions with 250 ms debounce, two-character minimum, term-keyed results so stale responses can never render, arrow/Enter/Escape handling, no navigation on focus, silent failure). New fixed `panel` tokens in `packages/ui` because the hero panel sits on a permanently dark surface and must not follow the colour scheme.
- **Admin**: Site settings screen (`settings.manage`) for the headline, 2–5 phrases and the counter toggle, with `expectedVersion`, field errors and stale handling; navigation entry gated by the permission.

Verification (all green, 2026-09-06): `pnpm check` — database 23, API 112, admin 62, web 11, e2e 19, builds, contracts in sync (52 paths); `pnpm test:integration` — database 5, API 54 (`settings-suggestions.integration-spec.ts`: defaults before any save, 401/403/409/400 paths, audit metadata, counters appearing and disappearing with the toggle, suggestion grouping and exclusion of drafts and inactive terms, minimum length, literal `%`, rate limit with `Retry-After`). Runtime against the running API and a production web build: rotation advances and stops on pause (`aria-pressed`, label swap) with a stable H1 height, suggestions return live grouped results, arrow keys move `aria-activedescendant`, Escape closes without navigating, Enter on an active option opens the business, the plain form submit reaches `/business?q=bakery&category=cafes`, and 320 px dark mode shows no overflow and a readable hero panel.

Decisions: the hero ships with the navy gradient fallback that HERO 001 requires, because licensed Adelaide photography is a client asset and the media pipeline is Phase 20; hero phrases are real admin-managed settings (a first slice of CFG 001) rather than hard-coded copy; counters stay off by default and are hidden whenever the numbers cannot be read.

Limitations / follow-ups: hero image, focal points and the image slot (Phase 20); featured placements and latest posts on `/home` (Phases 18 and 22); Next.js dev mode does not hydrate inside the sandboxed browser pane (its HMR socket is blocked), so interactive verification runs against `next start`.


## Phase 16 — Reviews, ratings, abuse reports and moderation (complete, 2026-09-06)

SRS: REV 001–005 (1–5 whole-number rating, 2–80 character display name, private email ≤ 254 characters never made public, 20–3000 character plain-text review, guidelines and privacy acknowledgement recorded; publication/limit/Turnstile/honeypot/rate checks before acceptance; pending on creation with a neutral receipt; states pending/approved/rejected/spam with reasons, audit and transactional aggregate updates; original text always retained, redaction keeps the original and a reason, ratings never edited; mean = approved sum ÷ approved count, unrounded for sorting, null at zero count, no double counting; keyed email + business hash flags repeat submissions within 30 days for review, repeated idempotency keys return the original outcome, duplicates and bursts go to moderation), REP 001–002 (report an approved review with a reason enum, optional ≤ 1000 character details and optional private contact; spam controls; acknowledgement never reveals the reporter; target and content snapshot persisted so reports outlive removal; open/investigating/resolved with outcome and moderator; reports never auto-remove content and never disclose private content for unpublished targets), API 003 (scoped Idempotency-Key, payload fingerprint, 24 h retention, 201 for pending reviews/reports, replays return the original receipt without duplicate rows or mail), API 004 (64 KB bodies, unknown fields rejected), SEC 002/003 (server-side Turnstile with expected hostname/action, honeypot as a supplement, review limits 5 per 15 minutes and 20 per day per IP, reports 5 per hour, keyed burst signals, fail-safe on limiter or CAPTCHA failure — never a silent bypass), DAT 002/003 (keyed email hashes, encrypted recoverable private contact, moderation history survives public removal), PRIV 001 (acknowledgement version and timestamp stored per submission; only necessary data collected), RBAC 001 (`reviews.moderate`, `reports.manage`), DIR 001 (zero reviews reads "No reviews yet").

Acceptance criteria:
1. Migration: `reviews` (business FK, display name, encrypted private email, keyed email hash, rating 1–5 check, original and public text, status enum, moderation fields, acknowledgement version/time, hashed submitter IP, version, timestamps; indexes on business+status+createdAt and emailHash+business+createdAt), `abuse_reports` (review target, reason enum, details, encrypted reporter email, status/outcome, moderator, target snapshot, version, timestamps), `idempotency_records` (hashed key + scope PK, payload fingerprint, stored response, expiry). Harness table list updated.
2. Public API: `POST /api/v1/businesses/{id}/reviews` → 201 neutral receipt (`{data:{receiptId, status:'pending'}}`), rejecting unpublished businesses, invalid fields, failed Turnstile/honeypot and rate limits (429 with `Retry-After`; 503 when a limiter or the verifier is unavailable); `GET /api/v1/businesses/{id}/reviews` (approved only, newest default, pagination, no private fields); `POST /api/v1/reports` → 201 neutral receipt for approved-review targets only. Every public POST requires an `Idempotency-Key`; replays return the original receipt without new rows.
3. Moderation API (`reviews.moderate`, `reports.manage`): `GET /admin/reviews` (status, business, flagged-duplicate filters, pagination), `POST /admin/reviews/{id}/approve|reject|spam` with reason and `expectedVersion`, `PATCH /admin/reviews/{id}/redaction` (public text + reason, original preserved, rating untouched); `GET /admin/reports`, `POST /admin/reports/{id}/investigate|resolve` (outcome retain/remove/spam, note). Aggregates move inside the same transaction as the decision and never double count; every action is audited.
4. Web: approved reviews and the rating summary on the business page, plus a review form (rating, name, email, text, guidelines acknowledgement, honeypot, Turnstile when a site key is configured — otherwise the form explains submissions are unavailable rather than pretending to work) that shows the neutral receipt and preserves input on error.
5. Admin: moderation queue for reviews (filters, decision dialogs with reason, redaction) and abuse reports (states, outcome), both permission-gated.
6. Tests: unit (aggregate arithmetic, rating rounding, idempotency fingerprints, Turnstile verifier failure paths), integration (submission validation and limits, pending scope never leaking into public reads or aggregates, idempotent replay, moderation transitions with aggregate correctness and double-decision protection, redaction preserving the original, repeat-submission flag, report lifecycle, permission denial), admin and web unit tests; root gate and runtime verification.
Out of scope: comments on blog posts (Phase 19 reuses this moderation core), enquiry delivery (Phase 17), retention purge jobs (Phase 22, fields are recorded now), public reviewer accounts (never in MVP).

Delivered:
- **Migration** `20260906084235_reviews_reports_idempotency`: `reviews` (encrypted private email, keyed `emailHash`, `rating` with a `BETWEEN 1 AND 5` check constraint, original and optional redacted text, status enum, moderation fields, acknowledgement version/time, hashed submitter IP, version), `abuse_reports` (review target, reason/outcome enums, encrypted reporter email, target snapshot, status, version), `idempotency_records` (scope + hashed key PK, payload fingerprint, stored receipt, expiry). Harness truncation list updated.
- **Public API**: `POST /businesses/{id}/reviews` (published businesses only, acknowledgement required, honeypot, Turnstile, 5 per 15 min and 20 per day per IP, 201 neutral receipt that is not the review id), `GET /businesses/{id}/reviews` (approved only, newest/highest/lowest, pagination), `POST /reports` (approved review targets; unknown or unapproved targets get the identical neutral receipt and create nothing). Both writes require an `Idempotency-Key`: a replay returns the original receipt with `Idempotent-Replay: true`, and the same key with a different body is a 409 `IDEMPOTENCY_KEY_REUSED`.
- **Moderation API**: `GET /admin/reviews` (status, business, `repeatFlagged`, `reported` filters), `POST …/approve|reject|spam` (reason required except approve, `expectedVersion`, repeated decisions rejected with 409), `PATCH …/redaction` (published text replaced or restored, original text and rating untouched), `GET /admin/reports`, `POST …/investigate|resolve` (outcome retain/remove/spam). The approved aggregate moves inside the moderation transaction, so totals cannot drift or double count; every action is audited.
- **Security**: `CaptchaPort` with a real `TurnstileVerifier` (server-side verification including hostname and action). Without `TURNSTILE_SECRET_KEY` the API answers 503 for public writes — never accepts them unverified — and production start-up now requires both `TURNSTILE_SECRET_KEY` and `PUBLIC_SITE_URL`. Limiter or verifier outages fail safe with 503; `SUBMISSION_TERMS_VERSION` is stored with every acknowledgement.
- **Admin**: Reviews moderation queue (filters, repeat and report flags, expandable original text and moderation contact, decision dialogs with reasons, redaction dialog) and Abuse reports queue (investigate, resolve with outcome and note), both permission-gated (`reviews.moderate`, `reports.manage`).
- **Web**: approved reviews and a moderated review form on the business page (rating radios, name, unpublished email, text, guidelines acknowledgement, hidden honeypot, Turnstile widget, neutral receipt, errors preserving input). Without a configured site key the form is replaced by an honest "submissions are temporarily closed" notice.

Verification (all green, 2026-09-06): `pnpm check` — database 23, API 117, admin 66, web 13, e2e 19, builds, contracts in sync (64 paths); `pnpm test:integration` — database 5, API 62 (`reviews.integration-spec.ts`: pending scope invisible in public reads and aggregates, encrypted email and hashed IP, validation and honeypot and captcha failures, unpublished target 404, missing idempotency key, replay returning the original receipt with no extra rows, key reuse conflict, fail-safe 503, per-IP ceiling, repeat flag, permission denial, approve/reject/re-approve aggregate correctness with no double counting, redaction preserving the original, report lifecycle with neutral receipts for unknown targets and reports never changing the review). Runtime: the live API serves the 12 new paths, refuses a submission without an idempotency key (400) and answers 503 while no Turnstile secret is configured; the public business page renders the reviews section, "No reviews yet" and the closed-submissions notice.

Decisions: the captcha verifier is a port with one real implementation — no development bypass exists, because a bypass would make the check meaningless (SEC 003); receipts are truncated identifiers, so a receipt cannot be used to look up or guess a review; resolving a report never changes the reported review, matching REP 002.

Limitations / follow-ups: real Turnstile keys are a client account (decision D03) and must be set before public launch; retention purges for rejected reviews, reporter details and IP signals are Phase 22; comment moderation reuses this core in Phase 19; the reviewer-facing guidelines page is Phase 22 (the form links to `/review-guidelines`, which will 404 until then).


## Phase 17 — Enquiries, transactional outbox and the worker application (complete, 2026-09-06)

SRS: ENQ 001–007 (form fields and acknowledgement that details are shared with the named business, no marketing consent bundling, no attachments; the recipient always comes from the listing configuration and a listing without one cannot accept a form; enquiry and outbound event saved in one MySQL transaction with a 202 receipt that never claims delivery; a transactional outbox dispatcher enqueues BullMQ jobs so queue downtime loses nothing; delivery states queued/providerAccepted/delivered/retrying/failed/suppressed kept separate from handling states new/inProgress/closed; stable message ids, bounded retries with exponential backoff; verified sender with the visitor address only as Reply-To, escaped content, plain-text body, header-injection prevention, no provider credentials or recipient addresses in browser responses; recipient and listing rechecked before dispatch, suppressed with an alert when routing is no longer valid; permission-restricted admin views with no public listing or export; enquiry contents excluded from logs and analytics), EVT 001–002 (durable outbox rows with id, type, resource id and version, occurrence time and correlation id; payloads carry identifiers, never private message bodies; dispatcher retries until enqueue succeeds; consumers deduplicate by event id and tolerate repeats; five attempts with exponential backoff and jitter, then a visible failed state; permission-protected audited manual retry), ARC 003 (`apps/worker` as an independently operable Nest-compatible BullMQ runtime), API 003/004 (idempotent public POST with a 202 receipt, 64 KB bodies), SEC 002 (three enquiries per 15 minutes and ten per day per IP, Turnstile and honeypot), DAT 002/PRIV 001 (encrypted recoverable contact details, retention fields, acknowledgement version).

Acceptance criteria:
1. Migration: `enquiries` (nullable business for site contact, kind, name, encrypted email and phone, subject, message, acknowledgement version/time, hashed submitter IP, handling status, delivery status, attempt count, provider message id, last error, suppression reason, version, timestamps), `outbox_events` (type, resource type/id/version, correlation id, identifier-only payload, status, attempts, availableAt, dispatchedAt) and `provider_message_events` (provider event id unique, kind, received at) for future webhook deduplication. Harness list updated.
2. API: `POST /api/v1/businesses/{id}/enquiries` and `POST /api/v1/contact` → 202 `{receiptId, status:'accepted'}` after the enquiry and its outbox row commit together; recipient resolved server-side from the listing's private enquiry email (or the configured site recipient), never from the request; a listing without a routable recipient answers 409 `NO_ENQUIRY_ROUTE` and the web form is replaced by phone/website/correction actions. Idempotency-Key, Turnstile, honeypot and the SEC 002 ceilings apply exactly as for reviews.
3. Outbox dispatcher: a polling dispatcher inside the API claims pending rows transactionally and enqueues BullMQ jobs keyed by event id; enqueue failures leave the row pending for the next pass, and a dispatched row is never enqueued twice for the same attempt.
4. `apps/worker`: a standalone Nest application (own package, `pnpm dev:worker`, its own README) running a BullMQ worker for `enquiry.email` jobs with five attempts, exponential backoff with jitter and a visible failed state; it loads the enquiry, rechecks the business is still published with a valid recipient (otherwise suppresses with an audited reason), sends through the shared `MailerPort` with a configured verified sender, the visitor address as Reply-To only, an escaped plain-text body and header-injection protection, then records the delivery state and provider message id.
5. Admin: `GET /admin/enquiries` (business, handling status, delivery status filters), `GET /admin/enquiries/{id}`, `PATCH …/{id}` (handling status with `expectedVersion`), `POST …/{id}/retry` (`enquiries.manage`, audited, refuses when nothing is retryable); an Enquiries screen showing target, times, delivery and handling status and the contact details, gated by `enquiries.read`/`enquiries.manage`.
6. Web: enquiry form on the business page mirroring the review form's protections, with the acknowledgement wording required by ENQ 001 and a 202 receipt that says the message was accepted, not delivered.
7. Tests: unit (outbox claim semantics, backoff, mail body escaping and header injection, delivery state machine), integration (transactional accept, no route → 409, idempotent replay, rate limits, admin filters and permission denial, retry path, suppression when the listing is unpublished), worker unit tests, admin and web tests; root gate and runtime verification with the console transport.
Out of scope: provider webhook ingestion and bounce/complaint processing (ENQ 006 — the signature scheme belongs to the chosen provider, decision D03; the deduplication table and delivery states are in place), visitor receipt emails (default off per ENQ 005), the public Contact page (Phase 22 static pages; the API route exists), retention purges (Phase 22).

Delivered:
- **Migration** `20260906151604_enquiries_outbox`: `enquiries` (nullable business for site contact, encrypted email and phone, acknowledgement version/time, hashed submitter IP, separate handling and delivery states, attempts, provider message id, last error, suppression reason, version), `outbox_events` (type, resource type/id/version, correlation id, identifier-only payload, status, attempts, `availableAt` backoff, dispatchedAt) and `provider_message_events` (unique provider event id, ready for webhook deduplication).
- **API**: `POST /businesses/{id}/enquiries` and `POST /contact` → 202 with a receipt that says accepted, not delivered; the enquiry row and its outbox event commit in one transaction, so an accepted request is never lost. The recipient is read from the listing (or the configured site address) and there is no destination field in the request; a listing without one answers 409 `NO_ENQUIRY_ROUTE` and the public page shows phone, website and a correction mailto instead. Idempotency-Key, Turnstile, honeypot and the SEC 002 ceilings (3 per 15 minutes, 10 per day) apply as for reviews. Admin: `GET /admin/enquiries` (+ filters), `GET/PATCH /admin/enquiries/{id}` (handling status, `expectedVersion`) and `POST …/retry` (`enquiries.manage`, audited, refuses anything that is not failed or suppressed).
- **Outbox dispatcher** (`apps/api/src/outbox/`): claims due rows with a conditional update so two dispatchers cannot take the same event, enqueues through a `QueuePort` (BullMQ in production, a recording queue in tests) using the event id as the job id, marks rows dispatched, and on failure leaves them pending with exponential backoff until the five-attempt budget is spent.
- **`apps/worker`** (new application, SRS ARC 003): standalone BullMQ consumer with its own configuration validation (refuses the console transport and a missing sender in production, and states plainly that no provider adapter exists yet), an `EnquiryMailerPort` with a console transport, AES-256-GCM field decryption, and delivery that re-reads the listing at dispatch time — unpublished listings or missing recipients are suppressed with a reason instead of emailed. Transient failures are rethrown for BullMQ's retries; permanent ones are recorded as failed; exhausted jobs mark the enquiry failed so an admin can retry.
- **`packages/domain`** (new shared package): the enquiry mail composition (header sanitisation, Reply-To validation, plain-text body) and the queue names, retry policy and Redis connection parsing, imported by both the API and the worker so the invariant is shared rather than copied (SRS ARC 002).
- **Admin**: Enquiries screen with separate delivery and handling columns, expandable message and contact details, start/close actions and an audited retry dialog, gated by `enquiries.read`/`enquiries.manage`. **Web**: enquiry form on the business page with the ENQ 001 acknowledgement, honeypot, Turnstile and an "accepted" receipt; listings that cannot be routed show contact actions and a correction link instead.

Verification (all green, 2026-09-06): `pnpm check` — database 23, API 117, admin 69, web 13, domain 6, worker 9, e2e 19, all builds, contracts in sync (69 paths); `pnpm test:integration` — database 5, API 69 (`enquiries.integration-spec.ts`: transactional accept with the outbox row and identifier-only payload, encrypted contact details, no-route 409, validation and honeypot and captcha failures, rejected destination field, missing idempotency key, replay creating nothing, per-IP ceiling, queue outage leaving events pending and dispatching them afterwards with the event id as the job id, admin filters and permission denial, handling state independent of delivery, retry rules and audit trail). Runtime: a private API instance (Cloudflare's published always-pass test key) accepted an enquiry with 202, the dispatcher enqueued it, and the worker delivered it through the console transport with the visitor address as Reply-To — the enquiry ended at `providerAccepted` with the outbox row `dispatched`. The API's own hostname check was observed rejecting a token whose hostname did not match, before the site origin was aligned.
- Test-suite stability: the admin suite now caps Vitest at two workers and allows 2.5 s for async queries, after interaction-heavy Ant Design specs proved load-dependent; three consecutive full runs pass with steady timings.

Decisions: the message body never enters a queue payload or a log, only identifiers; delivery state and handling state are separate columns and are never conflated in the UI; a provider timeout is treated as ambiguous, so the retry dialog warns before re-sending; `packages/domain` was added to the workspace (an addition to the SRS ARC 001 table) because the worker must apply the same mail rules as the API and copying them would violate ARC 002.

Limitations / follow-ups: no email provider adapter exists (decision D03) — the console transport is development-only and the worker refuses to start in production without a real one; webhook ingestion and bounce/complaint processing (ENQ 006) wait for the same decision, though the deduplication table and delivery states are ready; visitor receipt emails stay off (ENQ 005); the public Contact page arrives with the static pages (Phase 22), and `SITE_ENQUIRY_RECIPIENT` must be set for general enquiries to be accepted; retention purges are Phase 22.


## Phase 18 — Blog and editorial content (admin core) (complete, 2026-09-06)

SRS: BLOG 001 (admin-only articles with title, unique stable slug, excerpt, sanitised rich content, author attribution, primary category, optional tags, cover image, publication and updated dates and SEO fields; the public author identity is separate from the admin login and email), BLOG 002 (draft/scheduled/published/archived; title, content, author, active category and a valid slug required before publish or schedule; scheduled timestamps stored in UTC while the admin works in Australia/Adelaide with the offset shown; idempotent scheduled publishing with a periodic catch-up so a missed run never strands due posts), BLOG 003 (preview only for an authenticated authorised admin through a short-lived route, `noindex` and `no-store`, excluded from sitemaps; a public draft lookup is 404; updating a published article creates a revision and invalidates public content; first publication date preserved separately from `updatedAt`), §14 (Post, Author, BlogCategory, Tag, ContentRevision entities), DAT 004–006 (indexes on post status and publish time, unique slugs even for archived content, atomic publication with outbox insertion, optimistic versions, reviewed migrations), SEC 001 (allowlist sanitisation, stored-XSS protection in admin previews as well as public pages), RBAC 001 (`posts.write`, `posts.publish`), EVT 001 (publication events on the outbox for later cache invalidation).

Acceptance criteria:
1. Migration: `authors` (display name, slug, bio, public image placeholder, active, version), `blog_categories` and `blog_tags` (name, unique slug, active, landing content, version), `posts` (title, unique slug incl. archived, excerpt, `bodyMarkdown`, `sanitizedBody`, status enum, `scheduledAt`, `firstPublishedAt`, `publishedAt`, `archivedAt`, `commentsEnabled`, SEO title/description, author FK RESTRICT, primary category FK RESTRICT, cover media placeholder, version), `post_tags` join, `content_revisions` (resource type/id, version, sanitised snapshot, actor, reason). Indexes per DAT 004. Harness list updated.
2. Sanitisation: authoring is Markdown; the server converts it and sanitises the result with an explicit allowlist (headings, paragraphs, lists, emphasis, links with safe protocols and `rel`, blockquote, code, images with required alt, tables) — scripts, event handlers, iframes, styles and `javascript:`/`data:` URLs are always removed. Unit tests cover each attack shape.
3. Admin API (`posts.write` / `posts.publish`): CRUD for authors, blog categories and tags (slug rules, activate/deactivate, `expectedVersion`, `TERM_IN_USE` when a term is referenced by a non-archived post); posts list with filters (status, category, tag, author, search), create/PATCH with `expectedVersion`, and explicit `publish`, `schedule`, `unpublish`, `archive`, `restore` actions with the BLOG 002 gates (409 `PUBLICATION_BLOCKED` listing what is missing) and slug lock after first publication. Publication writes a `post.published` outbox event in the same transaction and stores a revision of the previous sanitised body.
4. Preview: `GET /admin/posts/{id}/preview` returns the sanitised body with `Cache-Control: no-store` for `posts.write` holders only; there is no public draft route, and unauthenticated access is 401/404 rather than a redirect.
5. Scheduled publishing: a worker job that runs every minute, claims due scheduled posts transactionally, publishes them idempotently (already-published posts are skipped), records the outbox event, and catches up after downtime. Tests cover the catch-up path and a Adelaide daylight-saving boundary.
6. Admin UI: Posts list and editor (Markdown body with live preview, excerpt, author/category/tag selectors, SEO fields, comments toggle, schedule picker showing Adelaide time and the resulting UTC instant), plus Authors, Blog categories and Tags screens; all permission-gated.
7. Tests: unit (sanitiser, slug and publication gates, schedule conversion), integration (CRUD, gates, slug lock, revisions, preview permissions, scheduling and catch-up, taxonomy references, permission denial), admin tests; root gate and runtime verification.
Out of scope: public blog pages, comments and related articles (Phase 19), cover images beyond the reference field (Phase 20 media), SEO metadata beyond per-post title/description (Phase 21), author archive pages (never in MVP).

Delivered:
- **Migration** `20260906160308_blog_posts_authors_taxonomy`: `authors` (public byline, separate from `admin_users`), `blog_categories`, `blog_tags`, `posts` (title, unique slug incl. archived, excerpt, `bodyMarkdown` + `sanitizedBody`, status enum, scheduling and publication timestamps, SEO fields, comments toggle, version), `post_tags`, `content_revisions` (unique per resource and version). Indexes per DAT 004 on status with published and scheduled time, category and author.
- **Sanitisation** (`apps/api/src/blog/sanitise.ts`): Markdown is rendered with `marked` 18 and then filtered by `sanitize-html` 2.17 against an explicit allowlist — headings, text, lists, quotes, code, tables, links and images only; `http`/`https`/`mailto`/`tel` schemes only; external links forced to `rel="noopener noreferrer nofollow" target="_blank"`; images given `alt` and lazy loading. Unit tests assert that scripts, event handlers, iframes, styles, forms, objects, SVG and `javascript:`/`data:`/`vbscript:` URLs never survive.
- **Editorial API**: authors, blog categories and blog tags with generated slugs, sanitised landing content, `expectedVersion` and activate/deactivate guarded by `TERM_IN_USE` when a live article still uses them; posts with list filters (status, category, tag, author, search, sort allowlist), create/PATCH, and explicit `publish`, `schedule`, `unpublish`, `archive`, `restore`. Publishing enforces the BLOG 002 gates (409 `PUBLICATION_BLOCKED` listing what is missing), locks the slug after first publication, preserves `firstPublishedAt`, writes a `post.published`/`post.updated`/`post.removed` outbox event in the same transaction, and stores a `ContentRevision` of the previous sanitised body whenever a published article changes.
- **Preview**: `GET /admin/posts/{id}/preview` returns the sanitised body for `posts.write` holders with `Cache-Control: no-store, private` and `X-Robots-Tag: noindex, nofollow`; there is no public draft route at all, so an unauthenticated lookup is 404 and an unauthenticated preview is 401.
- **Scheduled publishing**: `ScheduledPublishingService` scans every minute, claims due posts by row version and publishes them idempotently with their outbox event, so a scan that runs late (or twice) publishes each post exactly once and never strands one.
- **Admin UI**: Articles list (status and search filters in the URL, incomplete and scheduled markers), the article editor (Markdown body, sanitised server-side preview shown verbatim, author/category/tag selectors, SEO fields, comments toggle, revision reason, publish/schedule/unpublish/archive/restore dialogs with the blockers from the API, and a Adelaide-time schedule picker that sends a UTC instant), plus Authors, Blog categories and Blog tags screens. All gated by `posts.write`/`posts.publish`.

Verification (all green, 2026-09-06): `pnpm check` — database 23, API 127, admin 75, web 13, domain 6, worker 9, e2e 19, builds, contracts in sync (90 paths); `pnpm test:integration` — database 5, API 77 (`blog.integration-spec.ts`: slug generation and collisions, sanitisation of body and landing content, publication gates with field-level reasons, permission denial for a write-only role, slug lock, revision capture with the first publication date preserved, preview headers and unauthenticated 401/404, scheduling refusals for past times, catch-up publication across the 2026-10-04 ACDT transition with idempotency, `TERM_IN_USE` for author/category/tag, archive/restore transitions and the audit trail). Runtime against the live API: 21 blog paths served, a created draft had its `<script>` stripped and its external link marked `rel="noopener noreferrer nofollow"`, publish set `firstPublishedAt`, the preview returned `no-store, private` with `X-Robots-Tag: noindex, nofollow`, and a public post lookup returned 404.

Decisions: articles are authored in **Markdown** and stored with the sanitised HTML beside the source — the preview therefore shows exactly what will be published, and a future editor change cannot bypass the sanitiser; the public author identity is a separate `authors` table that grants no access; scheduling stores UTC while the admin picker works in Adelaide time and shows the offset, with the conversion unit-tested across a daylight-saving boundary.

Limitations / follow-ups: public blog pages, comments and related articles are Phase 19; cover images are a reference field until the media pipeline (Phase 20); per-post SEO fields exist but sitemaps, JSON-LD and redirects are Phase 21; the outbox events are written but cache invalidation consumes them in Phase 22.


## Phase 19 — Public blog pages and comment moderation (complete, 2026-09-06)

SRS: BLOG 004 (article page with heading hierarchy, byline, date, cover, body, tags, share links without third-party widgets, related articles and approved comments; related articles prefer the shared category then tags, exclude self and unpublished content and return at most four with a deterministic tie order), BLOG 005 (blog index and category/tag pages server-rendered, 12 articles per page, newest published first; a tag without substantive editorial landing content is `noindex`; no author archive pages), COM 001 (name 2–80, private email ≤ 254, plain-text comment 2–2000, no login, guidelines and privacy acknowledgement, all comments pending, approved/rejected/spam following the review moderation rules, only approved comments public, flat list), COM 002 (comments can be closed per article; submission rechecks publication and `commentsEnabled`; archived, draft or closed articles are rejected with a safe public error; chronological order with a stable id tie-break and page size 20; reporting and removal invalidate comment counts and pages), REP 001–002 (an abuse report may target an approved comment as well as a review; exactly one target), API 003/004 (idempotent public POST, 201 receipt, bounded pagination), SEC 002 (comment ceilings: five per 15 minutes and 20 per day per IP, Turnstile and honeypot), SEO 001/003 (server-rendered HTML, one H1, canonical, `noindex` for thin tag pages).

Acceptance criteria:
1. Migration: `comments` (post FK cascade, display name, encrypted private email, keyed email hash, original and optional redacted text, status enum, moderation fields, acknowledgement version/time, hashed submitter IP, version) and an `abuse_reports.commentId` column with the "exactly one target" invariant enforced by a check constraint and in the service.
2. Public API: `GET /posts` (12 per page, newest published first, category/tag filters, published-only), `GET /posts/{slug}` (404 unless published, sanitised body, byline, tags, related articles ≤ 4), `GET /blog-categories` and `GET /tags` (active terms with post counts and whether they have landing content), `GET /posts/{id}/comments` (approved only, chronological, 20 per page) and `POST /posts/{id}/comments` (201 neutral receipt; rejects closed comments, unpublished articles, failed Turnstile/honeypot/limits; requires an `Idempotency-Key`). `POST /reports` accepts a comment target.
3. Moderation: `GET /admin/comments` (status, post filters), `POST …/approve|reject|spam` with reason and `expectedVersion`, `PATCH …/redaction`; the same rules as reviews, audited, with the post's approved comment count kept correct.
4. Web: `/blog` index, `/blog/category/{slug}` and `/blog/tag/{slug}` landings (thin tags `noindex`), and `/blog/{slug}` article page with byline, date, tags, share links (copy link and ordinary mail/X/Facebook URLs, no third-party scripts), related articles, approved comments and the comment form (or a clear "comments are closed" notice). Blog appears in the public navigation.
5. Admin: Comments moderation queue mirroring the Reviews queue.
6. Tests: unit (share links, comment rules), integration (public index/detail scope and pagination, related-article ordering, comment submission rules incl. closed and unpublished articles, idempotent replay, limits, moderation transitions and counts, report targeting a comment, permission denial), admin and web tests; root gate and runtime verification.
Out of scope: threaded replies (never in MVP), author archive pages (never), cover images (Phase 20), sitemap/JSON-LD (Phase 21), cache purge on publication (Phase 22).

Delivered:
- **Migration** `20260906162923_comments_and_report_targets`: `comments` (post FK cascade, encrypted private email, keyed hash, original and optional redacted text, review-style status enum, moderation fields, acknowledgement, hashed IP, version) plus `abuse_reports.commentId` with `reviewId` made nullable. MySQL refuses a check constraint on a column used by a cascading foreign key (error 3823), so the "exactly one target" rule is the application invariant SRS REP 001 explicitly permits — enforced in `ReportsService` and covered by an integration test; the migration records why.
- **Public API**: `GET /posts` (published only, newest first, 12 per page, `category`/`tag`/`q` filters), `GET /posts/{slug}` (404 for drafts; sanitised body, byline, tags, related articles ranked by shared category then shared tags with a stable tie-break, at most four), `GET /blog-categories` and `GET /tags` (active terms with published counts and landing content), `GET /posts/{id}/comments` (approved only, oldest first, 20 per page) and `POST /posts/{id}/comments` (201 neutral receipt; rechecks publication and `commentsEnabled`, 409 `COMMENTS_CLOSED`, Turnstile, honeypot, per-IP ceilings, `Idempotency-Key` with replay). `POST /reports` now accepts a comment target.
- **Comment moderation** (`comments.moderate`): list with status, post and reported filters; `approve`/`reject`/`spam` with reason and `expectedVersion`; `PATCH …/redaction` preserving the original. Approved comment counts follow the moderation state, so removing a comment updates the article's count.
- **Web**: `/blog` index (12 per page, category chips), `/blog/category/{slug}` and `/blog/tag/{slug}` landings (sanitised landing content; a tag with neither content nor articles is `noindex, follow`), and `/blog/{slug}` with byline, date, sanitised body, tags, author card, share links (plain `mailto` and share URLs with `rel="noopener noreferrer nofollow"`, no third-party scripts), related articles, approved comments and the moderated comment form or a "comments are closed" notice. Blog joined the public navigation.
- **Admin**: Comments moderation queue mirroring Reviews; the Abuse reports queue shows the target type and links to the right queue.

Verification (all green, 2026-09-06): `pnpm check` — database 23, API 127, admin 78, web 15, domain 6, worker 9, e2e 19, builds, contracts in sync (101 paths); `pnpm test:integration` — database 5, API 83 (`blog-public.integration-spec.ts`: index scope and ordering with drafts excluded, filters, pagination bounds, article detail with related ordering, taxonomy counts and the thin-tag case, comment submission rules incl. closed and unpublished articles and idempotent replay, moderation transitions with public visibility and counts following them, redaction preserving the original, comment reports with the single-target rule). Runtime: `/blog`, an article and a category page returned 200 while an unknown tag and article returned 404; the article page rendered one H1, a canonical URL, Adelaide-formatted dates, share links with safe `rel`, no third-party scripts and no overflow at 375 px.

Decisions: comments reuse the review moderation core (states, reasons, redaction, audit) rather than a parallel implementation; share links are plain URLs so no third-party script runs on an article page; the thin-tag `noindex` rule is applied in the web layer from the API's `landingContent` and `postCount`.

Limitations / follow-ups: comment counts on cached pages refresh on the next revalidation until tag purge lands (Phase 22); cover images (Phase 20); sitemap, JSON-LD and redirects (Phase 21); the comment and review forms link to `/review-guidelines`, which arrives with the static pages (Phase 22).


## Phase 20 — Media pipeline (complete, 2026-09-06)

SRS: MED 001 (only authorised admins upload; accept JPEG, PNG and WebP up to 10 MB and 40 megapixels; reject SVG, executables, animated formats and documents; validate the signature and the decoded image, not the filename or the browser's MIME; re-encode derivatives and strip EXIF including location), MED 002 (request a short-lived constrained signed upload → private quarantine → validate completion and checksum → process variants → mark ready; a pending or rejected asset is never publicly addressable; random server-generated object keys, least-privilege credentials, no client-chosen keys or overwrites), MED 003 (metadata: source name, MIME, bytes, dimensions, checksum, object key, derivatives, alt text, credit, rights/source note, focal point, processing status, creator and timestamps; responsive thumbnail/card/hero renditions preserving aspect ratio with a fallback when processing fails; content images require useful alt text), MED 004 (gallery order, caption and contextual alt overrides live on the usage record; an asset may be used by several businesses or posts; deletion of a referenced asset is blocked until usages are removed; abandoned quarantine objects removed after 24 hours and unreferenced ready objects after 30 days), DAT 003 (restrict deletes of published media), ARC 003 (S3-compatible object storage behind an adapter), SEC 004 (credentials only in the environment, never in media metadata or browser responses), RBAC 001 (`media.manage`), BUS 002/BLOG 001 (listing galleries and article covers).

Acceptance criteria:
1. Local infrastructure: MinIO added to the Compose project on a loopback port with its own volume and credentials in the ignored `infrastructure/.env`, so the real S3 API is exercised locally. Two buckets: a private quarantine and a public media bucket, created idempotently at start-up.
2. Migration: `media_assets` (source name, MIME, bytes, width, height, checksum, object key, status `quarantined|ready|rejected`, alt text, credit, rights note, focal point, rejection reason, uploader, version, timestamps), `media_variants` (asset FK, kind `thumbnail|card|hero`, object key, dimensions, bytes, MIME), `business_media` (business + media FK, order, caption, alt override, cover flag, unique pair) and real foreign keys for `posts.coverMediaId` and `authors.imageMediaId` with `RESTRICT`.
3. Storage port: an `ObjectStoragePort` with an S3 adapter (AWS SDK v3) used for MinIO and production alike; presigned PUT URLs constrained by content type, size and a random server-generated key; the API never proxies file bytes and never accepts a client-supplied key.
4. Upload flow: `POST /admin/media/uploads` (returns the asset id and a short-lived signed URL), `POST /admin/media/{id}/complete` (re-reads the object, verifies size and checksum, validates the magic bytes and the decoded image, rejects SVG/animated/oversized/too-many-pixels, then enqueues variant processing), worker job that re-encodes thumbnail/card/hero to WebP with EXIF stripped, publishes them to the public bucket and marks the asset ready (failures mark it rejected with a reason and never leave a half-published asset).
5. Usage and deletion: business gallery endpoints (add, reorder, caption, alt override, cover) and post/author cover references; `DELETE /admin/media/{id}` refuses while any usage exists; retention scans remove abandoned quarantine objects after 24 hours and unreferenced ready assets after 30 days, logged by count.
6. Admin: media library (upload with client-side size/type pre-check, alt text and rights fields, status, usages), gallery management on the business editor and a cover picker on the article editor.
7. Web: listing cards and detail pages render the real cover and gallery images with responsive sizes and the stored alt text, falling back to the existing placeholder when an asset is missing.
8. Tests: unit (validation rules, key generation, variant sizing), integration (upload lifecycle incl. rejection paths, quarantine invisibility, usage rules and deletion refusal, permission denial), worker unit tests, admin/web tests; root gate and runtime verification against MinIO.
Out of scope: CDN configuration and cache purge (Phases 22/24), video or document uploads (never in MVP), image cropping UI beyond the focal point.

Delivered:
- **Infrastructure**: MinIO added to the Compose project (`adelaide-sphere-minio`, host ports 9020/9021 because php-fpm holds 9000 on this machine, volume `adelaide-sphere_minio-data`, credentials in the ignored `infrastructure/.env`). The API creates both buckets at start-up and applies an anonymous read policy to the **public** bucket only; the quarantine bucket never gets one (verified: a quarantine URL returns 403).
- **Migration** `20260906165837_media_pipeline`: `media_assets` (source name, MIME, bytes, dimensions, checksum, random object key, status quarantined/ready/rejected, rejection reason, alt text, credit, rights note, focal point, uploader, version), `media_variants` (unique per asset and kind) and `business_media` (order, caption, alt override, cover). `posts.coverMediaId` and `authors.imageMediaId` became real `RESTRICT` foreign keys (the widening is documented in the migration; both columns were empty).
- **Shared rules** (`packages/domain/media.ts`): allowed MIME types, 10 MB and 40-megapixel limits, minimum dimensions, variant sizes (thumbnail 320, card 800, hero 1600), the rejection-reason order and the random object-key builder, used by the API and the worker alike.
- **API**: `ObjectStoragePort` with an S3 adapter (AWS SDK v3, path-style for MinIO). `POST /admin/media/uploads` returns a five-minute signed PUT for a server-generated key; `POST /admin/media/{id}/complete` re-reads the object, verifies the checksum, detects the real type from the magic bytes, reads the dimensions and rejects anything outside the rules (deleting the rejected original immediately), then writes a `media.uploaded` outbox event; list/detail/update/delete with usage counts, and deletion refused with 409 `MEDIA_IN_USE` while an asset is referenced. Gallery usage lives on `PUT /admin/businesses/{id}/gallery` (order, caption, alt override, single cover, `expectedVersion`), and only processed assets with alt text may be used.
- **Worker**: `media.process` job re-encodes thumbnail/card/hero to WebP with sharp, never upscaling, publishing only after every variant succeeds and marking the asset ready; a failure rejects it with a reason and removes any partial variants. Re-encoding drops EXIF, including GPS.
- **Retention** (`MediaService.runRetention`): abandoned quarantined or rejected assets after 24 hours, unused ready assets after 30 days, logged by count.
- **Admin**: Media library (upload with client-side type and size checks, required alt text, status, dimensions, usage counts, details dialog for alt/credit/rights/focal point, delete guarded by usage), a reusable media picker that only offers processed assets with alt text, and a gallery editor on the business page (add, reorder, caption, contextual alt, cover).
- **Web**: listing cards and detail pages show the real cover and gallery with responsive sizes and stored alt text; blog cards and articles show the cover; the placeholder remains the fallback. `next.config.ts` allows exactly one remote image origin, derived from `MEDIA_PUBLIC_BASE_URL`.

Verification (all green, 2026-09-06): `pnpm check` — database 23, API 127, admin 83, web 15, domain 10, worker 13, e2e 19, builds, contracts in sync (106 paths); `pnpm test:integration` — database 5, API 89 (`media.integration-spec.ts`: signed upload with a server-generated key and refused client key, permission denial, size/type refusals, checksum mismatch and disguised-file rejection with the original deleted, duplicate completion refused, gallery rules incl. not-ready and missing-alt refusals, single cover, stale version, deletion refused while used, detail usages, metadata edit with version). Runtime against real MinIO: buckets created, public read policy applied, a 2400×1600 JPEG uploaded through the signed URL, validated, processed into three WebP variants (320/800/1600), fetched publicly (200) with EXIF stripped, while a quarantine URL returned 403.
- Test-suite cost: the admin specs now render the page under test instead of the whole route tree (the nav-visibility tests still mount `AppRoutes`), cutting the interaction-heavy files from about 29 s to 4 s and removing the load-dependent flakes.

Decisions: MinIO joins the local stack so the same S3 client and signed-URL flow used in production is exercised locally; the public read policy is applied by the API but a failure is logged rather than fatal, because a production key may legitimately lack `PutBucketPolicy`; alt text is required before an asset can be placed on a page, and the contextual override lives on the usage record.

Limitations / follow-ups: no CDN in front of the bucket yet (Phase 22/24) — `MEDIA_PUBLIC_BASE_URL` points straight at storage locally; retention runs on demand (`runRetention`) until the scheduled maintenance job lands with the operations phase; the article cover picker is available through the media library and gallery editor, but the article editor's own cover field is still a reference only; no image cropping beyond the focal point.


## Phase 21 — SEO: sitemaps, structured data, canonicals and redirects (complete, 2026-09-06)

SRS: SEO 001 (server-rendered HTML with one H1, descriptive title and meta description, absolute canonical on one configured origin, correct status codes, Open Graph and social image; admin and private content never in public metadata), SEO 002 (XML sitemap index split into businesses, editorial content and curated taxonomies, canonical 200 pages only, meaningful last-modified timestamps, no drafts, redirects, empty taxonomies, search combinations or private routes; robots.txt is guidance, not access control), SEO 003 (curated category and area pages need real editorial content and eligible listings; no automated category × area pages; filtered searches are `noindex, follow` with a normalised self canonical; tracking parameters stripped from canonicals; paginated listings use self canonical page URLs with crawlable previous/next links), SEO 004 (a slug change creates a 301 to the new canonical path; no collisions, cycles, chains or cross-origin targets; aliases resolve to the latest target; drafts 404; deliberately removed resources may return 410; never redirect every missing page to the home page), SEO 005 (validated JSON-LD: Organization and WebSite, BreadcrumbList where breadcrumbs are visible, the most accurate LocalBusiness subtype for a listing and BlogPosting for an article, with address, phone, URL, geo and hours only when known and displayed — nothing invented), SEO 006 (rating markup only from approved, visible submissions and the same aggregate the page shows; omitted when empty; review rich-result eligibility must be confirmed by the technical lead before enabling review markup), SEO 007 (text embedded in JSON-LD sanitised so it cannot break out of the script element, sitemap content XML-escaped, unpublished resources gone from schema, related blocks and sitemaps as well as search).

Acceptance criteria:
1. Migration: `redirects` (unique source path, target path, kind `permanent|gone`, reason, resource type/id, actor, timestamps) with cycle and chain prevention in the service.
2. API: `POST /admin/businesses/{id}/slug` and `POST /admin/posts/{id}/slug` change a published slug and create the 301 in the same transaction (replacing today's blanket `SLUG_LOCKED` refusal), resolving any existing alias to the new target so chains cannot form; `GET /redirects/resolve?path=` for the web tier; admin list of redirects; `GET /sitemap/*` feeds returning canonical paths and last-modified times for published businesses, published posts and curated taxonomies that have both editorial content and at least one eligible item.
3. Web: `robots.ts` (allow public routes, disallow `/admin` and query-filtered paths, point at the sitemap index), `sitemap.ts` generating the index plus child sitemaps from the API feeds, canonical URLs with tracking parameters stripped, `rel="prev"`/`rel="next"` on paginated listings, and a middleware that resolves redirects (301) and returns 410 for deliberately removed resources.
4. JSON-LD: Organization and WebSite on the home page, BreadcrumbList wherever breadcrumbs are shown, LocalBusiness (with address, geo, phone, URL and opening hours only when published) on business pages, BlogPosting on articles, plus `aggregateRating` only when approved reviews exist and are displayed. All values escaped so `</script>` in content cannot break out.
5. Tests: unit (canonical normalisation, JSON-LD builders and escaping, redirect cycle/chain rules), integration (slug change creating a redirect and resolving aliases, sitemap feed exclusions, permission denial), web unit tests, and runtime checks of robots, sitemap, canonical, redirect status codes and structured data with JavaScript disabled.
Out of scope: review rich-result markup is built but stays behind an explicit setting until the technical lead confirms eligibility (SEO 006); cache purge on publish (Phase 22); Search Console verification and analytics (Phase 24).

Delivered:
- **Migration `add_redirects`**: `redirects` (unique `sourcePath`, nullable site-relative `targetPath`, `kind permanent|gone`, reason, resource type/id, actor, timestamps). `RedirectsService` keeps three invariants on every write — one source resolves one way, aliases pointing at an old path are repointed at the newest target (no chains), and a path that becomes live content again loses its outgoing rule (no cycles).
- **Slug changes**: `POST /admin/businesses/{id}/slug` and `POST /admin/posts/{id}/slug` change a published slug and write the 301 in the same transaction (`listings.publish` / `posts.publish`, `expectedVersion`, audit entry, article outbox event). Unpublished content changes slug with no redirect, because it never had a public URL.
- **Redirect administration**: `GET/POST/DELETE /admin/redirects` behind the new `redirects.manage` permission, plus an admin screen for moved and permanently removed pages.
- **Sitemap feeds**: `GET /api/v1/seo/sitemap/{businesses|editorial|taxonomies}` returning canonical paths and real last-modified times. Only published listings and articles appear; a taxonomy needs its own editorial text *and* at least one published item, so thin generated pages stay out.
- **Web**: `robots.txt` (sitemap index, `/admin`, `/api/` and query-filter paths disallowed), `/sitemap.xml` index with `/sitemaps/{section}.xml` children (XML-escaped, rendered per request with a five-minute public cache header so the build never needs a live API), and `middleware.ts` resolving redirects for `/business/*`, `/blog/*` and `/business/*` — 301 to the new address, 410 for a removed page, and pass-through for unknown paths so a missing page still renders its own 404 rather than being sent to the home page. Resolutions are cached in memory for 60 s and an unreachable API never blocks rendering.
- **JSON-LD** (`lib/structured-data.ts`): Organization and WebSite on the home page, BreadcrumbList wherever breadcrumbs are visible, the most accurate LocalBusiness subtype on a listing (address, geo, phone, hours and `aggregateRating` only when the page itself shows them) and BlogPosting with a Person author on an article. `serialiseJsonLd` escapes `<`, `>` and `&`, so pasted text cannot close the script element.
- Canonicals already strip tracking parameters (only known search keys survive `parseSearchParams`), filtered searches stay `noindex, follow`, and pagination keeps crawlable previous/next links.

Verification: `pnpm check` green (database 23, API 141, admin 92, web 20, domain 10, worker 13, e2e 19, all builds, contracts in sync); `pnpm test:integration` green (database 5, API 101) including `seo.integration-spec.ts` — sitemap exclusions for unpublished content and empty taxonomies, a slug change creating a 301, a second change repointing the older alias instead of chaining, reusing a redirecting path removing the rule, article slug change with stale/invalid refusals, manual 301/410 entries, cross-origin and reserved-path refusals, permission denial for an admin without `redirects.manage`, and path normalisation on resolve.

Decisions: redirects live behind their own `redirects.manage` permission rather than `settings.manage`, because changing where a public URL goes is a different risk from editing site settings; chain prevention happens on write (repointing aliases) rather than by following chains on read, so every resolution is a single lookup.

Limitations / follow-ups: review rich-result markup (SEO 006) is deliberately not emitted beyond `aggregateRating`; cache purge on publish is Phase 22; Search Console verification is Phase 24.


## Phase 22 — Editorial depth, interface quality, static pages, featured placements and caching (complete, 2026-09-07)

Raised by the client during Phase 21: the product felt thin — authors were a two-field modal, the article body was a plain Markdown textarea, the dashboard was a placeholder, and the interface did not read as a finished product. The instruction is to lift every section to a premium, industry-standard level, one at a time. SRS anchors: BLOG 001 ("sanitized rich content", author attribution separate from admin login), BLOG 004 (byline, author card), ADM 002 (the full admin screen inventory with search, filters, confirmations and stale-edit warnings), ADM 003 (dashboard shows pending moderation, open reports, failed enquiries, due/failed scheduled posts and recent audit activity, with no private text), SEC 001 (allowlist sanitisation of rich content in public pages *and* admin previews), UX 001, NFR 005/011.

Delivered so far:
- **Author profiles** (migration `author_profiles`): role, short bio, sanitised long biography, pronouns, location, public editorial email, website, topic labels, profile photo (a processed media asset with alt text) and per-network profile links (`author_links`, one per known network, host-checked). Authors remain attribution only — no login, no administrator email (SCP 002). New admin screens: an authors list (photo, role, topics, published/total counts, activate/deactivate) and a full profile editor; the public article page now renders a real byline (photo, role, dates, reading time) and an author card (photo, biography, topics, links), and `BlogPosting` credits a Person with those fields.
- **Rich text editor**: TipTap 3.31.3 in the admin (headings, emphasis, lists, quotes, code blocks, dividers, links, media-library images and tables) with a keyboard-accessible toolbar, word count and reading time. Articles carry a `bodyFormat` (`markdown` legacy, `html` from the editor); both formats pass the identical server-side allowlist, so the editor is a convenience and never the security boundary. Existing Markdown articles keep working and can be converted in one click. The editor is code-split (461 kB separate chunk) and loads only on the two screens that write rich content.
- **Article cover images**: `coverMediaId` is now a real field on the article API and editor (validated as a ready asset with alt text), not just a caption override.
- **Dashboard** (`GET /api/v1/admin/dashboard`): permission-scoped counts for pending reviews and comments, open reports, failed and new enquiries, draft listings, uploads still processing and overdue scheduled articles, plus the next scheduled articles and recent audit activity. Counts only — no enquiry, review or comment text — and a metric is omitted entirely when the caller lacks the permission that owns its screen.
- **Admin design system**: refreshed tokens (palette, type scale, elevation, control sizing), shared `PageHeader`, `SectionCard`, `StatCard`, `StatusTag`, `EmptyState` and sticky `StickyActions` save bar, a grouped navigation shell (Overview, Directory, Editorial, Community, Configuration) with an account menu and a "View site" link, and route-level code splitting that cut the main bundle from 2.17 MB to 973 kB (298 kB gzip).
- **Public reading experience**: one `.as-prose` editorial style shared by article bodies and author biographies (measure, headings, quotes, code, tables, figures) replacing ad-hoc utility strings.

Verification: `pnpm check` and `pnpm test:integration` green (counts above), including new suites `authors.integration-spec.ts` (full profile round-trip, biography sanitisation, link host and email validation, unusable image refused, link replacement, stale version, deactivation refused while credited), `dashboard.integration-spec.ts` (permission-scoped metrics, anonymous 401, no private text) and admin specs for the authors screens, redirects screen and dashboard.


Also delivered in this phase:
- **Information pages** (migration `static_pages_and_featured`, SRS CFG 002): the five fixed pages (about, contact, privacy, terms, review guidelines) with sanitised rich content, revisions on every change to published text, and a publication gate that refuses stub copy, placeholder wording ("lorem ipsum", "TBD", "sample text", example domains) and unvalidated contact routing. Admin screen with the rich editor and per-page publication blockers; public routes at `/{slug}`; the footer links only pages that are actually published.
- **Featured placements** (SRS DIR 007): manual editorial placements with a position and a validated interval, overlap refused, no payment fields anywhere (FUT 002). Public search returns at most three matching, published, featured listings in `meta.featured`, excluded from the organic results, their count and their pagination; the same set appears on every page of a query and empties when filters no longer match. Admin screen under Directory → Featured listings.
- **Caching and invalidation** (SRS CACHE 001–003): a Redis read cache for public search, namespaced by a publication version so a publication change retires every dependent entry at once; publication, featuring, moderation, page and settings changes write a `cache.invalidate` outbox event in the same transaction, the dispatcher hands it to the worker, and the worker purges the web tier through `POST /api/revalidate` (shared secret, tag allowlist, immediate expiry) with BullMQ retries — so a failed purge is tracked and retried rather than waiting for a TTL. Redis being unavailable degrades to uncached reads; MySQL stays authoritative.
- **Home banner** (SRS HERO 001): the hero is a real banner with up to six admin-managed Adelaide photographs behind a navy overlay, cross-fading with previous/next, pause and per-image controls, a caption slot and per-slide focal points. It falls back to the solid navy panel when no images are configured, and anyone who prefers reduced motion sees only the first slide. Slides are chosen from the media library in Site settings.
- **Dark scheme rework**: the public palette had cards and page background both in navy, which read as one flat field. The dark scheme is now a near-black slate page with clearly lifted surfaces and documented contrast ratios; navy is a brand accent (hero, header) rather than the page colour.

Verification: `pnpm check` green (database 23, API 147, admin 99, web 23, domain 12, worker 16, e2e 19, builds, bundle budget, contracts in sync); `pnpm test:integration` green (database 5, API 115) including `static-pages.integration-spec.ts`, `featured.integration-spec.ts` and `cache-invalidation.integration-spec.ts`.

Limitations / follow-ups: the remaining public screens (directory filters, listing detail) have had a light pass rather than a full redesign; no CDN sits in front of the media bucket yet; review rich results stay disabled pending the technical lead's confirmation (SEO 006).

## Phase 23 — Accessibility and performance (complete, 2026-09-07)

SRS: NFR 005 (performance budgets), NFR 006 and NFR 011 (WCAG 2.2 AA, keyboard operation, visible focus, reduced motion), NFR 013 (client bundle discipline).

Delivered:
- **Automated accessibility checks**: axe-core runs over representative admin screens (dashboard, sign-in, author editor, redirects) in the test suite, and over the public hero banner in a jsdom component test. The rules cover WCAG 2.0/2.1/2.2 A and AA plus best practice; colour contrast is verified separately by the palette test, because jsdom has no layout.
- **Defects the checks found, and fixed**: table action columns had empty headers (now visually hidden "Actions" text), section headings were plain `<div>`s so the heading order jumped from h1 to h4 (SectionCard now renders a real `<h2>` and the dashboard lists use their own markup), and the lazy editor's loading skeleton exposed an empty heading (now an announced status message with a decorative skeleton). The public `PageHeader` also stopped rendering a second `banner` landmark inside `<main>`.
- **Performance**: route- and editor-level code splitting cut the admin entry chunk to 755 kB (26 chunks, 2.15 MB total) from a single 2.17 MB bundle, and `pnpm budget` now fails the phase gate if either the entry chunk or the total exceeds its cap.
- Reduced motion is honoured by both rotating elements (hero phrases and banner slides), each with a persistent pause control, and neither causes layout shift.

Verification: `pnpm check` green including the new accessibility specs and the bundle budget step.

Limitations / follow-ups: automated rules do not replace a manual audit — a keyboard-only pass, screen-reader pass and 320 px/200 % zoom review of the public pages remain a launch gate (SRS T02/T14); no synthetic load test has been run (NFR 003).

## Phase 24 — Operations: deployment, backups and monitoring (complete, 2026-09-07)

SRS: OPS 001–003, BACK 001–002, MON 001–002.

Delivered:
- **CI** (`.github/workflows/ci.yml`): frozen-lockfile install, migration policy lint, lint, typecheck, unit, e2e, build, bundle budget and contract check; a separate job runs the integration suites against real MySQL 8.4 and Redis 8 services after applying migrations exactly once; a third job audits production dependencies and fails on high or critical advisories.
- **Images**: multi-stage, non-root Dockerfiles for the API, worker and web app, each pinned to Node 24.19.0 and pnpm 12.3.4, with health checks and `STOPSIGNAL SIGTERM` for the worker's drain.
- **Monitoring** (`GET /api/v1/admin/operations/status`, permission `audit.read`): queue age, failed events, failed enquiries, scheduled-publishing lateness, moderation backlog and stuck uploads, each with the MON 002 threshold and the action an operator should take. Counts and ages only — the integration test asserts no address ever appears in the payload.
- **Backups**: `infrastructure/backup/backup-database.sh` takes an encrypted, checksummed logical backup with the binlog position recorded for a one-hour RPO; `restore-drill.sh` restores into an isolated `*_restore` database (it refuses any other name), verifies schema, collation and row counts, and prints the measured restore time plus the manual steps a drill still requires.
- **Runbooks**: `docs/operations/runbook.md` (environments, deployment and rollback, runtime health, pools and network policy, backup and restore, the alert table and common procedures) and `docs/operations/restore-drills.md` for drill results.

Verification: `pnpm check` and `pnpm test:integration` green, including `operations.integration-spec.ts` (signal set and thresholds, degraded state, permission and session refusal). Container builds and CI itself run on the client's infrastructure and are not exercised from this machine.

Limitations / follow-ups (all client decisions, not code): no cloud accounts, DNS, TLS certificates, CDN, error tracking or uptime monitoring are provisioned; the cross-border processing register and the on-call responder table in the runbook are deliberately blank until the client fills them; the first restore drill must be run and recorded before launch.


## Phase 25 — Verification: UAT journeys, capacity and the restore drill (complete, 2026-09-07)

SRS: QA 001–003 (release verification and UAT flows), NFR 003 (capacity), NFR 006/011 (accessibility), BACK 002 (restore drill).

Delivered:
- **UAT journeys** (`e2e/`, Playwright 1.63): the four QA 003 flows plus the checks a manual pass would repeat — home → search → business in three interactions, search with JavaScript disabled, the review and comment forms stating plainly when submissions are closed, blog → article with byline and author card, a genuine 404 that keeps its address, robots and sitemap contents, admin anonymous refusal on every admin surface, an administrator signing in and opening the moderation queues, skip-link focus, one `h1` and one `main` per page, and no horizontal scrolling at 320 px. They run at desktop and 320 px widths against a running stack; credentials come from the environment, so the suite contains none.
- **Defects the journeys found, and fixed**: a `notFound()` inside a dynamic route rendered a blank page (Next 16 serves its bare error document and keeps the content in the flight payload) — fixed with per-segment `not-found` boundaries plus `global-not-found`; and the directory list had a streaming `loading.tsx` boundary, so with JavaScript disabled it showed "Loading businesses…" forever — the boundary is gone and results are server-rendered.
- **Capacity** (`tools/load/`): a seeder that fills an isolated `*_load` database with the NFR 003 volume (10,000 businesses, 2,000 articles, 100,000 approved reviews) and an autocannon profile at 50 GET/s across 100 sessions. Captcha-protected POSTs are deliberately excluded and measured separately, because driving them would measure the protection rather than the product.
- **Capacity defects found, and fixed**: the first run failed at 5.4% errors, all connection-pool timeouts. Two real causes: the pool size was the driver default of 10 with no way to configure it (now `DATABASE_CONNECTION_LIMIT`, validated, default 20, documented as a budget across replicas in the runbook), and a cold cache let concurrent identical requests each hit the database — the stampede CACHE 003 asks about. `CacheService` now coalesces concurrent misses for the same key into one load. Listing detail reads are cached too (five minutes, retired by the publication namespace). After the fixes, the full 30-minute acceptance run passed: 89,850 requests, 0 errors, p50 53 ms, p95 200 ms, p99 244 ms at the full data volume.
- **Restore drill** (`docs/operations/restore-drills.md`): a real rehearsal — encrypted backup, checksum verified, restored into an isolated `adelaide_sphere_restore` database, schema (45 tables), collation (0 mismatches) and row counts verified, restore time recorded, database dropped afterwards. The scripts now use `age` or `gpg`, whichever is installed, and take a `--port`. The drill recorded one gap honestly: the local account cannot write the binlog position, so a production backup account needs `RELOAD`/`BINLOG ADMIN` for the one-hour RPO.
- **Public design pass**: directory filter toolbar, results header and empty state, listing header and description measure, and a shared not-found treatment.

Verification: `pnpm check` green (database 23, API 153, admin 99, web 23, domain 12, worker 16, e2e 19, builds, bundle budget, contracts in sync); `pnpm test:integration` green (database 5, API 115); Playwright 30 journeys passing at two widths plus 4 authenticated admin journeys; the capacity profile passing at NFR 003 volume.

Limitations / follow-ups: a 404 still renders blank with JavaScript disabled (Next 16 keeps the not-found body in the flight payload; every other page is server-rendered); the manual screen-reader pass and the production-shaped restore drill remain launch gates; the load profile covers public reads only.

## Phase 26 — Home page redesign: a light-and-dark editorial composition (complete, 2026-09-07)

SRS: UX 001–003 (branding, navigation, three-interaction discovery), HERO 001–007 (banner, headline, search), DIR 001 (card contents), CFG 002 (contact routing), NFR 006/007/011 (accessibility, 320 px, focus and target size), NFR 001/013 (server rendering, bundle discipline), SEO 001–003.

Client feedback that prompted it: the page was one narrow column of near-identical navy, the hero read as a plain card rather than a destination banner, there was no Adelaide photography, cards looked like admin components, and the whole thing looked like a technical prototype.

### Visual implementation plan (the plan this phase was built to)

1. **Token layer first** (`packages/ui/src/styles.css`): a light-first palette — warm off-white page, white cards, a cool neutral band — plus explicit dark *band* tokens for the header, hero, locality feature, call to action and footer. Content widths (1520 / 1120 / 68ch), gutters, section rhythm, radii, shadows, focus rings and motion timings become tokens rather than per-component values.
2. **Drop the OS dark scheme.** The light/dark rhythm is designed per section; a `prefers-color-scheme` override repainted every band the same navy, which was the defect being fixed. `palette.test.ts` fails the build if one is reintroduced.
3. **Full-bleed layout.** `main` loses its width; sections are full-bleed and bound their own content with `.as-container`. Inner pages opt back into the column in one place.
4. **Section rhythm**: dark header → photographic hero → light categories → soft-neutral listings → dark Adelaide localities → light stories → dark call to action → dark footer.
5. **Real data or an honest state.** Every band loads independently and renders a populated, empty or failure state; nothing is invented to fill space.
6. **Verify in the browser at 1440 / 1024 / 768 / 390 px**, then run the automated accessibility scan, the journeys and the full gate.

### Delivered

- **Design system** (`packages/ui/src/styles.css`): the token set above, `.as-container` / `.as-container-tight` / `.as-section` primitives, and `.as-on-dark` so focus rings stay visible on dark bands. `apps/web/src/app/globals.css` adds the display-face rule and one shared card-lift treatment. Typography is a pairing: Geist for the interface, Instrument Serif (one weight, self-hosted by `next/font`) for display headings only.
- **Hero** (`hero-banner.tsx`, `hero-headline.tsx`, `hero-search.tsx`): a full-bleed photograph with a directional navy wash from `sm` up and an even tint below it (a narrow screen has no empty side of the picture to clear), per-slide focal points, prioritised first slide, cross-fade rotation with previous/next/pause and per-image controls at 44 px, a photo credit, and a designed gradient underneath so the banner still works if the image fails. The headline is the display serif with the reserved-height rotating phrase; the search panel is one rounded card with a fixed "Adelaide, Australia" label, a labelled keyword combobox, an optional category select and a prominent Search button, stacking full-width on mobile with its labels intact.
- **Photography** (`apps/web/public/hero/`, `lib/hero-assets.ts`, `docs/content/hero-photography.md`): two licensed photographs of the city (since replaced; current credits in `docs/content/hero-photography.md`), stored locally, cropped to 2560×1440, re-encoded as WebP with EXIF stripped, and credited in the banner. Admin-configured slides replace them entirely.
- **Header and footer**: a full-width navy header with the brand mark, active-page state, an always-available "Add a business" action and a native `<details>` mobile menu that works without JavaScript; a structured dark footer with directory, editorial, information and contact columns. About and Contact join the navigation automatically once those pages are published.
- **Home page** (`app/page.tsx`): the seven-band composition, category cards with restrained icons and a tile that completes the grid, listing and article grids whose column count follows how many cards actually exist, a Adelaide locality band that is a real grid rather than a row of pills, a lead-article treatment that works with a single published article, and a call to action that explains the no-account listing process.
- **Cards** (`business-card.tsx`, `post-card.tsx`, `featured-post-card.tsx`, `lib/category-visuals.ts`): a listing without a photograph gets a branded panel derived from its category — never a shared placeholder and never a fabricated photograph. The whole card is one link (stretched title anchor) with the contact action above it, so there is one focus stop and one accessible name.
- **Per-section states**: the home page loads its six sources with `Promise.allSettled`; a failing endpoint degrades its own band with a "we couldn't load this" notice and a retry, and is never reported as "nothing to show" (DIR 006, NFR 012).
- **Contact routing** (`lib/site.ts`): a development address (`.local`, `.test`, `.invalid`, `.example`, `.internal`) is treated as unset. The site then withholds it everywhere — footer, hours corrections, listing correction link — and the listing action points at the homepage explanation instead of publishing a mailbox nobody can write to.

### Verification

- **Browser review at 1440, 1024, 768 and 390 px**: hero composition and search usability, header navigation and the mobile menu, section widths, card grids, the light/dark rhythm, spacing, footer; no clipping, overlap, horizontal overflow or unexplained empty areas. `document.scrollWidth === innerWidth` at every width. Console clean apart from Next's image-preload warning under device-pixel-ratio emulation.
- **Automated accessibility**: a new axe-core WCAG 2.2 AA scan in `e2e/specs/accessibility.spec.ts` over `/`, `/business`, `/blog` and a listing page, at desktop and 320 px — **zero violations** — plus a mobile-menu operability test. `palette.test.ts` proves AA contrast for body, muted and link text on all three light surfaces and all three dark band shades.
- **Journeys**: `pnpm --filter @adelaide-sphere/e2e test` — 34 passed, 4 skipped (admin credentials absent).
- **Gate**: `pnpm check` green — database 23, API 153, admin 99, web 54, domain 12, worker 16, e2e 19, all builds, admin bundle entry 751 kB, contracts in sync.

### Defect found and fixed while testing

`categoryVisual('auto-repair')` returned the home-services family, because the home rule matched "repair" first — a mechanic would have been given a plumbing wrench. The rules are now ordered specific-first and short ambiguous tokens ("car" inside "carpet") match on hyphen boundaries; `category-visuals.test.ts` covers it.

### Outstanding content (client)

Brand logotype and wordmark, the client's own hero photography (the CC BY images are interim), the approved public contact address, and the About/Contact/policy page copy — until those pages exist the navigation omits them rather than linking to a 404.

## Phase 27 — Contact page and form, editorial and listing detail (complete, 2026-09-07)

SRS: UX 002/003 (navigation and the public route contract), CFG 002 (information pages and contact routing), ENQ 002/003 (the general enquiry uses the same durable pipeline), SEC 002/003 (captcha and honeypot on every public write), BLOG 004/005, BUS 001/003, REV 003/004, DIR 001/006, NFR 006/011.

Client feedback that prompted it: "I also need a contact us page with same way", "add form in contact us page", "improve the Blog and directory detail page in same way", and "I think you also missed rating system in directory detail page with review".

### Delivered

- **`/contact`** (`app/contact/page.tsx`): a real route instead of a 404. When an editor publishes the Contact information page its approved copy and address take over completely; until then the page explains how to reach the editors using facts about how the product actually works — no invented policy — and is `noindex, follow`, because that copy has not been through the client's approval. `InformationPage` (dark title band, reading column, aside) now backs About, Privacy, Terms and the review guidelines too, so every information page looks like the same publication.
- **Contact form** (`components/contact-form.tsx`, `lib/submissions.ts`): posts to `POST /api/v1/contact`, which already existed — the general site enquiry runs through the same transactional outbox as a business enquiry (ENQ 002/003), so no new endpoint, table or admin queue was invented for it; the message lands in the enquiries queue as `kind: site`. A fixed topic list becomes the enquiry subject, so the queue stays sortable and the visitor does not have to invent one. Turnstile-protected with a honeypot and an idempotency key; without a site key the form is not offered at all, because the API would refuse the submission anyway and a form that always fails is worse than an honest notice. `validateContactForm` mirrors the API's rules and is unit-tested.
- **Blog** (`app/blog/**`, `collection-header.tsx`): a dark title band with the category chips and counts on the index, a lead article plus a grid, and an article page that opens with a dark editorial header (breadcrumbs, category, display-serif title, standfirst, byline, share) with the cover lifted into it, then a clean reading column, tags, author card, comments and a related band. Category and tag landing pages share the same header. Their landing copy also stopped being invisible: it was styled with a `prose` class that does not exist in this project (there is no Tailwind Typography plugin) and now uses `.as-prose`.
- **Listing detail** (`app/business/[slug]/page.tsx`): an identity band carrying the category, name, area, rating, open/closed state and the three actions a visitor wants (call, directions, website) with the photograph — or the branded category panel — beside it; then about, services, hours, reviews and the enquiry form beside a sticky contact card, and related listings in a soft band.
- **Rating system** (API `ratingBreakdown`, `rating-panel.tsx`, `rating-stars.tsx`, `review-list.tsx`): the listing detail response now carries the approved-review distribution — five buckets, zeros included, empty when nothing is approved — computed with a grouped read over *all* approved reviews. It is deliberately not inferred from the page of reviews the client happens to have loaded, and not a stored aggregate, so it cannot drift from the moderation state. The page shows the average, a partial-fill star row (a 4.3 average looks like 4.3, not five stars), the count, and a bar per star where the count and percentage are written out, so nothing depends on the bar alone (NFR 011). An unrated listing says "No reviews yet" and invites the first review instead of drawing an empty five-star row, which reads as a zero.

### Verification

`pnpm check` green — database 23, API 153, admin 99, web 64, domain 12, worker 16, e2e 19, all builds, admin bundle entry 751 kB, contracts regenerated and in sync. `pnpm test:integration` green — database 5, API 116, including a new integration test that submits and approves 5/5/3-star reviews and asserts the published distribution, the empty array before the first approval, and that the buckets sum to the published count. Playwright: 34 journeys passing at desktop and 320 px, with the axe WCAG 2.2 AA scan extended to `/contact` — zero violations. Browser review of the contact, blog index, article, directory, category, area and listing pages at 1440/1280/390 px: no horizontal overflow (`scrollWidth === innerWidth`), no clipping or overlap.

### Notes and limitations

- The contact form cannot be exercised end to end locally: without `TURNSTILE_SECRET_KEY` the API answers 503 by design, and there is no email provider adapter (both are decision D03). Rendering and validation were verified against a temporary instance started with Cloudflare's published *test* site key; no key was written into the project.
- A defect found while testing the category visuals: `auto-repair` was matching the home-services rule ("repair") before the auto rule, so a mechanic would have been given a plumbing wrench. Rules are now ordered specific-first, with hyphen boundaries for short ambiguous tokens ("car" inside "carpet"); covered by `category-visuals.test.ts`.

## Phase 28 — General settings, brand marks, loading and error states (complete, 2026-09-07)

SRS: CFG 001 (site identity, branding, contact routing), BUS 003 and BLOG 001/004 (profile links), UX 002, SEO 001–003, NFR 006/011/012, SEC 001.

Client instructions that shaped it: an editable general-settings screen; social **icons instead of text everywhere**, with Pinterest added; icons shown wherever a link is valid, including the header and the directory; real star icons in the review rating; a loading screen on both the public site and the admin; and error pages that fail gracefully.

### Delivered

- **General settings** (`apps/api/src/settings/general-settings.ts`, `dto/general-settings.dto.ts`, admin `GeneralSettingsPage.tsx`): application, short and organisation name, tagline, default meta description, support email, Australian phone, website, postal address, logo/browser icon/share image chosen from the media library, the header contact bar and the footer copyright template (`{year}`, `{name}`) and text. Validated server-side, versioned with `expectedVersion`, audited by shape only — the audit metadata records counts and flags, never the values. A support address on a development domain (`.local`, `.test`, `.invalid`, …) is refused rather than published as a dead mailbox, and the contact bar cannot be enabled with nothing to put in it. The public shell reads the settings and omits anything unset instead of rendering a blank; a failed settings read falls back to the shipped defaults, so no page ever fails because of the shell.
- **Pinterest** across the three link vocabularies — the site's own profiles, business links (BUS 003) and author links — with `pinterest.com`, `pinterest.com.au` and `pin.it` as its own domains. One additive migration (`20260907065911_social_link_pinterest`) extends both enums; every existing value keeps its position, so no row is rewritten.
- **Brand marks instead of link text** (`apps/web/src/components/brand-icon.tsx`, admin `src/components/BrandIcon.tsx` + `shared/brands.ts`): one table of icon and name per kind, used by the header contact bar, the footer, listing detail links, the author card, the share row and the admin editors. The icon is decorative; the platform name (or the editor's own label) is the accessible name and the hover title, and targets are 44 px (36 px inside the slim contact strip). LinkedIn deliberately keeps a neutral globe: Simple Icons withdrew that mark at the trademark owner's request, and hand-copying it would reinstate exactly what was withdrawn.
- **Rating stars are icons** (`rating-stars.tsx`, `review-form.tsx`): the display row and the review form both draw the icon set the rest of the interface uses instead of the ★ character. The form is still a native radio group — five radios, one per star, filled up to the choice, each named "N stars" for a screen reader, with "4 of 5" beside it.
- **Waiting is visible** (NFR 012). Public: a navigation indicator (`route-progress.tsx`) — a top progress bar and a corner spinner from the moment an internal link or GET form is used until the new page renders, announced politely. It is deliberately **not** a `loading.tsx` boundary: a streaming placeholder is all a visitor sees when JavaScript is off, which was the /business defect found during the UAT journeys. Admin: one `PageLoader` for route code, the session check and record loads, plus a boot loader in `index.html` that is removed once React mounts, so a slow connection never shows a white page.
- **Error pages** (`status-page.tsx`, `error.tsx`, `global-error.tsx`, `global-not-found.tsx`, admin `ErrorBoundary.tsx`): one designed treatment — dark title band, the status named ("Error 404"/"Error 500"), a plain explanation, the digest as a quotable reference and real published destinations, with a retry on the error boundary. `global-error.tsx` covers a failure in the root layout itself and depends on nothing but the stylesheet. The admin boundary tells a stale build (`ChunkLoadError` after a deployment) apart from a genuine fault and offers the reload that actually fixes it, with the time of the failure. The API needed no change: its exception filter already answers every failure with the `{error:{code,message,fields,requestId}}` envelope — verified again by curl for an unknown route, a wrong method, a malformed body and an anonymous admin call.

### Defects found and fixed

- Two assertions in the in-progress settings work expected `listings@adelaidesphere.com` for the input `Listings@AdelaideSphere.com` (unit and integration); the normaliser only folds case, so the expectations were wrong, not the code.
- `link-in-text-block`: the review and comment acknowledgements, the hours-correction mailto and the 404 body used colour-only links inside sentences. They are underlined now — a genuine WCAG 2.2 AA failure that only surfaced once a Turnstile site key made the forms render.
- The axe journey waited for `networkidle`, which never arrives once the Turnstile widget holds a connection open. It now waits for `load` and for the images to decode, which is what the contrast check actually needs.
- A broken `@icons-pack/react-simple-icons` link in `apps/admin/node_modules` (pnpm recorded the dependency without its React peer while skipping resolution); the lockfile entry was corrected and the install repaired.

### Verification

`pnpm check` green — database 23, API 168, admin 103, web 74, domain 12, worker 16, e2e 19, all builds, admin bundle entry 753 kB, contracts regenerated and in sync. `pnpm test:integration` green — database 5, API 118. Playwright: 34 journeys at desktop and 320 px (4 admin journeys skipped without credentials), including the axe WCAG 2.2 AA scan of `/`, `/business`, `/blog`, `/contact` and a listing — **zero violations**. Runtime: the settings document seeded into the dev database and checked in the browser — five brand marks in the header bar and footer including Pinterest, 44 px icon links on listing detail, five star radios, no horizontal overflow at 1280 px; the designed 404 at a real 404 status; and with the API stopped, an uncached page returned a real **500** with the shell intact, the reference printed and a working retry (a cached page still answered from the data cache, as intended).

### Notes and limitations

- The admin screens behind sign-in (loaders on the editors, the icons in the link selects) are covered by their unit tests; they were not driven in the browser, because doing so means typing an administrator password.
- The public site now renders the Turnstile widget: a real site key is present in the git-ignored `apps/web/.env.local`. Submissions still need the matching API secret.

## Phase 29 — Administrator roles, permissions and permission-aware admin (complete, 2026-09-07)

SRS: **1.1 RBAC 002–012** (new, added at explicit client instruction), amending RBAC 001 and withdrawing the ADM 003 deferral of role-editing interface. Decision record: `docs/decisions/0001-authorization-casl.md`. Developer guide: `docs/authorization.md`.

Client requirement: permissions assignable to roles, roles to administrators, permissions also directly to an administrator; an admin interface showing only what the signed-in administrator may use; and backend enforcement of every permission.

### Specification first

The SRS moved to revision 1.1 with a change-log entry naming the affected IDs, the data, security and test impact, and the approver. RBAC 002–012 specify the catalogue, roles, assignments, effective-permission calculation, enforcement, the principal endpoint, the administration API, caching and revocation, the interface, the privileged invariants and the audit trail; section 13 gained the entities, section 16 the endpoint families, section 21 test group T15. No unrelated section was rewritten.

### Delivered

- **Model.** `effective = permissions of active roles ∪ direct permissions`, restricted to active permissions and empty unless the account is active. Grant-only: no deny rules, recorded as a deliberate decision so a future deny model arrives through a migration rather than by accident.
- **Catalogue** (`identity/permissions.ts`): 22 codes with label, description, module and active/system state, six of them new for access control (`roles.view/create/update/delete`, `permissions.view`, `admins.access.manage`). Declared in code, synchronised by the idempotent `admin:seed-rbac`, and never creatable through an interface. The established codes were **not** renamed to the client's example names: they are the ones SRS RBAC 001 names and every route, seed, test and existing assignment carries, and a rename would be a data migration with no behavioural gain (RBAC 002 governs the convention, not a fixed list).
- **Schema** (migration `20260907082702_authorization_roles_and_direct_permissions`, additive): role activation and version, permission label/module/active/system, `admin_permissions` for direct grants, `assignedById` on every assignment, `admin_users.authzVersion`, `audit_logs.userAgent`. Deletion behaviour keeps history: assignments cascade with their administrator, never remove a permission row, and null the assigning administrator rather than vanishing.
- **Enforcement** (`AuthorizationModule`): the resolver, a CASL 7.0.1 ability factory used directly (NestJS's documented pattern, no third-party wrapper — ADR 0001), and the existing default-deny guard now deciding through the ability. Unregistered or retired codes can never satisfy a requirement. 401 without authentication, 403 without permission, no role-resolution detail in either.
- **Administration API**: roles list/read/create/update/activate/delete, complete replacement of a role's permissions, the read-only catalogue, an administrator's access, and complete replacement of their roles and direct permissions — every one permission-checked, `expectedVersion`-guarded (409 `STALE_VERSION`), transactional with its audit record, and idempotent on repeat.
- **Cache and revocation**: effective permissions cached under `authz:admin:{id}:v{authzVersion}`; every access change increments the version in the same transaction, so withdrawn access is gone on the next request rather than at a TTL. Redis unavailable falls back to MySQL — proven not to grant *or* lose access.
- **Invariants**: no self-editing of access, no granting beyond what the actor holds, the last active super administrator cannot be demoted or disabled, the protected role cannot be deleted, deactivated, unprotected or hand-edited, no inactive role or unknown permission assignment, no deleting a role still in use.
- **Admin interface**: Refine `accessControlProvider` fed by the server's codes, one canonical route→permission mapping, a route guard that waits while capabilities are unknown and otherwise renders an accessible forbidden page, typed codes with a drift test against the API catalogue, navigation that shows nothing until capabilities are known, and screens for roles, the role editor with a module-grouped permission matrix, the read-only catalogue and an administrator access editor that distinguishes inherited from direct and names the source of every effective permission.

### Defects found and fixed

- **CASL wildcard escalation.** Mapping `resource.action` onto CASL's action/subject made `admins.manage` a wildcard (`manage` means "any action" in CASL), which would have granted `admins.access.manage` and every future `admins.*` code. The whole code is now the action on one subject; a unit test holds the line.
- The pre-existing auth integration test edited permission tables directly and expected the next request to see it; with the version-scoped cache that is deliberately invisible. It now signals the change the way the API does.
- The administrator access editor implied "nothing granted" for an account that is merely not active; it now says the access is kept but not in force.
- The permission matrix overflowed horizontally at 390 px, and the roles table broke role keys across lines.

### Verification

`pnpm check` green — database 23, API 178, admin 117, web 74, domain 12, worker 16, e2e 19, all builds, admin bundle entry 775 kB, contracts regenerated and in sync. `pnpm test:integration` green — database 5, API 139, including the 21-case access-control suite against real MySQL and Redis. Browser: signed in through the documented reset-link flow (temporary value, rotated and its session revoked afterwards), then checked the roles list, permission catalogue, role editor and administrator access editor at 1280 px and 390 px — no horizontal overflow, a real role assignment saved through the confirmation dialog, and the resulting `authz.admin.roles` audit event read back with a safe summary. Axe (unit) over the role editor and access editor: zero violations.

### Notes and limitations

- No explicit deny rules, and no `@casl/prisma`: neither is required by SRS 1.1, both are recorded in ADR 0001 as deliberate omissions with the conditions for revisiting them.
- Authorization audit events share the existing `audit_logs` table under the `authz.*` action family rather than a separate table: it already carries actor, target, safe metadata, request id and address, keeps text targets that survive a deleted role, and one audit trail is better than two that can disagree. `audit_logs.userAgent` was added for RBAC 012.
- The four Playwright admin journeys still skip without credentials; the access-control behaviour they would cover is proven by the API integration suite and the admin unit tests.

## Access-control audit and remediation (complete, 2026-09-07)

Full report: `docs/audits/authorization-integration-audit.md`; route matrix: `docs/audits/route-authorization-matrix.md`.

An adversarial audit of administrator authentication, roles and permissions, run against the real MySQL and Redis and the running applications, treating the Phase 29 completion claims as unverified.

### Defects found and fixed

- **Critical — self-escalation.** `PATCH /admin/admins/{id}` and `POST /admin/admins` assigned roles with only `admins.manage`, with no self-edit check, no "cannot grant beyond your own permissions" check and no active-role check. An account manager could make themselves a Super Admin in one request; proved at runtime (200 OK, 22 permissions afterwards). Both endpoints now require `admins.access.manage` for the role payload and go through the same `assertMayAssignRoles` invariants as the access API. The second, weaker assignment path is gone.
- **High — the last-super-admin invariant lost a race.** The check counted survivors outside the transaction that then wrote. Two concurrent demotions both returned 200 and left the deployment with zero active super administrators. `assertNotLastSuperAdminTx` now takes `SELECT … FOR UPDATE` on the protected role row inside the transaction and re-counts; applied to role replacement, account update and disable. The concurrency tests now see `[200, 409]`.
- **High — inactive roles were assignable** through the account endpoint (expected 400, got 200). Same fix.
- **High — privilege changes did not end the target's sessions**, contrary to AUTH 002 and inconsistent with the older account endpoint. Every role and permission change now revokes the affected sessions in the same transaction; a live session went 200 → 401 in 49 ms in the runtime check.
- **Medium — the frontend capability cache survived logout**: the previous administrator's codes still answered `can()` until a fresh `/me`. Extracted to `auth/capability-store.ts` + `auth/capability-lifecycle.ts`, cleared on logout, logout-causing errors and failed session checks, with unit tests.
- **Medium — editors rendered read-only for one render** before capabilities were known; they now wait, as RBAC 010 asks.
- **Medium — ten raw permission strings** across eight screens sat outside the typed catalogue and its drift test; all replaced with `useCapabilities().can(PERMISSION.…)`.
- **Medium — `@nestjs/mau`**, an unused dev dependency from the scaffold, pulled five high advisories into the tree; removed (9 → 4 high).
- **Low — dead code**: the superseded unlocked check and role resolver were removed so they cannot be called by mistake.

### Evidence added

`authorization-audit.integration-spec.ts` (21 attack scenarios: escalation on every path, two concurrency tests, session replay after revocation, corrupt cache, cross-user cache, forged codes and role ids, pagination limits, oversized payloads, injection and markup in role text, audit immutability and secret-freedom, the `/me` contract, and a sweep proving **all 137 admin routes** refuse an anonymous caller with 401 and a permission-less administrator with 403 except the 5 public and 9 session-only ones); `authorization-schema.integration-spec.ts` (8 constraint proofs against real MySQL: duplicate assignments, orphans, restricted deletes, cascade with audit survival, collation, indexes); admin `capability-lifecycle.test.ts` and `ActionGating.test.tsx`.

### Runtime verification

Five personas against the live stack — super administrator (22 permissions, everything allowed), role-limited editor (3, moderation and configuration refused), editor plus one direct permission (4 = 3 inherited + 1 direct, moderation allowed), an administrator with nothing (0, everything refused but the session-only dashboard, which returns no metrics), and a disabled account (login refused). Browser: the editor's navigation showed only Overview and Editorial; `/admin/roles` typed directly rendered the forbidden page while the API answered 403; signing out cleared the session. Persona passwords were random, single-use, kept in the session scratchpad and deleted with the accounts.

### Verification

`pnpm check` green — database 23, API 178, admin 129, web 74, domain 12, worker 16, e2e 19, all builds, admin bundle entry 776 kB, contracts in sync. `pnpm test:integration` green — database 5, API 168. Playwright 34 passed, 4 skipped. Frozen-lockfile install, Prisma validate/generate, migration status and policy check all clean. Secret scan of trackable files clean.

### Note

`docs/traceability.md` was renamed to `docs/requirements-traceability.md` (the path the client's instructions use), and every reference updated.

## Access-control audit closure (complete, 2026-09-07)

Closes the items the audit left open; the findings themselves are unchanged. Addendum: `docs/audits/authorization-integration-audit.md`.

- **Privileged-mutation ceiling** (SEC 003): a guard that runs *after* authorization, so it meters what an already-authorised session may do and never turns a missing permission into a 429. 20 per minute and 200 per hour **per administrator** — the id, never `X-Forwarded-For`, which is only meaningful for the documented `TRUST_PROXY` hops. Covers administrator create/update/enable/disable/setup-resend, session revocation, role create/update/delete, role-permission replacement and administrator role/permission replacement. A Redis outage falls back to 5 per minute per process — a ceiling, not a closed door, so an operator can still restore access. Refusals use the standard envelope with `Retry-After` and disclose no counters.
- **The four skipped Playwright journeys are gone**, replaced by five that run on desktop and at 320 px: permission-aware navigation (including the mobile drawer), forbidden direct navigation with the API still answering 403, allowed action visibility, forbidden action suppression, a direct grant with no role at all, live revocation during an open session, and logout clearing session and browser state. `e2e/specs/provisioning.ts` creates the administrators with `crypto.randomBytes` passwords, refuses `NODE_ENV=production` and any database not ending in `_dev`/`_test`/`_e2e`, and cleans up before *and* after so a mid-run failure leaves nothing usable. Suite: **44 passed, 0 skipped** (was 34 + 4 skipped).
- **Verified MySQL TLS — implemented, not just documented.** The audit's mitigation for the `mariadb` advisory turned out not to exist: the connection layer never passed an `ssl` option. `DATABASE_URL` now carries `?sslmode=disabled|required|verify-ca|verify-identity` (with `?sslca=`), the driver option is derived from it, and **production refuses to start** unless the mode verifies. Covered by `url.spec.ts` and `env.validation.spec.ts`.
- **Advisory disposition**: `docs/security/dependency-advisories.md` — package, version, path, severity, whether the vulnerable path is used, the fixed version, why upgrading is or is not possible, the mitigation, the production action and the revisit trigger. No overrides were used: `@prisma/adapter-mariadb@7.10.0` pins `mariadb@3.4.5` exactly, so the fix is genuinely unreachable until Prisma moves.
- **Operational consistency**: `docs/operations/authorization-runbook.md` (supported changes go through the API; emergency SQL must bump `authzVersion` and revoke sessions; recovery path) plus `pnpm --filter api authz:verify [email]`, which reports the invariants or one administrator's access and says whether the cache is in step with the database. No polling was added.

Verification: `pnpm check` green (database 27, API 185, admin 129, web 74, domain 12, worker 16, e2e 19, builds, bundle 776 kB); `pnpm test:integration` green (database 5, API 169); Playwright 44 passed / 0 skipped; frozen-lockfile install, Prisma validate/generate/status/policy clean; secret scan clean and the e2e fixtures verified removed from the database.

## DIR 008 — conditional "Open now" filter (complete, 2026-09-07)

The last SRS requirement that was neither delivered nor blocked by a client decision. DIR 008 makes the filter **conditional**: it ships only when the hours data supports it, because a filter that quietly drops well-run listings with no published hours is worse than no filter.

- **Predicate in SQL** (`directory/hours/open-now.ts`) so paging, counts and facets stay in the database, with Adelaide's wall clock computed by the same Intl helpers the evaluator uses and passed in as plain numbers. It covers today's intervals, all-day, an interval that began yesterday and runs past midnight, and date exceptions replacing the weekly rule in both directions. A listing with no published schedule is never "open".
- **One authority, proven.** `evaluateHours` remains the display authority; `open-now.integration-spec.ts` seeds a listing per case against the real MySQL and asserts the SQL set equals the evaluator's answer at the same instant. That comparison caught a real gap: the predicate trusted `endNextDay` on rows the schedule validator would reject, so a malformed row could have read as "open all night". Both now require the closing minute to be earlier than the opening minute.
- **Conditional exposure**: the filter is offered only when at least 60% of published listings publish a schedule and at least five do. `meta.openNow` reports `available`, `applied`, `withHours` and `published`; below the threshold a request for it is answered **unfiltered** rather than with a misleadingly short list. Verified at runtime on the dev data (2 of 3 listings with hours → `available: false`, `applied: false`, full results returned).
- **Web**: `?openNow=1` round-trips through the URL like every other filter, and the control appears only when the API says it is available — never disabled or misleading. Cached search answers carry the Adelaide minute in their key, so a cached page cannot claim a shop is open after it has closed.

Verification: `pnpm check` green (database 27, API 185, admin 129, web 75, domain 12, worker 16, e2e 19, builds, contracts regenerated); `pnpm test:integration` green (database 5, API 172).

## Launch-readiness decision pack and external-service boundaries (complete, 2026-09-07)

Consolidates everything the client must decide or supply, and closes the one external-service boundary that still had no production adapter.

- **Decision pack** in `docs/launch/`: `client-decisions.md` (D01–D08 plus SEO sign-off, review rich results, on-call, staging ownership and the screen-reader review: question, why it matters, recommended default, alternatives, technical impact, deadline, status, owner), `adelaide-boundary.md` (D01: the three models evaluated; recommendation for a curated allow-list of gazetted localities bounded by ABS Greater Adelaide, activated in tiers with the council area as Tier 1; validation behaviour today and proposed; data-update procedure; acceptance criteria — **nothing activated**, the 14-area baseline stands), `content-requirements.md` (audit of development-only content plus every client-supplied item with location, format, length, image sizes, accessibility requirement, fallback and approval status) and `seo-approval.md` (titles, descriptions, patterns, canonical and indexing policy, structured data, SEO 006 sign-off record). No production contact details, credentials, legal copy, owners or brand assets were invented.
- **Transactional email boundary** (`packages/mail`, `@adelaide-sphere/mail`): SMTP on nodemailer 10.0.0 — the provider-independent shape every D03 candidate offers — with bounded timeouts (DNS 5 s, connection 10 s, greeting 10 s, socket 30 s), no pooling, plain text only, no file/URL access, header-injection refusal, a caller-owned stable `Message-ID`, and failures classified transient/permanent with addresses redacted before they are thrown. `MAIL_TRANSPORT` gains `smtp`; the API (`SmtpMailer`) and the worker (`SmtpEnquiryMailer`) both use it; **production refuses to start** unless `smtp` is configured with an authenticated, TLS-protected, non-loopback relay and a verified sender, and start-up errors name variables only. Worker: one attempt per job, the queue keeps the retries; the "no provider adapter" production refusal is gone. Runtime: password reset and contact enquiries delivered through the adapter into Mailpit with Reply-To and `Message-ID`, `providerAccepted` recorded, a replayed idempotency key sent once, a closed relay classified transient in 5 ms.
- **CAPTCHA, storage and queue boundaries** reviewed against the requirements: `CaptchaPort`/`TurnstileVerifier` (5 s timeout, fail-safe 503, hostname/action checks, no token logged), `ObjectStoragePort`/`S3ObjectStorage` (signed constrained uploads, quarantine never public), `QueuePort`/`BullmqQueue` (job id = outbox event id, five attempts with backoff). Production already required their credentials; no change needed.
- **Local services**: Mailpit `v1.31.1` added to Compose (loopback `1035`/`8035`, health check, named volume, message cap); MinIO and Redis/BullMQ were already present. Ports checked free before binding; no other container touched.
- **Content isolation**: the starter favicon (the Vercel mark) replaced by an original development icon; review and comment forms link to `/review-guidelines` only once it is published; directory category and area pages follow the SEO 003 substantive rule; `AggregateRating` is gated behind `REVIEW_RICH_RESULTS` (off) per SEO 006. Public site audit found no `.local` addresses rendered, no fake contact details, claims, testimonials or ratings.
- Build tooling: `mail:build` in `check`/`contracts:*`, both Dockerfiles and CI build the shared packages before typecheck.

Verification: `pnpm check` green (database 27, API 188, admin 129, web 79, domain 12, **mail 10**, worker 19, e2e 19, all builds, admin bundle entry 776 kB, contracts in sync). `pnpm test:integration` green on the confirming run (database 5, API 172); the first run failed two order-dependent cases unrelated to this work (`reviews` distribution answered 401, `static-pages` contact routing hit an HTTP parse error) and both passed immediately in isolation — recorded as flakes in `docs/ai/current-state.md`. Runtime: Mailpit at 127.0.0.1:1035/8035 started and healthy, private API on 3011 and a worker run with the SMTP transport, then stopped; user-started servers untouched. Secret scan over trackable files clean; no env file tracked; `apps/*/.env.example` and `infrastructure/.env.example` hold placeholders only.

## Launch-readiness cleanup: artifact revocation, test isolation, Mailpit consistency, mail audit (complete, 2026-09-07)

Closes the loose ends the decision pack left: the credentials a runtime check leaves behind, two order-dependent integration failures that were **not** harmless, and an audit of the new mail boundary.

### 1. Authentication artifacts

The reset link mailed during the earlier runtime check was retired, along with every other unused token and live session in the development database. `POST /admin/auth/reset-password` with that exact token now answers `400 INVALID_RESET_TOKEN`; the residue check reports `0 active token(s), 0 live session(s)`. No token value was written to a tracked file, a document or a log — it was read from the Mailpit inbox into an untracked scratch file, used once to prove refusal, and deleted.

New, and reusable: `apps/api/src/auth/auth-artifacts.ts` (`countAuthArtifacts`, `revokeAuthArtifacts`, `assertRevocableTarget`), the CLI `pnpm --filter api auth:revoke-test-artifacts` / `auth:artifacts:check`, and `e2e/global-teardown.ts`, which runs the provisioning cleanup after **every** Playwright run including a failed or interrupted one (the cleanup now also deletes reset tokens belonging to provisioned accounts). Both refuse `NODE_ENV=production` and any database not named `*_dev`, `*_test` or `*_e2e`, and print counts only. `apps/api/test/auth-artifacts.integration-spec.ts` proves the whole loop against the real database: a mailed link plus an open session are created, revoked, the link is then refused by the real flow, the session stops authenticating, and a second pass is idempotent.

### 2. Order-dependent integration failures — root cause

Both were the **same defect**, and it was real: **supertest binds a new ephemeral port for every request**. When the Nest app is only `init()`-ed and never `listen()`-ed, `server.address()` is null, so supertest calls `server.listen(0)` per request and closes it afterwards. Across a full suite that is thousands of bind/close cycles; a port handed out again while its predecessor is still in `TIME_WAIT` lets the new client read bytes belonging to the previous connection. Every symptom matches that and nothing else: a **public** review POST answered `401` (a response to an earlier admin request — the public route cannot produce 401, its guard returns early for non-admin paths), `Parse Error: Expected HTTP/, RTSP/ or ICE/` in the static-pages suite, and, reproduced during this investigation, a `403` assertion in the media suite receiving the `401` that the *preceding* line expected. Not shared database state, Redis keys, fake timers, singletons, transaction visibility or account collisions — the requests were answered by the wrong socket.

**Fix:** `listenForTests` in the integration harness binds the server once per test file on one ephemeral loopback port; `createIntegrationApp` and the bespoke bootstrap in `auth.integration-spec.ts` both use it, and `app.close()` releases it. supertest then reuses that address and never listens per request.

A **second, independent** defect surfaced while reproducing: `truncateApplicationTables` empties more than fifty tables inside one interactive transaction (so `FOREIGN_KEY_CHECKS = 0` covers them all), and Prisma's default 5 s transaction timeout expired mid-loop on a loaded machine — `A query cannot be executed on an expired transaction … 5280 ms passed` — taking four suites' `beforeAll` with it. The timeout is now explicit (60 s, `maxWait` 30 s), so a slow disk delays a run instead of breaking it.

**Determinism evidence:** the three implicated files individually (9, 4, 6 tests) ✓; the full suite in its normal order five consecutive times, 174 passed each ✓; the full suite in reversed file order ✓; the three files together five consecutive times ✓. Before the fix the same loop failed on two of three runs, with a different victim each time.

### 3. Local SMTP consistency

The ignored `apps/api/.env` now carries `MAIL_TRANSPORT=smtp`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1035`, `SMTP_SECURE=false` (the variable names the mail package actually reads). Verified from that file: the password-reset message and an enquiry both arrive in Mailpit as `text/plain; charset=utf-8`, the enquiry carries the visitor as `Reply-To` and the configured sender as `From`, **two submissions sharing one idempotency key produced exactly one message**, and no token appears in the API console (the only `password` matches are route names). Mailpit was emptied afterwards. The file is still git-ignored; every `*.env.example` holds placeholders only. Production rules are unchanged and still refuse loopback, plaintext and unauthenticated relays.

The API the client left running on 4001 is a `start:prod` process, not a watcher, so it still runs the console transport: it needs their own restart to pick the change up. It was deliberately not stopped.

### 4. Mail-package audit

Reviewed each item and added tests for what was not yet proven: TLS pinned to 1.2 or newer with certificate verification never disabled; multi-address, display-name and bracketed values refused for `to`, `from` and `replyTo` so a caller cannot widen the envelope; subject bounded at 998 characters and, newly, the body at 256 KB with an empty body refused; plain text only, with no `html` or `attachments` key ever set and UTF-8 passed through unchanged; `verify()` failures classified like send failures; `close()` releasing the transport; the `Message-ID` identical across retries of the same message and never invented; and thrown errors carrying no body, subject, address or credential. Traced every input: the relay host comes only from the environment, the sender only from configuration, the recipient only from the listing's encrypted field or the configured site recipient, and `Reply-To` — the one visitor-supplied header value — is validated in `packages/domain` and again in the transport. **No request can select an arbitrary SMTP host, sender or Reply-To.**

**Verification.** `pnpm check` green (database 27, API 188, admin 129, web 79, domain 12, mail 16, worker 19, e2e 19, all builds, admin bundle entry 776 kB, contracts in sync). Integration determinism: 5 consecutive full runs (174 passed each), a reversed-file-order run, 5 repeats of the implicated trio, and each implicated file alone — all green. Secret scan over tracked and untrackable-but-present files clean; `apps/api/.env` still git-ignored; no token literal in any trackable file; the scratch file holding the captured token was deleted. `pnpm --filter api auth:artifacts:check` reports 0 active tokens and 0 live sessions. Mailpit emptied.

## Next step

All planned phases are complete. The client-facing register is `docs/launch/client-decisions.md` (index: `docs/launch/README.md`); every remaining item is a client decision or input, a staging-dependent verification (UAT journeys, capacity run and restore drill on the production shape), or the manual screen-reader pass. Engineering follow-ups that unlock on decisions: boundary rules 5–7 (D01), provider webhooks for bounces (D03b), the error-tracker integration (D03d), and a mandatory-TOTP gate if chosen (D06). Infrastructure is running (`pnpm infra:status`); stop with `pnpm infra:down` (keeps data).

---

# SRS 1.2 extension — Phases 30–41 (System & Settings, Security Settings, Website content)

Authorised by client instruction of 7 September 2026, specified by SRS sections 25–26 (revision 1.2) and informed by the read-only Logimart reference comparison in `docs/reference/logimart-comparison.md`. Implemented **one module at a time**; each phase runs the same gate: focused checks while implementing, then `pnpm check` and `pnpm test:integration`, browser verification of the primary workflow, then traceability, current-state and this file updated before the next phase starts.

| Phase | Module | SRS IDs | Key deliverables |
| --- | --- | --- | --- |
| 30 | Shared settings architecture and permission catalogue | SET 001–005, RBAC 013 | Typed setting registry per owned group (security / email / operations / website), declaration metadata, validated versioned update path with transactional activity audit and cache invalidation, permission codes for every module of sections 25–26 |
| 31 | Resend provider and email logs | MAIL 001–010 | Resend adapter behind `packages/mail`, production config validation, delivery records, signed webhook with event idempotency and status precedence, read-only log UI with masked recipients and audited unmasking, throttled manual resend, deliverability documentation |
| 32 | Activity log | ACT 001–006 | Typed event catalogue, consolidated append-only read model over admin/authorization/operational events, redaction, bounded filters and indexes, 365-day retention job |
| 33 | Security settings | SECS 001–008 | Authentication, password policy, login security and session security groups — enforced, bounded by AUTH 001/002 and SEC 002, recovery-path invariant, session administration, audited consequences |
| 34 | Cache manager | CMGR 001–005 | Namespace/tag registry, Redis availability and counts, registered invalidate/warm operations only, throttled audited actions, prohibited-capability tests |
| 35 | Queue monitor | QMON 001–005 | Per-queue BullMQ metrics, worker availability, redacted job detail, retry/cancel/pause/clean within bounds, bounded bulk with per-item outcomes |
| 36 | Scheduled tasks | TASK 001–006 | Code registry with schedule metadata, BullMQ job schedulers, distributed lock, missed-run policy, allow-listed "run now" dispatched to the worker, 30-day history |
| 37 | FAQs | FAQ 001–005 | Admin CRUD with publication actions, sanitised answers, accessible public disclosure list, gated `FAQPage` structured data |
| 38 | Service alerts | ALRT 001–007 | Alert model with severity and display window in Adelaide time, deterministic selection, above-header rendering, version-aware keyboard-accessible dismissal, write-time URL validation, urgent cache purge |
| 39 | Testimonials | TSTM 001–005 | Consent/approval record with approver, approved media, sanitised quotes, publication gated on approval, clean empty state |
| 40 | Client/partner logos | PTNR 001–005 | Content-only partner records with recorded display authorisation, mandatory alt text, validated URLs, clean empty state |
| 41 | Cross-module audit and documentation | all of 25–26 | Authorization, sensitive-data exposure, cache-key separation, queue redaction, email idempotency, webhook security, audit completeness, production configuration, accessibility, responsive, SEO, migration safety and backup implications; defects fixed and traceability closed |

New client decisions raised by this extension are **D09** (Resend account, verified domain, DNS records, approved addresses, webhook secret, DMARC schedule) and **D10** (initial website content and its rights: FAQ copy, alert policy, consented testimonials, partner logo authorisations) — both recorded in SRS §23 and to be tracked in `docs/launch/client-decisions.md`.

## Phase 30 — Shared settings architecture and permission catalogue (2026-09-07)

**SRS:** SET 001–005, RBAC 013 (revision 1.2, section 25).

**Delivered.** Configuration is now separated by ownership rather than pooled: `security_settings`, `email_settings` and `operations_settings` join the established `site_settings` table, one per owning module, added by the reviewed migration `20260907135714_settings_owned_groups` (additive; it also drops the `permissions.updatedAt` default left by the 1.1 backfill, which had shown as schema drift on every migration since). `apps/api/src/settings/registry.ts` declares each group with its owner, store, permissions and note, and declares each setting with the metadata SET 002 requires — type, bounds, default, visibility, runtime-or-restart, sensitivity, view and update permissions, the cache tags it invalidates, and `enforcedBy`. `settings-store.service.ts` implements the whole SET 003 contract once: validation with field errors, `expectedVersion` with 409, the change and its audit record in one transaction, declared cache invalidation, and an unchanged save as a no-op that writes nothing. `settings-groups.controller.ts` gives each group its own route pair with statically declared permissions, plus a session-only registry listing filtered to the groups the caller may view.

The three new groups intentionally declare **no settings yet**: each one lands with its enforcement in its own phase, because SET 005 and SECS 001 forbid a stored-but-unenforced control. The registry spec fails if a group is left empty without a note explaining that, if any declaration is credential-shaped or marked sensitive, or if a setting has no `enforcedBy`.

**Permission catalogue (RBAC 013).** 41 new codes across three new modules — System, Security and Website — covering email logs (including recipient unmasking as a code distinct from viewing), activity logs, cache, queues, schedules, security settings and sessions, and the four website content modules. Viewing and acting are always separate. `pnpm --filter api admin:seed-rbac` applied them (41 created); the admin app's mirror list was extended so the contract test still proves the two agree.

**Verification.** API unit 216 passed (registry invariants, generic store contract with fakes, reserved-slug rules); `settings-groups.integration-spec.ts` 11 passed against the real MySQL: registry filtering by permission, 401 anonymous, 403 per group without a permission and without naming it, defaults at version 0, unknown key rejected with field errors, malformed payload rejected, 409 on a stale version, unchanged save writing no row and no audit event, and each group proven to live in its own table with the website group unreachable through the generic routes.

## Phase 30a — Listing page layout and the public directory route rename (2026-09-07)

Two client requests handled alongside Phase 30.

**Enquiry form moved into the listing sidebar.** On `/business/{slug}` the enquiry form sat at the foot of the main column while the sidebar ended after the contact card, leaving most of the right-hand column empty. The form now sits under the contact card in the sidebar (`EnquiryForm` gained a `compact` prop so its fields stack in one column at every width, because the previous two-column layout was keyed to the viewport rather than to the space the form actually has), the sidebar column is no longer sticky since it is now taller than the viewport, and the column is 28 rem. Measured on the dev listing: sidebar 1208 px against a 1672 px main column, previously about 600 px; no horizontal overflow. The `#enquiry-heading` anchor the hero's "Send enquiry" action targets is unchanged.

**`/directory` renamed to `/business` (SRS revision 1.3, UX 002/003).** The list, the curated category and area pages and the listing detail now share one prefix: `/business`, `/business/category/{slug}`, `/business/area/{slug}`, `/business/{slug}`. Public navigation, breadcrumbs and the footer heading read "Businesses"; the admin navigation group and the permission-matrix module read "Business". Old addresses answer 301 in the web middleware — a mechanical `/directory…` → `/business…` mapping that preserves the query string, deliberately not a seeded redirect row, so the rename cannot depend on a seed having been run. `category` and `area` became reserved business slugs, because a static route segment wins over the dynamic one and a listing slugged that way would be unreachable; refused at write time in `directory.service.ts` with a unit test. The sitemap emits only the new addresses.

**Verification.** `next build` lists the four `/business` routes; runtime: `/business` 200, `/directory` 301 → `/business`, `/directory/category/cafes?page=2` 301 → `/business/category/cafes?page=2`. Web unit 80 passed, admin 129 passed, API 216 passed, SEO and open-now integration specs updated to the new paths.

## Phase 31 — Resend provider and email logs (2026-09-07)

**SRS:** MAIL 001–010 (revision 1.2, section 25).

**Provider.** `packages/mail` gained a second adapter behind the same boundary: `ResendTransport` speaks the provider's HTTP API with `fetch` (no client library — one POST is the whole surface, and a dependency would own the retry, timeout and classification that EVT 002 specifies), sends a stable `Idempotency-Key`, classifies 429 and 5xx as transient and every other 4xx as permanent, and never lets a recipient, body or key into an error. `MAIL_TRANSPORT` now accepts `resend`; production start-up **fails** on a missing or malformed key, an absent sender, a sender on a development or reserved domain, a missing webhook secret or an overridden API base URL.

**Delivery records.** Migration `20260907151409_email_delivery_records` adds `email_deliveries` and `email_delivery_events`. Operational metadata only: no rendered body, the recipient held as AES-256-GCM ciphertext with a masked display form, and failures recorded as a bounded code plus a redacted summary. `providerMessageId` is unique so a duplicated acceptance cannot fork a record, and `providerEventId` is unique because that uniqueness is what makes duplicate webhook delivery idempotent.

**Webhook.** `POST /api/v1/webhooks/email` verifies the Svix-style signature over the **raw** body (kept for `\`/webhooks/\`` paths only, in the body parser) before parsing anything; unsigned, wrongly signed, tampered, stale and replayed requests answer 401 with a body that explains nothing. Events are deduplicated on the provider event id, out-of-order events record their own timestamp without lowering a more meaningful status (complained/suppressed > bounced > delivered > sent > queued), and untracked event types (opens, clicks) are acknowledged and ignored.

**Admin.** `/admin/email-logs` is read-only by construction — no create, edit or delete route — with filters, bounded pagination, a detail view with the provider timeline, a reveal endpoint behind `system.email_logs.recipients.view` that audits every reveal, and a resend behind `system.email_logs.resend` that refuses delivered, complained and suppressed messages and non-resendable templates, creating a linked new attempt. The **System → Email logs** screen mirrors those rules in the interface (masked recipient, reveal and resend hidden without the permission, confirmation stating the double-send risk).

**No duplicated send path.** Authentication mail is recorded by `RecordingMailer`, which wraps whichever transport is configured rather than reimplementing any of them; the worker writes the same record around enquiry delivery, so a bounce for an enquiry can be matched back. Recording is best-effort in both places: a log write never blocks an accepted message.

**Verification.** `packages/mail` 32 tests (config refusals with no value echoed, transport classification, webhook signature: valid, rotated secret, tampered body, wrong secret, replay in both directions, non-numeric timestamp, unconfigured). API unit 217. `email-logs.integration-spec.ts` 13 tests against the real MySQL covering every webhook refusal, unknown message, idempotent retry, out-of-order precedence, masking, absent write routes, the separate reveal permission with its audit row, both resend refusals, the linked replacement, bounded pagination and "a recipient is not a search key". Worker 22 (including the log records and that a failed log write still delivers). Admin `EmailLogsPage.test.tsx` 4.

**Documentation.** `docs/operations/email-deliverability.md` records the domain set-up (dedicated subdomain, SPF, DKIM, staged DMARC, From/Reply-To, bounce, complaint and suppression handling, rate limits, pre-launch test messages) and states plainly that no provider guarantees inbox placement.

**Outstanding:** D09 (account, verified domain, DNS, addresses, webhook secret) and, with it, staging verification; the 180-day/90-day retention job lands with the scheduled tasks module (TASK).

## Phase 32 — Activity log (2026-09-07)

**SRS:** ACT 001–006 (revision 1.2, section 25).

**One surface, not a third store.** Administrative actions, authorization changes and operational events already share `audit_logs`; ACT 001 asked for one consolidated *experience* over them, so this phase added the vocabulary and the reading, not another table. `audit/activity-catalogue.ts` declares activity domains (auth, admin, authz, listing, taxonomy, blog, media, settings, seo, review, comment, report, enquiry, email, system), each with a category and a label, and derives the outcome from the event code rather than storing a second field that could disagree with the first. `activity-catalogue.spec.ts` reads every `action:` in the API source and fails on a domain the catalogue does not declare — that is what keeps a caller from inventing an unregistered event, without a per-code list of eighty entries that would drift the first time somebody forgot it.

**Read model.** `/admin/audit` became `/admin/activity` (one route over one table; an alias would have been the duplication this module exists to remove) and gained `category`, `outcome` and `requestId` filters plus the derived `category`, `domainLabel` and `outcome` on every row. Category and outcome filter in the database, on the same suffix list the derivation uses. The admin screen is now **Activity log**, with category and outcome filters and a request-id search that follows one request across its events.

**Retention.** `AuditService.purgeExpired()` applies the 365-day bound of ACT 006 and PRIV 001, reports the number of rows removed and never their content, and is idempotent. It is registered as a scheduled task in the scheduled-tasks phase; until then it is called deliberately.

**Permission tidy-up.** `system.activity_logs.view` was retired in the catalogue (`active: false`) before it was ever assignable: the consolidated log is read with `audit.read`, which RBAC 001 already names, and two codes for one access is how a permission model rots. The admin contract test now compares against *active* catalogue entries, which is the correct reading of RBAC 002.

**Verification.** API unit 224 (7 catalogue tests including the source sweep); `activity-log.integration-spec.ts` 7 against the real MySQL: derived category/label/outcome, database filtering by category, outcome and request id, no create/update/delete route, secrets refused even when a caller passes them, bounded page size and rejected filter values, 401/403, and the retention purge proven to remove an aged row and to be idempotent. The default-deny route sweep and the admins suite pass on the renamed route; `/api/v1/admin/settings/registry` was added to that sweep's session-only list with the reason recorded.

## Phase 37 — FAQs (2026-09-07)

**SRS:** FAQ 001–005 (revision 1.2, section 26).

`faqs` (migration `20260907161650_website_faqs`) stores the answer twice, exactly as articles and information pages already do: the source the editor wrote and the sanitised HTML that is the only thing ever rendered, so a sanitiser change can be re-applied without losing the original. Sanitisation is the existing SEC 001 allowlist — the same path as posts, not a second one — and an answer that is nothing but disallowed markup is refused rather than saved empty. Publication is an explicit action; a repeated publish is a 409 rather than a silent no-op; reordering is one bounded transaction; every mutation writes an activity event with the change.

Public: `/faqs` renders published questions grouped as authored, using native `<details>`/`<summary>` rather than a scripted accordion — keyboard operable, announced correctly and working with no JavaScript, which is what NFR 011 asks for and what a scripted widget usually gets wrong. Nothing published means a 404, not an empty page. `FAQPage` structured data sits behind `FAQ_RICH_RESULTS`, off by default, on the same discipline as review rich results, and describes only the questions on the page with answers reduced to text. The footer links FAQs only once a question is published, on the same rule as the information pages.

**Verification.** `faqs.integration-spec.ts` 10 against the real MySQL (draft invisible publicly, sanitisation and the markup-only refusal, documented lengths, explicit publish/unpublish with the first publication timestamp kept, 409 on a stale edit, display order and transactional reorder, an activity event per mutation, view separated from create/update/publish/delete, bounded list and reorder payload); web `faq.test.ts` 2; admin `FaqsPage.test.tsx` 3. Runtime: two published questions render at `/faqs` in their groups with `<details>` disclosure and no structured data while the gate is off.

## Phase 38 — Service alerts (2026-09-07)

**SRS:** ALRT 001–007 (revision 1.2, section 26).

`service_alerts` (migration `20260907162953_website_service_alerts`) carries severity, a display window, dismissibility, priority and **two** version numbers: `version` is optimistic concurrency for editors, `contentVersion` is what a viewer's dismissal is keyed to. Editing the wording or severity bumps the second, so an alert somebody dismissed comes back with its new message; changing only the display order does not.

`alert-rules.ts` holds the two things worth proving on their own. **Selection** is severity, then priority, then display order, then creation time, then id — fully determined, so the same state always renders the same order and a caching layer cannot be blamed for a flicker that was really a tie. **Links** are validated at write time against an allowlisted scheme: a site-relative path or an http(s) URL, with `javascript:`, `data:`, protocol-relative `//host` and embedded credentials refused on save rather than filtered at render.

Public: the bar renders above the header on every page, server-side, so an alert outside its window cannot reach a page by any route. Severity chooses the accessible semantics — `role="alert"`/`aria-live="assertive"` only for a genuine emergency, polite otherwise. Dismissal is a real `<button>` with an accessible name that says which alert it closes; state lives in that browser only, is keyed to the content version, and storage being unavailable shows the alert rather than failing. It is rendered in document order rather than inside a Suspense boundary: a streamed boundary was swapped in *after* the header, which put the alert in the wrong place and shifted the page as it arrived.

Because the bar is on every page, publication, editing a published alert and removal purge the shell, and taking a live alert down is marked **urgent** (CACHE 002).

**Verification.** `alert-rules.spec.ts` 11 (window bounds with an exclusive end, severity outranking priority, deterministic ties, the bound of two, an expired emergency dropped, correctness across the Adelaide daylight-saving change, every unsafe link refused, assertive reserved for emergencies); `service-alerts.integration-spec.ts` 11 against the real MySQL (write-time link validation, link/label pairing, inverted window, draft invisible, window filtering, severity order and bound, content-version bump only on a readable change, 409s, the urgent purge event on unpublish, an activity event per mutation, public read without a session); web `service-alert-banner.test.tsx` 6. Runtime: the bar renders above the header as a direct body child at the top of the page.

## Phase 38a — Hero pause controls removed from the visual composition (2026-09-07)

Client instruction: remove both visible pause buttons (the circular one beside the headline and "Pause the banner" in the control row), while keeping the automatic motion.

HERO 003 and WCAG 2.2 SC 2.2.2 require a mechanism to stop automatically continuing motion — they do not require a permanently visible button. Both controls are now rendered off-screen (`sr-only`) and appear in place on keyboard focus (`focus-visible:not-sr-only`), so they stay in the accessibility tree, reachable by keyboard and announced to screen readers, while the hero carries no visible pause button. The motion itself is unchanged: it still stops under `prefers-reduced-motion`, while the tab is hidden, and when a visitor pauses it, and stepping through the images with previous, next or a dot stops the rotation, which gives a sighted mouse user a way to stop it without a button.

I first removed the automatic motion with the buttons — the only way to drop the controls and stay compliant — and restored it when the client confirmed they wanted the motion kept.

**Verification.** `hero-banner.test.tsx` 5: the pause control is present with `aria-pressed` and carries both `sr-only` and `focus-visible:not-sr-only`; the banner advances on its own after the seven-second dwell; stepping through with next stops it. Web suite 89 passed, axe clean on the hero. Runtime: both controls measure 1×1 px in the layout (off-screen) and are still in the accessibility tree; rotation was correctly paused in the check because the browser pane reports `document.hidden`.

## Phase 38b — Header layering: alerts, contact bar, pinned navigation (2026-09-07)

Client instruction: the top bar should hide on scroll, as in Logimart, and service alerts should sit above it.

Logimart achieves this by sticking only the navigation and leaving everything above it in normal flow. Adelaide Sphere had the whole header sticky, so the contact strip stayed pinned. The contact strip and the navigation are now **siblings** — the strip in normal flow, the navigation `sticky top-0` — rather than one sticky block: a `sticky` child only sticks within its own parent's box, so nested inside the header it would have unpinned the moment the header scrolled past. There is no scroll listener, so there is nothing to jank on a slow device and nothing to recalculate on every frame.

Rendered order is now service alerts → contact strip → navigation, which is the Logimart arrangement and was already the layout order; only the stickiness changed.

**Verification.** Runtime at three scroll positions: at rest, alerts at 0, contact strip at 380, header at 629; at 2000 px the contact strip is at −1620 (gone) and the header is pinned at exactly 0. Web suite 90 passed. An end-to-end check was added to `e2e/specs/accessibility.spec.ts` so the behaviour cannot regress silently: after scrolling, the header sits at the top and its navigation links are still reachable.

## Phases 39–40 — Testimonials and client/partner logos (2026-09-07)

**SRS:** TSTM 001–005, PTNR 001–005 (revision 1.2, section 26). Migration `20260907170938_website_testimonials_partners`.

**Approval and authorisation are evidence, not flags.** Each record names the administrator who gave it, when, and optionally how it was obtained. Publication is refused without it — `APPROVAL_REQUIRED` for a testimonial, and for an organisation three separate refusals in the order they matter: `LOGO_REQUIRED`, `ALT_TEXT_REQUIRED`, `AUTHORISATION_REQUIRED`, because each is a different mistake. Authorisation cannot even be recorded before there is a logo to authorise.

**Consent does not survive a rewrite.** Editing a testimonial's quote clears its approval and returns it to draft: consent was given for particular words. Changing an organisation's logo clears its authorisation for the same reason — permission was given for a particular mark. Both admin screens say this in a confirmation *before* the edit, rather than letting an editor discover it afterwards.

**Testimonials carry no rating.** The product's ratings are the moderated reviews of section 7; a second, unmoderated star display beside them would misrepresent both. Quotes are stored as plain text with markup stripped and bounded at 1,000 characters.

**A partner record is content and nothing else.** It is not an account, holds no credentials and grants nobody access — the reference project this module was modelled on let exactly that boundary blur, growing a logo strip into a customer account with API tokens, so the requirement, the migration comment and the service all state the boundary.

**Public.** Both bands render on the home page and are **omitted entirely** when nothing qualifies — no empty strip, no placeholder. Testimonials use semantic `figure`/`blockquote`/`figcaption`; a linked listing is dropped if it is no longer published. Partner logos carry their mandatory alternative text and use safe external-link attributes; a record whose asset has since disappeared is dropped rather than rendered broken.

**Verification.** `showcase.integration-spec.ts` 11 against the real MySQL: publication refused without approval, published once recorded with the approver named, approval cleared by a quote edit (and the testimonial pulled from the public list), markup stripped and bounds enforced, non-existent listing or image refused, the three partner refusals in order, authorisation refused before a logo exists, write-time website validation, nothing unpublished or unauthorised served publicly, an activity event per mutation in both modules, approving and authorising proven separable from creating, publishing and deleting, and both admin surfaces refused anonymously while both public lists need no session. Admin `Showcase.test.tsx` 5 proves the interface never offers an action the server would refuse. API unit 235, web 90, lint clean.

**Section 26 is complete.** All four website content modules ship empty and honest: they wait on the client's content and permissions (D10), not on engineering.

## Phase 33 — Security settings (2026-09-07)

**SRS:** SECS 001–008 (revision 1.2, section 25). Migration `20260907173222_security_password_history`.

**Eight settings, every one enforced.** `sessionIdleMinutes`, `sessionAbsoluteHours`, `maxConcurrentSessions`, `passwordResetMinutes`, `passwordMinLength`, `passwordHistoryDepth`, `loginMaxFailedAttempts`, `loginBlockMinutes`. Each declares in the registry the code that enforces it, and `SecurityPolicyService` resolves them once (15-second cache, invalidated on write) so `SessionService`, `AuthService`, `AccountService`, `PasswordService` and `LoginThrottleService` all read the same answer instead of each keeping its own constant.

**No setting can weaken the specification.** Every bound narrows AUTH 001/002 or SEC 002 and can never widen it: session timeouts are additionally clamped to what the deployment configured, login limits use `Math.min` on attempts and `Math.max` on windows, and a stored value outside its bounds is clamped rather than trusted — so the worst this module can produce is the baseline the SRS already requires. There is no boolean anywhere in the group: `loginEnabled`, `throttlingEnabled` and `passwordResetEnabled` are exactly the shape SECS 007 forbids, and the reference project's lockout switch is why the requirement says so.

**Mandatory two-factor is deliberately absent.** It is client decision D06, and SECS 001 forbids shipping a security control that is stored but not enforced. The group's note says this in the interface rather than leaving an empty switch that implies otherwise.

**Consequences are applied, not just described** (SECS 006). Lowering the concurrent session limit ends the oldest sessions immediately; lowering the password history depth prunes the hashes that are no longer needed — the second was found by its own test, which is exactly what the test was for. Both are audited. Session timeouts apply on the next request from each session, including sessions that already exist, and a password rule applies at the next password change: raising the minimum length cannot invalidate a stored hash, and the screen says so rather than implying otherwise.

**Password history** (`admin_password_history`) keeps only hashes, only to the configured depth, verified never compared, checked *before* a reset token is consumed so a refused password does not cost somebody their link.

**Session administration** (SECS 005) moved to its own capability: `security.sessions.view` / `security.sessions.revoke` replace `admins.manage` on the three session routes, so a security operator can end somebody's sessions without being able to create or disable administrators. Session listings gained a coarse `device` summary — browser family and platform, derived from the user agent, never presented as device identification, with a test proving no version, build or serial reaches it.

**Verification.** `security-settings.integration-spec.ts` 10 against the real MySQL: the declared defaults are the specification baseline; every weakening refused (eight cases, each with its field error); no setting exists that could disable sign-in, reset or throttling; a stricter minimum applies at the next change while the existing password still works; reuse refused and history bounded by the depth; the reset link shortened; the oldest sessions ended when the limit is lowered and when a new session would exceed it; the before/after summary recorded; and viewing separated from changing. Plus `device-summary.spec.ts` 4. API unit 240, integration 247, **three consecutive full integration runs green**. Admin `SecuritySettingsPage.test.tsx` 4 proves the form is generated from the server's declarations, a reader cannot edit, and neither the D06 note nor the "applies at the next change" wording is dropped.

## Phase 34 — Cache manager (2026-09-07)

**SRS:** CMGR 001–005 (revision 1.2, section 25).

**Two registries, no keys.** `cache/cache-registry.ts` declares what an operator may see and clear: *namespaces* this API holds in Redis under a declared prefix (`search:`, `business:`), and *tags* the web tier caches (businesses, posts, taxonomy, settings, pages, faqs, alerts, testimonials, partners). Clearing a namespace scans that prefix inside the current publication namespace; clearing a tag emits the ordinary invalidation event, so the same worker purges the same pages a publication would, across replicas and the CDN. Nothing outside the registry can be reached: an administrator names a registered entry, never a key or a pattern, so arbitrary commands, raw key access, whole-store flushes and pattern deletion have nowhere to enter.

**What must stay out of reach is written down and proven.** `PROTECTED_PREFIXES` names the key spaces this interface must never touch — `session:`, `throttle:`, `authz:`, `bull:`, `idempotency:` — and the spec proves no declaration overlaps them in either direction (a prefix inside a protected space, or one broad enough to swallow it). A second spec reads the module's own source and fails if `flushall`, `flushdb`, `sendCommand`, `client.call(` or `eval(` appear anywhere in it: the claim is that those calls do not exist, not that some code path avoids them. The integration test then writes real `throttle:`, `authz:`, `bull:` and `idempotency:` keys, clears every registered namespace, and asserts all four survive untouched.

**A real bug the tests caught.** ioredis applies its `keyPrefix` to ordinary commands but **not** to `SCAN`: the first implementation scanned an unprefixed pattern, matched nothing, deleted nothing, and reported success. The pattern now carries the prefix and the returned keys are stripped before `DEL` (which would otherwise apply it a second time). The integration test asserts on entries actually removed, which is why the silence was caught rather than shipped.

**Honest reporting.** Entry counts are sampled with a bounded SCAN and capped, and are labelled approximate in the API and on the screen. Redis being unavailable is reported as what it means for the site — pages are served from the database instead — and a clearing attempt while it is unreachable answers 503 rather than claiming success (CMGR 003).

**Verification.** `cache-registry.spec.ts` 6, `cache-manager.integration-spec.ts` 8 against real Redis and MySQL (status shape and approximate flag, a namespace cleared with the count reported, protected keys proven untouched, `*`/`search:*`/`cache:*`/`FLUSHALL` and friends all refused, view separated from clear with anonymous refused, the tag clearance proven to write the same `cache.invalidate` event a publication writes, both clearings audited, and "last cleared" recorded). Admin `CacheManagerPage.test.tsx` 4 proves the screen offers no clear-everything control, no free-text field, and explains an unavailable cache rather than only reporting failure.

## Phase 40a — Admin editing moved from dialogs to pages, and the showcase publication rule relaxed (2026-09-08)

Two client instructions, handled together because they touch the same screens.

**Dialogs → pages.** Record editing now happens on its own route rather than in a modal. A dialog constrains a form to a box, hides the record's context behind it, cannot be linked to or reloaded, and traps focus in a scrolling area; a page can be bookmarked, opened in a new tab, read at the width the content needs, and keeps its save bar in view without stealing the screen. `components/ui/RecordEditorPage.tsx` is the one layout every editor uses — breadcrumbs, a back link, the form, an optional context panel, a sticky save bar with the record's version and last edit — so nine screens do not each invent their own.

Converted so far: FAQs, service alerts, testimonials and clients/partners, each with `/new` and `/:id` routes. `permissionsForPath` gained segment-wise matching for `:param` patterns, so an editor route requires the *edit* permission rather than inheriting the list's read permission — without that, an administrator who may only view could open a form the server would refuse to save (RBAC 010). Still to convert: taxonomy terms, editorial terms, redirects, administrators, featured listings, media library, and the moderation decision dialogs.

**Confirmations stay dialogs.** ADM 002 requires confirmation for destructive actions, and CMGR 003, QMON 003, MAIL 009 and ALRT 007 each name one. An interruption is the point of those, so they remain — what went away is *forms* in dialogs, not warnings.

**Publication no longer waits on recorded permission (SRS 1.5).** At the client's instruction, a testimonial no longer requires a recorded approval to publish, and a partner organisation no longer requires a recorded authorisation. Both records remain, optional: recording one still names the administrator and the time, editing a quote or replacing a logo still clears the record it covered, and both stay permission-separated from creating and publishing. What a partner *does* still require is the logo asset and its alternative text, because those are about the strip being renderable and readable rather than about permission (MED 003, NFR 006).

The concern was stated once and the instruction stands: the record was never about who typed the content in, but about evidence that the subject agreed to be quoted or to have their mark shown. That residual risk is legal rather than technical, and is recorded in the SRS change log and in TSTM 002 so it is not rediscovered later as a surprise.

**Verification.** API unit 245, `showcase.integration-spec.ts` 11 rewritten to the new rule (publish without consent recorded; consent still recordable and still cleared by a quote edit, without unpublishing; partner still refused without logo or alternative text). Admin `Showcase.test.tsx` 6 and `permissions.test.ts` 6 (including the new `:param` route cases).

## Phase 40b — Website → Pages, and a custom About page (2026-09-08)

Two client instructions, resolved together because the second depends on the first: the information-page screen was to carry only Privacy Policy, Terms of Use and Review Guidelines, and About was then to become a designed page whose copy stays in the CMS.

**One page set, two templates.** `Contact` is gone from the editable set. `/contact` is still a public route, but its address, phone and postal details come from the general settings (CFG 001), where the API already refuses a non-routable domain — an editable contact page meant a second place to type an address, and the one an editor typed won. `About` stays in the same `static_pages` record as the policy pages (same revisions, same publication gate, same audit) but declares `template: 'about'`, which is what decides that a bespoke public template renders it. No second content source, no schema change; the unused `contact_email` column is left in place for a reviewed drop rather than dropped in passing, and rows for a withdrawn slug are ignored by the registry rather than deleted.

**Admin.** The master-detail "Information pages" screen is gone. Website → Pages lists the known pages with their address, template, readiness and last change; each opens at `/website/pages/:slug`. The editor form, the publish action and the blocker reporting live in one `StaticPageEditor` used by that route, so there is a single implementation rather than a copy per screen. `/pages` redirects to the new address so old links still land.

**About page.** `/about` composes the administrator's title, introduction and SEO fields with material that must not be retyped: live published counts from a new `GET /site/metrics`, the configured contact route, and a description of how listings are created, checked, published and corrected. Eight bands, alternating light and dark, all server-rendered with no client JavaScript of its own. A count that cannot be taken is `null`, not zero, and a section with nothing true to show is omitted entirely — which is why the snapshot disappears rather than displaying dashes when the database is unreachable, and why a genuine zero is not advertised. The page claims no certification, endorsement or guaranteed accuracy, and describes the Adelaide boundary as it is actually enforced, naming D01 as still open.

**Content.** `pnpm --filter api pages:seed` writes shipped baseline copy into an empty About row and publishes it, through the same cache-invalidation pipeline an editor's publish uses. It refuses to run over an existing row, so it can never overwrite what an editor wrote or re-publish what an editor unpublished, and it is held to the same publication gate. The client's approved wording replaces it in the editor. Photography is the two licensed images already shipped for the hero, with their credits; replacing them with the client's own is recorded in `docs/content/hero-photography.md`.

**Verification.** API unit 245, web 103 (10 new About tests, 3 new navigation tests), admin 152 + 5 new page tests; `seo.integration-spec.ts` and `static-pages.integration-spec.ts` extended and green against the real database. Production build clean. Runtime on a preview at 3010 against the running API: `/about` 200 with the About link in both navigations and the footer, `/privacy` 404 while unpublished, `/contact` 200; sitemap index carries `pages.xml` listing `/about` and `/contact`; canonical, Open Graph, breadcrumb and `AboutPage` JSON-LD present; no console errors and no failed requests. Measured at 1440/1024/768/390/320 px: no horizontal overflow anywhere, hero 380 px at 1440 and 402 px at 1024 (inside the 360–440 px target), taller on narrow screens because the same copy wraps rather than because anything is oversized.

**A note on the first instruction.** Taken literally it would have removed About as well; the instruction that followed required About to stay in the CMS. Reading them together, what the client did not want was About and Contact on the *policy* screen — so the policy list holds exactly the three named pages, About has its own editor, and Contact has no editable page at all.

## Phase 35 — Queue monitor (2026-09-08)

QMON 001–005. Two closed registries in `apps/api/src/queues/queue-registry.ts`: the queues an operator may see and act on, and — per job name — the *only* payload fields that may be displayed. The redaction rule is an allowlist rather than a deny-list, because a deny-list has to be updated every time a job gains a field and the cost of forgetting is a token or an address on screen; an allowlist's cost of forgetting is a field not shown until someone adds it deliberately.

Everything is read through BullMQ's own interfaces — counts, paused state, workers, oldest waiting job — so nothing depends on Redis key layout, and worker availability is labelled an estimate because it is a live reading from Redis rather than a guarantee (QMON 005). A job that is not registered shows as work with its details withheld rather than as a payload dump.

Actions are four separate permissions and apply only to an explicit selection of at most 25 jobs, each applied independently with its own outcome, so a job another replica has already taken fails on its own line (QMON 004). Retry is refused for anything not failed; removal for anything running; cleaning is limited to completed or failed metadata at least 24 hours old, so a failure that has just happened cannot be erased. Pausing states its consequence — enquiries stored but not delivered, images unprocessed, pages served from cache — before it is confirmed. There is no route that creates a job, edits a payload or replays arbitrary work, and the integration test asserts that.

**Verification.** `queue-registry.spec.ts` 7 (redaction, unrecognised payloads, bounds), `queue-monitor.integration-spec.ts` 9 against the real Redis (depths, redaction end to end, permission separation, per-item outcomes, bounds, pause/resume audit, no create route), `QueueMonitorPage.test.tsx` 7 (nothing actionable for a viewer, retry disabled until a selection exists, the repeat-effect warning, the unreachable state).

## Phase 36 — Scheduled tasks (2026-09-08)

TASK 001–006. The registry is `packages/domain/src/scheduled-tasks.ts`, shared by the API and the worker so neither can invent a task the other does not know: five tasks, each declaring its schedule, timezone, missed-run policy, timeout, retries, whether it may be run manually, whether it is high impact, whether it may be switched off, and whether two runs may overlap.

**Where things run.** The worker owns the schedules (BullMQ job schedulers derived from the registry's cron) and the implementations; the API shows state, records history and can ask for one registered task to run. A manual run is a queue job, not an inline execution — the integration test asserts that the request returns in milliseconds with no run recorded — so "run now" during a scheduled run meets the same lock rather than racing it. Nothing an administrator sends becomes a schedule, a command or a payload: the only identifier any route accepts is a registry code, and a request body carrying `cron` or `command` is ignored entirely.

**Tasks.** Scheduled article publication (which had a health alert but no runner until now), activity-log retention (ACT 006), email-log retention in two stages — the address removed at 90 days, the record deleted at 180 (MAIL 010) — queue metadata tidying, and retention of this history itself. Every implementation works from "everything older than X" rather than a cursor, so a repeat, a retry or an overlapping manual run converges on the same state.

**Safety.** A distributed Redis lock per task, released only by its holder; a task already running elsewhere is *skipped* and recorded as such rather than queued behind the first, because these are periodic jobs and the next occurrence does the work anyway. A run that exceeds its timeout is stopped and recorded as timed out. Failures are recorded as one line — the test proves a stack trace with file paths does not reach the record. History holds outcomes, durations and counts, never what a task touched, and is itself retained 30 days.

**Enable/disable.** Only `queue.clean-metadata` is optional; publication and the three retention tasks are marked required for correctness and refuse to be switched off, in the API (409 `TASK_REQUIRED`, no row written) and again in the worker's schedule sync. The admin screen shows the disabled switch with the reason rather than a control that would fail.

**Migration.** `20260907205054_scheduled_tasks` adds `scheduled_task_runs` and `scheduled_task_states`; additive only, no destructive statement. `taskCode` is deliberately not a foreign key — the registry lives in code and history must outlive a retired task.

**Verification.** `scheduled-tasks.spec.ts` (worker) 10, `schedules.integration-spec.ts` 9, `ScheduledTasksPage.test.tsx` 5 (including that clicking through a high-impact confirmation without typing the code dispatches nothing). Root: lint clean with zero warnings, typecheck clean, unit suites db 27 / api 252 / admin 169 / web 103 / worker 32.

## Phase 40c — The rest of the dialogs, and one submit path (2026-09-08)

Completing the client's instruction that record editing happen on pages rather than in dialogs, and the code-quality pass they asked for afterwards.

**Converted.** Taxonomy terms (categories, services, local areas — one `TermEditorPage` driven by the same config the list uses), blog categories and tags, SEO redirects, administrators, featured placements and media details. Each has its own route, its own permission entry, and a link from the list rather than a button that opens a box. Two things came out of the conversions rather than into them: `EditorialTermsPage` carried a dead "authors" branch (authors have had their own screen for some phases), and `AdministratorsPage` sent `roleKeys: ['super_admin']` for every invitation — every new administrator was silently a super administrator. The invite screen now asks which roles, requires at least one, and the test proves nothing is sent until one is chosen.

**Still dialogs, deliberately.** Moderation decisions (approve, reject, redact), enquiry handling, and the publish/unpublish confirmations on the business and post editors. Each is a confirmation of a decision about the row in front of you, with a reason recorded — ADM 002, REV 004 and CMGR 003 all require the interruption, and moving them to a page would separate the decision from the thing being decided. What went away was *forms* in dialogs, not warnings.

**One submit path.** Fourteen editors repeated the same six lines: sign out on an expired session, explain a stale version, put field errors on the fields the API named, fall back to one message. Repeated, it had drifted — different wording for the same conflict, and in two screens `if (fields)` on an object that is always truthy, so a plain error silently cleared the form's own messages. `shared/useRecordEditor.ts` now owns validation, the saving flag, the error text and the field mapping; each editor supplies only what to send. `RecordEditorPage` gained the loaded-values fix the taxonomy editor exposed: `initialValues` applies at mount, and a record that arrives later has to be pushed in.

**Consistency.** Every screen now uses `PageHeader` — breadcrumbs, one H1, an explanation, the actions — including the business editor and the administrators and editorial-terms lists, which had grown their own heading blocks.

**Test stability.** The admin suite failed differently on each run once it passed 35 files: interaction-heavy specs missed their own async windows while eight workers competed for the CPU. Two changes, both about the machine rather than the code: `asyncUtilTimeout` raised to 15 s (a query that waits longer still fails, it just is not decided by load), and the pool capped at four threads. 37 files / 175 tests, 77 s, repeatable.

## Phase 41 — Cross-module audit (2026-09-08)

The last item on the roadmap: looking across the modules built over the programme rather than at each in turn, for the things that only go wrong between them.

**What was checked, and with what.** Authorization: `pnpm --filter api authz:verify` plus the default-deny guard and the access-control integration specs, which enumerate the admin surface — every route added this programme (`/admin/system/queues`, `/admin/system/schedules`, `/admin/pages`, `/site/metrics`) declares a registered permission or is explicitly public. Envelopes: every new controller returns `{data}` or `{data, meta}` and every failure the `{error:{code,message,fields,requestId}}` shape, exercised by the 400/403/404/409 assertions in the new integration specs. Activity coverage: `activity-catalogue.spec.ts` reads every audit call site in the source and fails on an undeclared domain — `system.queue.*`, `system.schedule.*` and `settings.page.*` are covered by the `system` and `settings` domains. Cache invalidation: the publication paths and the content seed all write through `CacheService.recordInvalidation` rather than touching Redis. Migrations: `db:migrations:check` clean. Secrets: tracked `*.example` files carry placeholders only; the real `.env` is ignored.

**One finding, fixed.** `MediaService.runRetention` — the MED 004 policy that deletes abandoned uploads and month-unused images — had no caller anywhere. It had been written, tested by nothing, and never run. Now that Phase 36 exists it is a scheduled task (`media.retention`, daily, required for correctness) implemented in the worker where the object storage lives, and the API's uncalled copy is gone with a comment at its former site saying where it went. The retention windows moved to `packages/domain/src/scheduled-tasks.ts` so the policy is declared once. The schedules integration test now asserts that every retention policy the SRS states has a registered task applying it, which is the check that would have caught the original omission.

**One observation, not changed.** `authz:verify` reports the protected role holding 63 permissions against a catalogue of 62: the extra is `system.activity_logs.view`, retired when the activity log was consolidated in Phase 32. It grants nothing — the guard refuses a retired permission, and the CLI confirms zero assignments grant access through one — so the row is untidy rather than unsafe, and removing it means writing to the client's database outside a migration. Left for the next reviewed migration, recorded here so it is not rediscovered as a surprise.

**Gate.** `pnpm check` exit 0: lint with zero warnings, typecheck, unit (database 27, API 252, admin 175, web 103, domain 12, mail 16, worker 33), e2e 19, every build, bundle budget, contracts in sync. `pnpm test:integration` exit 0: 35 files / 275 tests against the real MySQL and Redis.

## Phase 42 — Pages an administrator can add (2026-09-08)

The client asked what happens when they need another CMS page, and whether the screen could have an Add button. It can, and now does.

**What was in the way, and what replaced it.** The slug set was closed in code, which is what guaranteed that nobody could publish an arbitrary top-level URL. That is a guarantee worth keeping, but a fixed list is not the only way to keep it. `pageSlugProblem` now enforces it directly: a strict lower-case pattern, a reserved list, and a uniqueness check at write time. The reserved list matters more than it looks — Next.js resolves a static route before the dynamic page route, so a page slugged `blog` would have been created, published, listed in the footer and then answered by the blog index: a page that exists everywhere except where you look for it. Each refusal returns the sentence an editor can act on rather than "invalid".

**Two kinds of page.** System pages (About and the three policies) stay declared in code, always listed, and cannot be created, renamed or deleted, because the product links to them by address — the review form's acknowledgement points at the review guidelines, About has its own template and navigation item. Everything below them is the administrator's, and carries exactly the same content rules: sanitised rich text, a revision of the previous published text on every edit, the publication gate. No schema change was needed: a custom page is simply a `static_pages` row whose slug the registry does not name.

**Addresses are fixed at creation.** Anything that links to a page links to its address, so renaming quietly breaks other people's links. The create form suggests an address from the title and stops suggesting once the editor types their own; after that the address is the one thing on the page that cannot be edited, and the aside says what to do instead — a new page and a redirect.

**Deleting.** Refused for a system page, and refused while a page is published: unpublishing first turns the resulting 404 into a decision the administrator made rather than one they discover later from a support message. The list disables the button and says "Unpublish it first" rather than offering an action the API would reject. A deletion takes the page's revisions with it and is audited.

**The public side stopped keeping its own list.** `app/(pages)/[slug]` had the three policy slugs hardcoded; it now asks the API, because a list in the web tier would have to be edited every time an editor added a page and would be wrong until it was. The footer and the sitemap already worked from published rows, so a new page appears in both without further code.

**Verification.** Slug validation unit tests including path traversal, uppercase, spaces, double hyphens and every reserved route; five integration cases against the real database (create → draft invisible → publish → served, listed and in the sitemap; reserved and taken addresses; malformed addresses creating nothing; both deletion refusals; delete and stop serving, with the audit trail); admin tests for the Add button, the address suggestion and override, the API's refusal landing on the address field, and the delete affordance; a web test proving the shared template renders a page created after that code was written. `pnpm check` and `pnpm test:integration` green.


## Post-audit remediation — 8 September 2026

The audit found two High defects and fixed them. This pass asked a harder
question: could the same class of failure happen again, and would anyone notice?

**F-01, closed structurally.** The original fix corrected one call site. Job-id
construction is now a single function — `queueJobId()` in
`packages/domain/src/queue.ts` — that strips every character BullMQ refuses,
names `:` explicitly in its failure message, bounds the length and refuses an id
with no usable characters. `assertQueueJobId()` guards the one place jobs are
enqueued, so an invalid id fails at creation rather than at consumption.
`scheduledTaskJobId()` delegates to it. Six integration cases run against real
Redis and BullMQ: every registered task dispatches manually and on recovery,
every job name round-trips, a `:` id is refused with the message naming the
character, a repeated dispatch stays one job holding the first payload, an id
persisted before this change is still reachable, and a real `Worker` retry keeps
the same id and payload.

**F-02, closed structurally.** API and worker now read one list —
`MAIL_TRANSPORTS` in `packages/mail/src/transports.ts` — and both suites iterate
it, so a value one side accepts and the other refuses is a test failure rather
than a production start-up failure. The worker was started under `console`,
`smtp` and `resend`.

**A new defect, found while testing the above.** The Resend transport summarised
the provider's response body into the error it threw. A provider that echoed the
request would have written the API key into a log, an admin screen and a stored
failure reason. The existing assertion passed only because its fixture never
contained the key. `redactCredentials`/`redactSensitive` now strip `re_…`,
`whsec_…`, `Bearer …` and `sk_…` alongside the addresses already redacted.

**Monitoring (MON 001–002).** Provider-neutral `prom-client` exposition on
`/metrics`, deliberately outside `/api/v1` and out of the OpenAPI document,
loopback-only unless `METRICS_TOKEN` is set, answering **404** rather than 401 to
an unauthorised caller. The worker gets the same endpoint plus `/health`, and
only when `WORKER_METRICS_PORT` is set. Each worker replica publishes a heartbeat
to `as:worker:heartbeat:<instanceId>` every 15 s with a 45 s expiry, carrying
instance id, version, start time, last beat, queues and counters — nothing about
the host and nothing from the environment. `WorkerLivenessService` turns those
into the states an operator actually has to distinguish: Redis unreachable, no
worker ever started, every worker stopped, alive but not finishing work, alive
but the required schedule has stopped. The last one is the F-01 shape, and it is
derived from run history rather than from a socket. It is exposed at
`GET /api/v1/admin/system/queues/workers` behind `system.queues.view` and shown
as the Workers card on the Queue Monitor. Route labels are Nest patterns, never
URLs; no address, body, token, session or visitor-supplied value is a label, and
a test asserts that over the real exposition.

Verified live: a worker started locally, the API reported `as_worker_heartbeats 1`
with real queue depths, and the gauge went to `0` after the worker stopped.

**Release gate (F-09).** `pnpm test:browser` runs Playwright against production
builds on free ports, creates and drops its own database, provisions a temporary
administrator with a generated password, treats a skipped test as a failure, and
stops only what it started. `pnpm verify:release` chains it after `check` and
`test:integration`. A CI job is prepared and not connected.

**F-05 is still open.** The empty server-rendered 404 body is a Next.js 16
streaming property, not a defect in this code: once a Suspense boundary has
rendered, `notFound()` cannot replace a body that is already going out. Both
documented answers were implemented and tested; the proxy variant worked but put
an API call on every unmatched request, so it was reverted. The application is
unchanged and healthy. The recommendation stands: serve the already-correct
prerendered `_not-found.html` at the reverse proxy.

**Not done, and deliberately so.** No on-call person assigned (client approval,
SRS §23). No CI workflow pushed and no external account connected. No commit.

## Staging closure — 9 September 2026

Scope: finish the evidence a staging hand-over needs. No product features.

* **API restarted on 4001** from the current build (the process was identified by
  its listener, restarted with the same ignored `.env`, no secret printed, no
  other process touched). `/api/v1/health` 200, `/api/v1/health/ready` 200 with
  database and Redis ok; `/metrics` 200 from loopback with 131 series and **404
  from the host's LAN address**; admin on 4002 unaffected.
* **Release gate** run as `pnpm verify:release` — root checks, integration tests
  and the browser suite in one command. Green in **13 min 23 s**: 1,010 unit and
  integration tests, then 52 browser tests with **0 failures, 0 skips, 0 flakes**.
  Three defects the gate itself surfaced were fixed rather than worked around:
  the runner created a database whose name the provisioning guard rightly
  refused (so four authorization journeys failed), the journeys skipped for want
  of published content (now seeded per run), and the run left its Redis database
  behind (now flushed on the way out). A fourth was found while checking the
  machine afterwards: the runner signalled its child but not the process group,
  so the admin and web servers it started kept listening after every run. Servers
  are now started detached and the group is signalled, with a `SIGKILL` fallback;
  verified by a clean run that left no listener and no key behind.
* **Nine failure drills executed.** D5–D9 were run this session against isolated
  infrastructure; they found and closed two real defects (a `/metrics` hang under
  a Redis outage, a sticky oldest-waiting gauge).
* **F-05 closed at the deployment layer.** A reference reverse proxy
  (`infrastructure/edge/`) serves the prerendered not-found document for 404s
  from the web upstream, with the status preserved. Measured through nginx, not a
  development server.
* **Monitoring proven deployable.** Prometheus in a separate container scrapes the
  API and two worker replicas over a bearer token read from a git-ignored file;
  no metrics port is published beyond loopback.
* **Alert coverage validated** against the recorded drill series; three conditions
  (object storage, backup success, restore-drill age) are documented as staging
  tasks because nothing emits them yet. **No on-call person assigned** — that
  needs the client's approval (D07).

## Admin interface redesign — 10 September 2026

Scope: the admin application's appearance, structure and wording. No change to
authentication, authorization, validation, concurrency or audit behaviour.

* **Inventory first** (`docs/audits/admin-ui-inventory.md`): every route
  classified, its problems recorded, and where it has been verified.
* **Tokens and shared components**: one theme file; `SettingsSection`,
  `ErrorState`, `PermissionDenied`, `DangerZone` and `RecordMetadata` added to
  the existing set, with contract tests.
* **Security settings rebuilt as the reference screen**, and the copy fixed at
  its source — the server's settings registry, which now declares units and
  plain-language limits and keeps its internal justification internal.
* **Dashboard** gained real worker liveness, scheduler state and queue links,
  permission-filtered, with no invented numbers.
* **Ten defects found by running the interface**, all fixed, listed in the
  inventory — including an accessibility failure (an icon-only link with no name
  on a phone), a contrast failure in empty tables, and two layouts that scrolled
  sideways on a phone.
* **Evidence**: axe over one screen of each page family and the overflow rule at
  six widths, in `e2e/specs/admin-ui.spec.ts`, inside the release gate.

## Operational safety, record editors and the route sweep — 10–12 September 2026

Scope, in the order the client set it: make media processing safe to operate,
then featured listings, redirects, the administrator access editor, the service
alert preview, and a sweep of every admin route. No commit, no push.

* **The worker is a required, separately supervised process.** Uploads stayed in
  "processing" because no worker was running, and nothing said so.
  `apps/worker/README.md` and `docs/operations/runbook.md` now state the
  requirement (restart always, liveness from the heartbeat, graceful shutdown,
  alerts C4/W3/W5), and the media library reads worker liveness and says
  definitively when processing has stopped instead of waiting quietly.
* **Featured placements**: `PATCH` now runs the overlap check `POST` runs, from
  one shared function. The check was also read-then-write, so simultaneous
  requests could each pass it; it now runs inside the write transaction behind a
  lock on the listing's row. The integration test sends six overlapping requests
  at once and requires exactly one to be stored. Without the lock, all six were
  accepted.
* **Redirects** (client decision): a temporary 302 kind and an on/off state,
  full stack. One function, `redirectEffect`, decides the outcome for both the
  public resolver and the new admin preview, so they cannot disagree. An inactive
  rule answers 404 publicly. Both caches in front of the resolver dropped to
  10 seconds, and a 302 is sent `no-store`. The enum member was appended last,
  so the migration is an instant alter rather than a table rewrite.
* **Administrator access editor**: each permission's source by role name, a
  direct grant that duplicates a role flagged, grants the acting administrator
  does not hold withheld (as is the Super Admin role, for anyone who is not
  one), and every change named, with the sign-out it causes, before it is
  confirmed. The server's invariants are unchanged.
* **Service alerts**: the severity table (colours, tone, role, politeness) and
  the link validator moved to `@adelaide-sphere/domain`, read by the API, the
  public banner and a new admin preview; parity tests on both sides pin them to
  the one table. Two defects fixed with it: the editor scheduled alerts in the
  browser's timezone rather than Adelaide's, and the service re-derived a link's
  externality with its own heuristic.
* **A data-loss defect in media usage** (client-approved fix, larger than
  reported). Testimonials, partners, the site logo/icon/sharing image and home
  hero slides were not counted as uses, so those images could be deleted from
  the library — and **the worker's retention task would have deleted them
  automatically 30 days after upload**. One shared definition
  (`packages/domain/src/media-usage.ts`) now drives the library's refusal, its
  "unused" filter and the retention task.
* **The route sweep** (`e2e/scripts/route-sweep.ts`) opened all 72 routes at
  1440 and 320 px and as a moderation-only administrator. The first run found 21
  routes with a finding; all are fixed. The largest was structural: every editor
  with a side column collapsed its form to nothing below 992 px. The full list
  is in `docs/audits/admin-ui-inventory.md`.
* **Outstanding, named:** a preview of the placed listing on the featured
  editor, a preview of the home hero on `/settings`, and a manual screen-reader
  pass.
* **Evidence (12 September 2026):** `pnpm verify:release` exit 0 — lint with no
  warnings; unit: database 27, API 274, admin 220, web 111, domain 35, mail 37,
  worker 46; API e2e 19; builds; bundle entry 700 kB within budget; contracts in
  sync; integration: database 5, API 299; browser 64 with none skipped or flaky.
  Route sweep: 72 routes, 0 findings.
* **Not production-ready.** Still outstanding: worker supervision in a real
  environment, staging itself, a production-shaped backup/restore verification,
  and the client launch decisions in `docs/launch/client-decisions.md`.

## Sign-in, themes, password reuse and helper text — 12 September 2026

Client requests in this session, in order. No commit, no push.

* **Sign-in redesigned** on a lit navy ground with the form on a frosted-glass
  card, shared by all five signed-out screens. Native placeholders on every
  field. Failures are answered by kind — wrong details (without saying which
  half), too many attempts (the server's wait counted down on the button),
  throttle unavailable, network down — and a server field error lands on its
  field. Caps Lock is flagged while typing.
* **A production-safety defect fixed on the way:** Refine's login hook opened
  its own error toast for every unsuccessful sign-in, and for the two-step
  marker that toast printed the challenge token on screen. That one toast key
  is now dropped; the screen reports failures in place.
* **After a reset or setup link, the reader is sent straight to sign in** with a
  notice. Only notices defined in `auth/sign-in-notice.ts` are shown, so text
  placed in navigation state cannot reach the screen. The reset and setup
  screens now share one `NewPasswordForm` instead of two diverging copies.
* **Password reuse.** The current password could be "changed" to itself
  whenever history depth was zero (the old default), because the depth check
  returned first. The current password is now always refused, on change and on
  reset, and the default depth is **3** earlier passwords (client instruction;
  SRS SECS 003 sets no default). The setting's label and summary say exactly
  that. Integration tests cover change, reset, and depth zero.
* **Light and dark themes**, light by default, chosen per browser. One palette
  pair in `config/theme.ts` feeds both Ant Design and the CSS variables every
  inline style reads; ~25 hard-coded colours moved onto tokens. Gradients —
  page ground, navigation, cards, titles, stat icons, one brand gradient on all
  primary buttons — in both themes. Contrast is tested for both palettes, which
  caught a pre-existing failure: the light theme's subtle text was 4.4:1 on the
  page ground (now 4.8:1). The browser suite runs axe in dark as well; that
  caught links inside alerts told apart by colour only (now underlined).
* **Reloading the dashboard in development** showed Vite's "did you mean
  /admin/?" page, because the router writes `/admin`. A small Vite plugin now
  301s `/admin` → `/admin/` on the dev and preview servers, as nginx already does
  in production.
* **Helper text cut down**: 60 descriptions and hints rewritten to one line; two
  were also wrong (the partner and testimonial editors still claimed a recorded
  approval was required, which SRS 1.5 removed). `src/copy-length.test.ts` now
  enforces the limits.
* **Email log.** The log was correct — it held the one message sent today (a
  password reset). Enquiry emails are sent and logged by the worker, and none is
  running, so nothing appears for them. The log and the media library now share
  one `WorkerStoppedAlert` that says so instead of showing an empty list.
* **Branded HTML email** (client request). Every transactional message —
  password reset, account setup, business enquiry — is now rendered by one
  layout (`packages/domain/src/email-layout.ts`) as HTML and plain text from
  the same content: navy header and brand gradient with solid fallbacks for
  clients that drop gradients, a bulletproof button with a copy-and-paste link,
  a hidden preview line, dark-mode overrides, every value escaped and links
  limited to http(s) (SRS ENQ 005 allows HTML provided visitor content is
  escaped and a text body is sent — both hold). Two defects fixed with it: the
  reset email promised "30 minutes" whatever the security setting said (it now
  states the real lifetime), and the invitation and its resend were two
  different messages (now one builder). The worker's copy of the enquiry-mail
  types was replaced by the domain's.
* **A test that restored its fixture by reusing a password** (`admins`
  integration) now asserts the refusal and restores the fixture by clearing its
  history directly.
* **Seven pages lost their heading when their data failed to load** (site and
  general settings, website pages, the permission catalogue, and the author,
  administrator and article editors): they returned only an error block, with
  no h1. They now share `PageLoadError` — the page's own header and
  breadcrumbs, then the error with a retry. This was also why an access-control
  test was flaky: it watched the catalogue heading appear, and the page's
  unanswered request then replaced it. That test now answers its requests.


## 12 September 2026 — Demonstration listings, richer business and taxonomy records

* **Twenty fictional Adelaide listings** seeded into development databases by
  `apps/api/scripts/seed-businesses.ts`, with services, hours, addresses,
  contact routes, social links, four attribution-licensed photographs each and
  approved reviews; the three existing listings were filled in the same way.
  Content and licensing rules: `docs/content/business-demonstration-listings.md`.
* **Four additive, reviewed migrations**, each approved by the client before it
  was written (SRS §74): `businesses.establishedYear` ("n years in business");
  image and search-appearance fields on `categories` and on `local_areas`;
  `services.icon`. No existing row changed.
* **Public business page:** photographs open at full size from a sliding
  gallery; every service carries a pictogram — an editor's choice from the
  shared icon library in `@adelaide-sphere/domain/service-icons`, or a
  name-based match until one is made; "n years in business" in the header.
* **Categories and local areas** can carry an image (home-page tile and landing
  header) and their own SEO title, description, keywords and share image; the
  home page's category band is titled "Browse businesses by category".
* **SRS conflict surfaced and resolved:** a request to rename local areas to
  "Cities" was declined by the client once the Adelaide-only scope rule
  (SCP 001–005, UX 003) was pointed out; local areas keep their name.


## 12 September 2026 — Public blog: editorial presentation and media handling

Client request: the blog index, category archive and article page read as
functional but sparse, with very large navy blocks where article pictures
should be. Frontend only — no schema change, no business-rule change, no change
to moderation or editorial workflow.

* **The oversized navy blocks had three causes, all now closed.** (1) A cover
  reaches the public API only once the worker has processed it —
  `BlogPublicService.renditions()` publishes nothing for an asset that is not
  `ready` — so with no worker running every cover arrives as an empty array and
  every card takes its no-picture branch. (2) `gridColumns(1)` returned
  `grid-cols-1`, so a single article's card spanned the whole 1520 px content
  width and its 16:10 frame became an ~880 px-tall panel; `articleColumns()`
  now never collapses a row below half width, and a one-article collection is
  given the lead layout instead of a stretched grid card. (3) `next/image` had
  no failure path, so a rendition that 404s left the frame's `bg-navy-900`
  showing with nothing on it — indistinguishable from having no cover, and
  undiagnosable. Measured after the change: the tallest media block on a
  one-article archive is 352 px at 1440 px, and an article hero 567 px.
* **`components/article-media.tsx`** is the one place an article picture is
  drawn: reserved aspect ratio before load, `card` (800 px) or `hero` (1600 px)
  rendition chosen by the layout it sits in, lazy by default and eager only for
  a genuine LCP image, and one restrained fallback — the brand mark on a
  category-derived gradient (`editorialGradient`) — for both ways a picture can
  be absent. A load failure swaps in that fallback *and* writes the failing URL
  to the console, so a broken media origin stays diagnosable while a reader
  never sees a broken-image glyph or an error.
* **One canonical card.** `post-card.tsx` now carries both the `standard` and
  `featured` layouts (`featured-post-card.tsx` is gone), with `showCategory`
  off on an archive, where the term is already the page heading. The fallback
  panel carries no words for the same reason.
* **One fixed four-column grid,** at client instruction: `cardGridColumns`
  (1 / sm 2 / lg 3 / xl 4) is used by the blog index, the blog category and tag
  archives and the business search results, and does **not** narrow to the
  number of cards. A collection therefore keeps its shape as it fills up, and a
  lone card is a quarter of the row rather than the full section width — which
  is the other half of the fix above, since a full-width card is what turned a
  missing cover into an 850px-tall panel. The count-dependent `gridColumns` is
  unchanged and still used by the home-page bands and the related-articles row,
  where the section is narrower and a row of three is the maximum that fits.
* **Reading width.** New `--as-content-read` (46 rem) and `.as-container-read`;
  the article's breadcrumb, title, standfirst, byline, body, author and
  comments all share one 736 px column while the hero runs wider at 1008 px.
  `.as-prose-article` sets the long-form scale (17–18 px, 1.78, H2 clamped to
  1.6–2.05 rem) and switches off the per-element 68ch cap, which had left
  paragraphs at one measure while the headings beside them ran to the full
  column.
* **Article flow** is now body → tags → author → related → comments; related
  articles previously sat below the comments. **The hero caption prints the
  photographer credit only.** It previously printed `coverAlt` as visible body
  copy, which put an editor's own name under the photograph as if it were a
  caption; alternative text is the description announced in place of a picture,
  the data model has no caption field, and none was invented.
* **Category navigation** (`blog-category-nav.tsx`) on the index and the
  category archives: "All stories" plus the stocked categories from the API,
  `aria-current` on the active chip so the state is not colour alone, and a
  row that scrolls sideways on a phone rather than wrapping into four lines.
* **Comments** gained the states the brief asks for: field messages that say
  what to do, errors tied to their controls and focused on failure, distinct
  copy for rate limiting, a closed service, a validation failure, a server
  fault and an unreachable network (`submissionFailureMessage`), "Posting…"
  with repeat submission refused, guidelines and privacy notice linked
  separately once each is published, and a success message that says the
  comment is awaiting review. The API's own message is no longer shown.
  Nothing about validation, the honeypot, the captcha, the acknowledgement or
  moderation changed.
* **Defect found and fixed during verification:** a `loading.tsx` added to the
  category and tag archives made those routes stream, so `notFound()` could no
  longer set the status and an unknown category answered **200** instead of 404
  (SRS SEO 001). Both files were removed; only `/blog`, which never 404s, keeps
  its skeleton. The repository already knew this hazard — `/business` uses a
  route group for the same reason.
* **The three editorial headers were reworked again at client instruction**
  ("I do not like this hero section"). `.as-editorial-band` (in
  `apps/web/src/app/globals.css`) gives the blog index, the collection headers
  and the article header one treatment: a single sky light source in the upper
  right over a band that deepens downward, a fine dot texture masked to fade
  before the content ends, and a lit hairline where the band meets the page.
  All of it is decoration behind `-z-10`, so nothing can sit over text, and the
  strongest layer still leaves white at about 9.5:1 and band-muted at about
  5.9:1. The rhythm was tightened as well: the kind of page and its size now
  share one line above the heading (`BLOG CATEGORY • 3 articles`,
  `ADELAIDE SPHERE • 8 stories`) instead of being stacked blocks that made the
  band twice as tall as its content needed, and the article's category badge is
  a sky-outlined chip with the standfirst set a step larger.
* **The category page's repeated name is gone.** An editor's landing content
  reasonably opens by typing the category name, which the H1 has just said, so
  the archive read "City guides / City guides / Our guides.".
  `lib/landing-content.ts` drops an opening heading when its text matches the
  title — a presentation decision only: the stored content is untouched, a
  heading that says anything else is left where the editor put it, and the
  helper only ever removes, so it cannot introduce markup.
  **Note for the client:** the copy itself ("Our guides.") is admin-controlled
  and still thin; a fuller category description is worth writing in the admin.
* **Verified**: `pnpm --filter web test` (184 passed, 30 files), typecheck,
  lint, production `next build`; and the real pages driven in Chromium at
  375/430/768/1024/1280/1440 px against a stub API (this container has no
  MySQL, Redis or object storage), covering an article with a cover, without
  one, with a cover that 404s, a long headline, the business search results,
  and archives holding one, two, three and seven articles: 54 page/width
  combinations with no horizontal overflow, one `h1` per page, no heading-level
  skips, zero axe violations (WCAG 2.2 A/AA) and no unexpected failed
  requests. Route statuses confirmed: unknown article and unknown
  category 404, empty category 200.

No SRS business-rule change was introduced.

## 13 September 2026 — Contact page: layout, form states and the Turnstile action defect

Client request: the Contact page worked but read as plain and vertically spread,
with the form disconnected from the contact information. Audited against SRS
ENQ 001–003, SEC 002/003, CFG 001/002 and UX 003 before changing anything.

* **Defect found in the audit and fixed.** The contact form rendered its
  Turnstile widget with action `contact`, but `EnquiriesService.submit`
  verified every enquiry against `enquiry`, and `TurnstileVerifier` rejects a
  token whose action does not match. With real keys every genuine contact
  message would have been refused `CAPTCHA_FAILED`. The integration suite could
  not see it because its captcha double ignores the action. The service now
  checks `contact` for site messages and `enquiry` for listings; the
  acknowledgement error and receipt message no longer mention "the business" for
  a site message. Proven by `enquiries.service.spec.ts`.
* **Second defect.** Turnstile tokens are single use, but the implicit
  `.cf-turnstile` widget was never reset, so a retry after any failed attempt
  resent a spent token. New `components/turnstile-widget.tsx` renders the widget
  explicitly (compact below 300 px), reports loading, verified, expired, error
  and "script never loaded" states in a live region with retry/reload actions,
  and exposes `reset()`; the contact form renews the token after every attempt
  that reached the API. Server verification is unchanged and authoritative.
* **Layout.** `InformationHero` was extracted from `information-page.tsx` (the
  policy pages render exactly as before) and reused with `.as-editorial-band`.
  Two columns from `lg` (`minmax(0,1fr)` + 28/32 rem): contact details (email
  and phone from general settings, address only when configured, Adelaide-only
  coverage), four help topics, "When will we reply?", what to include, and
  useful links (FAQs and the privacy policy only when published). The form card
  spans both rows so its sticky position has room and ends with the section. It
  is sticky only where the card fits under the pinned navigation
  (`min-height` 58 rem at `lg`, 54 rem at `xl`) and becomes static once it holds
  an alert, because validation messages make it taller than the viewport. Source
  order details → form → guidance puts the form early on a phone.
* **Form.** Labels "Name", "Email address", "What can we help with?",
  "Message"; placeholders; Name/Email side by side only when the card is at
  least 28 rem wide (container query). Topic labels are shortened for display
  (`CONTACT_TOPIC_LABELS`); the stored subjects are unchanged. Client messages
  now distinguish missing from invalid and match the API limits (name 2–80,
  email ≤ 254, message 20–5000). A form-level alert plus focus on the first
  invalid field; API field text is rewritten where it is developer-facing
  (`contactFieldErrors`) and form-level copy never shows the API's message
  (`contactFailureMessage`, incl. 429, 503, `NO_ENQUIRY_ROUTE`, timeout after
  20 s, network, and `IDEMPOTENCY_KEY_REUSED` → "already received"). A ref
  refuses a second submit before the disabled state renders. The success state
  says "Message received" rather than "sent" (ENQ 003: a 202 is not a delivery
  claim), shows the reference and clears the form.
* **Verified**: focused tests only, as requested — web
  `contact-form.test.tsx` + `submissions.test.ts` 34 passed; API
  `enquiries.service.spec.ts` + `turnstile.verifier.spec.ts` 11 passed; web
  `tsc --noEmit` and eslint on changed files, API `tsc` and oxlint clean; web
  production `next build` passed. Runtime against the local stack at 1440×900
  (card 732 px, sticky, fits), 1280×800 (static: would not fit), 1024×1000
  (sticky), 768 (stacked, details → form → help → links) and 390 (no overflow,
  full-width button, 316 px widget); one `h1`; validation state checked in the
  browser. The Turnstile challenge itself was not completed in automation, so
  an end-to-end submission with real keys remains to be done by a person.

No SRS business-rule change was introduced.

## 13 September 2026 — About becomes a product route on the Contact template

Client instruction: remove About from Website → Pages, give it a template like
Contact's, keep its current photographs, no map, gradient accents, icon-led
points and less copy; make Contact match and clean up the code.

* **SRS discrepancy (not resolved by editing the SRS).** ABT 001 makes the About
  title, body, SEO fields and publication the administrator's, held in the
  information-page record; ABT 005 links About only while published; CFG 002
  lists About as a system page. After this change About is a code-owned route
  like `/contact`: its copy is shipped product copy and an administrator can
  override only its route SEO (`about` key in `SEO_ROUTES`). ABT 002–004 and 006
  are still met — the copy describes the product as it works with no invented
  history, endorsements or verification claims; figures come from
  `/site/metrics` and are omitted when null or zero in a `<dl>`; photographs are
  project files with printed credits; one `h1`, a semantic ordered list for the
  listing process, `AboutPage` and breadcrumb JSON-LD, canonical URL and sitemap
  entry. The SRS owner should amend ABT 001/005 and CFG 002 or reverse the
  instruction.
* **Data.** Nothing deleted. The `static_pages` row for `about` and its media
  usages are kept; `isProductRoute()` (a reserved address that is not a system
  page) now hides such a row from the admin list, admin get/update/publish, the
  public page read, the footer list and the sitemap. Whether to drop the row is
  a separate, reviewed decision.
* **Shared parts, one template.** `components/product-page.tsx` holds what both
  pages use: `ProductPageLayout` (the two-row grid whose sidebar column spans
  both rows), `AsideCard` (sticky only where it fits, static once it holds an
  alert), a gradient `IconTile`, `IconPoints` (optionally an ordered list with
  step badges), `ContentSection` and `LinkList`. Contact's help section, reply
  expectations and tips collapsed into two icon-point lists; About is hero →
  skyline banner and "Who we are" → sticky mission card (laneway photo, live
  counts) → what we offer → how a listing gets here → why, beside the market
  photo → a gradient "Be part of" panel with three onward links.
* **Removed.** `components/about-page.tsx`, `lib/headings.ts#pageSections`
  (only About used it), the `about` template type and API enum (contracts
  regenerated), `ABOUT_SEED` and the dev seeder `scripts/seed-about-page.ts` +
  `about-page-content.ts`, and the About special case in `(pages)/[slug]`. The
  header no longer fetches pages; About is always in the header and footer.
* **Photographs.** The three current media-library renditions were copied from
  local object storage into `apps/web/public/about/` (a skyline, a laneway and
  a market; since replaced). Current sources in
  `docs/content/about-photography.md`.
* **Verified**: web `tsc` + eslint, API `tsc` + oxlint, admin `tsc` clean;
  `pnpm contracts:generate`; focused unit tests — web 40 (site header/footer,
  contact form, submissions, headings), API `static-pages.spec.ts` 12, admin
  `PagesPage.test.tsx` 10 — passed; web `next build` passed. Runtime: `/about`,
  `/contact`, `/privacy`, `/terms`, `/blog` 200; `/api/v1/pages/about` 404 with
  the row retained; sitemap pages section lists `/about` and `/contact`; About
  at 1440×900 sticky card 736 px, three photos loaded, four live counts; no
  horizontal overflow on either page at 390 px. The API integration specs that
  were updated (`static-pages`, `seo`) were not run.

* **Follow-up (client request): more copy, fuller sidebar.** "Who we are" is
  three paragraphs, every section has a one-line introduction, and a new "Our
  editorial standards" section lists only rules the product enforces (REV
  001–003, REP 001). The sidebar is now a stack — mission card, "Explore by
  area" (up to twelve published areas, omitted if the list cannot be read) and
  "Talk to our editors" (configured email and phone, and a link to the form) —
  and only the last card is sticky. `AsideCard` gained `sticky="always"` for a
  short card that fits any desktop viewport; the height-conditional rule stays
  for tall cards such as the contact form.
No SRS business rule was changed in the SRS; the About ownership rules above are
superseded by client instruction and recorded here.

## 13 September 2026 — Dashboard charts, metadata on every public route, business search appearance

Client requests: an industry-standard dashboard with charts and colour; SEO
title, description, keywords and share image on every public URL; and the
"Search appearance" section businesses were missing.

* **Dashboard.** `GET /admin/dashboard` keeps its metrics, scheduled posts and
  activity, and adds permission-scoped counts only (ADM 003): a 30-day trend of
  reviews, comments and enquiries bucketed by Adelaide calendar day (a UTC or
  24-hour-step bucket moves submissions across days and repeats or skips a day at
  daylight saving — `dashboard-trend.ts`), current and previous period totals,
  headline figures, the approved-rating mean and spread, enquiry delivery states
  for the period, listing status and the six largest primary categories. The
  screen opens with a gradient overview banner, then the work queues, gradient-
  accented KPI tiles whose change is stated in words, the submissions line chart,
  stacked bars for delivery and listing status and bar lists for ratings and
  categories. Charts are hand-built SVG (no library, so the bundle budget is
  untouched) following the dataviz method: forms chosen by job, the reference
  categorical slots 1–3 validated all-pairs against the admin card surfaces in
  both themes, reserved status colours with icons and labels, a legend for two or
  more series, a crosshair tooltip, arrow-key reading through a live region and a
  table view. Refresh keeps the previous render dimmed (`useAsync#refresh`).
* **Metadata.** `lib/seo.ts#pageMetadata` is now the one builder: a page that
  sets `openGraph` replaces the root layout's object, so each route previously
  lost the site name, locale and default image, and routes without an override
  had no Open Graph title or X card at all. Share images: the page's own, then
  the configured default, then a generated card (`/og/[kind]/[key]`), which takes
  a kind and a slug rather than text and 404s for anything unpublished. Business
  pages no longer offer the SVG fallback as a share image; blog category and tag
  pages no longer hard-code the site name.
* **Business search appearance.** Additive migration
  `20260913100000_business_search_appearance` (`seoTitle`, `seoDescription`,
  `seoKeywords`, `ogImageMediaId` with `ON DELETE RESTRICT`); the fields travel
  through the create/update DTOs, the admin record (with a share-image preview),
  the public detail (with the image's largest rendition and dimensions) and the
  editor. A business share image is a media usage (`businessShareImageOf`), so
  neither the library nor the retention task can treat it as unused.
* **Found in verification:** a long media alt text was being used whole as
  `og:image:alt` (now trimmed to 125 characters), and the keyword
  "Adelaide, South Australia" was being split in two by the keyword parser.
* **Verified**: `pnpm db:migrations:check`, migration applied to the local dev
  database, `pnpm contracts:generate`; API tsc and oxlint, admin tsc and eslint,
  web tsc and eslint clean. Runtime: public business detail carries the new
  fields; business, blog tag and home pages emit the complete metadata set;
  `/og/business/<slug>` returns a 1200×630 PNG with `noindex`, and an unknown
  slug or kind returns 404. Not run: the unit and integration suites that were
  written or updated (`dashboard-trend.spec.ts`, `dashboard.integration-spec.ts`,
  `Dashboard.test.tsx`, `seo.test.ts`, `media-usage.spec.ts`). The dashboard
  and the business editor were not seen in a browser: the admin session was
  signed out. The test database has not been migrated.

No SRS business-rule change was introduced.

## 13 September 2026 — Search appearance data filled for every public record

Client report: the admin SEO fields for businesses, local areas and categories
were all empty. Correct — the previous change added the metadata builder, the
generated share cards and the business SEO fields, but wrote no data; public
page tags were composed from fallbacks. This entry records the data itself.

* `apps/api/scripts/seed-search-appearance.ts` (dev/test/e2e databases only,
  through the `seed-commons` guard) fills **empty fields only**, never an
  editor's value, from each record's own data. Result, verified by query in
  `adelaide_sphere_dev`: 174/174 businesses, 48/48 categories and 14/14 local
  areas have a title (≤ 60 chars), description (≤ 160), keywords (≤ 255) and a
  processed share image; 7/7 articles and the privacy, terms and review
  guidelines pages likewise; the six route entries (home, businesses, blog,
  FAQs, about, contact) in `website/seo` have title, description, keywords and
  image. No stored text states a count or a rating.
* Images: businesses use their first gallery photograph; categories their own
  image; articles their cover; policy pages and routes existing project
  photographs. Local areas had no photograph: 12 licence-checked Wikimedia
  Commons photographs were uploaded and processed by the worker, and set as
  both the area image and its share image.
* Local areas also had no introduction, which kept every area landing page
  `noindex` (`landingRobots`). Each now has a short introduction limited to
  established landmarks and streets.
* Web: the title template uses the full site name (`· Adelaide Sphere`, was
  `· Sphere`); stored route and policy titles leave the name out so it is not
  repeated.
* Wording defects caught in verification and regenerated: descriptions cut
  mid-sentence before a suffix, "Compare cafes listings", and doubled place
  names (a locality followed by the city name).
* Four categories (Cafes, Restaurants, Bars, Independent shops) had no
  description and were therefore `noindex`; each now has a one-sentence
  description of what the category holds. The home page title carries the site
  name (it is rendered without the template).
* Verified on the running site (curl as a crawler user agent): title,
  description, keywords, robots, canonical and `og:image` present and matching
  the stored values on the home, businesses, business detail, category, area,
  blog, about, contact, FAQs and privacy pages; an area share image answers
  200 `image/webp`.
* Known limits: several category photographs are generic stock rather than
  local scenes (e.g. Shopping, Restaurants), so their share images are
  equally generic; blog categories and tags have no SEO columns and use
  composed text with a generated card; services have no public page.

## 13 September 2026 — Search appearance for blog categories

Client request: blog categories had no Search appearance and no SEO data.

* Additive migration `20260913120000_blog_category_search_appearance`:
  `seoTitle`, `seoDescription`, `seoKeywords`, `ogImageMediaId` (FK restrict)
  on `blog_categories`, applied to the local dev database; migration policy
  check passes. The test database has not been migrated.
* API: the term input accepts the four fields for categories and refuses them
  for tags with a field error; a share image must be a processed asset. The
  admin term and the public `GET /blog-categories` expose them (public share
  image as its largest rendition). The image counts as a media use
  (`blogCategoryShareImageOf`), so the library blocks its deletion and the
  retention task keeps it; the media screen links it to the category.
  Contracts regenerated.
* Admin: the blog category editor has a Search appearance section (title,
  meta description, keywords, share image); tags do not.
* Web: `/blog/category/[slug]` uses the stored values and share image, each
  falling back to the composed text.
* Data: `seed-search-appearance.ts` now fills blog categories too (empty
  fields only), written from the articles each category holds, with one of its
  own article covers as the share image: 3 of 3 updated.
* Checks: API, admin and web `tsc` clean; eslint/oxlint clean on changed files.
  No test suites run. Note: "City guides" landing content is still the
  placeholder-like "Our guides." and should be rewritten by an editor.

## 13 September 2026 — robots.txt and sitemap coverage

Client request: "generate robots.txt and sitemap.xml". Both already existed as
dynamic routes (`app/robots.ts`, `app/sitemap.xml/route.ts`,
`app/sitemaps/[section]/route.ts` over `GET /seo/sitemap/:section`); the audit
found coverage gaps and one SRS deviation rather than missing files.

* Pages section now also lists `/` and `/business` (when a listing is
  published) and `/faqs` (only while a question is published — it answers 404
  otherwise), with last-modified times from the newest published row.
* Blog categories are listed once they hold a published article, the same rule
  their page applies; they previously required landing content, so two
  indexable categories were missing from the sitemap.
* Tag pages now follow SRS BLOG 005 — `noindex` unless the tag has landing
  content and at least one article (the page indexed any tag with articles),
  matching the sitemap rule that already existed.
* robots.txt: the non-standard `Host:` line is removed. `/og/` is deliberately
  not disallowed: Twitterbot honours robots.txt and would lose share cards.
* Verified: API sections return the new entries (pages: `/privacy`,
  `/review-guidelines`, `/terms`, `/`, `/business`, `/faqs`, `/about`,
  `/contact`; taxonomies include all three blog categories); robots.txt served
  without `Host`; tag pages without landing content render `noindex, follow`.
  `seo.integration-spec.ts` expectations updated, not run.

## 13 September 2026 — Enquiry handling: Start, Close and Reopen

Client question: what Start and Close do. They set the handling status — the
team's workflow (`new`, `inProgress`, `closed`) — which is separate from email
delivery (SRS ENQ 004/006). Defects found: a closed enquiry was offered
"Start" (which silently reopened it), Close had no confirmation and did not
warn that closing never confirms delivery, and the API accepted any change,
including a change to the same status and a return to `new`.

* One rule, `packages/domain/src/enquiry-handling.ts`: new → in progress or
  closed; in progress → closed; closed → in progress (Reopen). The API refuses
  anything else with 409 `INVALID_TRANSITION` (after the version check); the
  admin renders exactly the allowed actions from the same table.
* Admin: buttons "Start handling", "Close", "Reopen" with a description tooltip
  and the subject in the accessible name; Close asks first and says so when
  delivery is not confirmed; buttons are locked while a change is in flight; a
  refused change reloads the list.
* Checks: domain, API and admin `tsc` clean; eslint/oxlint clean; the built rule
  checked for all nine from→to pairs. New `enquiry-handling.spec.ts`; admin test
  labels updated. No suites run.

## 14 September 2026 — WordPress-style navigation menus (SRS 1.9, MENU 001–006)

Client instruction: manage the Primary, Secondary and Footer menus from the admin the way WordPress does — drag and drop, parent/child, custom links, icons, and lists of pages, posts and categories to add from. Client choices: the secondary menu sits on the right of the contact strip; the footer is one menu whose top-level items are columns, plus a separate footer-bottom location for the policies; primary goes to three levels; mobile uses a slide-in drawer.

* **SRS.** Recorded as revision 1.9: UX 002 amended (its items become the shipped defaults), new MENU 001–006 in section 26, section 14 entity rows, T17 and the section 26 acceptance extended. `docs/ai/srs-index.md` refreshed.
* **Domain** (`packages/domain/src/menus.ts`, subpath `/menus`): the four locations and their depth/count caps, limits (20 menus, 60 items, field lengths), item kinds, a 32-icon library, `validateMenuTree` (cycles, orphans, order, depth against the strictest assigned location, caps, required fields, icons) and `validateMenuLink` (ALRT 005 rules plus one `mailto:` address and a `tel:` number).
* **Database.** Migration `20260914120000_website_menus`, additive: `menus`, `menu_locations` (location primary key; the four rows inserted by the migration; menu reference RESTRICT) and `menu_items` (self-parent CASCADE, typed nullable foreign keys to pages, posts, blog categories/tags, categories, areas and businesses, all SET NULL so a deleted record leaves a "Missing" item). Applied to dev. Integration harness truncation list extended.
* **API** (`apps/api/src/website/menu*.ts`). Whole-tree save in one transaction (version claim inside the transaction, reference existence check, level-by-level insert, activity record, `menus` purge when assigned); location assignment validated against the location's rules, primary cannot be cleared, assigned menus cannot be deleted; `link-sources` for the admin panels under the menu permission only (published businesses only); public `GET /site/menus` resolved by the pure `menu-resolver.ts` (unpublished/scheduled/inactive/missing targets hidden with their subtree, empty headings dropped, FAQ route only while published). Permissions `website.menus.view|manage` seeded; `menus` registered in the cache manager; contracts regenerated (nullable DTO fields needed an explicit `type: String` or the generated types became `Record<string, never>`).
* **Seed.** `pnpm --filter api menus:seed` (idempotent, never replaces an assignment) created Main navigation (Home, Businesses, Blog, About, Contact, "Add a business" as a button), Footer (Local areas ×6, Categories ×6, Information) and Footer legal (the three policy pages) on dev — the public header and footer render exactly what they did before. Deployment order: `migrate deploy` → `admin:seed-rbac` → `menus:seed`.
* **Admin** (`pages/website/menus/`, dnd-kit 6.3.1/10.0.0/3.2.2): content panels with most recent / view all / search and checkboxes, custom link and heading panel, nested sortable tree with horizontal-drag nesting clamped to the location depth, screen-reader announcements, WordPress Move links, per-item fields (label, URL, title attribute, description, icon, link/button style, new tab, nofollow), state badges, client-side validation mirroring the API, 409 reload alert, unsaved-changes guard, read-only mode, Manage locations tab.
* **Web** (`components/navigation/*`): disclosure dropdowns and level-3 flyouts (parent stays a link, separate `aria-expanded` button, Escape returns focus, CSS fallback without JavaScript), modal `<dialog>` drawer with accordions, secondary links in the strip, footer columns and legal row; `fetchMenus` tagged with every linked content tag and falling back to product routes only. `header-nav.tsx` removed.

**Decisions and conflicts.** Secondary is one level (a dropdown in a strip that scrolls away would open under the pinned header). The item cap of 60 keeps a worst-case whole-tree save inside the 64 KB body limit. **Behaviour change:** a newly published page no longer appears in the footer automatically. Existing gap noted, not changed: `TaxonomyService` emits no cache purge, so category/area changes reach menus at the 300 s expiry.

**Verification.** `tsc`/eslint/oxlint clean in domain, API, admin, web and e2e; `db:migrations:check` and `contracts:check` pass. Runtime: public menus shape and `max-age=300`; anonymous admin 401 and origin-less writes 403; seeded header, footer columns and legal links identical to the previous navigation; with a temporary nested menu written directly to dev (then restored and deleted): dropdown and third-level flyout render and position correctly, active trail marked, draft page absent, Tab traversal into submenus, Escape closes the innermost menu and returns focus; drawer at 375 and 320 px (modal, background scroll locked, current branch expanded, no horizontal overflow, focus returns on close). The browser pane's automated Enter/Space produced trusted key events but no synthesised click, so button activation by keyboard is covered by the new Playwright journey rather than this pass. **Not verified in the browser:** the admin Menus screen, which needs an administrator sign-in. Tests written, not run: `menus.spec.ts`, `menu-resolver.spec.ts`, `menus.integration-spec.ts`, admin `menu-tree.test.ts`, web `active-trail.test.ts` and rewritten `site-header.test.tsx`, e2e drawer/submenu journeys.

## 14 September 2026 — Articles, slice A0–A1: body images protected, editor fixes and plain language

Client request: make articles easy for a non-technical writer and help the blog grow. The plan (easy writing A0–A7, growth B1–B8, SRS 1.10 before B1 ships) is in the session plan; this record covers the first two slices.

**A0 — defect: images inside rich text could be deleted (MED 004, DAT 003).** The editor inserted library images by URL only. `MEDIA_USAGE_RELATIONS` listed covers, share images and the like but nothing inside a body, so the media library offered to delete an image a published article showed, and the worker's `media.retention` task would have removed it once past the unused-image window. The same applied to page bodies, author bios, FAQ answers and blog category/tag landing text.

* One table rather than one per resource: migration `20260914150000_content_media_references` (resource type, resource id, media id; media FK RESTRICT). `apps/api/src/media/content-media.ts` `syncContentMedia` runs inside the save transaction of articles, pages, author bios, FAQs and blog categories/tags; deletions of pages and FAQs clear their rows.
* `extractMediaIds` (`packages/domain/src/media-usage.ts`) reads `data-media-id` and, for content inserted earlier, the rendition address (`media/<assetId>/…`). `bodyReferences` joined the shared usage list, so the library's delete refusal, its "unused" filter and the retention task all see these uses; the media detail page names the record ("… (inside the article)") and links FAQs and blog tags.
* The editor now writes `data-media-id`; the sanitiser keeps it only when it is id-shaped.
* `pnpm --filter api media:backfill-content [--dry-run]` recorded 2 references in 1 article on dev and found **no stored content pointing at a missing image** — nothing had been lost here. Run it on every environment after the migration, before the next retention run.

**A1 — editor bugs and wording.**
* Fixed: "Article restoreed" (messages from a map); choosing or removing a featured/share image no longer saves the whole form (it previews immediately and saves with the article); "Discard changes" restores the saved article in place, body included (`RichTextEditor` `resetKey`); "Remove link" removes the link.
* Formatting no longer vanishes silently: the sanitiser maps `s`/`strike`→`del`, `b`→`strong`, `i`→`em`, `h1`→`h2`, `h5`/`h6`→`h4`; the underline shortcut is disabled (underline reads as a link and has no published style).
* A taken article address now suggests the next free one ("Try “best-cafes-2”").
* Plain language: Summary (was Excerpt), Title/Description in search results (was SEO title/Meta description), Image description (was "Caption or alt override"), Heading/Subheading/Minor heading, "Note about this change" (was the audit-log reason), no "Markdown", "sanitises", "slug" or "301" in the editor or list; the unused Keywords field is hidden (it becomes the focus phrase of the SEO helper); "incomplete" became "Not ready to publish".
* Deferred to A3: the date-picker replacement (the existing schedule test types into the native field).

**Checks.** `tsc`/eslint/oxlint clean in domain, database, API, admin and worker; `db:migrations:check`; migration applied to dev; contracts regenerated (media usage kinds `faq`, `blogTag`); compiled sanitiser checked for the tag mapping and `data-media-id` handling; `extractMediaIds` checked against rendition URLs and plain-text mentions. Tests written, not run: domain `media-usage.spec.ts`, `sanitise.spec.ts` (formatting mapping, media id), `media.integration-spec.ts` (an article's body image is in use, not unused, and freed when removed from the text); `Blog.test.tsx` wording updated. **Not verified in the browser:** the admin editor, which needs an administrator sign-in.

## 14 September 2026 — Articles, slices A2 and B1: live checklist, save-then-publish, auto summary, one scheduled publisher (SRS 1.10)

**A2.** The publication rules moved to `packages/domain/src/posts.ts` (subpath `/posts`): transitions, the six requirements as a checklist `{code, field, met, message}` with counts ("Write at least 200 characters in the article — 143 so far"), schedule rules and `deriveExcerpt`. `apps/api/src/blog/post-rules.ts` adapts them to stored rows, so API and admin apply identical rules in identical words.
* Editor: a live "Ready to publish / Not ready to publish" checklist in the Publishing card (`aria-live`, icon plus text, unmet items focus their field); the server-only "Not ready" banner is gone. Publish/Schedule save unsaved edits first (`persist()` → transition with the saved version), also from a brand-new article; a refusal after saving keeps the dialog and refreshes the saved version in place. Writers without `posts.publish` see a plain note instead of silently missing buttons.
* An empty summary is written from the opening text on create, and when emptied on edit; the editor says so after saving.

**B1.** Two publishers used to run: the API's 60-second timer and the worker task, recording publication differently (the worker skipped the version, `firstPublishedAt`, `scheduledAt` and the audit entry). `ScheduledPublishingService` and `BlogService.publishDueScheduled` are removed; the worker's `content.publish-scheduled` now runs every minute, re-checks the requirements, publishes under the version guard with `firstPublishedAt`, audit and cache invalidation, and returns an article that no longer qualifies to draft with `posts.publishFailure` (migration `20260914160000_post_publish_failure`, cleared by any later transition). The editor shows the reason, the list marks "Couldn’t publish on schedule", and the dashboard adds "Scheduled articles that could not publish". **Operational consequence:** scheduled articles need the worker running (already a documented requirement).

**SRS 1.10** recorded (BLOG 002 amended, plus the A0 defect fix noted); index refreshed.

**Checks.** `tsc` and eslint/oxlint clean in domain, worker, API and admin; migration applied to dev; contracts regenerated (`publishFailure`); compiled rules checked for summary boundaries and messages. Tests written, not run: `packages/domain/src/posts.spec.ts`, worker `scheduled-tasks.spec.ts` (publish, refuse to draft, concurrent change, plain-text count), `post-rules.spec.ts` and `blog.integration-spec.ts` expectations (new wording, summary derivation, address suggestion, `publishFailure` cleared on reschedule). Not verified in the browser: the admin editor (administrator sign-in needed).

**Next slices:** A3 layout and date picker → A7 my author profile → A5 preview → A4 autosave and revisions → A6 images/links/embeds → B2–B8.

## 14 September 2026 — Articles, slice A3: WordPress-style editor layout

The article editor (`apps/admin/src/pages/blog/PostEditorPage.tsx`) is split into a writing column and sidebar boxes under `pages/blog/editor/`:
* **Writing column:** a large borderless title, the web address line under it, the text editor (older Markdown articles get a plain notice with "Switch to the normal editor"), the summary (its placeholder shows the summary that would be written automatically), then a folded **Search results and sharing** panel (`SearchSharingPanel`: search preview, title/description with length meters, share image and social preview; rendered while folded so previews stay current) and the saved-version preview.
* **Sidebar:** `PublishBox` (status, scheduled/first-published dates, live checklist, comments switch, change note once published, Save draft / Update, Publish and Schedule, and Unpublish/Archive under "More"), `DetailsBox` (category, tags with **"Add tag “…”" inline**, author, and a link to create an author when none exist) and `FeaturedImageBox` (library or **in-place upload** through `MediaField`, image description first).
* **Responsive order** (`.as-post-editor` grid): at ≥ 1200 px writing beside the boxes; below that Publish and Details come *before* the writing and the images after it, so the buttons and required choices are never scrolled out of reach.
* Publish/Schedule moved from the page header into the Publish box; the header keeps All articles and View on site.
* **Schedule picker:** antd `DatePicker` (typed `YYYY-MM-DD HH:mm` or calendar, 5-minute steps, past days disabled) holding the Adelaide wall-clock time independent of the browser's zone, with a sentence confirming the exact time and offset (ACST/ACDT).
* Image choices go through `MediaField` inside the form, so the earlier preview-override state is gone; "Discard changes" remounts the pickers and the editor.
* Copy-length rule: three over-long hints shortened (editor summary, link dialog, Menus page). **Pre-existing** over-limit descriptions remain in `DashboardPage.tsx`, `SiteSettingsPage.tsx` (two), `BusinessEditorPage.tsx` and `PageCreatePage.tsx` — `copy-length.test.ts` will flag them; not changed here.

**Checks.** Admin `tsc` and eslint clean; the running Vite dev server compiled every new module. `Blog.test.tsx` schedule step updated for the calendar picker (types the value and confirms). Not run: admin tests. **Not verified in the browser** (administrator sign-in needed): layout at 1440/992/320 px, inline tag creation, upload in place, the date picker.

## 14 September 2026 — Articles, slice A7: my default author profile

Authors stay public profiles separate from logins (BLOG 001), but a writer no longer has to pick themselves on every article.
* Migration `20260914170000_admin_default_author`: `admin_users.defaultAuthorId` (nullable, FK to `authors` SET NULL, indexed).
* API: `GET /admin/authors/mine` and `PUT /admin/authors/mine {authorId|null}` under `posts.write`, declared before `:id`. Only the signed-in administrator's own preference changes, so no `expectedVersion` is asked for (nobody else can edit it); unknown or inactive authors are refused with a field error; each change writes `blog.author.default.set`. The link is on the administrator record and appears in no public or author response.
* Admin: a new article pre-selects the default author when it is active; under the Author field the Details box says "Your default author for new articles" or offers "Use this author for all my new articles". Deviation from the plan: the control lives next to the author choice rather than on the account page, where writers actually make that choice.
* SRS 1.10 extended to BLOG 001 (same revision, same day); index refreshed.

**Checks.** API and admin `tsc`/lint clean; migration applied to dev; contracts regenerated. Test written, not run: `authors.integration-spec.ts` default-author case. Not verified in the browser (sign-in needed).

## 14 September 2026 — Articles, slice A5: preview before publishing

**In the editor.** A "Preview" button in the Publish box opens a drawer showing what is typed right now, saved or not. `POST /admin/posts/preview-render` (`posts.write`, `no-store, private`, `noindex`) runs the content through the same sanitiser and summary rule a save uses and stores nothing; the drawer shows category, title, summary (noting when it was written automatically), byline, reading time, the processed featured image and the body. The old "Preview of the last save" card is gone.

**On the website.** "Open on the website" saves outstanding edits (a new article then moves to its own page), asks `POST /admin/posts/:id/preview-link` for a private link and opens it in a new tab. The token is 32 random URL-safe characters in Redis for ten minutes, bound to the editor's session; the public `GET /preview/posts/:token` answers the draft only while the token exists and that session is neither revoked nor expired, and one identical 404 otherwise (archived articles excluded). Headers: `no-store, private`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`. The web route `/preview/article/[token]` is dynamic, noindex/nofollow with a no-referrer meta, carries a "Preview — not published" banner, and is disallowed in `robots.txt`.

**One article design.** `apps/web/src/components/article-view.tsx` now holds the article header, body and sidebar, used by both `/blog/[slug]` (which keeps JSON-LD, related articles and comments) and the preview (which hides share links and shows "Publishes when you publish it"), so the preview is the real page rather than an imitation.

**Configuration.** `apps/admin/.env.example` gains `VITE_PUBLIC_SITE_ORIGIN` (the public site's origin for opening previews; unset in production, where the admin is under `/admin/` on the site's origin). For local use set it to `http://localhost:4000` in the admin's own env file.

**BLOG 003** is met as recorded in SRS 1.10's scope for this programme: authenticated, short-lived, noindex, private no-store, unauthenticated draft lookups still 404.

**Checks.** API, admin and web `tsc` (web with route typegen) and lint clean; contracts regenerated; Vite compiled the editor modules. Runtime: unknown token → 404 from API and web with the three headers; anonymous `preview-render` → 401; `robots.txt` disallows `/preview/`; `/blog/fitzroy-on-foot` still renders fully after the refactor (header, body, sidebar, comments). `Blog.test.tsx` updated to open the drawer and assert the rendered request (not run). **Not verified:** the drawer and a working preview link in the browser, which need an administrator sign-in.

## 14 September 2026 — Articles, slice A4: autosave and version history

**Autosave.** While there are unsaved changes the editor keeps two copies: this browser's (`localStorage`, every 2 s, `apps/admin/src/shared/postDrafts.ts`; the only copy for an article never saved) and, for an existing article, a private server copy every 20 s (`PUT /admin/posts/:id/autosave`, table `post_autosaves`, one row per article per administrator). Neither touches the article, its version or its revisions, and writes are not audited; the save bar says when a copy was kept, or that it is kept only in the browser if the server could not be reached. An explicit save or "Discard changes" clears both; discarding the server copy is audited. Signing out clears every browser copy. Autosave routes are not metered by the sensitive-mutation ceiling (it is opt-in), so an hour of writing cannot exhaust the per-administrator limit.

**Recovery.** Opening an article (or a new one) with a copy newer than the saved article and different from it shows "You have unsaved changes from …" with Restore / Discard, and warns when the article was saved since the copy began.

**History.** A version is now kept whenever a save changes the title or text — drafts included, not only published articles — and always on published edits, with the editable source, format and summary (`content_revisions.bodySource/bodyFormat/excerpt`), capped at the latest 50 per article. The Publish box's **History** opens a drawer listing versions (when, who, note); choosing one shows a word-by-word comparison of title, summary and text with what is in the editor now (`diff` 9.0.0; removed text struck through, added text underlined, both labelled for screen readers). **Restore this version** (`POST /admin/posts/:id/revisions/:revisionId/restore` with `expectedVersion`) keeps the current text as a version first, re-sanitises the restored text, refreshes a published article's pages, clears the writer's autosave and is audited. Revisions from before this change restore from their HTML.

**Migration** `20260914180000_post_autosave_and_revision_source` (additive; applied to dev). Integration harness truncates `post_autosaves`.

**Checks.** API and admin `tsc`/lint clean; contracts regenerated; Vite compiled the new modules; anonymous calls to the autosave and revision routes refused (401, and 403 without a trusted origin). Integration test written, not run (autosave keeps the version, private per administrator, a draft save keeps a version and clears the autosave, stale restore 409, restore keeps the current text as a version, audited). Not verified in the browser (sign-in needed).

## 14 September 2026 — Articles, slice A6: images, tables, links, videos, maps and business cards

**Images.** The editor's **Add an image** (toolbar, or dropping/pasting a picture into the text) opens one dialog: the image description comes first and is required; the picture is uploaded there with progress and waits for processing (or is chosen from the media library); an optional caption and Normal / Full width size are set before inserting. The result is a `<figure class="as-figure[ as-figure--wide]">` with `data-media-id`, so the image counts as in use (A0). Selecting an image shows **Image settings** and **Remove**. Nodes: `apps/admin/src/components/editor/nodes.ts` (`ArticleFigure`), dialog `editor/InsertImageDialog.tsx`.

**Tables, links, paste.** Inside a table a second toolbar offers add/remove row and column, header row and delete table. The link box (toolbar or Ctrl/Cmd+K) has **Find on this site**: articles, pages, businesses, business categories, local areas and blog categories by name, via new `GET /api/v1/admin/editor/link-sources` (`posts.write`, reuses `MenuLinkSourcesService`; 401 anonymous). HTML pasted from Word or Google Docs is tidied (styles, classes, fonts, spans, Office tags, comments) and the writer is told once.

**Videos, maps, business cards.** `packages/domain/src/embeds.ts` (`@adelaide-sphere/domain/embeds`) reads YouTube watch/youtu.be/shorts/embed links and Google Maps "Embed a map" HTML or address, and explains what to paste for share links; a title is required. The body stores an inert marker `<div class="as-embed" data-embed="youtube|map|business" …>`, never an iframe. The sanitiser keeps a marker only when its id, map address (`https://www.google.com/maps/embed?pb=` + token) or business id validates; any other `div` is unwrapped with its text kept. Business cards are resolved on each public read: `PublicPostDto.businesses` lists only **published** businesses referenced by the body, so an unpublished business's card disappears when the article's pages refresh (≤ 60 s revalidate) — the planned `post_businesses` table was not needed. On the site `components/article-body.tsx` splits the body, re-checks each marker, and `embed-placeholder.tsx` shows a placeholder that loads nothing from Google until **Play video** / **Show map** (youtube-nocookie, reserved aspect ratio, titled frame) or the reader's "Always load videos and maps" choice (`localStorage` `as.consent.embeds`, this browser only).

**No migration.** Contracts regenerated (`PublicEmbeddedBusinessDto`, editor link-sources path).

**Checks.** API, admin and web `tsc`/eslint clean; the compiled sanitiser keeps figure classes and valid markers and drops invalid markers, handlers and iframes; the running API refuses the new route anonymously and returns `businesses` on articles; the public article renders unchanged with no console errors. Tests written, not run: `packages/domain/src/embeds.spec.ts`, `sanitise.spec.ts` figure/marker cases, web `article-body.test.ts`. Not verified in the browser editor (sign-in needed), and no article with an embed exists yet to check the placeholder at 320 px.

## 14 September 2026 — Articles, slices B2 and B5: crawlable blog pages and RSS feed

**B2 Crawlable pagination.** `robots.ts` no longer disallows `/blog?`, so numbered blog pages can be crawled (searches, `?q=` and tracking parameters stay disallowed). `apps/web/src/lib/pagination.ts` (`readPageParam`, `pagedPath`, `pagedTitle`, `isPastLastPage`) is shared by the blog index, category and tag pages: page 1 (including `?page=1` and malformed values) is canonical on the plain address; later pages are self-canonical with "— page N" in the title; a page past the last is not found. The blog index now also shows numbered page links under the articles, because the scroll loader removes its own "More articles" link once it hydrates.

**Known behaviour.** Category and tag pages past the last return HTTP 404. The blog index has a `loading.tsx` skeleton, so its response is already streaming when the check runs: Next.js then sends 200 with the not-found page and `<meta name="robots" content="noindex">` (documented in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`, "Status Codes"). Search engines do not index it; removing the skeleton would give a hard 404 if ever required.

**B5 RSS.** `GET /blog/feed.xml` (`app/blog/feed.xml/route.ts`, `lib/rss.ts`): RSS 2.0 with the newest 20 published articles — title, canonical link and permalink guid, RFC 822 date, author display name, category and summary (never the full text) — with an atom self link, `application/rss+xml`, a five-minute public cache, and XML-escaped text with forbidden control characters removed. Every page advertises it with `<link rel="alternate" type="application/rss+xml">` (root layout and `pageMetadata`). `fetchPosts` accepts `pageSize`.

**Checks.** Web `tsc`/eslint clean. At runtime: robots without `/blog?`; the feed returns 200 with the right headers, validates with `xmllint` and lists the 6 published articles; `/blog?page=1` canonical is `/blog`; `/blog/category/city-guides?page=5` is 404 and `/blog?page=999` is the noindex not-found page; the feed link is in the head of the index and an article. Tests written, not run: `lib/pagination.test.ts`, `lib/rss.test.ts`. No category yet has more than one page, so a self-canonical page 2 was checked only by reading the code.

## 14 September 2026 — Articles, slice B3: table of contents

**What.** An article with three or more sections and subsections (h2/h3) shows **In this article**: a card at the top of the sticky sidebar from `lg`, and a folded `<details>` block above the text on smaller screens (only one is displayed at a time). Links are plain anchors, so it works without JavaScript; subsections are nested under their section; a linked heading lands below the sticky header (`scroll-margin-top`), with smooth scrolling only when reduced motion is not requested. Files: `apps/web/src/lib/headings.ts` (`articleOutline`, `SECTION_ID_PREFIX`), `components/article-toc.tsx`, `components/article-view.tsx` (shared by the article and its preview), `components/article-body.tsx` (`body` prop), `globals.css` (`.as-toc`).

**Change from the plan.** Section ids are added when the page is rendered, not stored by the sanitiser, so there is no `blog:rerender` command, no body rewrite, no backup step and nothing to migrate: every existing article and every preview gets anchors immediately. Ids are `section-<slug>`, unique per article, and never collide with the page's own ids (the sanitiser keeps no `id` attributes, and any found are replaced).

**Checks.** Web `tsc`/eslint clean. On `/blog/fitzroy-on-foot` the four h2 headings carry `section-…` ids and both contents lists link to them; checked in the browser at 1440 px (sidebar card) and 375 px (folded block, no horizontal scroll, link lands below the header). Tests written, not run: `lib/headings.test.ts` outline cases (order, nesting levels, duplicates, stripped ids, empty headings).

## 14 September 2026 — Articles, slice B4: blog search

**Search.** `/blog/search?q=…` (`apps/web/src/app/blog/search/page.tsx`) finds published articles whose title, summary or text contain every searched word (prefix match, so "galler" finds "galleries"), most relevant first and newest first among equals. The page is `noindex, follow`; the result count is announced (`role="status"`); results are paged like the rest of the blog (a page past the last is a 404); with no query or no match it suggests the blog categories. A plain GET search form (`components/blog-search-form.tsx`, works without JavaScript) sits on the search page and in the blog index header. `robots.ts` already keeps `?q=` out of crawling.

**API.** The public `GET /api/v1/posts?q=` now uses MySQL FULLTEXT in boolean mode. `apps/api/src/blog/search-query.ts` reduces what was typed to words of letters and digits (no boolean operator or quote can reach the query), drops words under 3 characters and InnoDB's default stopwords (a required stopword would match nothing), caps it at 8 words and requires each as `+word*`; the string is a bound parameter. MySQL ranks up to 500 candidates, category/tag filters apply to those, and only the requested page is loaded. When nothing indexable is left (e.g. "St"), titles and summaries are matched directly, as before. No contract change.

**Data.** Migration `20260914190000_post_search_text` (additive; applied to dev): `posts.searchText` (plain text of the sanitised body, never rendered) and FULLTEXT index `posts_search_idx` on title, excerpt and searchText. The API writes `searchText` whenever the body is saved (create, update, restore). Existing articles: `pnpm --filter api blog:backfill-search-text [--dry-run]` (`src/cli/backfill-search-text.ts`; idempotent, leaves `updatedAt` and the version alone, one audit entry). The backfill is a command rather than SQL in the migration because `REGEXP_REPLACE` over long bodies can hit MySQL's regex time limit. Run on dev: 7 of 7 updated, a second dry run 0. **Deployments must run it once after the migration.** Seed scripts that insert posts directly leave `searchText` null until the next save or backfill; those articles are still found by title and summary.

**Checks.** API `tsc`/oxlint and web `tsc`/eslint clean. At runtime: "galleries" (body only) → 1, "Gertrude galler" → 1, "tram" → 5 ranked, operator and injection-looking input → 0 without error, stopwords only → title/summary fallback, "St" → fallback matches, category filter combined with search, web search page 200 with and without a query, past-the-end 404, `noindex, follow`, search form on `/blog`; browser at 375 px with results and with no match (no horizontal scroll). Tests written, not run: `search-query.spec.ts`, web `blog-search.test.ts`. No integration test yet against real FULLTEXT.

## 15 September 2026 — Articles, slice B6: featured articles and search advice

**Featured articles.** A publisher can feature a published article from the editor's Publish box ("Feature on the home page"; disabled while there are unsaved edits, since featuring is a separate, versioned action). At most three are featured at once (`MAX_FEATURED_POSTS`, `@adelaide-sphere/domain/posts`). `POST /api/v1/admin/posts/:id/feature` and `/unfeature` (`posts.publish`, `expectedVersion`, 409 `STALE_VERSION`/`INVALID_STATE`, 409 `FEATURED_LIMIT` naming the featured articles) lock the featured rows while the limit is checked, bump the version, refresh the post caches and are audited (`blog.post.feature` / `blog.post.unfeature`). Unpublishing or archiving clears it. The article list shows a "Featured" pill. Public `GET /api/v1/posts?featured=true` lists them, most recently featured first. The home page's blog band leads with featured articles, then the newest not already shown; page 1 of `/blog` shows an "Editor's picks" band and leaves those articles out of its own list. Both treat the featured list as optional: if it cannot be read, the latest articles still show.

**Search advice.** The Search results and sharing panel now has a visible **Focus phrase** (stored in the existing `seoKeywords`) and a **Search advice** list (`apps/admin/src/pages/blog/editor/seoChecks.ts`), worked out in the browser as the writer types: focus phrase in the title, summary, opening and web address (whole words, ignoring case, accents and punctuation; the search title and description are checked when set); length (300 words); headings once the text is long; image descriptions; links to other pages on the site; share of sentences over 25 words. Advice only — it never blocks saving or publishing.

**Migration** `20260914200000_post_featured` (additive; applied to dev): `posts.featuredAt` and index `posts_featuredAt_idx`.

**Checks.** API, admin and web `tsc`; API oxlint, admin and web eslint clean; contracts regenerated. The API was checked on a temporary instance of the compiled build (port 3099, stopped afterwards): anonymous feature/unfeature 401; `featured=yes` 400; with one article featured directly in the dev database, `featured=true` returned exactly it while the unfiltered list kept all 6; the value was cleared again. **Not yet checked at runtime:** the home page and `/blog` picks band (the API watch process on port 4001 had stopped serving, see below), the feature limit and concurrency (integration test not written), and the admin switch, pill and advice list in the browser (sign-in needed). Tests written, not run: admin `seoChecks.test.ts`.

**Environment note.** During this slice the user-started `nest start --watch` (API, port 4001) stopped listening, most likely after a recompile while the domain package was being rebuilt. The compiled build starts cleanly, so restarting that watch process restores it; it was left for the user to restart.

## 15 September 2026 — Articles, slice B7 (author pages) and two-level comment replies (client instruction)

**Author pages (SRS 1.10 BLOG 005 amended).** `/blog/author/[slug]` (`apps/web/src/app/blog/author/[slug]/page.tsx`) shows the author's published profile — photo, role, pronouns, location, bio, topics, links — and their articles, newest first, 12 per page (later pages self-canonical, past the last 404). It exists only for an active author with at least one published article (`GET /api/v1/authors/:slug`, `BlogPublicService.author`, 404 otherwise), so there is never an empty archive; nothing private is returned (no public email field, no admin link). `ProfilePage` + `Person` JSON-LD and breadcrumbs; the editorial sitemap lists author pages. `GET /api/v1/posts?author=<slug>` filters articles. Every public author object now carries `profilePath` (null for an inactive author); the article byline and author card link to it ("More articles by …"), and the article's `BlogPosting` author URL points at it.

**Comment replies (SRS 1.10 COM 001–002 amended; two levels, as the client asked).** A reader can reply to an approved comment from the article page (Reply opens a form under the thread, focused, with Cancel); replying to a reply adds to the same thread, so conversations never nest deeper than one indent (`replyParentId`, `@adelaide-sphere/domain`). Replies are moderated exactly like comments and use the same limits, captcha, honeypot and acknowledgement; the API checks that the target is an approved comment on the same published, open article. The public list pages top-level comments (20 per page, oldest first) with their approved replies; a reply is hidden, and not counted, while the comment it answers is not approved. Moderators can **Reply as the Adelaide Sphere team** (`POST /api/v1/admin/comments/:id/reply`, `comments.moderate`): published at once under "Adelaide Sphere team" with a Team badge, the writing administrator recorded privately (`authorAdminId`) and audited (`comment.staff_reply`). The moderation list shows what each comment replies to and marks team replies. No notification emails are sent.

**Migration** `20260915090000_comment_replies` (additive; applied to dev): `comments.parentId` (cascade with its parent), `staff`, `authorAdminId` (set null if the administrator is deleted), index `(parentId, status, createdAt)`; the visitor contact and acknowledgement columns become nullable, for team replies only — the API still requires them for every visitor comment.

**Checks.** API `tsc`/oxlint, worker `tsc`, admin `tsc`/eslint, web `tsc`/eslint clean; contracts regenerated; the web post fixture gained `profilePath`. Runtime: author page 200 with 6 articles, unknown author and page 9 → 404, canonical, `ProfilePage` JSON-LD, 375 px without horizontal scroll; API sitemap lists the author page; `posts?author=` 6; anonymous team reply 401. With temporary rows in the dev database (removed afterwards): a team reply nests under its comment in the API and on the article page with the Team badge; rejecting the parent hides the reply and the count drops from 6 to 4; the article byline links to the author page. The B6 check left open earlier was completed the same way: `/blog` shows Editor's picks without repeating the article, and the home page leads with it. Tests written, not run: domain `comments.spec.ts`. Not verified: the reply form submission in the browser (needs a real Turnstile token) and the admin Reply dialog (sign-in needed).

## 15 September 2026 — Articles, slice B8: blog analytics events behind consent (programme complete)

**What is counted.** Eight events, from a fixed list (`apps/web/src/lib/track.ts` `ANALYTICS_EVENTS`): `share` (network), `copy_link`, `article_read_75` (article slug, once per page view), `related_click` and `business_card_click` (link path), `toc_click` (section id), `embed_load` (youtube or map), `blog_search` (result count only — never the words searched for).

**How.** `track()` sends nothing unless the visitor has accepted analytics (`as.consent.analytics` = accepted), and then only to Google Analytics (`gtag`) or Tag Manager (`dataLayer`) if one is on the page; nothing goes to the Meta pixel. Parameters are cleaned: simple names, at most 8, short strings without `@` or `?`, finite numbers. Failures are swallowed so analytics can never affect the page (NFR 012). Server components stay server-rendered: they carry `data-track="<event>"` markers (table of contents, related articles, business cards, share links) and one client component in the layout (`components/analytics-events.tsx`) listens for link clicks inside them and measures reading depth on `[data-track-read]` (the article body; absent on private previews). Copy link and video/map loads call `track` directly; the search page uses `TrackOnView`. Reading depth keeps checking until an event is actually sent, so a reader who accepts part-way through is still counted once.

**Checks.** Web `tsc`/eslint clean. In the browser on `/blog/fitzroy-on-foot` with a stub `gtag` and navigation blocked: no consent → nothing sent; consent accepted → `toc_click {section}`, `related_click {link_path}`, `share {method: email}`; scrolling through the article → exactly one `article_read_75 {article: fitzroy-on-foot}`; no Google or Meta scripts were loaded; consent and stub removed afterwards. A first attempt exposed that reading depth stopped listening before consent existed; fixed as above. Tests written, not run: `lib/track.test.ts`. Not verified in the browser: `copy_link` (clipboard permission in the pane), `embed_load` (no article has an embed yet) and `blog_search` (needs the stub before hydration).

**For the client.** The privacy notice (an editor-managed page) should say that, with consent, the blog counts shares, reading to 75%, clicks on related articles, business cards and the table of contents, video and map loads, and the number of search results.

**Articles programme.** A0–A7 and B1–B8 are complete. Outstanding: the admin browser pass (sign-in needed), the written-but-unrun test suites, running `blog:backfill-search-text` on each environment, and the integration tests noted in traceability.

## 15 September 2026 — Review fixes: navigation menus and the articles programme

A read-only review of the menus and articles work (three reviewers: menus; articles API; articles admin and web) found 42 items. Fixed:

**Menus.**
- The site header keeps its built-in navigation while no primary menu is assigned (before `menus:seed`); previously it rendered empty.
- Tree errors without a field of their own (place, heading without children, deleted target) are listed on the item card.
- A click on a submenu that hover had just opened no longer closes it.
- Custom links are stored in their validated, normalised form.
- `save` re-reads where the menu is shown after locking it; `assignLocation` locks the menu and re-validates its items inside the transaction; `menus:seed` validates an existing menu and assigns only an empty, unchanged location.
- A top bar holding only the secondary menu is hidden below `md`.
- The drawer re-opens the current page's branch after client-side navigation.
- Removed the unused `buildMenuTree`/`flattenMenuTree`; typed `titled` and the controller's source states.

**Articles, API.**
- One plain-text conversion (`htmlToPlainText`, `@adelaide-sphere/domain`) for the API and the worker: block elements are word breaks and entities are decoded, so search text, derived summaries and the 200-character rule agree. Re-run `blog:backfill-search-text` after deploying.
- A reply (visitor or team) must belong to a shown thread.
- Comment moderation, redaction and team replies, published article edits, and author edits and activation now purge the web cache (`comments`, `comments:<post>`, `post:<slug>`, new `author:<slug>`).
- `restoreRevision` checks the version before recording the revision (409, not a duplicate-key error).
- No preview link for an archived article.
- One `visibleCommentsWhere` shared by the count and the list.
- The preview key prefix is shared.
- Unused domain exports were removed and stale docs corrected.

**Articles, admin.**
- Restoring a version replaces the text on screen.
- Reloads never overwrite unsaved edits.
- A published article's address cannot be changed while there are unsaved edits.
- Switching an old article to the rich editor counts as an edit.
- The action dialog cannot be submitted twice.
- Embeds may only sit at the top level of the document.
- The image dialog no longer leaks object URLs and uses the right rendition when an existing image changes size.
- Live regions announce the publish headline, not every keystroke.

**Articles, web.**
- "Show more comments" loads further pages of threads (20 each).
- Analytics never load or send on `/preview/*` (the address carries the token).
- Reading depth is also checked when the page opens.
- The comment email hint is linked to its field.
- Embed markers are checked with the domain rules.
- Removed the unused dark share-links variant, duplicated grid and breadcrumb code, and a contradictory comment.

**Left as they are (recorded).**
- Menus duplication refactors: shared address/state helper for the resolver and link sources; one reference lookup; the icon map copied in admin and web.
- The unreachable "Missing" label in the sources panel.
- Double-submit protection for team replies beyond the dialog's loading state.
- The RSS alternate link declared in both the layout and `pageMetadata`, which are both needed.
- The preview-session finding was checked and is not a defect: links are bound to the creating session in the API.

**Checks.** Domain build; API `tsc` and oxlint; worker, admin and web `tsc`; admin and web eslint on every changed area — all clean. Dev runtime: API and public pages respond, and the search text was re-backfilled with the new conversion. Test suites still not run.

## 15 September 2026 — Adelaide map above the footer; testimonials off the public site (SRS 1.11)

**What.** Every public page shows an "Explore Adelaide" band above the footer with a Google map (`apps/web/src/components/site-map-band.tsx`, placed in `app/layout.tsx`). It reuses the article map placeholder (`embed-placeholder.tsx`, new `variant="band"`, wider reserved frame in `globals.css`), so nothing loads from Google until the visitor presses Show map or has chosen to always load maps and videos. Hidden on `/preview/*` (`components/hide-on-paths.tsx`). The home page's testimonials band and its fetch are removed and `testimonial-carousel.tsx` deleted; the admin Testimonials screen, API and records are unchanged.

**Setting.** General settings → "Map above the footer": paste Google Maps "Embed a map" HTML or its address (validated with `parseEmbedUrl`, maps only; `siteMapSrc` in the settings document, no migration). Empty shows the built-in Adelaide map (`DEFAULT_ADELAIDE_MAP_SRC`). The public settings payload always carries `siteMap { src, title }`; the site re-checks the source with `isSiteMapSrc` and falls back to the default.

**Checks.** Domain build; API `tsc` and oxlint; admin and web `tsc`/eslint clean; contracts regenerated (`PublicSiteMapDto`, `siteMapSrc`). Runtime: public settings carry the default Adelaide map; anonymous settings save 401; the band sits above the footer on `/`, `/business`, a business page, `/blog`, an article, `/about` and `/contact`, with no Google iframe in the HTML and no testimonials section; it is absent under `/preview/`. The 404 response renders without the site shell (no footer), so it has no band either. Browser at 375/768/1440 px: no horizontal scroll, frame height reserved (256/397/506 px) before and after loading; Show map is keyboard reachable, loads the Adelaide map (checked visually) and moves focus into it. Tests written, not run: `general-settings.spec.ts` (site map cases), `embeds.spec.ts` (`isSiteMapSrc`).

**Follow-up (15 Sep 2026, client instruction).** The map above the footer is now shown directly and edge to edge instead of behind "Show map": `site-map-band.tsx` renders the heading in the page container and a full-width `iframe` (`loading="lazy"`, height reserved by `.as-site-map`) straight above the footer. The browser therefore requests the map from Google when it scrolls into view, without a separate choice; the privacy notice should say so. The band variant of `embed-placeholder.tsx` was removed; article maps and videos stay click-to-load.

## 15 September 2026 — Published prices and paid guest posts (SRS 1.12)

**Prices.** Guest Post $39 one time and Business Listing $69 per year (AUD, inc. GST) are shown as two cards (`apps/web/src/components/pricing-plans.tsx`, `.as-pricing-card` in `globals.css`) in a "Simple, transparent pricing" band on the home page before the business call to action, and as "Plans and pricing" on the contact page. Each card links to `/contact?plan=…#contact-form`, which preselects the new "Business listing plan" or "Guest post" topic in the contact form (`initialTopic`). Nothing is paid on the site. The home call to action no longer says there is nothing to pay.

**Settings.** General settings → Pricing: show or hide prices; per plan name, price, billing period, summary and up to six points (`pricing` in the settings document; rules and defaults in `@adelaide-sphere/domain/pricing`). The public settings payload carries `pricing`.

**Guest posts.** Migration `20260915120000_post_guest_post` adds `posts.guestPost`. The editor's Details box has "Paid guest post"; the article list shows a Guest post pill. On the site the card and article carry a "Guest post" label, a disclosure precedes the text, and outbound links are `rel="sponsored …"` (applied when read, `sponsoredLinks`). Blog and About wording updated.

**Checks.** Migration `20260915120000_post_guest_post` applied to dev; domain build; API `tsc`/oxlint; worker, admin and web `tsc`; admin and web eslint; contracts regenerated (`PublicPricingDto`, `guestPost`). Runtime: public settings carry both plans ($39 one time, $69 per year, AUD, GST inclusive); anonymous settings save 401; the home pricing band precedes the call to action with both prices, "inc. GST" and the two `/contact?plan=…#contact-form` links, and the "nothing to pay" sentence is gone; the contact page shows the plans; `?plan=business-listing` and `?plan=guest-post` preselect their topics and an unknown plan preselects nothing. With one article flagged as a guest post in the dev database (reverted afterwards): the API returns the flag on the article and its card, and the site shows the Guest post label on the card and article and the disclosure line (the article has no outbound links, so the sponsored rewrite is covered by `sponsored-links.spec.ts` only). Browser: cards side by side at equal height at 1440 px and 768 px, stacked at 375 px, no horizontal scroll, 48 px buttons with a visible keyboard focus ring. Tests written, not run: `pricing.spec.ts`, `general-settings.spec.ts` (pricing), `sponsored-links.spec.ts`. Not verified: the admin Pricing section and guest post switch (sign-in needed).

**For the client.** The published Terms of Use still say "We do not charge a business to be listed" — edit it in Website → Pages; only the seed for new installations was changed.

**Follow-up (15 Sep 2026, client instruction) — contact page layout.** "How to reach us" and "Plans and pricing" now share the top row in two equal halves, with the contact form directly below the pricing in the same half-width column and the other sections unchanged on the left (`ProductPageLayout` gains an optional `split`; without it About and FAQs keep their layout). The pricing cards use a `compact` variant there (two up at `xl`, stacked at `lg`); the home page keeps the full-size cards. Checked in the browser: equal halves at 1440 px (632 px each, form below pricing) and 1024 px (cards stacked); reading order How to reach us → Plans and pricing → form → other sections at 768 and 375 px; no horizontal scroll; 48 px buttons; `?plan=guest-post` still preselects its topic; FAQs grid unchanged. Web `tsc`/eslint clean.

**Follow-up (15 Sep 2026, client instruction) — contact page halves swapped, form sticky.** "Plans and pricing" is now the left half and "How to reach us" the right half, with the contact form directly below it. The form stays in view while the page scrolls on every desktop (`AsideCard sticky="form"`: `lg:sticky lg:top-24`, static again while it shows an alert so no control is hidden); previously it only stuck on screens at least 58rem tall. Phones and tablets read Plans and pricing → How to reach us → form → other sections.

**Follow-up (15 Sep 2026, client instruction) — "How to reach us" at its own height.** The halves no longer stretch to equal height. In `ProductPageLayout`'s split mode the right column now holds "How to reach us" at its natural height with the contact form directly under it, spanning the full height so the sticky form stays in view while the left column (Plans and pricing, then the other sections) scrolls. Document order — pricing, how to reach us, form, other sections — is also the reading and keyboard order on narrow screens.

**Follow-up (15 Sep 2026, client instruction) — dark Clients and partners band.** The home page's "Clients and partners" band now uses the dark tone (`Band tone="dark"`, dark `SectionHeading`). `PartnerStrip` gains `tone="dark"`: translucent cards with white names and muted relationship labels, each logo on a small white tile so dark marks stay legible, and light-on-dark arrows, page dots and focus outline. Elsewhere the strip keeps its light styling.

**Follow-up (15 Sep 2026) — clearer permission selection in the admin.** The Editor role looked empty although it holds three permissions: three ticks among 66 entries were easy to miss, and two counters disagreed ("3 selected of 64 available" counted active permissions; "3 of 66 selected" also counted the two retired ones). `PermissionMatrix` (role editor and an administrator's direct permissions) now shows one counter — "N of 64 permissions selected", plus "+ N retired" when a role still carries a retired one — a "Selected" list at the top with a remove button per permission (hidden when read-only), and a "Show selected only" switch that combines with search. The duplicate counter on `RoleEditorPage` is gone. Admin `tsc`/eslint clean. Test written, not run: `pages/access/PermissionMatrix.test.tsx`. Not checked in the browser (admin sign-in needed).

## 15 September 2026 — Separate permissions per admin menu item, permission-based dashboard (SRS 1.13)

**Why.** One code opened several menu items (`settings.manage` covered General, Home page, SEO settings and Pages; `taxonomy.manage` three screens; `posts.write` four), so the client could not give SEO settings to one person and Home page settings to another.

**Catalogue.** `apps/api/src/identity/permissions.ts` now gives every sidebar item its own View code plus one code per action, with `module` (sidebar section), `menuItem` (sidebar label), `action` and `migratesFrom`. 119 active codes; eight retired (`settings.manage`, `taxonomy.manage`, `listings.write`, `posts.write`, `media.manage`, `redirects.manage`, `admins.manage`, `community.contacts.view`). Mapping in `docs/authorization.md` §2.

**Carry-over.** `IdentityService.seedRbac()` copies the old code's role and direct grants onto each new code the first time the code is created (audited `authz.permission.migrated`, role versions and `authzVersion` bumped). Dev database: first run created 63 codes and carried 86 grants; second run 0 and 0. No migration.

**API.** Every route retagged to its menu item's code; `@RequireAnyPermission` (guard, `AbilityFactory.allowsAny`) for shared lookups; `routes:matrix` shows any-of as `a | b` and flags `RETIRED(…)` (0 routes); `authz:verify` reports holders of an old code without a replacement. `directory.service` private-email visibility follows `listings.update`; the settings registry's website group uses `settings.general.*`.

**Dashboard.** `dashboard.service.ts` gates each widget by the View code of the screen it links to (reviews, comments, reports, enquiries, listings, posts, media, categories, areas, activity). Categories and Local areas figures no longer appear for `listings.read` alone. Scheduled articles, activity and breakdowns are `null` when not permitted; the page hides those sections and shows the no-permissions card only when nothing at all is visible. Contracts regenerated.

**Admin.** Sidebar and route map use the new View codes; screens open read-only without Update (taxonomy, blog categories and tags, media details, General/Home/SEO settings); buttons gated per code (Add/Invite, moderation Publish/Reject/Spam, Redact, Reply, Reveal per screen, enquiry retry, redirect switch/delete, page create/edit/delete/publish, article feature, menu locations, queue clean, administrator rename/status/sessions). Media pickers need `media.view` to choose and `media.upload` to upload. The role editor's permission matrix is now a grid: sidebar sections, a row per menu item, View/Create/Update/Publish/Delete columns plus named extras, row and section select-all, View ticked with any action; stacked on phones; retired codes shown only while held.

**Checks.** API and admin `tsc`; API oxlint; admin eslint; contracts regenerated; `admin:seed-rbac` twice; `routes:matrix` 0 retired or undeclared; `authz:verify` clean. Tests updated for the new codes (catalogue, guard, ability, integration fixtures, admin gating, matrix grid, dashboard nulls) but **not run**. Browser check of the admin not done in this session: it needs a signed-in administrator.

## 15 September 2026 — Activity log by area, grouped, as a timeline (SRS 1.14)

**Why.** After the 1.13 sync the log opened on 63 "Permission migrated" rows whose target read only "Permission", and one permission showed every area to anyone who held it.

**Access.** `audit.read` retired; seven `activity.<area>.view` codes (Configuration → Activity log row, carried over from `audit.read`: dev sync created 7 and copied 7 grants, second run 0). `audit/activity-scope.ts` builds the caller's scope once, as a Prisma `where` and as bound SQL; `AuditController` (`@RequireAnyPermission`) applies it to the list, the new `GET /admin/activity/summary` and group members, and refuses a `category` outside it (403). Dashboard recent activity uses the same scope. `activity.system.view` also covers unregistered domains.

**Grouping.** `grouped=true` groups in MySQL on action, actor and request id (or UTC minute when there is none), ordered by latest event; `groupKey` (base64url, validated, 400 when tampered) lists the members within the caller's scope. `actorAdminId=system` selects automatic events.

**Names.** `audit/activity-targets.ts` resolves readable names per page, one query per type, for non-private records (businesses, articles, pages, taxonomy, authors, media, redirects, menus, website content, roles, administrators, permissions; self-named ids such as settings keys and task codes). Reviews, comments, enquiries, abuse reports and email deliveries stay unnamed.

**Design.** `AuditLogPage.tsx` is a timeline: area chips (radio group with today's count per visible area), a search box that takes an action code or a request id, who (with "The system itself"), date range and an outcome segmented control (a bottom drawer on phones), removable filter tags, day headings (sticky), and rows as sentences — area icon tile, subject, verb, the record's name linked when the reader can open it, area and email caption, time, a ×count pill and outcome. Refused or failed events carry a red left rule and tint. Rows expand in place: a group lists its members twenty at a time, an event shows its detail with readable metadata labels, "Copy request id" and "Show everything from this request". "Show every event" turns grouping off. Components in `pages/activity/`; sentences, nouns, links and Adelaide day helpers in `shared/activity.ts`; styles `.as-activity-*` in `styles/global.css` with light and dark area tints. The dashboard's recent activity uses the same rows in compact form.

**Checks.** API `tsc`/oxlint; admin `tsc`/eslint; contracts regenerated; `admin:seed-rbac` twice; `authz:verify` clean; `routes:matrix` shows both activity routes as any-of. Runtime against the dev database through the compiled controller: grouped list with counts and names, group members, tampered key 400, content-only scope returns only content events, hidden area 403, summary counts per area. Tests updated for the retired code (not run). The signed-in browser check is still to do: the in-app browser has no administrator session.

**Follow-up (15 Sep 2026, client instruction) — expanded groups redesigned.** An opened group no longer repeats a full sentence, outcome and detail card for every event. `ActivityGroupMembers` states once what every event shares — count, recorded code, who, and each metadata value identical across the loaded events ("Copied from audit.read", "Roles given it 1") — in a summary strip under a left rail; each member is one 44 px line (`ActivityMemberRow`): time, the record's name (linked when openable) and its code, an outcome only when refused or failed, and a toggle only when the event holds something of its own (request id, address, reason or a differing value). Event details are now a grid of short facts (`.as-activity-facts`) with codes in monospace (`.as-activity-code`). Admin `tsc`/eslint clean.

## 15 September 2026 — Search appearance for blog tags (SRS 1.15)

Blog tags now have the same Search appearance section as blog categories: SEO title, meta description, keywords and share image. Migration `20260915150000_blog_tag_search_appearance` (additive, FK restrict) applied to dev; Prisma client rebuilt. API: tag create/update store the fields, the tag list returns the share image preview, the "categories only" refusal is gone, the public tags feed returns the fields and share image, and the media library lists a tag's share image as a use. Web: the tag page metadata uses them with the composed fallbacks; the indexing rule is unchanged. Admin: the editor shows the section for both kinds. Checks: migration policy, API/web/admin `tsc` and lint, contracts regenerated. Tests not run.

## 15 September 2026 — PDF documents for administrators (SRS 1.16)

**Rules.** PDF only, up to 20 MB (images stay at 10 MB), uploaded only with the new `media.documents.upload` permission. Nobody receives it automatically, and each upload permission is checked against the declared type. `documentRejectionReason` refuses non-PDF bytes, a type mismatch, incomplete files, encryption, scripts, launch actions, attachments, rich media and XML forms; the API checks at completion and the worker checks again.

**Scan and publish.** `apps/worker/src/clamav.ts` speaks clamd INSTREAM over TCP (no new dependency). A clean PDF is copied to the public bucket at a random key with `application/pdf`, `Content-Disposition: attachment; filename="<safe>"` and the immutable cache header, marked ready with page count, scan time and engine, and its quarantine copy deleted. An infected file is rejected and audited as `media.scan.infected` with the signature name only. If the scanner is missing or down, the job throws (the queue retries), the heartbeat records the state, and `media.documents.scan` (every five minutes) retries waiting documents. Retention now deletes a document's public copy too.

**Using documents.** Rich text: "Link a PDF document" in the editor toolbar opens `DocumentPickerDialog` (choose a ready document, or upload one and wait for the scan). The link carries `data-media-id` and `as-doc-link`, which the sanitiser now keeps on `a`, so the document counts as in use. Menus: a `document` item type and a Documents source panel; the public menu shows it only while the document is ready. The public site styles `.as-doc-link` with a file icon.

**Media library.** An Images / Documents switch (`?kind=document`). The Documents view has an upload card and a list with title, file name, size, pages, status (scanning, ready, or not accepted with the reason), "Linked in N", Copy link, Open and Delete, plus scanner and waiting notices. The document details page shows the title, public link with copy, file facts, scan result and where the document is linked. Image pickers now request images only. Fixed on the way: blog tag share images were missing from `MEDIA_USAGE_RELATIONS`, so retention could delete their files.

**Data and infrastructure.** Migration `20260915170000_media_documents` (additive) applied to dev, no drift. `clamav` service (`clamav/clamav-debian:1.4`, multi-architecture) added to `infrastructure/docker-compose.yml`; `CLAMAV_HOST`/`CLAMAV_PORT` in the worker env example. VPS guide: ClamAV container (section 6.8), worker env, media host `client_max_body_size 21m`, and `nosniff` plus `Content-Security-Policy: sandbox` on PDFs.

**Checks.** Migration policy and schema diff; domain, API, worker, admin and web `tsc`; oxlint and eslint; contracts regenerated; `admin:seed-rbac` created 1 code and carried 0 grants. Runtime against local MinIO and ClamAV 1.4.6: a clean PDF uploaded through the compiled service, scanned and published (HEAD 200, `application/pdf`, `attachment; filename="Price-list-2026.pdf"`, immutable); the EICAR test string detected as `Eicar-Test-Signature`; a PDF with `/JavaScript` and PNG bytes declared as PDF rejected; 21 MB refused (400); a missing title refused; each upload permission refused for the other kind (403). The sanitiser keeps a document link's id and class and drops other attributes, and usage extraction finds the id. Tests added (domain, sanitiser, ClamAV protocol, worker scan-and-publish, usage) but not run. Admin screens not yet checked in a signed-in browser. The local worker must be restarted to pick up `CLAMAV_HOST`.

**Follow-up (15 Sep 2026, client decision) — no virus scanning on the server.** The client will not run ClamAV (about 1.2 GB of RAM). Removed: `apps/worker/src/clamav.ts` and its spec, the worker's document branch, `CLAMAV_*` configuration, the `media.documents.scan` task, the scanner field in the worker heartbeat and liveness API, the Documents view's scanner notices, the picker's scan wait, the `clamav` Compose service (local container, volume and image removed), and the VPS and monitoring sections. The API now publishes a PDF as its upload completes (`MediaService.publishDocument`): the same structural checks, then one download copy with `Content-Disposition: attachment`, the quarantine copy removed, no worker job. Migration `20260915180000_media_documents_without_scan` drops the unused `scannedAt` and `scanEngine` columns (reviewed: added the same day, unreleased). Kept: the 20 MB limit, the separate permission, the refusal of scripts, launch actions, attachments, rich media, XML forms and encryption, download-only delivery, and the media host's `nosniff` and sandbox headers. SRS change-log row 1.16 records the accepted residual risk.


## 15 September 2026 — Go-live audit and production hardening

**Audit.** Three read-only reviews (API and worker; web and admin; deploy, infrastructure and secrets), each finding re-checked in the code. Already sound: one exception filter with generic 5xx text and no stacks, JSON-enveloped body-parser errors, default-deny permission guard covering every admin route, CSRF on mutations, httpOnly/Secure/SameSite=Strict session cookie, non-enumerating login, sanitiser allowlist, no unsafe raw SQL, uploads checked by content, server-only API origin, digest-only web error pages, no secrets in tracked files, production env validation. Verdict: not yet safe to go live (blockers in `docs/ai/current-state.md`).

**Fixed.** API: Prisma P2002/P2025/initialisation errors mapped to 409/404/503; 5xx logs record the route pattern (no query or preview token); readiness answers "Service not ready"; `enableShutdownHooks`; production listens on 127.0.0.1 (`HOST`); production refuses `OPENAPI_ENABLED`, a missing `METRICS_TOKEN` and `TRUST_PROXY=0`; Turnstile action must match; login throttle reset normalises the email. Worker: fixed stored sentences for media rejections and enquiry delivery errors, detail only in the log; fatal handlers for unhandled rejections and exceptions. Web: review, enquiry and comment forms map status and code to written copy and allow-list field messages; `/faqs` errors instead of 404 on an outage; sitemap and feed return 503 with `Retry-After`; business page tolerates a reviews failure; `SITE_NOINDEX` for staging. Admin: server and availability errors always use `DEFAULT_MESSAGES`; non-API error text never shown (media field, image dialog, sign-in); per-screen `RouteErrorBoundary`. Deploy script: encrypted pre-deploy backup via `backup-database.sh`, then `db:migrate:deploy` and status before switching; `APP_VERSION` written. VPS guide: Cloudflare real-IP and firewall script with weekly refresh, `limit_req` zones (search tighter), shared security-header snippet included in every header-setting location, enforced framing CSP plus report-only full CSP for site and admin, media host HSTS, static-only gzip, `NODE_ENV=production` in systemd units. Dependencies: multer 2.3.0 (platform-express 12.0.2 plus workspace override); CI audit ignores exactly the four accepted advisories listed in `docs/security/dependency-advisories.md`. `apps/web/.env.example` is now tracked (placeholders only); admin example documents `VITE_PUBLIC_SITE_URL`.

**Not changed, on purpose.** Search is not rate-limited inside the API: the web server renders search pages on visitors' behalf from one address, so a per-IP limit there would throttle the whole site; nginx limits it by real visitor IP instead. The Turnstile hostname check keeps accepting a missing hostname (test keys report `example.com`).

**Checks.** API, worker, web and admin `tsc` and lint; deploy script `bash -n`; runtime against the local API (malformed JSON 400, oversized 413, unknown route 404, no session 401, all generic with request ids; readiness OK) and web (`/`, `/faqs`, sitemap, robots). Tests updated for the new messages (health, env validation, worker delivery, admin HTTP client, sign-in, login); suites not run.

## 15 September 2026 — Pages stage 2: the page builder in the admin (change log 1.17)

**Editor.** `apps/admin/src/pages/website/editor/` replaces `StaticPageEditor` and the old create form. `PageEditor` serves both routes: title and address on top (the address follows the title on a new page until edited), then tabs for Content, Search & sharing (SEO title, description, keywords, share image, "Hide from search engines", and search advice from `seoChecks`, which now skips focus-phrase checks when none is given) and Page settings (sidebar for text-only pages, a note kept with the previous version). A new page starts from a template (Information, Service or landing, Policy, Blank); templates are arrangements of empty sections, and guidance lives in placeholders, never in saved content.

**Sections.** `SectionList` is an ordered outline: drag by the handle (pointer or keyboard, announced) or use Move up/down; hide, duplicate, remove with an Undo message; the page header is fixed at the top. `SectionFields` has plain-language forms for every type with character counts and examples: header (label, heading defaulting to the page title, introduction, picture, button), text and image-and-text (rich text editor), call to action (tone, main and second button), feature cards (icon, title, text, link; 2–6, reorderable), questions (reorderable, rich-text answers), businesses (search published businesses; ones since unpublished are flagged), contact (enquiry form switch). `ButtonField` sends a button to a site path, an https/mailto/tel address, or a PDF chosen or uploaded through the existing document picker. Policy pages offer only header, text, questions and contact. API validation errors land on the exact field and mark the section ("1 problem"), opening it and switching to its tab.

**Publish box.** Status, unsaved state, last saved and published times; a checklist that shows the API's blockers for the saved page and the shared section checks while editing; Create page / Save draft / Update page (disabled until something changes); Publish (waits for a save and a clean checklist); Unpublish with a confirmation and optional reason; View on site. The route remounts the editor per saved version, so a save or status change starts from the server's copy.

**API.** Single-page responses include `references` (thumbnail and alt text for section images, titles of linked documents, names and status of chosen businesses) so the editor can show what a section points at; the list leaves it empty. `CUSTOM_PAGE_PURPOSE` no longer says a page "joins the footer" (menus link pages since 1.9).

**List.** Status filter adds Scheduled; rows show when a scheduled page goes live, "Returned to draft", "Hidden from search engines", and a View on site action for published pages.

**Checks.** API `tsc`/oxlint; contracts regenerated (references now typed); admin `tsc`/eslint; admin dev server compiles every new module; runtime through the compiled service on a temporary page (references resolved on create and get, empty in the list; removed afterwards). Tests updated and added (`PagesPage.test.tsx`: section add, hide, move, remove and undo; policy page restrictions; section error placement); not run. Signed-in browser check outstanding: the in-app browser has no administrator session.

## 15 September 2026 — Pages stage 3: preview, autosave and version history (change log 1.17)

**Preview.** `POST /admin/pages/:slug/preview-link` (`website.pages.view`) issues a random 32-character token stored in Redis for ten minutes with the page id, the editor's session and administrator; `GET /preview/pages/:token` (public, `no-store, private`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`) answers only while that session is live, and every failure is the same 404. The preview shows the editor's own kept copy of unsaved changes when there is one (normalised and sanitised again), otherwise the saved page, through the same render model as the public page (`renderPublic`). Web: `app/preview/page/[token]` (force-dynamic, noindex, no-referrer, banner) renders `components/static-page-view.tsx`, now shared with `(pages)/[slug]` so a preview is exactly the public page. The admin opens it in a new tab after keeping a copy of what is typed; a page never saved cannot be previewed.

**Autosave.** `GET|PUT|DELETE /admin/pages/:slug/autosave` (`website.pages.update`) on `page_autosaves`, one private copy per page per administrator. It never changes the page, its version or its history; sections are normalised to the catalogue and rich text sanitised on the way in; saving the page deletes the saver's copy; discarding is audited (`settings.page.autosave.discard`). Admin: `usePageAutosave` keeps a copy every 15 seconds while there are changes and on demand before a preview, with a status line in the publish box; on opening a page with a kept copy the editor offers Restore or Discard, and says when the page was saved since.

**Version history.** `GET /admin/pages/:slug/revisions` and `/:revisionId` (`website.pages.view`), `POST …/restore` (`website.pages.update`, `expectedVersion`). Restore goes through the ordinary save — validated, sanitised, media and businesses checked, the replaced content kept as a version ("Before restoring version N"), a live page refreshed — and is audited (`settings.page.revision.restore`); search settings stay as they are. A version saved before sections reads as one text section. Admin: `PageRevisionsDrawer` lists versions with who and why, shows the sections of the chosen version and a word-by-word comparison of title and text with the editor. The comparison and text extraction moved to `components/TextComparison.tsx` and `shared/readableText.ts`, now used by the article history too.

**Body size.** Page and article content can exceed the global 64 KB JSON limit (a page holds up to 200 000 characters of formatted text). `/api/v1/admin/pages` and `/api/v1/admin/posts` now accept up to 1 MB (nginx's `client_max_body_size`); every other route keeps 64 KB.

**Checks.** API `tsc`/oxlint; contracts regenerated; admin `tsc`/eslint; web `next typegen`, `tsc`, eslint; admin dev server compiles the new modules; `/`, `/privacy`, `/terms` still 200. Runtime through the compiled services on a temporary page, cleaned up afterwards (17 checks): nested sections pass the global validation pipe; a version kept on save; version detail; autosave kept and sanitised without changing the page; preview link shape; preview shows the unsaved copy without the script; API preview 200 with no-store and noindex; web preview renders the banner and noindex meta; unknown tokens 404 on API and web; saving removes the kept copy; restore brings back title and text and keeps the replaced content; a stale restore is refused; autosave for an unknown page 404. Body limits against the running API: 100 KB page save reaches authentication (401), 100 KB contact submission 413, 1.1 MB page save 413. Admin tests added (recovery offer and restore, history list, no preview or history before first save); not run.

## 15 September 2026 — Pages stage 4: scheduling, address change, duplicate, unpublish reason (change log 1.17)

**Scheduling.** `POST /admin/pages/:slug/schedule` (`website.pages.publish`, `expectedVersion`, `scheduledAt` UTC) runs the same checks as publishing plus `scheduleBlockers` (a future time) and answers 409 `PUBLICATION_BLOCKED` with the list; `POST …/unschedule` returns a scheduled page to draft. Publishing or unpublishing clears any schedule and any earlier refusal. The worker's `content.publish-scheduled` task now also publishes due pages under a version guard, writing the `cache.invalidate` outbox event (`pages`, `page:<slug>`, `sitemap`, `menus`) and `settings.page.publish` audit; a page that no longer qualifies returns to draft with `publishFailure` and `settings.page.schedule_blocked`. The page publication rules moved to the domain package (`pageTextBlockers`, `pagePublicationBlockers`, `PAGE_MIN_BODY_CHARACTERS`) so the API and the worker judge a page identically; `apps/api/src/settings/static-pages.ts` delegates to them. Admin: Schedule / Change time / Unschedule in the publish box, a Adelaide-time date picker using the article helpers, and the scheduled time and any "returned to draft" reason shown.

**Address change.** `POST /admin/pages/:slug/address` (`website.pages.publish`) moves a custom page: the address rules of a new page, refusal of a taken address and of an address an active redirect already claims, and 409 `PAGE_IS_SYSTEM` for system pages. A published page records a permanent redirect from the old address (`RedirectsService.recordSlugChange`, resource type `static_page`) in the same transaction and purges `pages`, both page tags, `sitemap`, `redirects` and `menus`; menus link pages by id and follow. Audited as `settings.page.address.change`. Admin: "Change address" under the address (saved custom pages, publish permission, disabled while there are unsaved changes) opens a dialog that says whether a redirect will be left, then opens the page at its new address.

**Duplicate and unpublish.** `POST /admin/pages/:slug/duplicate` (`website.pages.create`) creates a draft through the ordinary create path (address rules, section, media and business checks) with the source's sections, layout and search settings except the SEO title; audited `settings.page.duplicate`. The list offers Duplicate with a title and address dialog and opens the copy. Unpublishing now requires a reason of at least three characters (`UnpublishStaticPageDto`); the confirmation's button stays disabled until one is given.

**Checks.** Domain build; API `tsc`/oxlint; contracts regenerated; worker `tsc`/lint and build; admin `tsc`/eslint; admin dev server compiles the new modules. Runtime through the compiled API and worker on temporary pages, cleaned up afterwards (14 checks): unpublish without a reason refused by the validation pipe; a past schedule refused; schedule and unschedule; the worker task published a due page ("Published 1 page") and queued its cache purge; a scheduled page that no longer qualified returned to draft with the reason; a system page, a reserved address and a taken address refused; a published page moved with an active permanent redirect, the public API serving the new address and 404 at the old; duplicate created a draft with the same sections; unpublish with a reason. Updated: `static-pages.integration-spec.ts` sends an unpublish reason; the worker spec's fake database has `staticPage`; article summary wording unchanged. Admin tests added (schedule sends a future Adelaide time with the loaded version; unpublish needs a reason; the address dialog explains the redirect and checks the address; duplicate from the list). Suites not run.

## 15 September 2026 — Pages stage 5: public design and search details (change log 1.17)

**Structured data.** Every information page, section-built or text-only, now carries `WebPage` JSON-LD (`webPageJsonLd` in `apps/web/src/lib/structured-data.ts`: name, description, last change, part of the site, published by the organisation), emitted from `components/static-page-view.tsx` so the public page and its preview agree. `FAQPage` is added when visible question sections exist, behind the same `FAQ_RICH_RESULTS` sign-off flag as the FAQ page (SRS 1.2 FAQ 005). Breadcrumbs were already emitted by both page headers; "hide from search engines" pages were already noindex and out of the sitemap (stage 1).

**Picture credits.** The public render model's section images now include the credit recorded on the media asset (`publicImages` reads `mediaAsset.credit`), and the header and image-and-text sections show "Photograph: …" under the picture when one exists, as licences such as CC BY require wherever the picture appears.

**Heading order.** One `h1` per page (the header section, or the standard title band); section headings are `h2`; feature card titles are `h3` under a section heading and become `h2` when the section has none, so no level is skipped.

**Task catalogue.** `content.publish-scheduled` is now "Publish scheduled articles and pages" with a description that covers both; the Queue Monitor test fixture was updated.

**Checks.** API `tsc`/oxlint; contracts regenerated (image credit typed); web `tsc`/eslint; admin and worker `tsc`. A temporary published page with header, cards, image and text, businesses, questions and a call to action (removed afterwards): server HTML has one `h1` followed only by `h2` headings, one `WebPage` block and no `FAQPage` (flag off). In the browser at 1440 px every section rendered, images loaded (200), no console errors and no horizontal overflow; at 390 px the header, cards, image and text, businesses, questions and call to action stack correctly with no horizontal overflow once the page's load-in motion settles. Suites not run.

## 15 September 2026 — Pages stage 6: SRS 1.17, documentation and journeys (change log 1.17)

**SRS.** Change-log row 1.17 records the client instruction and its effect on CFG 002, SEO 001/002/004/005 and SEC 001, with data, operations, security and test impact; the CFG 002 sentence that fixed a page's address is struck through and marked as amended in 1.17, as earlier amendments were. `docs/ai/srs-index.md` now names revision 1.17 with the new line count and checksum, points the pages area at the change log, and notes that line ranges below the change-log table have shifted.

**Traceability.** A row for page sections, preview, autosave, history, scheduling and address change (SRS 1.17) lists the modules and the per-stage runtime evidence; the 1.7 row's "address is fixed" remaining work is marked superseded.

**Client guide.** `docs/operations/editing-pages.md` explains, in plain language, sections and what each is for, creating a page from a template, reordering, hiding and undoing, the publish box and checklist, scheduling, unpublishing with a reason, preview, kept unsaved changes and version history, search and sharing including hiding from search engines, changing an address and what happens to the old one, duplicating, linking from menus, and which permission allows what.

**Journeys.** `e2e/specs/pages.spec.ts` (public, both projects): a published page has one `h1`, `WebPage` JSON-LD and no horizontal overflow; an unknown page and an invalid preview link are 404, and the preview API answers `no-store` and `noindex`. `e2e/specs/page-builder.spec.ts` (desktop, provisioned super administrator): create from the information template, publish, the page served on the site, change address with the old address redirecting (polled past the redirect cache), unpublish with the required reason, delete from the list. `provisioning.ts` gains `removeE2ePages`, which removes every `e2e-page-` page with its versions and redirects before and after the run. E2E `tsc` clean; journeys not run.

## 15 September 2026 — Functional review: admin, API, worker and public site fixes

The earlier go-live audit was security-focused and missed functional defects. This pass reviewed behaviour end to end and fixed what it found.

**Admin.** Table pagination works again (branding requested `/settings`, a 404; page clicks were written as sort changes; `useListParams.setSort`/`setMany` replace sequential `set` calls that overwrote each other, incl. Audit log and Reviews filters). Category, service and area pickers search the server (`TermSelect`, API `ids` and `topLevel` filters) instead of the first 50 terms, so new services appear on business edit; the parent-category picker likewise. FAQ, partner, testimonial and service-alert editors load by id (`GET /admin/<kind>/:id`) instead of searching the first 50 rows, and refuse to "save" a record they could not load. Role pickers and menus load every page; the document picker paginates; the featured-listing and testimonial linked-listing pickers search published businesses; Reviews and Enquiries name the filtered business. `/website/pages/new` now requires `website.pages.create`. The page builder opened new pages with every section collapsed (ids generated twice) and disabled "Move up" on the second section; both fixed. Permission checkboxes name their row ("Businesses: View").

**API and worker.** Cache purges added where edits left the public site stale: published business update and hours, media edits in use and galleries, category/service/area create/update/activate, blog term update/activate, review redaction. Business detail recomputes "open now" per request rather than caching it. Category facets count secondary categories. Blog search applies category/tag/author/featured inside the full-text query (pages were short or empty). Redirect list honours `isActive`; stable ordering ties on id. Idempotency fingerprints ignore the single-use captcha token and honeypot, so a retry after a failed challenge is not refused. `METRICS_TOKEN` was validated but dropped from the config (never applied). Media retention reports real delete counts and failures.

**Public site.** Moved information pages redirect (middleware now runs on `/:slug`). Business pages offer "Show more reviews" beyond the first ten. "Open now" counts as a filter (noindex, chip). Lazy lists never repeat a card; featured listings show on page 1 only. Review and enquiry forms send one request per press; the comment form explains a reused submission.

**Tests.** Stale tests from the 1.13–1.17 work realigned without weakening them; jsdom `<dialog>` stand-in added. Focused runs (user-authorised): admin 21 files 130/130; web 5 files 38/38 (+5 new more-reviews, +open-now coverage); API specs for changed services 14 files 118/118; env validation 46/46; worker scheduled tasks 16/16. `tsc` and lint clean in admin, web, API and worker; contracts regenerated. Runtime (temporary session, revoked): `topLevel` returns 7 of 48 categories, all top-level; the four website editors load by id; business by id 200; `/business?openNow=1` shows the chip. Not verified with data: redirect `isActive` filter and single-segment page redirect (no redirects in the dev database). Full suites, integration and Playwright remain for the release gate.

**Deliberately unchanged.** `robots.txt` still disallows `/business?` (listings are in the sitemap); a page number past the end shows a "past the end" message. Category facets do not yet roll child counts up into parents.

## 15 September 2026 — Release gate on `release/2026-09-go-live`

**Commits.** With the user's go-ahead, the uncommitted work (SRS 1.13–1.17, Pages, production hardening, the functional review) was committed on the branch `release/2026-09-go-live` in layered commits (database and domain, API and worker, admin, web and e2e, deploy/CI/docs), followed by the gate fixes below. Nothing pushed. A secret scan of the changes found only placeholder fixtures.

**Real defects found by the gate and fixed.**
- `scheduledTaskIntervalMinutes` read `* * * * *` as daily, so worker liveness would have taken two days to flag a stopped scheduled-publishing task (`packages/domain/src/scheduled-tasks.ts`).
- TipTap's `setEditable` emits an update by default: every page or article with rich text opened as "unsaved", so Publish and Change address stayed disabled (`apps/admin/src/components/RichTextEditor.tsx`).
- Earlier in the day (functional review): page builder opened new pages with sections collapsed and disabled "Move up" on the second section; `/website/pages/new` needed only view permission.

**Gate policy change (user decision).** The admin bundle budget summed every lazy chunk while describing it as first load. `apps/admin/scripts/check-bundle-budget.mjs` now follows `index.html` and static imports (first-load cap 1.8 MB; 1.60 MB now), keeps the 1.1 MB entry cap (879 kB) and raises the all-chunks cap from 2.6 to 3.2 MB (2.88 MB now) for the 1.13–1.17 screens.

**Stale tests realigned (no weakening).** API integration: 14 (1.13 permission codes and modules, 1.10 comment replies and summaries to the last whole sentence, 1.14 activity fields, null dashboard sections without permission, 1.17 version on every save, author pages in the sitemap, secondary categories in facets matching the filter, stale menu location saves 409). Browser: moderator fixture holds the 1.13 view codes (a missing code now fails provisioning), menu-and-action checkbox names, the axe scan waits for eager images and finished fade-in animations (contrast was measured mid-fade; theme tokens pass AA). Domain: media usage relations for 1.16.

**Skips.** The browser runner fails on any skip. The seed (`e2e/scripts/seed-public-fixtures.mjs`) now adds a published information page and a primary menu with a submenu, and the page-builder journey is excluded from the 320 px project in `playwright.config.ts` instead of skipping itself.

**Results.** Lint and typecheck clean; unit: database 27, API 330, admin 329, web 256, domain 95, mail 38, worker 51 all passing; API e2e 19; all builds; bundle budget; contracts in sync; integration: API 316/316, database 5/5. Browser (`pnpm test:browser`, own database and ports): 75 expected, 0 unexpected, 0 skipped, 0 flaky at desktop and 320 px, exit 0. Every step of `pnpm verify:release` is green.

## 15 September 2026 — Deploys register new permissions

On a server upgraded to this release the Super Admin saw only the menu items whose codes predate change log 1.13 (Businesses, Enquiries, Roles, Permissions, Website, Security, System); Categories, Articles, Media, Reviews, Pages, Settings, Administrators and the rest were hidden and refused. Permission codes are declared in code and reach the database only through `IdentityService.seedRbac()` (`admin:seed-rbac`); no migration adds them and `scripts/deploy-vps.sh` never ran it. Locally both Super Admins receive all 126 active codes from `/admin/auth/me`. The deploy script now runs `node dist/cli/bootstrap-admin.js --seed-only` with the application environment immediately after migrating. The seed is idempotent: it upserts the catalogue, carries grants from replaced codes on the run that creates a code, retires undeclared codes, grants Super Admin every active permission and bumps `authzVersion` so open sessions pick it up. Servers already upgraded need the command run once by hand.

## 15 September 2026 — Local setup

The local development environment was set up on 15 Sep 2026 with its own infrastructure and identifiers and a fresh empty database.

- **Cleaned:** `node_modules`, build output, `.next`, `tsbuildinfo`, the Prisma generated client and Playwright results. Reinstalled with `pnpm install --frozen-lockfile`; the lockfile is unchanged.
- **Local stack:**
  - Compose project `adelaide-sphere`, including containers, volumes, edge and monitoring projects, and Prometheus jobs.
  - Host ports: MySQL 3317, Redis 6390, Adminer 8092, MinIO 9020/9021, Mailpit 1035/8035, Grafana 9501.
  - App ports: web 4000, API 4001, admin 4002, set in the scripts, Vite config, API env defaults, web defaults, Playwright, e2e scripts, the load tool, API vitest configs and fixtures, `launch.json`, and the specs asserting those defaults.
  - Databases `adelaide_sphere_dev` / `_dev_shadow` / `_test`, user `adelaide_sphere`, buckets `adelaide-sphere-media` / `-quarantine`.
  - Browser-test container names, CI database names, deploy root `/srv/adelaide-sphere`, and the root package name.
- **Secrets:** every local env file has fresh random values: MySQL root and app, Redis, MinIO, `APP_SECRET_KEY`, `FIELD_ENCRYPTION_KEY`, `METRICS_TOKEN`, the metrics-token file. Turnstile keys are left empty (keys are domain-bound), so public forms show as closed. Local mail is sent from `noreply@adelaidesphere.local`.
- **Data:**
  - All 52 migrations applied to dev and test.
  - Seeded: `admin:seed-rbac` (136 permissions), `pages:seed`, `menus:seed`.
  - Super Admin `admin@adelaidesphere.local` created with an unseen random password; use the reset flow.
  - Taxonomy and content were seeded later the same day (entries below).
- **Verified:**
  - `pnpm typecheck` and `pnpm lint` exit 0.
  - The Compose stack is healthy; no other project's containers were touched.
  - `/api/v1/health/ready` returns 200 with database and Redis ok.
  - Web `/` and `/privacy` return 200; admin `/admin/` returns 200, and its proxy reaches the API (401 on a protected route).
  - Both buckets created.
  - No test suites run.

## 15 September 2026 — Adelaide branding and the Australian-flag theme

At the user's instruction, the public brand is **Adelaide Sphere**, the theme uses the Australian flag's colours, and the logo keeps the same design.

- **Logo:** same artwork. The original globe (the Australian flag on a map of Australia) is kept pixel-for-pixel. The wordmark and tagline are re-set as "AdelaideSphere / YOUR GUIDE TO LOCAL ADELAIDE" in the original colours and layout.
  - Files: `apps/web/public/Adelaide_Sphere_{Light,Dark}_Logo.png` (2172×724, as before) and `apps/admin/public/brand-logo-{light,dark}.png` (transparent, as before). The previous logo files are removed; the favicon is unchanged.
  - Built with sharp in Avenir Next Heavy/Bold. The build script is not tracked. Replace the files if a designer supplies vector artwork.
- **Palette:** Commonwealth blue #012169, flag red #E4002B (#C8102E where text must pass AA) and white.
  - Public tokens (`packages/ui/src/styles.css`): `navy-*` and the bands are flag blue, `sky-*` are the blues (actions and links #0B3AA4), and `teal-*`/`gold-*` are the reds. The token names are kept, so no component classes changed.
  - Also updated: gradients in `apps/web/src/app/globals.css`, the admin theme (`apps/admin/src/config/theme.ts`, light and dark), `apps/admin/src/styles/global.css`, `apps/admin/src/layouts/auth-screen.css`, the email layout, the OG image, the hero overlay and the admin previews.
  - Every pair that `apps/web/src/lib/palette.test.ts` and `apps/admin/src/config/theme.test.ts` assert was computed against the new values before applying them: 0 failures. White on the blue→red gradient stays at least 5.9:1. The focus ring stays amber in the admin, because red fails 3:1 on navy.
  - Categorical colours (KPI accents, activity icons, chart series, status) are unchanged.
- **Copy:** the site name is "Adelaide Sphere", placeholder and fixture domains use adelaidesphere, and user-facing city copy is Adelaide / South Australia.
  - Also changed: `site/context` city/state/boundary (Adelaide, SA, City of Adelaide council area baseline), structured data `areaServed` Adelaide SA, and the default footer map `DEFAULT_ADELAIDE_MAP_SRC`.
  - Also changed: the TOTP issuer, the OpenAPI title (contracts regenerated), and the policy seed copy plus the two seeded dev policy pages (updated in place).
  - Tests asserting the changed strings were updated to the same strings; none was loosened.
- **Left for the later entries below (all completed on 15 Sep 2026):** timezone, photography, the local-area seed and content scripts, the state in the directions link, the earliest trading-year rule, the favicon location dot, and the package scope and queue name.
- **Verified:**
  - `pnpm typecheck` and `pnpm lint` exit 0; the only warnings are existing ones in `packages/domain/src/media.ts`.
  - Contracts regenerated.
  - Browser: web header and footer logo, hero, buttons and bands in flag colours; admin sign-in and shell.
  - No test suites run.

## 15 September 2026 — Timezone switched to Australia/Adelaide

At the user's instruction, the platform timezone is **Australia/Adelaide**: ACST, UTC+9:30; ACDT, UTC+10:30 during daylight saving. Daylight saving starts on the first Sunday in October and ends on the first Sunday in April.

- **Code:**
  - API wall-clock conversion renamed to `apps/api/src/directory/hours/adelaide-time.ts` (`ADELAIDE_TZ`, `adelaideMinuteKey`). The conversion probes offsets from the zone rules, with no hard-coded offset, so its logic is unchanged.
  - Used for opening hours, "open now" and its cache key, dashboard day buckets (`adelaideDay`), and `site/context` (`timezone: Australia/Adelaide`).
  - Every scheduled task's `timezone` and "Daily at 03:10 Adelaide time"-style labels. The worker passes `tz` to BullMQ.
  - Admin schedule pickers and date helpers (`adelaideLocalToUtc`, `utcToAdelaideLocal`, `adelaideOffsetLabel` showing ACST/ACDT, `adelaideDayKey`, `adelaideTime`, `formatDateTime`).
  - Web helpers (`adelaideToday`, `adelaideYear`, article, review and page dates).
  - Enquiry email "(Adelaide time)", API descriptions (contracts regenerated) and schema comments.
- **Tests:**
  - Every assertion pinned to the previous offsets keeps its local wall-clock scenario, with the UTC instant recomputed for Adelaide's offsets. This covers `adelaide-time.spec`, `hours-rules.spec`, `dashboard-trend.spec`, `alert-rules.spec`, `Blog.test`, `activity.test`, web `hours.test` and `share.test`, and `blog.integration-spec`.
  - All 39 recomputed values were checked by executing the real API functions (tsx) and `Intl` for the admin/web helpers, not by running the suites: 0 failures.
  - `app.e2e-spec` now expects the Adelaide `site/context`; it had been left expecting the previous city and state by the branding change.
- **Data:** nothing to migrate.
  - Opening hours are stored as wall-clock minutes, so they now mean Adelaide time.
  - The dev database holds no scheduled posts or pages, and no scheduled-task state.
  - Redis holds no BullMQ repeat schedules, because the worker has not run in this stack.
- **Verified:**
  - `pnpm typecheck` and `pnpm lint` exit 0; `pnpm contracts:generate` done.
  - `site/context` returns Australia/Adelaide after restarting the API.
  - No test suites run. Recommend `pnpm test` and `pnpm test:integration` before the next gate, since many time assertions changed.

## 15 September 2026 — Adelaide location model, artwork, photography and package rename

This work follows the user's choices: coverage is **Inner Adelaide**; photos come from Wikimedia Commons, with downloads approved; the globe's location dot moves to Adelaide; and the internal packages are renamed now.

- **Coverage:**
  - `apps/api/src/taxonomy/seed-data.ts` now holds 108 gazetted localities in the City of Adelaide and the Norwood Payneham & St Peters, Unley, Prospect, Walkerville, Burnside and West Torrens council areas.
  - Each locality records its council; localities shared with a council outside the seven are marked "part".
  - Seeded into the dev database with `taxonomy:seed`: 108 areas, 9 categories, 3 services.
  - `site/context` describes the Inner Adelaide boundary. Pending client decision D01.
  - Research notes: Keswick's council split is disputed between sources (listed under West Torrens). Postcodes were cross-checked against a secondary listing because Australia Post's site was unreachable. Cleland is mostly national park.
- **Address rules:**
  - Postcodes must be South Australian (`^5\d{3}$`), in the API DTO and the admin form.
  - Coordinates are bounded to South Australia (latitude −38.1 to −26, longitude 129 to 141). The admin placeholders are Adelaide's.
  - Directions links and the public address line use `SA`.
  - The earliest trading year is 1836, Adelaide's proclamation.
  - Tests that create businesses now use Adelaide addresses (5000/5067, CBD coordinates), with matching validation messages.
- **Artwork:**
  - The globe's location dot now sits on Adelaide in the favicon (512 px), both web logos and both admin logos. The original dot is lifted and re-placed, and the old spot is inpainted from the surrounding map.
  - `favicon.ico`, which was still an older "M" icon, was rebuilt from the globe at 16/32/48 px.
  - The web image-optimiser cache was cleared so the new logos are served.
- **Photography:** five Wikimedia Commons originals (about 39 MB) were downloaded after the user's approval, cropped, and re-encoded as WebP with metadata removed:
  - hero: `adelaide-river-torrens` (Yu Chu Chin, CC BY-SA 4.0) and `adelaide-oval-footbridge` (Luke Anderson, CC BY-SA 2.0);
  - About: `adelaide-skyline-torrens` (Yu Chu Chin), `adelaide-leigh-street` and `adelaide-central-market` (Pangalau), all CC BY-SA 4.0.
  - Captions and credits are in the code; sources are recorded in `docs/content/hero-photography.md` and `about-photography.md`.
  - The five previous image files were removed.
- **Package rename:**
  - The workspace scope became `@adelaide-sphere/*` across 211 files (code, config, lockfile, scripts, READMEs, runbooks), followed by a forced relink.
  - The BullMQ queue became `adelaide-sphere`, and the enquiry Message-ID domain became `@adelaide-sphere`.
  - Runbook production paths, buckets, nginx site and Prometheus job names were updated.
  - Not changed: applied migrations (checksums). The SRS, the historical records, the deploy identifiers and the repository URL were updated on 16 Sep 2026 (see that entry).
  - The dev Redis may still hold empty metadata keys under the previous queue name; they are unused.
- **Verified:**
  - `pnpm contracts:generate`, `pnpm typecheck` and `pnpm lint` exit 0.
  - The API, web and admin servers were restarted on the renamed packages.
  - No test suites run. Recommend `pnpm test` and `pnpm test:integration`, because fixtures, validation messages, time assertions and package names changed.

## 15 September 2026 — Adelaide demonstration content

This work follows the user's choices. Wikimedia Commons downloads are allowed under CC0, public domain, CC BY and CC BY-SA. The full set was built first; the home banner keeps its two bundled photographs. The user then asked to keep only 20 businesses and to remove unused services, local areas and categories.

- **Content, written fresh for Adelaide by parallel authoring passes, each checked for former-city leftovers and type-checked:**
  - `business-seed-content.ts`: 20 fictional Inner Adelaide businesses with real streets and SA postcodes, and phones in the reserved `(08) 5550` range.
    - Four names were changed because real businesses already used them: Railway Terrace Fish Market, Hyde Park Flower Room, Half Loaf Bakehouse and Kentish Dental. The slugs are unchanged.
  - `blog-seed-content.ts`: six original Adelaide articles:
    - the East End;
    - Central Market;
    - trams;
    - the Botanic Garden;
    - The Parade, Norwood;
    - North Adelaide on foot.
  - `website-seed-content.ts`: 22 FAQs, 11 testimonials, 8 invented partner organisations and 28 comments.
  - `trade-seed-content.ts`: Adelaide suburbs and streets.
  - `seed-search-appearance.ts`: Adelaide SEO copy and verified area photographs.
- **Pipeline:**
  - `PERMITTED_LICENCE` in `seed-commons.ts` now accepts CC BY-SA (never NC or ND). The Commons user agent is now `AdelaideSphere-dev-seed`.
  - The worker has a dev launch entry on port 4003 (`WORKER_METRICS_PORT`, loopback).
  - The web-tier purge is wired locally: `REVALIDATE_TOKEN` for the web app and `WEB_REVALIDATE_URL`/`WEB_REVALIDATE_TOKEN` for the worker, in ignored env files. Before this, the web fetch cache kept serving empty lists after seeding.
- **Seeded:** trade listings (40 categories), businesses, service synonyms, blog and website content, then a partial gallery top-up. Commons rate limiting (HTTP 429) made the run take about 1.5 hours. The hand-written listings need `taxonomy:seed` categories to exist; Pets & Vets is now a starter category.
- **Reduced at the user's request, in one transaction on `adelaide_sphere_dev`:**
  - The 151 trade listings were deleted, with their reviews, hours, links and services.
  - Unused categories (48 → 10), local areas (108 → 16) and services (259 → 48) were removed.
  - 592 unreferenced media assets were deleted, and their 2,359 stored objects removed from local MinIO.
  - The API cache namespace was bumped.
  - Result: 20 published businesses, 55 approved reviews, 6 articles, and 115 media assets before search appearance.
- **Seed files kept in sync:**
  - `BASELINE_LOCAL_AREAS` holds the 16 localities in use. The full 108-locality research stays in this file's earlier record.
  - `STARTER_CATEGORIES` gains Pets & Vets.
  - `seed-trades.ts` requires `--include-trade-listings`.
  - `AREA_PHOTOS` holds only the kept areas.
  - Seeding order on a fresh database: `taxonomy:seed`, `seed-businesses`, `seed-service-synonyms`, `seed-blog`, `seed-website-content`, `seed-search-appearance`.
- **Not run:** `seed-hero-slides.ts` (the user kept the bundled banner) and the test suites.

## 15 September 2026 — Footer menu rebuilt with all three columns

`menus:seed` builds the footer from the data present when it runs. The Adelaide menus had been seeded on an empty database, so the footer carried only the Information column instead of Local areas, Categories and Information.

- **Rebuild:** the footer location was unassigned and the "Footer" menu deleted, with its items going too (menu items cascade). `pnpm --filter api menus:seed` was then re-run. It left the assigned primary and footer-bottom menus untouched and created a 21-item footer:
  - **Local areas:** the first six by sort order: Adelaide, North Adelaide, Burnside, Goodwood, Hyde Park, Kent Town.
  - **Categories:** the six top-level categories: Food & Drink, Pets & Vets, Shopping, Health & Wellness, Home Services, Professional Services.
  - **Information:** unchanged.
- **Caches:** the API cache namespace was bumped and the web fetch cache cleared.
- **Verified:**
  - The public menus endpoint and the rendered footer show all three columns plus the legal row.
  - All 12 new area and category links return 200.
- **Editing:** the footer can be changed in Admin → Website → Menus.

## 15 September 2026 — Logo recoloured to the flag palette; transparent backgrounds

At the user's request, the logo colours now match the theme, and the footer logo no longer sits on a box.

- **Rebuilt on transparent canvases, same pixel sizes and layout:**
  - `Adelaide_Sphere_{Light,Dark}_Logo.png` (2172×724, web and admin);
  - `brand-logo-{light,dark}.png` (admin);
  - the "box" was the old dark logo's opaque teal background.
- **Lettering:**
  - light version: "Adelaide" in Commonwealth blue #012169, "Sphere" as a #0B3AA4 → #C8102E gradient, tagline #4A5876;
  - dark version: white, #A9C1F7 → #FF8DA0, tagline #C8D3EC.
- **Globe:** its ocean was recoloured from sky-to-teal-green to flag blues. The hue band 150–205° maps to 212–222° with saturation and lightness kept. The flag map, red, white outlines and the Adelaide dot are unchanged.
  - The same recolour is applied to `brand-favicon.png`, and `favicon.ico` was rebuilt from it at 16/32/48 px.
  - The logos take their globe from the transparent 512 px favicon, so the edges are clean on any background.
- **Caches:** the web image-optimiser cache was cleared, with the web server stopped, so the new files are served.
- **Verified in the browser:** the header (white), the footer (flag blue) and the admin sign-in (dark) all show the new logo without a background box.

## 16 September 2026 — Former city references and names removed

At the user's instruction, every former city reference and name was removed so the project stands on its own. This is a deliberate scope instruction and includes the SRS.

- **Renamed:** the SRS is now `docs/Adelaide_Sphere_Technical_SRS_v1.md` (wording updated to Adelaide, South Australia, Australia/Adelaide and Greater Adelaide; heading positions unchanged; `docs/ai/srs-index.md` checksum refreshed), and the boundary document is now `docs/launch/adelaide-boundary.md`, rewritten around the Inner Adelaide baseline (108 localities researched, 16 seeded; D01 open; Keswick's split disputed).
- **Docs:** product names, database and bucket names, package scope, example domains (`adelaidesphere.com`), state and timezone wording, and local port mentions now describe this project only. Place-specific facts that did not apply (suburb lists, landmarks, photo credits) were rewritten or removed rather than swapped; lineage statements were removed.
- **Deploy guide (`docs/operations/deployment-vps.md`):** systemd units `adelaide-sphere-api` / `adelaide-sphere-worker` / `adelaide-sphere-web`, service account `adelaide-sphere`, backup database user `adelaide_sphere_backup`, database `adelaide_sphere`, app ports 4000/4001/4002, worker metrics port 9474 (`WORKER_METRICS_PORT` set explicitly), repository `git@github.com:nileshkushvaha/adelaide-sphere.git`, `MAIL_FROM_NAME=Adelaide Sphere`, server timezone Australia/Adelaide.
- **Internal prefix `ms` → `as`** (2,216 replacements in 182 files, lockfile excluded):
  - CSS classes and tokens `as-*` / `--as-*`, DOM event names, deploy container, nginx and snippet names;
  - admin session cookie `as_admin_session` (existing admin sessions end);
  - Prometheus metric names `as_*` (alert rules and dashboards updated with them);
  - Redis key prefix and Nest metadata keys `as:`, so keys a running Redis holds under the previous prefix are no longer read;
  - edge variables `AS_*_UPSTREAM`;
  - browser storage keys `as.admin.theme`, `as.post-draft:`, `as.consent.*` and `as.alert.dismissed.` (stored preferences and local drafts under the old keys are not carried over).
- **Applied migrations:** the comments in `20260905201937_collation_policy_utf8mb4_unicode_ci`, `20260912220000_service_icon` and `20260915090000_comment_replies` were edited. Their `_prisma_migrations.checksum` rows were updated to the new SHA-256 in `adelaide_sphere_dev` and `adelaide_sphere_test`; `db:migrate:status` reports up to date. No other environment had these migrations applied.
- **Seed keys:** the enrichment entries in `apps/api/scripts/business-seed-content.ts` are now `beulah-road-bakery` and `keswick-mobile-mechanics`. No stored listing used the old keys, so no rows changed.
- **Also:** the API scrape target is port 4011 in `infrastructure/monitoring/prometheus.yml` and the monitoring docs.
- **Verified:**
  - typecheck and lint pass across the workspace;
  - `bash -n scripts/deploy-vps.sh` passes;
  - with the local stack running, the public home, business list, a business page, the blog and the contact page all return 200 with the `as-` styles applied, and the admin sign-in renders styled.
- **Not run:** test suites.

## 16 September 2026 — Audit fixes: admin URL case, API timeouts, unsaved article copies

Fixes for three findings from the production-readiness audit of the same day.

- **Admin routes with different letter case (critical):**
  - Express matched routes regardless of case, and the guards recognise admin routes by an exact, case-sensitive path.
  - So `/api/v1/Admin/enquiries` reached the handler with no session. This was reproduced against the local API.
  - Routing is now case-sensitive (`configureApp`), and `isAdminPath` also ignores case.
  - Mixed-case admin paths now answer 404.
  - Tests: `admin-path.spec.ts`, plus a case in `app.e2e-spec.ts`.
- **Web requests to the API now have a time limit:**
  - `apps/web/src/lib/api.ts` gives every server read 5 s (`API_TIMEOUT_MS`, ten times the NFR 002 read target). A timeout is `ApiRequestError` code `TIMEOUT`, and the page shows its error state.
  - Preview reads use the same limit.
  - The redirect lookup in `middleware.ts` gives up after 2 s and renders the page as if there were no redirect.
  - A fetch with a signal is not memoised by Next.js, so reads are de-duplicated per render with React `cache`.
  - Checked with a stub on 4001 that accepts connections and never answers:
    - search and blog pages showed the error page in about 7 s;
    - a listing page took about 12 s, because Next.js renders it again after its metadata fails;
    - before the fix, these waited for the socket timeout.
  - With the real API, pages answer normally and an unknown listing is still 404.
- **Unsaved article copies survive an expired session:**
  - Before: a 401 made Refine log out, and that logout removed the browser copies of unsaved work.
  - Now only the "Sign out" action (`logout({ signedOut: true })`) removes them.
  - Each copy records its administrator (`ownerId`) and is read back only for that administrator.
  - Copies left by anyone else are removed when a different administrator signs in, so a shared computer still does not expose them.
  - Tests: `shared/postDrafts.test.ts` and a case in `auth-provider.test.ts`.
- **Verified:** typecheck and lint for api, web and admin.
- **Test suites (run at the user's request):**
  - The first run found prefix-rename misses: the admin CSS variable builder (`--ms-${…}`), the Redis `keyPrefix` in the API and worker, the default metric prefix and the idempotency-key prefix. The rename rule had only matched a prefix followed by a letter.
  - The Redis mismatch surfaced as 429s across the integration suite, because tests cleared throttle keys under the new prefix while the API wrote them under the old one.
  - 21 further occurrences were fixed.
  - Second run, all green with none skipped:
    - `pnpm test`: database 27, API 333, admin 338, web 256, domain 95, mail 38, worker 51.
    - `pnpm test:integration`: database 5, API 316.
  - `pnpm test:e2e`: 20 passed.
  - `pnpm build` first failed: `/faqs` was prerendered at build time and throws when the API is unreachable, so every build without a live API failed, including the CI build job.
    - This predates today's changes.
    - `/faqs` is now `force-dynamic`, like home, contact and about, and the web app builds with no API running.
  - `pnpm test:browser`: 75 passed, 0 failed, 0 skipped.

## Search identity: site name, favicon and robots (17 Sep 2026)
- **Why:** Google showed the bare domain and an old icon for adelaidesphere.com.
- **Live finding (not fixable in code):** on 17 Sep 2026, adelaidesphere.com (behind Cloudflare) was not serving this application.
  - Responses were either Cloudflare 522 (origin timeout) or a GoDaddy Website Builder site (`lang="en-US"`, GoDaddy's default `logo-default.png` as its apple-touch icons, `canonical` pointing to `/404`).
  - `robots.txt` is Cloudflare-managed content plus GoDaddy's rules.
  - This is what Google has crawled: the site name and icon it shows come from that site, not from this code.
- **Domain conflict (resolved the same day by the user):** production is `adelaidesphere.com`; the `.com.au` form is not used.
  - `scripts/deploy-vps.sh` (post-switch smoke check) and `docs/operations/deployment-vps.md` (DNS, certbot, nginx, CSP) used the `.com.au` name. Now changed to `adelaidesphere.com`, together with the admin placeholders (invite email, SEO canonical example) and the API settings test fixtures.
  - Other `.com.au` addresses (generic `example.com.au` placeholders, seeded businesses' own sites) are unrelated and unchanged.
- **Changes (web):**
  - `lib/structured-data.ts`: the existing WebSite entity gains `alternateName` (`AdelaideSphere`, `adelaidesphere.com`), and its `url` is the home page with its slash.
  - The Organization `url` is the same home page URL. Its `logo` falls back to the square brand mark (`/brand-logo.png`, 512×512 `ImageObject`) when no logo is uploaded, and a relative uploaded logo URL is made absolute.
  - Still one WebSite and one Organization, on the home page only.
  - `lib/site.ts`: `SITE_ALTERNATE_NAMES` and `BRAND_ICON`.
  - `app/layout.tsx`: one icon link (`/brand-favicon.png`, `image/png`, `96x96`; an uploaded favicon keeps its own size) plus `apple-touch-icon` 180×180.
  - `public/`: `brand-favicon.png` resized from 512 px (343 KB) to 96 px (18 KB), same URL and artwork. New files: `apple-touch-icon.png` (180 px, flattened on white) and `brand-logo.png` (512 px master), all generated with the `sharp` already installed for Next.js. `favicon.ico` (16/32/48, rebuilt from the same master on 15 Sep) is unchanged.
  - `app/robots.ts`: now `force-dynamic`. It was prerendered at build time, so the `Sitemap:` origin and `SITE_NOINDEX` came from the build machine (a staging-built image would keep `Disallow: /`). The rules are unchanged. `/business?` matches only query URLs under `/business`, never `/business/...`.
- **Left as is (deliberate):**
  - Next 16.3.4 writes the home canonical and `og:url` as `https://adelaidesphere.com` without the slash unless `trailingSlash` is enabled site-wide. That form is equivalent to the version with the slash, so routing is unchanged.
  - The sitemap already lists `https://…/` with real last-modified times.
  - No web manifest (the project has none).
  - Header and footer logo alt text is the site name.
- **Verified:**
  - `pnpm --filter web typecheck` and `lint` are clean. `pnpm --filter web test`: 260 passed, including 4 new site-identity cases (run at the user's request).
  - `pnpm --filter web build` passes with `SITE_ORIGIN` unset.
  - `next start` with `SITE_ORIGIN=https://adelaidesphere.com`: the home page has exactly one title, description, canonical, application-name, `og:site_name`, `og:url`, icon and apple icon, and Organization + WebSite JSON-LD with the expected values.
  - `/about`, `/blog`, `/contact`, `/business` and `/faqs` each have a self-referencing canonical.
  - The icons return 200 `image/png` / `image/x-icon`, and `robots.txt` names `https://adelaidesphere.com/sitemap.xml`.

## Production mail over the domain's SMTP server (17 Sep 2026)
- **Decision (user):** outbound mail uses `mail.adelaidesphere.com:587` with STARTTLS, authenticated as `smtp@adelaidesphere.com`, sending as `Adelaide Sphere <noreply@adelaidesphere.com>`. This replaces Resend as the documented production transport; Resend stays supported. It partly answers D03b/D09.
- **Code gap fixed:** the SMTP path ignored `MAIL_FROM_NAME` (only the Resend path used it), so mail would have gone out as a bare address.
  - `packages/mail`: `smtpConfigFromEnv` reads and validates `MAIL_FROM_NAME` (single line, ≤ 78 characters) into `SmtpConfig.fromName`.
  - `SmtpTransport` passes it to nodemailer as `{ name, address }`, so it is quoted and encoded rather than spliced into the header. `toSendOptions` refuses a name with a line break or longer than 78 characters.
  - The API's `SmtpMailer` passes `MAIL_FROM_NAME`; the worker already hands its whole environment to `smtpConfigFromEnv`.
  - Port 587 with `SMTP_SECURE=false` was already right: production sets `requireTLS`, TLS 1.2 minimum.
- **Configuration:**
  - `docs/operations/deployment-vps.md`: prerequisites, DNS note (the `mail.` record is DNS-only), §8.2 `api.env` block with the SMTP values and a password placeholder, §13 mail check, staging note.
  - `email-deliverability.md`: environment table and open items.
  - `apps/api/.env.example`: production values as comments and `MAIL_FROM_NAME`. `apps/worker/.env.example` and the mail and worker READMEs updated.
  - Local `apps/api/.env` and `apps/worker/.env` (git-ignored) gain `MAIL_FROM_NAME` only; local mail still goes to Mailpit.
  - No password is stored anywhere in the repository.
- **Checked (17 Sep):**
  - `mail.adelaidesphere.com` → 200.141.8.30. MX points to it, SPF `v=spf1 ip4:200.141.8.30 -all`, DMARC `p=quarantine`.
  - Port 587 STARTTLS negotiates TLS 1.3 with a valid certificate for `mail.adelaidesphere.com`.
  - DKIM was not checked: the selector is unknown.
- **Verified:** mail typecheck, build and oxlint; api and worker typecheck and oxlint. `@adelaide-sphere/mail` tests: 40 passed, including 2 new cases. API and worker suites not run.
- **Open:**
  - The SMTP password goes into the server's `shared/api.env` only.
  - Confirm `smtp@` may send as `noreply@`, that `noreply@` accepts mail (bounces arrive there, since SMTP has no delivery webhook), that DKIM signs for `adelaidesphere.com`, and the host's sending limits.

## Migration: stored `adelaidesphere.com.au` rewritten to `adelaidesphere.com` (17 Sep 2026)
- **Why:** production was restored from a backup taken while the old domain was in use, so settings, page and listing content still carried it. The code and configuration were changed earlier the same day; this is the stored data.
- **`packages/database/prisma/migrations/20260917190000_domain_com_au_to_com/migration.sql`:** 22 guarded `UPDATE` statements over settings, pages and their autosaves and revisions, posts and autosaves, businesses and their links and media, categories, local areas, blog categories and tags, authors and their links, FAQs, service alerts, menu items, redirects, partners, testimonials and media assets. Data only; nothing is added, removed or emptied.
  - `REGEXP_REPLACE` under `utf8mb4_unicode_ci` also corrects `AdelaideSphere.com.au` and `ADELAIDESPHERE.COM.AU`.
  - JSON columns (`settings.data`, page `sections`, `sectionsSnapshot`, author `expertise`) are cast with `AS CHAR CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` and parsed back. Both parts are needed: `CAST(json AS CHAR)` takes the client connection's character set (latin1 from the `mysql` CLI) and collation `utf8mb4_bin`, and MySQL then refuses to mix it with the text columns beside it. Both mistakes were caught by testing, not by review.
  - Each statement is guarded by a `LIKE` over the columns it rewrites, so it is safe to re-run and a clean database is untouched.
  - Excluded: visitor-submitted text (reviews, comments, enquiries, abuse reports), logs and audit history, `admin_users.email` (a login identity), and encrypted columns, whose ciphertext cannot be searched — a private enquiry address on the old domain must be re-entered in the admin. `updatedAt` is not bumped, so sitemap last-modified times keep describing real content changes.
  - Unrelated `.com.au` addresses (a listing's own website, `example.com.au` placeholders) are deliberately left alone; the user confirmed this on 17 Sep.
- **Tested** against a scratch database (`adelaide_sphere_migcheck`, created and dropped) on the local MySQL 8.4, with all 53 migrations applied and rows seeded with the old domain:
  - `prisma migrate deploy` applied it as a pending migration, exactly as production will.
  - Mixed-case spellings corrected; JSON escaping and non-ASCII text (`café — ☕`, `\"`, `&`) preserved; an unrelated `example.com.au` listing untouched.
  - Re-running the file changed 0 rows and reported no error, with both latin1 and utf8mb4 client connections.
  - `pnpm db:migrations:check`: policy OK.
- **After deploying:** restart the API, worker and web so the cached settings and pages reload.

## Deploy script: backup target and silent preflight (17 Sep 2026)
- **Found while deploying:** `scripts/deploy-vps.sh` backed up `--host 127.0.0.1` with the default port 3306, but the application's MySQL is the Compose container on **3317** (`DATABASE_URL` in `shared/api.env`); the VPS also runs an unrelated `mysqld` on 3306. The pre-deploy backup authenticated against the wrong server and failed, so the deployment stopped before migrating (the site was unaffected).
- **Fix:** the backup now takes the host, port and database name from the application's own `DATABASE_URL` and prints them before dumping. A host with a second MySQL can no longer be backed up by accident, and the file can no longer be a dump of the wrong database.
- **Also:** the preflight checks ran as bare `test`/`command -v` under `set -e`, so a missing tool or env file ended the deployment with **no output at all**. Each check now names what is missing. This is what made the first failed run look like nothing had happened.
- Untested against a VPS from here; the changed shell was syntax-checked and the URL parsing was run against a URL of the same shape (credentials percent-encoded, TLS parameters present).

## `sslmode=verify-ca` no longer checks the server's name (17 Sep 2026)
- **Why:** MySQL 8.4 generates its own certificate on first start, and that certificate names neither the host nor `127.0.0.1`. `sslOptionFor` returned a plain `{ rejectUnauthorized: true, ca }`, so Node's TLS stack also checked the name and every connection failed — the API logged `P2010 database unavailable` while the `mysql` client connected to the same server happily. The deployment guide already noted the certificate does not name `127.0.0.1`; the code did not implement that distinction.
- **Found in production:** a release deployed on 17 Sep could not reach the database. The running release had been patched by hand on the server and the change was never committed, so the rebuild restored the fault. This entry exists so the fix cannot be lost the same way again.
- **`packages/database/src/client.ts`:** `verify-ca` now passes `checkServerIdentity: () => undefined` — the chain is still verified against the authority, the name is not. `verify-identity` keeps the name check; `required` and `disabled` are unchanged. The switch is exhaustive over `MysqlSslMode`, so a new mode cannot silently fall into the wrong branch.
- **Tests:** `packages/database/src/url.spec.ts` covers both modes (27 passed). Typecheck clean.
- **Production note:** the `mysqldump` on a host whose MySQL runs in a container must be the server's own client (MySQL 8.4 removed `SHOW MASTER STATUS`); the wrapper in the deployment guide §15.2 is not optional on such a host.

## SEO settings: each page's metadata is saved under its own page (17 Sep 2026)
- **Reported:** editing one page in Configuration → SEO settings and saving replaced the other pages' metadata.
- **Confirmed in a browser, not by reading:** a Playwright journey drove the real screen and captured the request. Typing for Home, switching to Businesses and saving sent `routes: {"directory": {…}}` only — the home values were gone from the payload, and the save writes the whole document, so every other page's overrides were cleared. Two earlier explanations of mine (a misbound field id, a stale form store) were wrong, and the trace is what settled it.
- **Cause:** one set of fields whose `name` followed the picker (`['routes', routeKey, …]`). Switching pages unmounts those fields, and their values do not survive in the form store, so only the page on screen reached the request.
- **Fix (`apps/admin/src/pages/settings/SeoSettingsPage.tsx`):** every route's fields are rendered and only the chosen one is shown (`hidden` on the others). All pages stay in the form, so the document written is complete.
- **Test:** `e2e/specs/seo-settings.spec.ts` — types for two pages, saves, asserts the request carries both, reloads and asserts each page shows its own text, then edits one again and asserts the other is untouched. Passes at desktop and 320 px; it fails against the previous build, which is how the bug was proven.
- **`scripts/test-browser.mjs`** now passes its arguments to Playwright, so a single spec can be run against the provisioned stack (`pnpm test:browser specs/seo-settings.spec.ts`). Note the runner serves the admin with `vite preview`: build the admin first or the suite tests the previous bundle — which cost a run here.
- **Verified:** admin typecheck, lint, and 338 unit tests pass.

## Deploy script: migrations over TLS to a database reached by IP (17 Sep 2026)
- **Symptom:** `deploy.sh` stopped at `prisma migrate deploy` with `P1011 ... certificate verify failed (IP address mismatch)`, while the application connected normally.
- **Why:** the script asked the Prisma CLI for `sslaccept=strict`, which verifies the certificate against the authority *and* checks that it names the host. MySQL generates its own certificate, which names neither the host nor `127.0.0.1` — the deployment guide §6.5 already says so, and the application therefore uses `sslmode=verify-ca`. The Prisma CLI has no CA-only mode, so `strict` could never succeed against the loopback container.
- **Fix (user decision, 17 Sep):** the identity check is applied only when the database is reached by a hostname. Reached by IP — the container on loopback — the certificate authority is still supplied and the connection is still TLS; only the name check is dropped, on a connection that never leaves the machine.
- Host classification was checked against loopback, private, IPv6 and named hosts; the shell was syntax-checked. Not run against a VPS from here.
- **Also outstanding on that server:** `MEDIA_S3_ENDPOINT` must be the public `https://media.adelaidesphere.com` host, never `127.0.0.1:9020` — the API signs upload URLs for it and the admin browser uploads directly, so a loopback endpoint produces URLs no browser can reach and every upload stays "processing" (fixed on the server on 17 Sep; the guide §8.2 already warned).

## Deploy script: no assumed service account (17 Sep 2026)
- **Symptom:** after migrations and the RBAC seed, `deploy.sh` stopped with `sudo: unknown user adelaide-sphere`, leaving the release built but not switched.
- **Why:** the version stamp was written with `sudo -u adelaide-sphere`. The deployment guide's layout gives the environment files to a service account of that name; this server has no such user and runs the services as `deploy`, which owns `shared/`.
- **Fix:** the stamp is written as whoever owns `shared/worker.env` — directly when that is the deploying user, through `sudo -u <owner>` otherwise. Both layouts work and neither is assumed.
- Syntax-checked, and the rewrite (delete the old `APP_VERSION` line, append the new one) was exercised on a scratch file. Not run against a VPS from here.

## Scheduled database backups: two tiers on systemd timers (18 Sep 2026)
- **Why:** nothing took a backup on a schedule. The only backup that ran was the pre-deploy one inside `scripts/deploy-vps.sh`; the daily job existed solely as a heredoc in `docs/operations/deployment-vps.md` §15.2 and was broken three ways — no `--port` (so it targeted whatever answered on 3306, not the app's container on 3317), `sudo -iu adelaide-sphere` for a user this server does not have, and a `find /srv/adelaide-sphere/backups -mtime +30 -delete` that recursed into `before-deploy/` and fought the deploy script's own count-based retention.
- **Added:** `infrastructure/backup/run-scheduled-backup.sh` (`--tier daily|weekly`), `db-target.sh` (shared with the deploy script), four unit files in `infrastructure/backup/systemd/`, `infrastructure/backup/README.md`, `scripts/test-scheduled-backup.py`, `apps/worker/src/backup-status.ts` and `apps/api/src/operations/backup-status.service.ts`.
- **Tiers:** `daily` at 03:30 Adelaide kept 30 days (a fresh dump); `weekly` Sundays at 04:30 kept 180 days, produced by hard-linking the newest daily file rather than dumping again — the RPO comes from binlogs, a second dump would load a small shared VPS for nothing, and promoting means the archive is always a file already size-checked and checksummed.
- **Not 02:30.** South Australia moves 02:00 to 03:00 on the first Sunday in October, so the old runbook's `30 2 * * *` simply does not occur that day; `systemd-analyze calendar` confirms it jumps Sat 3 Oct → Mon 5 Oct. `Persistent=true` does not recover it, because the occurrence never existed.
- **Retention safety:** pruning is by the UTC stamp in the filename (not mtime, which a copy or restore rewrites), scoped to one tier directory, never leaves fewer than two files at any age, keeps and logs any filename it cannot parse, removes `.sha256` with its file, and hard-fails if a pass would empty the directory. Files without a stamp are also excluded from "newest", so a hand-restored file can never be the one the weekly tier promotes.
- **Alerting:** each run writes `backups/state/<tier>.state`; the worker publishes it at scrape time and the API reports `backup_age`. C10 in `alert-response.md` **had to become tier-qualified** — `time() - as_backup_last_success_timestamp_seconds > 26h` matches the weekly series six days in seven and would have paged daily. C10b, C10c and I4 are new or rewritten.
- **Verified:** `scripts/test-scheduled-backup.py` (33 checks) and `scripts/test-deploy-vps.py` (5 modes) pass; shellcheck clean; `systemd-analyze verify` on systemd 255 reports only the two container-only complaints; a real run against the local Compose MySQL produced a 61-table restorable dump with a verifying checksum, a hard-linked promotion and correct state files; `/metrics` was scraped live over HTTP, confirming a missing tier goes absent rather than stale and a corrupt state file yields no series and no 500. No test suites were run.
- **Open, and only checkable on the VPS:** whether `mysqldump` resolves to the container wrapper — if it does, `--port 3317` cannot work through it and `BACKUP_DB_PORT=3306` must be set (see below); enabling the timers; the `age` encryption path; that the unit's hardening does not block `docker exec`; a real rclone remote; and the production-shaped drill. Also unwatched: disk space, which now carries up to 30 daily + 26 weekly + 20 pre-deploy files.

## Env files are read, not sourced: a latent deploy defect (18 Sep 2026)
- **Found while** extracting the `DATABASE_URL` parser out of `scripts/deploy-vps.sh` so the scheduled backup could share it.
- **Symptom:** `set -a; . shared/api.env; set +a` leaves `DATABASE_URL` **unset**, while every other variable in the file loads normally.
- **Why:** §8.2 of the deployment guide writes that file with an unquoted query string — `…?sslmode=verify-ca&sslca=%2F…`. To a shell the `&` means "run this assignment in the background", so the assignment happens in a subshell and never reaches the caller. systemd parses `EnvironmentFile=` itself and is unaffected, which is why the running services never showed it and only shell scripts did. Confirmed directly: sourcing such a file yields `DATABASE_URL=<UNSET>` and `OTHER=x`.
- **Consequence if unfixed:** `api_command` would fail at `pnpm db:build` with "Cannot prepare Prisma TLS URL", and the RBAC seed would run without a database URL — both early in a deployment.
- **Fix:** `env_file_value` in `infrastructure/backup/db-target.sh` reads env files the way systemd does (last assignment wins, optional quotes stripped) instead of sourcing them, and `deploy-vps.sh` reads `DATABASE_URL` back through it in both places. Reading rather than sourcing also means an env file can no longer execute code; `test-scheduled-backup.py` asserts that.
- `scripts/test-deploy-vps.py` was stale — it predated the backup block and failed on the first mode — so it was repaired and extended: it now uses an unquoted `DATABASE_URL` on 3317 like the real one, runs the real backup script behind shims, and asserts `--port=3317` reaches `mysqldump` and that a failed backup migrates nothing.

## Partial backup files are removed on failure (18 Sep 2026)
- **Symptom:** a failing `mysqldump` left a truncated `.age`/`.gpg` file in the backup directory. The encryptor creates its output before the dump finishes, and `set -e` aborted the script before its size check could run.
- **Why it matters more now:** that file is the newest in the directory, so it is what a retention pass counts toward its floor and what the weekly tier would promote.
- **Fix:** an `ERR` trap in `backup-database.sh` removes the incomplete file and its checksum, and the size-check path removes it too. `test-deploy-vps.py` asserts a failed backup leaves nothing behind.

## Deliberate deviation: a 180-day weekly backup archive (18 Sep 2026)
- **What:** backups are retained for 180 days in the weekly tier, alongside the 30-day daily tier.
- **Against:** SRS **BACK 001** — "Retain daily recovery points 30 days; avoid unapproved long term personal data archives."
- **Approved by:** the project owner, in the session of 18 Sep 2026, after the conflict and its privacy implications were put to them. The SRS is unchanged.
- **Why it is a deviation and not a breach:** the daily tier still retains 30 days exactly as BACK 001 requires, so the baseline is met in full. The weekly tier is an addition. What BACK 001 forbids is an *unapproved* long-term personal-data archive; this one is approved and recorded here.
- **What it contains:** complete encrypted dumps of every table — enquiry contact details, private review and comment emails, abuse-report narratives, admin audit rows — at 26 recovery points.
- **Honest position on PRIV 001:** 180 days matches the longest live retention window in the policy (enquiries, approved-review private email, abuse reports), so no category is archived for longer than its own published window **except the shorter ones, which it necessarily outlives** — abuse IP signals (30 days) and rejected reviews and comments (90 days) persist in a backup taken before their purge ran. That is inherent to keeping backups at all, at any retention length. The controls are what make it acceptable, not a claim that it does not happen: encrypted to an `age` public key whose private half never exists on the server, readable only by `deploy`, used for disaster recovery only, pruned automatically rather than by hand, and copied off-site with a credential that cannot delete.
- **The consequence with teeth (PRIV 002):** restoring the weekly archive can put back rows the retention jobs have already purged, so the deletion replay must cover the whole period back to the backup point — up to 180 days, not the ≤30 a daily restore implies. This is printed by `restore-drill.sh` itself, and recorded in `docs/operations/restore-drills.md` and `infrastructure/backup/README.md`, rather than living only in a document nobody reads mid-incident.
- **FUT 003 stays satisfied:** the schedule lives in tracked systemd units changed only by an engineer with root, deliberately not in `packages/domain/src/scheduled-tasks.ts` and not as a BullMQ repeatable job, so no administrator-authored cron expression or shell command is ever created, stored in the database or reachable from the admin UI. A backup that ran inside the worker would also stop whenever the worker was down, which is when it matters most.

## Backup failure alerts, media mirror and a disk guard (18 Sep 2026)
- **Why:** the scheduled backup recorded its own failures, but nothing told anyone; uploaded files were not backed up on any schedule at all; and nothing on the host watched disk space.
- **Failure alerts.** `infrastructure/backup/notify-failure.sh` emails `BACKUP_ALERT_EMAIL` (in `shared/backup.env`) using the transport already configured in `api.env` — Resend over curl, or SMTP over curl. It is wired into the `OnFailure` units, which now both record the failure and report it. Two rules it obeys: it **always exits 0**, because it runs after something has already failed and a notifier that dies takes the only signal with it; and it never puts a secret on a command line — the API key and SMTP password go to curl through a mode-0600 file. Verified end to end against the local Mailpit: a real message arrived with the right sender, recipient, subject, the state files and the journal tail, and no credentials in the body. The journal tail needs `deploy` in `systemd-journal`; without it the mail still sends, just thinner.
- **Media mirror.** `infrastructure/backup/mirror-media.sh` plus an hourly timer replaces the `mc mirror` crontab line that existed only in the deployment guide (and under a user the server does not have). A database dump contains **no uploaded files**, only rows pointing at them, so without this a restored server is a perfect database full of broken images. Gated on `MEDIA_MIRROR_TARGET`: unset, it reports hourly that nothing is being copied rather than failing. It uses `--overwrite` and deliberately **no `--remove`** — a deletion here must never propagate to the copy that exists to survive it. Verified for real against the local MinIO: 382 objects copied, a second run incremental at 0 B, failure recorded when the container is stopped; the test bucket was removed afterwards.
- **Disk guard.** Every run now checks free space **before** dumping and refuses below `BACKUP_MIN_FREE_MB` (default 1024) or below three times the last backup's size, whichever is larger. MySQL on a full filesystem stops accepting writes and takes the site with it; a backup must not be the thing that causes that. The figure is recorded and published as `as_backup_disk_free_bytes{tier}`.
- **Two guards added while reviewing production-readiness:** the run refuses an `age1…` recipient when `age` is not installed — otherwise `backup-database.sh` falls back to gpg and either fails on an unusable recipient or, if `BACKUP_PASSPHRASE` happens to be set, quietly writes a passphrase-encrypted file the recorded key cannot open, discovered only at restore time; and it refuses a `BACKUP_ROOT` that is not at least two levels deep, so a mistyped unit file cannot point the retention pass somewhere nobody meant.
- **New metrics:** `as_backup_disk_free_bytes{tier}`, `as_media_mirror_last_success_timestamp_seconds`, `as_media_mirror_configured`. A state file written before the disk field existed reports 0, and a published zero would read as "the disk is full" to a threshold rule, so that case publishes nothing instead. New alert rules C11 and C12 in `docs/operations/alert-response.md`.
- **Verified:** 58 checks in `scripts/test-scheduled-backup.py`, 5 modes in `scripts/test-deploy-vps.py`, shellcheck clean, all seven unit files pass `systemd-analyze verify` on systemd 255 with only the two container-only complaints, typecheck and lint clean, and the new gauges scraped live over HTTP. No test suites were run.
- **Still open, and still the thing that matters most:** `BACKUP_OFFSITE_REMOTE` and `MEDIA_MIRROR_TARGET` are both empty, so every backup and every uploaded file still exists only on the one VPS disk. The alerting and the mirror are ready; the off-site destination is a client decision (D07). A production-shaped restore drill remains outstanding, and a backup that has never been restored is a hypothesis.

## One account on the VPS: `deploy` (18 Sep 2026)
- **Decision (project owner, 18 Sep 2026):** standardise on `deploy` rather than create an `adelaide-sphere` service account. `deploy` owns `/srv/adelaide-sphere` and is the `User=` of the API, worker and web units. This matches the server as it runs today; the alternative (a dedicated account owning `shared/`, releases and the admin build) was put to the owner and declined for now.
- **Why it was open:** the deployment guide assumed a service account the server never had, which caused the `sudo: unknown user adelaide-sphere` failure (17 Sep, above). §15 had been corrected on 18 Sep and a warning placed at the top of the guide; the rest of the guide still said otherwise.
- **Guide (`docs/operations/deployment-vps.md`):** warning removed; conventions, §5 (account and layout), §9.3 (nginx access), §10, §11B, §12 (units and restart rights), §18 (rollback) and §19 now say `deploy`, with no `sudo -iu`. §5 states the trade-off plainly: the running application has the same file access as the account that deploys it.
- **Mitigations, in the unit files:** `NoNewPrivileges=true` (already present) stops the services using `deploy`'s sudo rights; new `InaccessiblePaths=-/run/docker.sock` hides the Docker socket, since `deploy` is in the `docker` group and none of the services needs Docker. **The live units do not have this line yet.** Add it with `sudo systemctl edit`, then `daemon-reload` and restart during a deployment window.
- **nginx access:** `www-data` is no longer added to the owning account's group, which with `deploy` would expose its home directory. The two top directories get group `www-data` so nginx can pass through them, and each release grants read access to exactly the admin build and `_not-found.html`. `scripts/deploy-vps.sh` now does both and checks both as `www-data` (it used to handle the admin build only), and so does the first-release step in §10.6. Before this change the not-found document was readable only if `www-data` happened to be in `deploy`'s group on the server; that has not been checked.
- **Sudoers:** the `NOPASSWD` rule for the non-existent account is gone. `deploy` has sudo, and the script prompts once. An old `/etc/sudoers.d/adelaide-sphere-deploy`, if one exists on the server, grants nothing and can be removed.
- **Kept:** the script's APP_VERSION stamp still writes as the owner of `shared/worker.env`, so it keeps working if ownership ever moves.
- **Verified:** `python3 scripts/test-deploy-vps.py` (5 modes; the success mode now also asserts both `www-data` read checks); `bash -n`. shellcheck is not installed on this machine. Not run against the VPS. No test suites were run.
- **Not addressed, noticed on the way:** §4.3 installs Node system-wide under `/opt/node`, while the script builds with NVM from `/home/deploy/.nvm` and the units start `/usr/local/bin/node`. Those can be different binaries. §10.3 and §11B source `api.env` in a shell, which leaves `DATABASE_URL` unset (the `&` defect above). §17 still mentions "Siri Education services".

## Review fixes: API startup, off-site binlogs, relocatable checksums (18 Sep 2026)
A review of the backup integration found three defects, all confirmed and fixed. The rehearsal that proved the fixes found three more.

- **[P1] The API could not start.** `BackupStatusService` took a `string | null` constructor parameter with a default. Nest resolves every constructor parameter through the container, and nothing provided that one: `Nest can't resolve dependencies of the BackupStatusService`, reproduced against a fresh build. The directory is now an injection token (`BACKUP_STATE_DIR`) with a factory provider registered in `OperationsModule`. The existing spec constructed the class directly, which is how it missed this; a new spec resolves it through `Test.createTestingModule`. Verified by building the API and starting `dist/main.js`: it starts, and `/api/v1/health/ready` returns 200.
- **[P1] The one-hour RPO did not survive the loss of the server.** The daily dump recorded a binlog position, but the logs themselves never left the machine, so a lost VPS lost up to a day of changes. `infrastructure/backup/archive-binlogs.sh` runs every 30 minutes (`adelaide-sphere-binlog-archive.timer`). It flushes, then encrypts each closed log and copies it off-site with its checksum. A log is recorded as archived only after both files have uploaded, and a log that expired before it was archived fails the run as a gap. It works through `docker exec`, so it needs no host client and no grant beyond the existing `RELOAD` and `REPLICATION CLIENT`. `restore-drill.sh --binlog-dir` replays the archive from the dump's recorded position, with an optional UTC `--stop-datetime`. New metric and alert: `as_binlog_archive_last_success_timestamp_seconds`, C13.
- **[P2] Checksums did not survive a download.** `backup-database.sh` recorded the absolute path, and the drill ran `shasum -c`, which looked for the file there. Checksums now record the file name. The drill compares the hash with the file in hand, which also works for the older path-style files already on the server.

**Found by the rehearsal, and fixed:**
- **A drill reported a replay that had not happened, with exit status 0.** macOS `/bin/bash` 3.2 treats an empty array as unbound under `set -u`, so with no stop point `mysqlbinlog` never ran. `mysql` then succeeded on empty input. Arrays now use the `${a[@]+"${a[@]}"}` form, and replay is two separately checked steps, not a pipe.
- **A drill on the production server polluted the archive.** It wrote its restore, including `DROP DATABASE`, into the server's binlog. `--rewrite-db` is applied before `--database`, so a later replay into the same `_restore` name re-ran the old drill over the recovered data. Every drill connection now sets `sql_log_bin = 0`, and the drill refuses an archive that already holds writes made directly to its target. The first version of that refusal used `grep -q`: `mysqlbinlog` died of SIGPIPE, and under `pipefail` the check read as "not found" exactly when it had found something. It now counts matches.
- **The restore account in guide 15.5 could not replay, and its password was never kept.** Replay needs `REPLICATION_APPLIER` and `SESSION_VARIABLES_ADMIN`, both found by running it. The old command created the user with a random password it discarded. 15.5 now keeps the password in a mode-600 file, grants the two privileges, and drops the account after the drill. Both commands were run against the local container.

**Rehearsed for real against local MySQL 8.4 and MinIO.** The rehearsal used a scratch copy of the dev database and a backup account with the exact production grants. The off-site remote was a local directory behind an `rclone copyto` stand-in, because rclone is not installed here.
- The daily dump recorded its binlog position with the production grants.
- There were changes on both sides of a marked moment: a new table, an insert, an update, a delete, then another insert.
- The archive flushed and uploaded the logs.
- Everything was copied to a new directory, standing in for a download after the server is gone.
- Replay to the end restored every change. Replay to the stop point stopped exactly there.
- The server's binlog position was identical before and after the drill.
- An archive with a missing log failed, and so did a tampered one.
- Media was mirrored off-site and restored from that copy into an empty bucket: 381 objects each way, `mc diff` empty, and a sample file's hash matched.
- The failure email had been proven through Mailpit earlier. Scratch databases, accounts, buckets and files were removed afterwards.

**Checks:** 73 hermetic checks in `scripts/test-scheduled-backup.py` (including the archiver's gap, retry and password-not-on-the-command-line cases), 5 deploy modes, shellcheck clean, all ten unit files verified on systemd 255, typecheck and lint clean. Per CLAUDE.md rule 5, no test suites were run in this session.

**Not proven, and only provable on the server:** a real VPS backup, off-site download and isolated restore, media restore and failure email. That is guide 15.7, the go-live acceptance procedure. It restores from off-site copies alone onto a laptop, with pass criteria for each step. Until it has passed once, recovery is designed and rehearsed, not proven.

## SRS implementation planning and source reconciliation (18 Sep 2026)

Planning only, requested by the user; no application changes or test suites. Deliverables: `docs/planning/srs-implementation-plan.md` and `docs/planning/srs-requirement-matrix.md`. Coverage: 222 unique formal requirements (including change-log-only BLOG 006), plus all 181 non-NFR table rows and 52 standalone prose paragraphs. The source SRS was left unchanged and its SHA-256 is recorded in the matrix.

Material conflicts are recorded as C01–C14 in the plan: cover revision1.5 versus amendments through1.17; council-only SCP004 baseline versus current Inner Adelaide seed/project instructions; Resend MAIL001/D09 versus recorded SMTP choice; Open-now completeness/D08 versus60% heuristic; and obsolete acceptance text for comment threads, testimonials, partner authorization, documents, pages, settings storage, branding, paid guest posts and the site map. Latest explicit SRS amendments govern where unambiguous; geography/provider/readiness reconciliation stays an owner decision. The separately approved180-day weekly backup exception is preserved, with full-horizon deletion replay still required.

Static inspection found concrete closure work in transactional submission idempotency, asynchronous authentication mail, task cancellation/retries/lock release, visitor-data retention/deletion replay, atomic account-status audit, concurrent provider events, indexed directory search, exception-hour overlap, replica/CDN invalidation, asynchronous cache controls and periodic rating reconciliation. These are planning findings, not fixes or fresh runtime claims. Existing uncommitted work remains intact; implementation requires a subsequent request.

## AI Content Phase 1A — 18 September 2026

Implemented the expressly approved foundation only: disabled-by-default settings in the existing store; manual topic queue/detail/priority/pause/resume/cancel/reject in the existing admin; three server-enforced permissions; transactional safe audit; bounded API endpoints; durable actor-scoped request idempotency and exact normalized active-title protection. Added one topic table, no generation/control/provider tables. Atomic settings compare-and-set fixes the confirmed concurrent-save race with the smallest shared-store change.

Validation: 44 focused API unit tests, 10 new real MySQL integration tests, 11 existing settings and 12 existing blog integration tests, and 30 admin tests passed. Type checks, lint, database generation/migration policy, contract generation, API/admin builds and admin bundle budget passed. Desktop and 320px browser interactions passed with intercepted API fixtures; backend races were tested separately against real MySQL. Full repository release gate and live authenticated UAT were not run.

The isolated test harness applied the AI migration and the pre-existing pending domain migration to `adelaide_sphere_test` only. No retained-environment migration, RBAC sync, dependency/env change, deployment or provider call. No AI Post, scheduler or social integration. Existing unrelated changes preserved. Exact manifest, settings/routes, limitations and deployment/rollback: [Phase 1A completion report](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1a-completion.md). **Stopped at Phase 1A; wait for approval before Phase 1B.**

## AI Content Phase 1B — 18 September 2026

- **Scope:** plan §O workstream 1B only. Additive migration `20260918150000_ai_content_editorial_foundation` (lifecycle enum, `postId`/human-edit/failure columns, `ai_automation_controls`, `ai_generation_runs`, `ai_operations`, `ai_approvals`). Backend-only seam `@adelaide-sphere/database/editorial` (sanitiser and media sync moved there, revisions, material hash, AI publication policy, scheduled publication) and `/automation` (control epoch, leases/fencing, recovery, apply). Worker `ai.operation` job and the `ai-content.recover-operations` task. Scheduled publishing now writes `post.published` like the admin command.
- **Checks:** new integration spec 18/18; `pnpm test:integration` 344/344 + 5/5; `pnpm test` all passed; typecheck, lint, builds (web not rebuilt: no web changes, `next dev` running), budget, contracts, migration policy.
- **Environment:** migration applied to `adelaide_sphere_test` only. `adelaide_sphere_dev` is behind by `20260917190000_domain_com_au_to_com`, 1A and 1B, so the running dev API's blog edit/publish routes fail until `pnpm db:migrate:deploy` is authorized. Nothing deployed or enabled.
- **Next:** 1C blocked on the owner's pilot editorial-strategy and source-policy approval. Record: [Phase 1B completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1b-completion.md).

## AI Content Phase 1C — 18 September 2026

- **Scope:** plan §O workstream 1C under the owner's pilot policy. Additive migration `20260918170000_ai_content_research`: research sources, packets, evidence, claims and claim sources; topic novelty and approval fields; inventory epoch; research and discovery operation kinds.
  - Worker: `safe-fetch.ts` (SSRF-safe, pinned, bounded, robots.txt), `extract.ts` (schema.org claims and feeds) and the research/discovery runners.
  - API: research, claim, discovery and registry routes behind the new `ai_content.review` permission (the registry uses `ai_content.configure`).
  - Admin: research and fact-review panels, the Fact Review queue, Research Sources and "Find topic ideas".
- **Checks:** 1C spec 20/20; `pnpm test:integration` 364/364 + 5/5; `pnpm test` all passed; e2e 20/20; typecheck, lint, builds, budget, contracts, migration policy.
- **Found and fixed during verification:** Node 24's pinned-lookup `all` form, a stalled compressed read, DB/app clock skew on first due time, and novelty thresholds tightened.
- **Environment:** migration applied to `adelaide_sphere_test` only. `adelaide_sphere_dev` is now 4 migrations behind (domain `.com`, 1A, 1B, 1C). Retained, dev and production migrations remain unauthorised. Nothing deployed.
- **Next:** 1D is blocked on owner decisions (provider, credentials, model/pricing, budgets, byline/disclosure, 1C acceptance). Record: [Phase 1C completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1c-completion.md).


## AI Content Phase 1D — 18 September 2026

- **Scope:** plan §O workstream 1D under the owner's decisions (OpenAI; Terra for articles, Luna for light work, Sol not approved; USD 0.50/day, 10.00/month, 0.25/article, 70% warning).
  - Additive migration `20260918190000_ai_content_generation`: price schedules, budget buckets, generation/cost/provenance fields, `outcome_unknown`, research-bound approvals, the paid-call halt. Two seeded prices are *proposed*, not approved.
  - Database seam: `automation/{budget,providers,generation,review}.ts`.
  - Worker: `openai-provider.ts` and `generation.ts`, built only when `OPENAI_API_KEY` is set.
  - API: generation, approval, proposal, budget, pricing and resolution routes; new `ai_content.generate` and `ai_content.approve` permissions.
  - Admin: article card, budget, Pricing page, author and disclosure settings.
  - Web: the AI disclosure line.
- **Checks:** 1D spec 16/16; `pnpm test:integration` 380/380 + 5/5; `pnpm test` all passed; e2e 20/20; typecheck, lint, builds (web `tsc` only), contracts, migration policy; mutation checks M1–M6 caught.
- **Environment:** migration applied to `adelaide_sphere_test` only; `adelaide_sphere_dev` is 5 migrations behind. No key configured; **no live or paid call made**. Nothing deployed or enabled.
- **Next:** 1E is blocked on owner image decisions. Record: [Phase 1D completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1d-completion.md).

## AI Content Phase 1D review fixes — 19 September 2026

Fixes from a static review of `9b90b6b`:

- **P1:** unknown-outcome resolution is locked and state-conditional, so its cost settles once.
- **P1:** the fact screen no longer certifies. Every AI draft needs a person's fact confirmation (approval kind `facts`, bound to version, material hash and research packet) before approval and publication. Possible sentence-initial names are flagged to the confirmer.
- **P1:** the per-article cap is cumulative across all paid calls for the article.
- **P2:** Retry-After is honoured in full (ms, seconds, HTTP date). Longer than one hour, or unparseable, is held rather than retried.

Additive migration `20260918210000_ai_content_fact_confirmation` (test DB only). Five mutation checks were all caught. Details: [Phase 1D completion record §16](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1d-completion.md).

## Dev database migrated — 19 September 2026

- Owner-authorised: `pnpm db:migrate:deploy` applied the 6 pending migrations to `adelaide_sphere_dev` (`20260917190000_domain_com_au_to_com` through `20260918210000_ai_content_fact_confirmation`). Status: up to date.
- A `mysqldump` of the dev database was taken first (local session scratch, not in the repo).
- Checks: API health 200, public posts 200, web home and blog article 200, AI admin 401 unauthenticated. Two seeded price schedules are present as *proposed*; automation stays disabled. Production is untouched.

## AI Content Phase 1E — 19 September 2026

- **Scope:** plan §O workstream 1E under the owner's image decisions: hybrid, prompt-only by default, Generate image on request only, one featured slot, a separate image budget, human approval with alt text from the image, the configurable disclosure, and the media pipeline authoritative.
- **Migration:** additive `20260919100000_ai_content_images`: `ai_image_jobs`, image operation kind, image budget scopes, image price fields, per-article image mode.
- **Code:**
  - Database: `automation/images.ts` and `editorial/ai-image-gate.ts`, wired into the shared publication policy.
  - Worker: `images.ts`, `openai-image-provider.ts`.
  - API: image routes.
  - Admin: the Featured image card, image pricing, the image budget.
  - Web: the AI image caption.
- **Owner decision recorded:** automatic image mode is not implemented (plan exit "all three modes" is only partly met).
- **Checks:**
  - 1E spec 10/10 (×2); `pnpm test:integration` 393/393 + 5/5; `pnpm test` all passed; e2e 20/20;
  - typecheck, lint, builds (web `tsc` only), contracts, migration policy;
  - mutation checks G1–G8 all caught;
  - 1B/1D publish fixtures now attach an uploaded featured image (new requirement).
- **Environment:** migration applied to `adelaide_sphere_test` only. **Dev is 1 migration behind: the user-started dev API's public article detail returns 500 until it is applied.** No key and no live call. Nothing deployed.
- **Next:** 1F not started. Record: [Phase 1E completion record](/Users/nileshkushvaha/Sites/nodejs/adelaide-sphere/docs/planning/ai-phase-1e-completion.md).

- **Update (19 Sep 2026):** owner-authorised: `20260919100000_ai_content_images` applied to `adelaide_sphere_dev` after a dump; schema up to date. Dev API health, list, article detail and the web article return 200; normal articles keep their photographer credit and show no AI disclosure.
