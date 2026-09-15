# Authorization operations runbook

How to change, inspect and recover administrator access in a running deployment.
Model and developer guidance: `docs/authorization.md`. Requirements: SRS RBAC
002–012, ADM 001, AUTH 002.

## The supported rule

**Change access through the application, never with SQL.** The API is the only
path that applies the invariants, writes the audit record, retires the cached
permissions and ends the affected sessions — in one transaction:

| Change | Where |
| --- | --- |
| An administrator's roles | Administrators → the administrator → Roles, or `PUT /api/v1/admin/admins/{id}/roles` |
| An administrator's direct permissions | the same screen, or `PUT /api/v1/admin/admins/{id}/permissions` |
| What a role carries | Roles → the role, or `PUT /api/v1/admin/roles/{id}/permissions` |
| Role status | Roles → the role → Active, or `PATCH /api/v1/admin/roles/{id}` |
| Administrator status | Administrators → Disable/Enable |
| The permission catalogue | code, then `pnpm --filter api admin:seed-rbac` |

A direct database edit skips all four of those steps. The effective-permission
cache is keyed by `admin_users.authzVersion`, so **an edit that does not change
that column is not observed**: the administrator keeps their previous access
until the entry expires (five minutes) or something else bumps the version.
This is deliberate — it is what makes revocation immediate for supported changes
— and it is why the procedure below exists rather than a watcher polling the
database for edits nobody is supposed to make.

## When a permission is split

Deploys run `admin:seed-rbac` after migrations. When the catalogue gains codes that replace an older one (`migratesFrom`), that run copies the old code's role and direct grants onto each new code, once, and records `authz.permission.migrated` in the activity log. The CLI prints `grants carried over: N`; a second run prints 0.

Afterwards `pnpm --filter api authz:verify` reports `split permissions: every holder of an old code holds its replacements`. A holder listed there either had a replacement removed on purpose after the deploy, or the synchronisation has not run. Retired codes stay assigned and grant nothing; remove them from roles once the client is satisfied.

## Inspecting access

```bash
pnpm --filter api authz:verify                      # deployment-wide invariants
pnpm --filter api authz:verify admin@example.com    # one administrator
```

The per-administrator form prints roles, inherited, direct and effective
permissions, the live session count, and **whether the cache is in step with the
database**. It exits non-zero when the deployment has no active super
administrator, when the protected role is not in its expected state, when the
catalogue is behind the code, or when a cached set disagrees with the database.
Run it after any emergency intervention, and as a post-deployment check.

## Emergency database intervention

Only when the API cannot be used — for example nobody can sign in. Record who did
it and why; these steps write no audit row, which is itself a reason to prefer
the API.

1. **Make the change.** Example: restore the protected role to an administrator.

   ```sql
   INSERT INTO admin_roles (adminId, roleId, createdAt)
   SELECT u.id, r.id, NOW(3) FROM admin_users u JOIN roles r ON r.`key` = 'super_admin'
   WHERE u.email = 'operator@example.com'
   ON DUPLICATE KEY UPDATE createdAt = createdAt;
   ```

2. **Retire the cached permissions** for everyone affected. Without this the
   change is invisible until the cache entry expires.

   ```sql
   -- one administrator
   UPDATE admin_users SET authzVersion = authzVersion + 1 WHERE email = 'operator@example.com';
   -- everyone holding a role you changed
   UPDATE admin_users SET authzVersion = authzVersion + 1
   WHERE id IN (SELECT adminId FROM admin_roles WHERE roleId = (SELECT id FROM roles WHERE `key` = 'super_admin'));
   ```

3. **Revoke their sessions**, because the API does this for every privilege
   change (AUTH 002) and an emergency change must not be weaker.

   ```sql
   UPDATE admin_sessions SET revokedAt = NOW(3), revokedReason = 'privilege_change'
   WHERE adminId = (SELECT id FROM admin_users WHERE email = 'operator@example.com') AND revokedAt IS NULL;
   ```

4. **Verify**, and expect "cache: in step with the database":

   ```bash
   pnpm --filter api authz:verify operator@example.com
   ```

5. **Record it** in the operations log with the ticket, the operator and the
   reason, and write a matching audit note through the API afterwards if the
   change is one an administrator could have made.

## Recovery: no administrator can sign in

1. Confirm it: `pnpm --filter api authz:verify` — "active super administrators: 0".
2. Create a new one with operator-supplied credentials (never a default):

   ```bash
   ADMIN_BOOTSTRAP_EMAIL=you@example.com ADMIN_BOOTSTRAP_DISPLAY_NAME="Your Name" \
   ADMIN_BOOTSTRAP_PASSWORD='<supplied at run time>' pnpm --filter api admin:bootstrap
   ```

   It refuses to run when an administrator already exists, so for the "exists but
   has lost the role" case use the intervention above instead.
3. `pnpm --filter api admin:seed-rbac` repairs the protected role and the
   catalogue if either was damaged.
4. Sign in, create the real administrators, then disable the bootstrap account —
   the last active super administrator cannot be disabled, so create the
   replacement first.

## Rate limits on privileged mutations

Authorization mutations (administrator status, roles, direct permissions, role
status, role permissions, session revocation, account creation and setup-link
resends) are metered per administrator: **20 per minute and 200 per hour**.
Ordinary reads are not metered. A refusal is `429 RATE_LIMITED` in the standard
envelope with `Retry-After`.

If Redis is unavailable, a per-process fallback of **5 per minute** applies — a
ceiling rather than a closed door, so an operator can still restore access during
an outage. With several replicas the effective fallback ceiling is 5 × replicas;
that is accepted deliberately, and the outage itself is alerted on.

The counter is keyed by the **authenticated administrator id**, never by client
address: `X-Forwarded-For` is only meaningful for the `TRUST_PROXY` hops the
deployment documents, so a control keyed on it could be removed by a
misconfiguration. Production sets `TRUST_PROXY=1` behind the single reverse
proxy; the address appears in the throttle log line only.

## Production database transport

Production refuses to start unless `DATABASE_URL` uses verified TLS
(`?sslmode=verify-identity`, or `verify-ca` with `sslca`). See
`docs/security/dependency-advisories.md` for why, and for the exact URLs.
