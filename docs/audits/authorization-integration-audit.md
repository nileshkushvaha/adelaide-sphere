# Authorization and authentication integration audit

- **Audit date:** 7 September 2026
- **Auditee:** administrator authentication, roles, permissions and the permission-aware admin interface
- **Working-tree state:** uncommitted work on `master` (last commit `2a679a4`), phases 26–29 plus this audit's remediation. Database: Compose MySQL 8.4 on 127.0.0.1:3307 (`melbourne_sphere_dev`, `melbourne_sphere_test`), Redis 8.4 on 6380. The Homebrew MySQL on 3306 was not touched.
- **Authority:** `docs/Melbourne_Sphere_Technical_SRS_v1.md` revision 1.1 — ADM 001–003, AUTH 001–003, RBAC 001–012, SEC 003, PRIV 001, DAT 001, MOD 002, NFR 006/011/012.
- **Method:** previous completion claims were treated as unverified. Every conclusion below rests on code read in this audit, a test run in this audit, or a request made against the running stack in this audit.

## 1. Scope

In scope: the Prisma models and migrations for administrators, roles, permissions and assignments; the authentication guard chain; the effective-permission resolver and its Redis cache; the CASL ability and the permissions guard; the access administration API; the audit trail; the Refine access-control integration and the admin screens; the tests; environment examples; and the current working tree.

Out of scope: public-site authorization (there is none — no public accounts exist, SCP), the email provider, and the deployment platform.

## 2. Architecture as implemented

```
POST /admin/auth/login ─ Argon2id + optional TOTP ─▶ opaque session (MySQL, hashed token)
        │
        ▼  cookie ms_admin_session (HttpOnly, SameSite=Strict, Path=/api/v1/admin)
CsrfOriginGuard ─▶ SessionAuthGuard ─▶ PermissionsGuard          (global, in this order)
        │                  │                    │
        │                  │                    └─ AbilityFactory (@casl/ability 7.0.1)
        │                  │                         rules: can(<permission code>, 'AdminResource')
        │                  └─ IdentityService.getPrincipal
        │                        └─ EffectivePermissionsService.resolve
        │                              ├─ Redis  authz:admin:{id}:v{authzVersion}   (TTL 300 s)
        │                              └─ MySQL  active roles ∪ direct permissions, active only
        ▼
controller (@RequirePermissions) ─▶ service (object-level checks, transactions + audit)
        ▼
{data} / {error:{code,message,fields,requestId}}
        ▼
admin: authProvider.getPermissions → accessControlProvider.can → RequirePermission route guard,
       AdminShell navigation, useCapabilities().can(...) on individual controls
```

| Element | Implementation |
| --- | --- |
| Canonical permission registry | `apps/api/src/identity/permissions.ts` — 22 codes with label, description, module, active/system state |
| Naming convention | `resource.action`, lower snake case; enforced by `permissions.spec.ts` |
| Assignment source of truth | `admin_roles`, `role_permissions`, `admin_permissions` (MySQL) |
| Effective-permission resolver | `apps/api/src/authorization/effective-permissions.service.ts` (the only implementation) |
| CASL integration | `apps/api/src/authorization/ability.factory.ts`, used directly; no wrapper package |
| Guard/decorator | `@RequirePermissions` / `@SessionOnly` / `@Public` + `PermissionsGuard` (default deny) |
| Authn→authz boundary | `SessionAuthGuard` attaches the principal; `PermissionsGuard` decides. Guard order asserted in `app.setup.ts` and proven by the 401-before-403 sweep |
| Cache | Redis, key scoped by administrator id **and** `admin_users.authzVersion` |
| Invalidation | `authzVersion` increment inside the same transaction as the change; sessions revoked too |
| Audit | `audit_logs` under the `authz.*` action family, written with the transaction client |
| Capability endpoint | `GET /api/v1/admin/auth/me` |
| Refine integration | `apps/admin/src/auth/{access-control.ts,CapabilityProvider.tsx,RequirePermission.tsx,capability-lifecycle.ts,permissions.ts}` |
| Screens | `apps/admin/src/pages/access/*` and the access card on an administrator's page |

