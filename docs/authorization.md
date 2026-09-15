# Administrator authorization

How access control works in Melbourne Sphere: the model, where it is enforced, how to protect new code, and what to do when it goes wrong.

Specification: SRS 1.1 **RBAC 001–012** (section 10), with ADM 001/003, AUTH 002, SEC 003, PRIV 001. Technology decision: [ADR 0001](decisions/0001-authorization-casl.md).

## 1. The model

```
Administrator (active)
├── roles (active)
│     └── permissions (active)
└── direct permissions (active)

effective = role permissions ∪ direct permissions
```

- **Grant only.** There are no deny rules. The absence of a grant is denial, so there is no precedence to reason about. Adding deny later would need an SRS revision and a migration (RBAC 004) — it is a deliberate omission, not an oversight.
- **Direct permissions are additive.** They exist so one administrator can be given one extra capability without inventing a role for it.
- **Anything inactive contributes nothing**: an inactive role, a retired permission, or an administrator whose account is not `active` (their effective set is empty regardless of what is assigned).
- **Duplicates collapse.** A permission held through two roles and directly is one entry; the interface shows all of its sources.

The calculation lives in exactly one place: `apps/api/src/authorization/effective-permissions.service.ts`. Nothing else recomputes it — not the admin application, not another service.

## 2. Permission codes

`resource.action`, lower snake case, declared in `apps/api/src/identity/permissions.ts` with a label, a description, the sidebar **module** and **menu item** it belongs to, and its **action** (View, Create, Update, Publish, Delete or a named extra such as Redact).

**One menu item, its own codes** (SRS change log 1.13). Every admin menu item has a View code that opens it and a code per action it has, so SEO settings, Home page settings and General settings can be given to different people. The role editor shows the catalogue as the sidebar: a section per sidebar group, a row per menu item, a column per action. Ticking an action ticks the row's View; unticking View removes the row's actions.

The code catalogue is the source of truth. `pnpm --filter api admin:seed-rbac` synchronises it into the `permissions` table (idempotent; safe on every deployment). Administrators **assign** permissions; they never create them, so a misspelt or unknown code cannot exist to be granted. A code that is not in the catalogue can never satisfy a requirement, even if a row for it exists in the database.

Retiring one: set `active: false` on the entry and re-run the synchronisation. The row and its assignments stay for the audit trail while granting nothing.

**Splitting one.** Add the new codes with `migratesFrom: ['old.code']` and retire the old one. The synchronisation run that first creates a new code copies every role and direct grant of the old code onto it (one transaction per code, audited as `authz.permission.migrated`, cache versions bumped), so nobody gains or loses access on deploy. It runs once per code: a grant removed afterwards is never re-added. `authz:verify` lists holders of an old code who lack a replacement.

| Retired in 1.13 | Replaced by |
| --- | --- |
| `settings.manage` | `settings.general.view/update`, `settings.home.view/update`, `settings.seo.view/update`, `website.pages.view/create/update/publish/delete` |
| `taxonomy.manage` | `categories.view/create/update`, `services.view/create/update`, `areas.view/create/update` |
| `listings.write` | `listings.create`, `listings.update` (plus `featured.view/manage` from `listings.read`/`listings.publish`) |
| `posts.write` | `posts.view/create/update`, `authors.view/create/update`, `blog_categories.view/create/update`, `blog_tags.view/create/update` (plus `posts.feature` from `posts.publish`) |
| `media.manage` | `media.view/upload/update/delete` |
| `redirects.manage` | `redirects.view/create/update/delete` |
| `admins.manage` | `admins.view/create/update/status` |
| `community.contacts.view` | `enquiries.contact.view`, `reviews.email.view`, `comments.email.view`, `reports.email.view` |
| — (1.16) | `media.documents.upload` is new and carried over from nothing: a Super Admin assigns it, and image uploaders do not receive it |
| `audit.read` (1.14) | `activity.authentication.view`, `activity.access_control.view`, `activity.content.view`, `activity.moderation.view`, `activity.communication.view`, `activity.configuration.view`, `activity.system.view` — the activity log and dashboard activity show only those areas |

Narrowed, with new siblings carried over: `reviews.moderate` (+ `reviews.view`, `reviews.redact`), `comments.moderate` (+ `comments.view/redact/reply`), `reports.manage` (+ `reports.view`), `enquiries.manage` (+ `enquiries.retry`), `website.menus.manage` (+ `website.menus.assign`), `system.queues.cancel` (+ `system.queues.clean`), and `system.status.view` was first carried over from `audit.read` (itself retired in 1.14).

The admin application mirrors the codes in `apps/admin/src/auth/permissions.ts`; `permissions.test.ts` compares the two lists and fails if they drift.

## 3. Where it is enforced

