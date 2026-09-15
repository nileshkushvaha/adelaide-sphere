# ADR 0001 — Administrator authorization with CASL inside a first-party NestJS module

- **Status:** accepted, 7 September 2026
- **Requirements:** SRS 1.1 RBAC 001–012, ADM 001/003, SEC 003, PRIV 001
- **Supersedes:** nothing. The Phase 9 permission guard (`auth/guards/permissions.guard.ts`) is extended, not replaced.

## Context

The client requires roles that carry permissions, roles assigned to administrators, permissions assignable directly to an administrator, an admin interface that shows only what the signed-in administrator may use, and backend enforcement of every permission. The repository already has authentication (opaque cookie sessions, Argon2id, optional TOTP), a `Role`/`Permission`/`RolePermission`/`AdminRole` schema, a code-declared permission catalogue and a default-deny guard. What is missing is direct administrator permissions, active/state flags, a catalogue with labels and modules, an effective-permission resolver with caching and revocation, an administration API and interface, and an authorization audit trail.

## Decision

1. **`@casl/ability` 7.0.1, pinned**, used directly inside a first-party `AuthorizationModule` in `apps/api`. MIT licensed, dual CJS/ESM with bundled types (`dist/esm/index.mjs`, `dist/types/index.d.ts`), one runtime dependency (`@ucast/mongo2js`), no peer dependencies — it composes with this repository's ESM NestJS 12 / TypeScript 6 / Prisma 7 setup without a loader shim.
2. **No third-party NestJS wrapper.** NestJS documents the CASL integration pattern (ability factory, policy handlers, policies guard) but ships no package; the community wrappers add indirection over authentication, Prisma access, caching, error envelopes and testing — all of which this project already owns and must keep owning. We implement the documented pattern ourselves.
3. **No `@casl/prisma`.** The model is a flat set of permission codes; there is no row-level policy requirement in SRS 1.1. Abilities are built with `createMongoAbility`, so a future conditions-based rule can be added without changing the guard contract, but no Prisma-coupled matcher is introduced today.
4. **Grant-only semantics.** Effective permissions are the union of active-role permissions and direct permissions. There are no explicit deny rules: the client has not asked for them, and precedence between deny sources is a support cost. A deny model would need an SRS revision and a migration (RBAC 004).
5. **The server is authoritative.** The admin application consumes effective permission codes from `GET /api/v1/admin/auth/me` through Refine's `accessControlProvider`; it never recomputes role resolution. Hidden navigation is a courtesy, and every route is enforced again by the API.
6. **Cache with a version, not a TTL alone.** Effective permissions are cached in Redis under a key that includes an `authzVersion` held on the administrator row. Any access change increments that version, so the previous entry is unreachable immediately. A cache miss, an unusable value or a Redis outage falls back to the database; a cache failure never grants access.

## Consequences

- One canonical catalogue in `apps/api/src/identity/permissions.ts` keeps permission codes typed; guards reject anything not in it, so a typo cannot become a silent grant.
- CASL earns its place at the policy-evaluation boundary and in the ability object the guard consumes; the resolver, cache, audit and API stay first-party and testable without it.
- Adding a module means adding catalogue entries and running the synchronisation command; nothing becomes visible by default.

## Alternatives considered

- **Keep the plain string check with no library.** Works today, but gives no structure for object-level or conditional policies later, which the SRS explicitly anticipates for state-dependent admin routes.
- **`nest-casl` or similar wrappers.** Faster to start, but they own the guard, the request principal and the caching decisions we already implement to this project's error-envelope and session rules.
- **`@casl/prisma`.** Deferred until a row-level requirement exists and its Prisma 7 compatibility is verified.