**Competing implementations:** one was found and removed — see C1. After remediation, every role assignment in the codebase passes through `AuthorizationService.assertMayAssignRoles`, and every last-super-admin check through `assertNotLastSuperAdminTx`.

## 3. Requirement matrix

| Requirement | Verdict | Evidence |
| --- | --- | --- |
| RBAC 002 catalogue declared in code, not creatable through the UI | Met | `permissions.spec.ts`; `admin/permissions` is read-only (`POST` → 404, audit spec); drift test `apps/admin/src/auth/permissions.test.ts` |
| RBAC 003 roles: state, protection, safe deletion | Met | audit spec (protected role delete/deactivate/edit refused; role-in-use refused); schema spec (unique key, restrict) |
| RBAC 004 roles + direct grants, no deny semantics | Met | authorization integration spec; no deny column or code path exists (grep: no `deny` in the authorization module) |
| RBAC 005 effective = active roles ∪ direct, active only | Met | 8 calculation cases in the integration spec; runtime persona matrix |
| RBAC 006 default deny, 401/403, object-level checks | Met | runtime sweep of **all 137** admin routes; IDOR test on session revocation |
| RBAC 007 principal endpoint returns only approved fields | Met | field-by-field assertion + secret regex in the audit spec |
| RBAC 008 administration API, versioned, transactional, bounded | Met | audit spec (idempotency, 409, rollback, pagination cap, mass-assignment refusal) |
| RBAC 009 cache and revocation | Met | version-bust, corrupt-entry, cross-user and Redis-outage tests; measured 49 ms end-to-end revocation |
| RBAC 010 permission-aware interface | Met after M1–M3 | admin unit tests (navigation, forbidden route, loading state, action gating, capability lifecycle) + browser run |
| RBAC 011 privileged invariants | Met after C1/H1/H2 | 8 refusal tests including two concurrency tests |
| RBAC 012 audit in the same transaction, no secrets | Met | audit spec (rollback with the change, secret regex, immutability) |
| AUTH 002 session rotation on privilege change | Met after H3 | privilege change now revokes the target's sessions in the same transaction |
| ADM 001 last super admin, no shipped credentials | Met after H1 | concurrency tests; bootstrap reads operator input (`cli/bootstrap-admin.ts`) |

## 4. Findings

Severity is practical impact: **Critical** = privilege escalation or authorization bypass reachable by an authenticated administrator; **High** = an invariant that can be broken, or a control the SRS requires that is absent; **Medium** = a real weakness with a bounded blast radius or a requirement met only partly; **Low** = hygiene, defence in depth, or an accepted risk.

### C1 — Critical — Self-escalation and unrestricted role granting through the administrator account endpoints

`PATCH /api/v1/admin/admins/{id}` and `POST /api/v1/admin/admins` accepted `roleKeys` and applied it with **only** `admins.manage`. They did not check self-editing, did not check that the acting administrator holds what they are handing out, and did not check that the role is active. An administrator whose job is managing accounts could therefore grant themselves `super_admin` in one request — the exact escalation RBAC 011 exists to prevent — while the audited, invariant-checked path (`PUT /admins/{id}/roles`) sat beside it unused.

*Evidence (before the fix):* `refuses an administrator granting themselves a role (PATCH /admins/{id})` → **200 OK**, and the attacker ended the request holding all 22 permissions.

*Fix:* both endpoints now require `admins.access.manage` for the role part of the payload and call `AuthorizationService.assertMayAssignRoles` (no self-edit, active roles only, protected role only from a holder, nothing carrying a permission the actor lacks). `apps/api/src/admins/admins.service.ts`, `apps/api/src/authorization/authorization.service.ts`.

### H1 — High — The last-super-admin invariant was not concurrency-safe

The check counted other active super administrators **outside** the transaction that then removed the role or disabled the account. Two requests could each observe a survivor and both commit.

*Evidence (before the fix):* two parallel demotions returned `[200, 200]` and left **zero** active super administrators — a deployment locked out of its own administration.

*Fix:* `assertNotLastSuperAdminTx` takes `SELECT … FOR UPDATE` on the protected role row inside the transaction and re-counts there; applied to role replacement, account update and account disable. Both concurrency tests now observe `[200, 409]` and at least one surviving super administrator.

