/**
 * Operator check for the authorization state of one administrator, or of the
 * deployment as a whole (SRS RBAC 005/009, audit closure item 4).
 *
 *   pnpm --filter api authz:verify                      # deployment-wide invariants
 *   pnpm --filter api authz:verify admin@example.com    # one administrator
 *
 * It is the supported way to answer "why can this person do that?" and to check
 * that an emergency database intervention was followed by the cache and session
 * steps the runbook requires. It only reads — nothing here changes access.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { DatabaseService } from '../database/database.service.js';
import { EffectivePermissionsService } from '../authorization/effective-permissions.service.js';
import { normaliseEmail } from '../identity/identity.service.js';
import { ACTIVE_PERMISSION_KEYS, ALL_PERMISSION_KEYS, permissionDefinition, SUPER_ADMIN_ROLE } from '../identity/permissions.js';

async function main(): Promise<void> {
  const target = process.argv[2]?.trim();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'], abortOnError: false });
  let healthy = true;
  try {
    const db = await app.get(DatabaseService).client();
    const effective = app.get(EffectivePermissionsService);

    if (target) {
      const admin = await db.adminUser.findUnique({
        where: { email: normaliseEmail(target) },
        select: { id: true, email: true, displayName: true, status: true, authzVersion: true, _count: { select: { sessions: true } } },
      });
      if (!admin) {
        console.error(`[authz] no administrator with that email`);
        process.exitCode = 1;
        return;
      }
      // Both answers, so a stale cache is visible rather than assumed.
      const [cached, fresh] = await Promise.all([effective.resolve(admin.id), effective.load(admin.id)]);
      const live = await db.adminSession.count({ where: { adminId: admin.id, revokedAt: null, expiresAt: { gt: new Date() } } });
      console.log(`[authz] ${admin.email} — ${admin.displayName} (${admin.status}), authzVersion ${admin.authzVersion}, ${live} live session(s)`);
      console.log(`[authz]   roles:      ${fresh.roles.map((role) => role.key).join(', ') || '(none)'}`);
      console.log(`[authz]   inherited:  ${fresh.inherited.join(', ') || '(none)'}`);
      console.log(`[authz]   direct:     ${fresh.direct.join(', ') || '(none)'}`);
      console.log(`[authz]   effective:  ${fresh.effective.join(', ') || '(none)'}`);
      if (cached.effective.join(',') !== fresh.effective.join(',')) {
        healthy = false;
        console.error('[authz]   MISMATCH: the cached permission set differs from the database.');
        console.error('[authz]   A change was made without incrementing authzVersion. Fix with:');
        console.error(`[authz]     UPDATE admin_users SET authzVersion = authzVersion + 1 WHERE id = '${admin.id}';`);
      } else {
        console.log('[authz]   cache: in step with the database');
      }
      return;
    }

    // Deployment-wide invariants.
    const activeSupers = await db.adminUser.count({
      where: { status: 'active', roles: { some: { role: { key: SUPER_ADMIN_ROLE.key, isActive: true } } } },
    });
    console.log(`[authz] active super administrators: ${activeSupers}`);
    if (activeSupers === 0) {
      healthy = false;
      console.error('[authz] NO ACTIVE SUPER ADMINISTRATOR. Recover with `pnpm --filter api admin:bootstrap` (docs/operations/authorization-runbook.md).');
    }

    const role = await db.role.findUnique({ where: { key: SUPER_ADMIN_ROLE.key }, include: { _count: { select: { permissions: true } } } });
    const expected = ACTIVE_PERMISSION_KEYS.length;
    console.log(`[authz] protected role: ${role ? `${role.isActive ? 'active' : 'INACTIVE'}, ${role.isSystem ? 'protected' : 'NOT PROTECTED'}, ${role._count.permissions}/${expected} permissions` : 'MISSING'}`);
    if (!role || !role.isActive || !role.isSystem || role._count.permissions < expected) {
      healthy = false;
      console.error('[authz] the protected role is not in its expected state; run `pnpm --filter api admin:seed-rbac` to repair it.');
    }

    const catalogue = await db.permission.count({ where: { key: { in: [...ACTIVE_PERMISSION_KEYS] }, isActive: true } });
    console.log(`[authz] catalogue: ${catalogue}/${expected} active permissions present`);
    if (catalogue < expected) {
      healthy = false;
      console.error('[authz] the database catalogue is behind the code; run `pnpm --filter api admin:seed-rbac`.');
    }

    // Assignments that grant nothing: not a fault, but worth seeing.
    const [inactiveRoleAssignments, retiredDirect] = await Promise.all([
      db.adminRole.count({ where: { role: { isActive: false } } }),
      db.adminPermission.count({ where: { permission: { isActive: false } } }),
    ]);
    console.log(`[authz] assignments that currently grant nothing: ${inactiveRoleAssignments} via inactive roles, ${retiredDirect} via retired permissions`);

    // A split permission (change log 1.13): every holder of the old code should
    // hold each code that replaced it, unless someone removed it on purpose since.
    let missing = 0;
    for (const key of ALL_PERMISSION_KEYS) {
      for (const source of permissionDefinition(key).migratesFrom ?? []) {
        const [roles, admins] = await Promise.all([
          db.role.count({ where: { permissions: { some: { permission: { key: source } }, none: { permission: { key } } } } }),
          db.adminUser.count({ where: { directPermissions: { some: { permission: { key: source } }, none: { permission: { key } } } } }),
        ]);
        if (roles + admins > 0) {
          missing += roles + admins;
          console.log(`[authz]   ${source} → ${key}: ${roles} role(s) and ${admins} administrator(s) hold the old code without the new one`);
        }
      }
    }
    console.log(`[authz] split permissions: ${missing === 0 ? 'every holder of an old code holds its replacements' : `${missing} holder(s) without a replacement (removed on purpose, or the sync has not run)`}`);
  } finally {
    await app.close();
    if (!healthy) process.exitCode = 1;
  }
}

void main();