**Every admin route declares its permission**, and the global guard chain runs in order: CSRF origin → session → permissions.

```ts
@RequirePermissions('listings.publish')
@Post(':id/publish')
publish(...) {}
```

- A route that declares nothing is **refused** (`PERMISSION_UNDECLARED`) and logged as a programming error. A new endpoint cannot ship open.
- `@RequireAnyPermission('categories.view', 'listings.create', …)` accepts any one of the codes. It is only for a lookup another screen depends on — the listing editor's categories, services and areas, the article editor's authors, blog categories and tags, the editor link search — so holding that screen's permission is enough. `routes:matrix` prints these as `a | b`, and flags any route still carrying a retired code as `RETIRED(…)`.
- `@SessionOnly()` is for routes that need identity but no capability (`/auth/me`, logout). `@Public()` is for login, forgot- and reset-password only.
- **401** when authentication is missing, invalid, expired or revoked. **403** when the identity is valid but the permission is absent, or an account, role or permission is inactive. Bodies use the standard envelope with the request id and say nothing about which permission was missing or where it would have come from.
- Where access depends on the loaded record, repeat the check in the service with the record in hand. A permission check on the URL alone cannot know whether *this* listing may be published.

The decision itself goes through CASL: `AbilityFactory` turns the effective codes into an ability, and the guard asks it. **The whole code is the CASL action on one subject** — splitting `admins.manage` into `can('manage', 'admins')` would use CASL's `manage` wildcard and silently grant `admins.access.manage`. There is a unit test for exactly that.

## 4. The current principal

`GET /api/v1/admin/auth/me` returns the administrator's id, name, email, active roles, **effective** permission codes, the inherited and direct halves, and session metadata. Nothing else — no password material, no session secret, no permission graph. This response is the authority the interface consumes.

## 5. Administration API

All under `/api/v1/admin`, each with its own permission:

| Endpoint | Permission |
| --- | --- |
| `GET /permissions` | `permissions.view` |
| `GET /roles`, `GET /roles/{id}` | `roles.view` |
| `POST /roles` | `roles.create` |
| `PATCH /roles/{id}`, `PUT /roles/{id}/permissions` | `roles.update` |
| `DELETE /roles/{id}` | `roles.delete` |
| `GET /admins/{id}/access` | `admins.view` |
| `PUT /admins/{id}/roles`, `PUT /admins/{id}/permissions` | `admins.access.manage` |
| `GET /activity?action=authz.*` | any `activity.*.view`; results limited to the areas held (`authz.*` needs `activity.access_control.view`) |

**Replacement, not patching.** Assignment endpoints take the complete set the caller intends to end up with. Repeating a request changes nothing (idempotent), the payload states the end state rather than a diff, and `expectedVersion` refuses a write made against a stale view with `409 STALE_VERSION`. Every mutation runs in one transaction containing the change, its audit record, the cache invalidation and the revocation of the target's sessions.

**One set of rules, whichever endpoint is used.** `PATCH /admins/{id}` and `POST /admins` also assign roles. They require `admins.access.manage` for that part of the payload and go through the same `assertMayAssignRoles` checks as `PUT /admins/{id}/roles`; there is no second, weaker path to the same change.

**A privilege change ends the target's sessions** (AUTH 002). Withdrawn access stops at the next request through the version-scoped cache, and the session itself is revoked, so an open browser cannot continue on the old footing.

## 6. Caching and revocation

Effective permissions are cached in Redis under `authz:admin:{id}:v{authzVersion}`. The version lives on the administrator row and is incremented — inside the same transaction as the change — whenever their roles, their direct permissions, their status, or a role they hold changes. The old key becomes unreachable immediately, so **no withdrawn access survives to a TTL** (the 5-minute expiry only bounds unused entries).

If Redis is unavailable, or returns something unusable, the resolver reads MySQL. A cache failure never grants access, and never denies it either. Nothing secret is ever part of a cached entry.

Changing the tables directly (a console, a fixture) does **not** signal a change. Increment `authzVersion` for the affected administrators, exactly as the API does.

## 7. Audit

Every access-control mutation writes an `authz.*` entry through `AuditService.recordWith(tx, …)`, in the same transaction as the change: `authz.role.create`, `authz.role.update`, `authz.role.permissions`, `authz.role.delete`, `authz.admin.roles`, `authz.admin.permissions`. Each carries the actor, the target, a safe before/after summary (which codes were added and removed — never a whole request body), the request id, the address and the user agent. Role events keep the role's key and name as text, so history survives the role.

Read them with `GET /api/v1/admin/audit?action=authz.*`.

### Concurrency