### H2 — High — Inactive roles were assignable through the account endpoint

`PATCH /admins/{id}` resolved roles by key with no active check, so a deactivated role could be re-attached (it would grant nothing, but the assignment misrepresents access and would come back the moment the role was reactivated). *Evidence:* expected 400, got 200. *Fix:* same shared checks as C1.

### H3 — High — Privilege changes did not end the target's sessions

SRS AUTH 002 requires session rotation on privilege change, and the older account endpoint did revoke sessions — but the new `PUT /admins/{id}/roles`, `PUT /admins/{id}/permissions` and `PUT /roles/{id}/permissions` did not. Access was withdrawn on the next request through the cache version, but the session itself continued.

*Fix:* every privilege change revokes the affected administrators' sessions inside the same transaction. Confirmed at runtime: a live session went from `200` to `401` (rather than `403`) 49 ms after its role lost a permission.

### M1 — Medium — Frontend capability cache survived logout

`latestPermissions` in `AppProviders` was set on `getPermissions` and never cleared, so after a logout or an expired session the previous administrator's codes still answered `accessControlProvider.can` until a new `/me` resolved. The API was never fooled; the interface could be. *Fix:* extracted to `auth/capability-lifecycle.ts` — cleared on logout, on an error that logs out, and on a failed session check — with six unit tests.

### M2 — Medium — Editors rendered as read-only before capabilities were known

The business, article and author editors computed `readOnly` from capabilities that were still loading, so for one render an administrator with write access saw a disabled form. *Fix:* those screens wait (`PageLoader`) until capabilities are known, which is what RBAC 010 asks for. Behind the route guard this is invisible.

### M3 — Medium — Raw permission strings in the interface

Ten checks such as `(permissions ?? []).includes('listings.publish')` were spread across eight screens, outside the typed catalogue and outside the drift test. Functionally correct, but a rename or typo would fail silently and open a control. *Fix:* all replaced with `useCapabilities().can(PERMISSION.…)`; the API-versus-admin drift test now covers every one.

### M4 — Medium — Unused dev dependency carrying five high advisories

`@nestjs/mau` (Nest's deployment CLI, from the scaffold) was a devDependency with no usage, pulling `undici` and `tmp` advisories into the tree. *Fix:* removed; high-severity advisories fell from 9 to 4.

### L1 — Low — Dead authorization code

The superseded unlocked `assertNotLastSuperAdmin` and `resolveRoles` in `AdminsService` were unreachable after the C1/H1 fixes. Removed, so no second implementation can be called by mistake.

### L2 — Low — Transitive advisories with no upstream fix

`mariadb` and `mysql2` (cleartext password to a man-in-the-middle during auth-plugin downgrade), `path-to-regexp` (admin bundle, DoS) and `deepmerge-ts` (Prisma CLI, dev-only). Mitigation already required by CLAUDE.md and the runbook: production database connectivity uses verified TLS, which removes the MitM precondition. Recorded, not fixed here — no patched version is reachable through Prisma 7 / Refine 5.

### L3 — Low — No rate limit on authenticated access-control mutations

Login is throttled; role and assignment mutations are not. Exploiting this needs `roles.*`/`admins.access.manage` already, and every attempt is audited. Deferred with a plan (§7).

### L4 — Low — Two queries per guarded request, no request coalescing

A guarded request costs one administrator lookup plus a cache read (one more query on a miss); concurrent misses do not coalesce. Measured: 11.5 ms per request warm, 20 concurrent requests in 82 ms. No action — the cost is bounded and the stampede protection used for public reads would add complexity here for no measured gain.

### L5 — Low — Static route scanning is unreliable for audit evidence

Scanning controller sources mis-attributes decorators (order is arbitrary, and files hold more than one controller). The matrix in `docs/audits/route-authorization-matrix.md` is generated from the built application's module container instead, and the runtime sweep is the real proof.

## 5. Verified correct (no defect found)

Recorded so the next audit knows these were tested, not assumed:

- **Default deny across the whole surface**: all 137 admin routes refuse a permission-less administrator with 403 and an anonymous caller with 401, except the 5 public and 9 session-only routes named in the sweep.
- **`/admin/dashboard`** is session-only by design and is scoped to the caller: a permission-less administrator receives no metrics and no activity (verified at runtime; super administrator sees 8 metrics, `nobody` sees none).
- **IDOR**: `DELETE /admin/auth/sessions/{id}` is scoped to the caller's own sessions — another administrator's session id returns 404 and stays live.
- **Cache**: entries are per-administrator and per-version; a corrupt, truncated, wrong-shaped or `null` entry falls back to the database; a Redis outage neither grants nor loses access; a direct database edit without a version bump is deliberately not observed.
- **Audit**: `authz.*` events carry actor, target, request id and a safe added/removed summary; no route can modify or delete them; no secret material appears in any event.
- **Schema against real MySQL**: composite uniqueness rejects duplicate assignments; foreign keys reject orphans; a permission that is still assigned cannot be deleted; deleting an administrator removes their assignments but keeps the audit rows with the actor nulled; the granting administrator's deletion nulls `assignedById` rather than dropping the assignment; all eight access-control tables are `utf8mb4_unicode_ci`; the reverse-lookup indexes exist.
- **Contract**: `/admin/auth/me` returns exactly `{admin:{id,email,displayName,roles,permissions,inheritedPermissions,directPermissions,totpEnabled}, session:{id,createdAt,idleExpiresAt,expiresAt}}` — no hash, token, secret or `authzVersion`.
- **Payloads**: undeclared fields are refused (400), oversized payloads are refused before any write, `pageSize` is capped at 50, and role text with markup or SQL is stored and returned verbatim as data.
- **Dependencies**: `@casl/ability` 7.0.1 with `@ucast/*`; no advisories against them, no duplicate authorization library, no wrapper, and no CASL in the admin or public bundles.

## 6. Validation results

Run after remediation:

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | clean, lockfile unchanged |
| `pnpm db:validate` / `db:generate` / `db:migrate:status` | schema valid, client generated, 20 migrations applied, no drift |
| `pnpm db:migrations:check` | policy OK |
| API lint / typecheck | clean |
| API unit | 29 files, 178 tests |
| API integration (real MySQL + Redis) | 23 files, 168 tests — including the 21 attack scenarios, 4 route-sweep/IDOR tests and 8 schema-constraint tests added by this audit |
| Admin lint / typecheck | clean |
| Admin unit | 29 files, 129 tests |
| Playwright journeys | 34 passed, 4 skipped (admin credentials absent by design) |
| Production builds | api, admin, web, worker, database all build |
| `pnpm check` (root aggregate) | green |
| Secret scan of trackable files | clean — no session token, persona password or key |
| Runtime scenarios | five personas, matrix in §7 |

### Runtime scenario matrix (live API)

| Persona | Login | Effective | Inherited | Direct | /auth/me | /dashboard | /posts | /media | /reviews | /roles | /admins |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Super administrator | 200 | 22 | 22 | 0 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| Role-limited (editor) | 200 | 3 | 3 | 0 | 200 | 200 | 200 | 200 | **403** | **403** | **403** |
| Editor + direct `reviews.moderate` | 200 | 4 | 3 | **1** | 200 | 200 | 200 | 200 | **200** | 403 | 403 |
| No permissions | 200 | 0 | 0 | 0 | 200 | 200 (empty) | **403** | **403** | **403** | **403** | **403** |
| Inactive account | **401** | — | — | — | — | — | — | — | — | — | — |

Live revocation: with the editor's session open, the role lost `posts.write`; the same session went `200 → 401` in **49 ms**.

Browser (admin at 127.0.0.1:3002, editor persona): navigation showed only Overview and Editorial — no Directory, Community, Configuration, Roles, Permissions, Administrators or Audit; `/admin/roles` typed directly rendered the accessible forbidden page while the underlying API answered 403 with a request id; signing out returned to the sign-in screen and `/auth/me` answered 401.

Test credentials for the personas were random, single-use, held only in the session scratchpad, and the accounts are removed at the end of this audit. No credential appears in any tracked file.

## 7. Remaining risks and deferred recommendations

| Item | Risk | Recommendation |
| --- | --- | --- |
| L2 transitive advisories | Low in production with TLS; the MitM precondition is removed by verified TLS to MySQL | Re-check when Prisma or Refine ship updated transitive ranges; keep the TLS requirement in the deployment checklist |
| L3 no throttling on access-control mutations | Low — requires privileged access already, and every attempt is audited | Add a per-administrator ceiling when the general admin-mutation throttling design is done, rather than a one-off limiter here |
| Redis holds effective permission sets | Anyone with Redis access could widen a cached set for up to 300 s | Redis is already password-protected and bound to localhost in development; production requires an isolated instance. Consider signing cache entries if Redis is ever shared |
| Direct database edits | An operator editing `admin_roles` by hand will not be observed until `authzVersion` changes | Documented in `docs/authorization.md`; the recovery procedure says to bump it |
| Four Playwright admin journeys skip without credentials | Coverage gap in CI only | Provide `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` from the secret store when staging exists |
| Explicit deny semantics absent | By design (RBAC 004) | Only through an SRS revision and a migration; do not add precedence rules informally |

## 8. Conclusion

The implemented model — authentication first, then effective permissions as the union of active-role and direct grants, enforced by a default-deny guard through CASL and mirrored (never re-derived) in the admin interface — is sound, and the database, cache and audit behaviour behind it hold up under adversarial testing.

It was not correct as found. One critical escalation path (C1) let an account manager make themselves a super administrator, and the last-super-admin invariant (H1) could be raced into leaving the deployment with no super administrator at all. Both were reachable through supported endpoints with ordinary permissions, and both existed because a second, weaker assignment path had been left in place beside the audited one. Those, and the four other confirmed defects, are fixed in this working tree, each with a test that fails against the old behaviour.

**Verdict: the integration is correct as of this audit**, on the evidence in §3–§6, with the residual risks in §7 accepted and recorded. The completion criteria are met: authentication precedes authorization; enforcement is complete across all 137 admin routes; default deny holds; role and direct permissions both work; revocation is immediate and also ends the session; the super-admin invariants resist concurrency; self-escalation is blocked on every path; assignment changes and their audit records are transactional; interface visibility matches backend permissions and direct URLs stay protected; real database constraints, Redis failure and cache corruption all behave safely; tests cover the negative cases; the documentation matches the implementation; and no credential was exposed.

---

# Closure addendum — 7 September 2026

The findings above are unchanged; this records what happened to the items left
open, and the new evidence. Working tree: uncommitted on `master`.

## Items closed

### L3 — throttling on privileged mutations (was: deferred)

**Closed.** `SensitiveThrottleGuard` runs last in the guard chain, so it meters
what an already-authorised session may do and never turns a missing permission
into a misleading 429. Marked routes: administrator creation, update, enable,
disable, setup-link resend, session revocation (single and all), role create,
update, delete, role-permission replacement, and administrator role and
direct-permission replacement.

- **Limits:** 20 per minute and 200 per hour, per administrator. Saving a role is
  two requests, so the minute window clears ten roles a minute — above deliberate
  editing, far below scripted abuse.
- **Key:** the authenticated administrator id. Never the client address:
  `X-Forwarded-For` is meaningful only for the documented `TRUST_PROXY` hops, so
  a control keyed on it could be removed by a misconfiguration. The address is
  logged with a refusal, nothing more.
- **Redis outage:** a per-process fallback of 5 per minute, not an open door and
  not a closed one — an operator can still restore access during an outage. With
  N replicas the effective ceiling is 5N, accepted deliberately and documented.
- **Refusal:** `429` with `{error:{code:'RATE_LIMITED',…,requestId}}` and
  `Retry-After`; no counter names, no remaining budget.
- **Evidence:** `sensitive-throttle.service.spec.ts` (5 unit cases incl. the
  fallback and the per-administrator keying) and an integration test proving 30
  consecutive reads are unmetered while creations are refused after the burst,
  with the envelope and header checked.

### Skipped browser journeys (was: coverage gap in CI only)

**Closed.** The four credential-gated journeys are replaced by five that run:
`e2e/specs/authorization.spec.ts`, on desktop **and** at 320 px, with
`e2e/specs/provisioning.ts` creating the administrators.

Provisioning refuses `NODE_ENV=production` and any database whose name does not
end in `_dev`, `_test` or `_e2e`; passwords are `crypto.randomBytes` per run,
held in memory only; accounts use a fixed `e2e-authz-` prefix and are removed in
`afterAll` **and** before provisioning, so a mid-run failure leaves nothing
usable. A missing or unsafe database fails the run with the reason rather than
skipping silently. Verified afterwards: zero leftover accounts or roles.

Proven by the journeys: permission-aware navigation (desktop and drawer),
forbidden direct navigation with the API still answering 403, allowed action
visibility, forbidden action suppression, a direct grant with no role at all,
live revocation during an open session, and logout clearing the session and the
browser state. Suite total: **44 passed, 0 skipped** (was 34 passed, 4 skipped).

### L2 — dependency advisories (was: recorded, not fixed)

**Dispositioned**, with a new finding fixed. Full table:
`docs/security/dependency-advisories.md`.

The `mariadb` advisory *is* on a used code path, and its fix is unreachable —
`@prisma/adapter-mariadb@7.10.0` (the latest) pins `mariadb` to exactly `3.4.5`,
so only an override could change it. The mitigation the original audit relied on
was verified TLS — and **that mitigation did not exist in code**: the connection
layer never passed an `ssl` option, so production could not use TLS even if it
was configured. Fixed in this closure:

- `parseMysqlUrl` reads `?sslmode=` (`disabled` | `required` | `verify-ca` |
  `verify-identity`) and `?sslca=`, rejecting anything else instead of ignoring it;
- `createDatabaseClient` maps that onto the driver's `ssl` option (an object is
  verifying unless `rejectUnauthorized` is explicitly false);