The last-super-admin invariant is not a count followed by a write. Inside the transaction that makes the change, `assertNotLastSuperAdminTx` takes `SELECT … FOR UPDATE` on the protected role row and then re-counts. Two administrators demoting the two remaining super administrators at the same moment therefore serialise: one commits, the other is refused with `409 LAST_SUPER_ADMIN`. The same applies to disabling an account. This is proven by concurrent-request tests in `authorization-audit.integration-spec.ts`.

## 8. The protected Super Admin role

`super_admin` is a system role. The API refuses to delete it, deactivate it, unprotect it or hand-edit its permissions — the catalogue synchronisation gives it every active permission, and repairs it if it was tampered with.

Refused by design (each recorded):

- removing the role from, or disabling, the **last active super administrator**;
- an administrator changing **their own** roles or permissions;
- granting a permission the acting administrator does not hold themselves;
- assigning an unknown, retired or inactive permission, or an inactive role;
- deleting a role that is still assigned to somebody;
- assigning roles through the administrator account endpoints without `admins.access.manage`.

## 9. The admin interface

Refine's `accessControlProvider` (`apps/admin/src/auth/access-control.ts`) answers from the server's codes. `RequirePermission` guards every route from one canonical mapping (`ROUTE_PERMISSIONS`), rendering a waiting state while capabilities are unknown and an accessible forbidden page when they are not held. `useCapabilities().can(...)` is the only way a component asks; no component compares raw strings.

Hiding is a courtesy. A URL typed by hand still reaches an API that answers 403.

Screens: **Roles** (list, editor with a permission matrix grouped by module), **Permissions** (read-only catalogue), and the **access editor** on an administrator's page (roles, direct permissions, effective set with the source of each entry).

## 9a. Rate limits on privileged mutations

Every route that changes access — administrator status, roles, direct
permissions, role state, role permissions, session revocation — is marked
`@SensitiveMutation()` and metered per administrator: **20 a minute, 200 an
hour**. Ordinary reads are not metered. The guard runs after authorization, so a
missing permission is still `403`, never a misleading `429`.

The counter is keyed on the authenticated administrator id, not the client
address: `X-Forwarded-For` only means anything for the `TRUST_PROXY` hops the
deployment documents. When Redis is unavailable a per-process fallback of 5 a
minute applies — a ceiling rather than a closed door, so access can still be
restored during an outage.

Marking a new privileged route is one decorator:

```ts
@RequirePermissions('roles.update')
@SensitiveMutation()
@Patch(':id')
```

## 10. Recipes

**Protect a new endpoint**

1. Add the code to `apps/api/src/identity/permissions.ts` with a label, description and module.
2. Declare it: `@RequirePermissions('thing.action')`.
3. Run `pnpm --filter api admin:seed-rbac`.
4. Mirror the code in `apps/admin/src/auth/permissions.ts` (the contract test enforces this).
5. Grant it to a role. Nothing is visible to anyone until you do.

**Expose a new admin screen**

1. Add its path and required codes to `ROUTE_PERMISSIONS`.
2. Add the navigation entry with the same `permission` in `AdminShell.tsx`.
3. Gate in-page controls with `useCapabilities().can(...)`.

**Bootstrap the first administrator**

`pnpm --filter api admin:bootstrap` reads credentials from operator input, validates them, hashes with Argon2id, refuses unsafe defaults, seeds the catalogue and the protected role, and audits the result. No password is ever shipped or seeded. Rotate it with the reset-link flow afterwards, and disable the bootstrap account once real administrators exist (`POST /admin/admins/{id}/disable` — the last active super administrator cannot be disabled, so create the replacement first).

**Verify a deployment or one administrator**

`pnpm --filter api authz:verify [email]` — invariants, or one administrator's
roles, inherited/direct/effective permissions, live sessions and whether the
cache is in step with the database. Non-zero exit when something is wrong. The
emergency procedure lives in `docs/operations/authorization-runbook.md`.

**Recovery: all administrator access lost**

1. Restore access on the server, not through the interface: run `pnpm --filter api admin:bootstrap` with fresh operator-supplied credentials. It creates a new super administrator; existing data is untouched.
2. If an administrator exists but has lost their role, re-run `admin:seed-rbac` (it repairs the protected role) and assign it with a direct database statement, then **increment that administrator's `authzVersion`** so the cache is retired.
3. Every recovery step is auditable: record who ran it and why in `docs/operations/`.

**Production requirements**

- `admin:seed-rbac` runs on every deployment, after migrations.
- Redis is expected but not trusted: authorization survives its absence.
- The bootstrap account is disabled or rotated after handover.
- Session cookies stay `Secure`, `HttpOnly`, `SameSite=Strict`, scoped to `/api/v1/admin`; a privilege change revokes sessions.
- Audit retention follows PRIV 001; authorization events are never pruned ahead of it.