- **production refuses to start** unless the mode verifies, alongside the
  existing refusal of `DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL=true`;
- `.env.example`, the operations runbook and the advisory document carry the
  exact URLs.

Evidence: `env.validation.spec.ts` (production rejects no-TLS, `disabled` and
`required`, accepts both verifying modes, and never echoes the connection
string) and `url.spec.ts` (parsing, refusal of unknown modes, driver mapping).
`mysql2`, `deepmerge-ts`, `path-to-regexp` and `uuid` are not on runtime paths;
each has a recorded revisit trigger.

### Operational consistency (was: documented in passing)

**Closed.** `docs/operations/authorization-runbook.md` states the supported rule
(change access through the API), the emergency database procedure with the
required `authzVersion` bump and session revocation, and the recovery path. New
command `pnpm --filter api authz:verify [email]` reports the deployment
invariants or one administrator's roles, inherited/direct/effective permissions,
live sessions **and whether the cache is in step with the database**, exiting
non-zero when it is not. No polling was added: the cache is version-scoped by
design, and an unsupported manual edit is a procedure question, not a daemon.

## Closure validation (7 September 2026)

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | clean |
| Prisma validate / generate / migrate status / policy | clean, 20 migrations, no drift |
| API lint, typecheck | clean (3 pre-existing unused-import warnings, unrelated) |
| API unit | 30 files, 185 tests |
| API integration (real MySQL + Redis) | 23 files, 169 tests |
| Database package (real MySQL) | 3 files, 27 tests |
| Admin lint, typecheck, unit | clean; 29 files, 129 tests |
| Playwright | **44 passed, 0 skipped** (desktop + 320 px) |
| Production builds | api, admin, web, worker, database |
| `pnpm check` | green |
| Secret scan | clean; e2e fixtures verified removed |

## Remaining accepted risks after closure

- `mariadb` 3.4.5 stays until Prisma pins ≥ 3.4.7; mitigated by enforced
  verified TLS in production and a private network segment.
- The Redis fallback ceiling is per replica (5 × replicas during an outage).
- Redis holds effective permission sets; a compromised Redis could widen one for
  up to five minutes. Isolated instance required in production.
- A manual database edit that skips the runbook is invisible until the version
  changes; `authz:verify` detects it on demand.
- No deny semantics (SRS RBAC 004, deliberate).
