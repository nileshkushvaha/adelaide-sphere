import { Injectable, Logger } from '@nestjs/common';
import type { AdminUser } from '@adelaide-sphere/database';
import { DatabaseService } from '../database/database.service.js';
import { EffectivePermissionsService } from '../authorization/effective-permissions.service.js';
import { ACTIVE_PERMISSION_KEYS, ALL_PERMISSION_KEYS, permissionDefinition, SUPER_ADMIN_ROLE, type PermissionKey } from './permissions.js';

export interface AdminPrincipal {
  id: string;
  email: string;
  displayName: string;
  status: 'invited' | 'active' | 'disabled';
  totpEnabled: boolean;
  roles: string[];
  /** Effective permissions: role-inherited ∪ direct, active only (SRS RBAC 005). */
  permissions: string[];
  /** The two halves of the union, so the interface can show where access comes from. */
  inheritedPermissions: string[];
  directPermissions: string[];
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Administrator accounts, roles and permissions (IdentityModule per SRS
 * section 16). Password handling lives in the authentication module; this
 * service never sees plaintext passwords.
 */
@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly effective: EffectivePermissionsService,
  ) {}

  /**
   * Synchronises the code catalogue into the database and keeps the protected
   * Super Admin role carrying every active permission (SRS RBAC 002/011).
   * Idempotent: safe to run on every deployment.
   *
   * Retired entries are deactivated rather than deleted, so history and any
   * existing assignment survive while granting nothing.
   */
  async seedRbac(): Promise<{ permissionsCreated: number; permissionsRetired: number; roleCreated: boolean; grantsCarriedOver: number }> {
    const db = await this.database.client();
    const existing = new Set((await db.permission.findMany({ where: { key: { in: ALL_PERMISSION_KEYS } }, select: { key: true } })).map((row) => row.key));
    for (const key of ALL_PERMISSION_KEYS) {
      const definition = permissionDefinition(key);
      const row = { label: definition.label, description: definition.description, module: definition.module, isActive: definition.active !== false, isSystem: true };
      await db.permission.upsert({ where: { key }, create: { key, ...row }, update: row });
    }
    const created = ALL_PERMISSION_KEYS.filter((key) => !existing.has(key));
    const permissionsCreated = created.length;
    let grantsCarriedOver = 0;
    for (const key of created) grantsCarriedOver += await this.carryOverGrants(key);
    // A permission no longer declared in code cannot grant access; the row stays
    // for the audit trail and for any assignment still pointing at it.
    const retired = await db.permission.updateMany({ where: { key: { notIn: ALL_PERMISSION_KEYS }, isActive: true }, data: { isActive: false } });

    const existingRole = await db.role.findUnique({ where: { key: SUPER_ADMIN_ROLE.key } });
    const role =
      existingRole ??
      (await db.role.create({
        data: { key: SUPER_ADMIN_ROLE.key, name: SUPER_ADMIN_ROLE.name, description: SUPER_ADMIN_ROLE.description, isSystem: true },
      }));
    // The protected role is repaired if it was tampered with: it is always active
    // and always carries every active permission (RBAC 011).
    if (existingRole && (!existingRole.isActive || !existingRole.isSystem)) {
      await db.role.update({ where: { id: role.id }, data: { isActive: true, isSystem: true, version: { increment: 1 } } });
    }
    const permissions = await db.permission.findMany({ where: { key: { in: ACTIVE_PERMISSION_KEYS }, isActive: true }, select: { id: true } });
    await db.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    // Everyone holding the repaired role must see the change on their next request.
    await db.adminUser.updateMany({ where: { roles: { some: { roleId: role.id } } }, data: { authzVersion: { increment: 1 } } });
    return { permissionsCreated, permissionsRetired: retired.count, roleCreated: !existingRole, grantsCarriedOver };
  }

  /**
   * Copies the role and direct grants of the codes a newly created permission
   * replaces onto it (change log 1.13), so splitting a permission never takes
   * access away on deploy. Called only in the run that creates the code, so a
   * grant a Super Admin removes afterwards is never re-added. The copy, the
   * cache invalidation and its audit record commit together.
   */
  private async carryOverGrants(key: PermissionKey): Promise<number> {
    const sources = permissionDefinition(key).migratesFrom ?? [];
    if (sources.length === 0) return 0;
    const db = await this.database.client();
    const [target, sourceRows] = await Promise.all([
      db.permission.findUnique({ where: { key }, select: { id: true } }),
      db.permission.findMany({ where: { key: { in: [...sources] } }, select: { id: true } }),
    ]);
    if (!target || sourceRows.length === 0) return 0;
    const sourceIds = sourceRows.map((row) => row.id);
    const [roleGrants, directGrants] = await Promise.all([
      db.rolePermission.findMany({ where: { permissionId: { in: sourceIds } }, select: { roleId: true, assignedById: true } }),
      db.adminPermission.findMany({ where: { permissionId: { in: sourceIds } }, select: { adminId: true, assignedById: true } }),
    ]);
    const roles = [...new Map(roleGrants.map((grant) => [grant.roleId, grant])).values()];
    const admins = [...new Map(directGrants.map((grant) => [grant.adminId, grant])).values()];
    if (roles.length === 0 && admins.length === 0) return 0;

    await db.$transaction(async (tx) => {
      const roleResult = await tx.rolePermission.createMany({
        data: roles.map((grant) => ({ roleId: grant.roleId, permissionId: target.id, assignedById: grant.assignedById })),
        skipDuplicates: true,
      });
      const directResult = await tx.adminPermission.createMany({
        data: admins.map((grant) => ({ adminId: grant.adminId, permissionId: target.id, assignedById: grant.assignedById })),
        skipDuplicates: true,
      });
      const roleIds = roles.map((grant) => grant.roleId);
      if (roleIds.length > 0) await tx.role.updateMany({ where: { id: { in: roleIds } }, data: { version: { increment: 1 } } });
      // Everyone whose effective set changed sees it on their next request (RBAC 009).
      await tx.adminUser.updateMany({
        where: { OR: [{ id: { in: admins.map((grant) => grant.adminId) } }, { roles: { some: { roleId: { in: roleIds } } } }] },
        data: { authzVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          action: 'authz.permission.migrated',
          targetType: 'permission',
          targetId: key,
          metadata: { from: sources.join(', '), roles: roleResult.count, directGrants: directResult.count },
        },
      });
    });
    this.logger.log(`carried ${roles.length} role and ${admins.length} direct grant(s) from ${sources.join(', ')} to ${key}`);
    return roles.length + admins.length;
  }

  async countAdmins(): Promise<number> {
    const db = await this.database.client();
    return db.adminUser.count();
  }

  async findByEmail(email: string): Promise<AdminUser | null> {
    const db = await this.database.client();
    return db.adminUser.findUnique({ where: { email: normaliseEmail(email) } });
  }

  /**
   * Creates an administrator with the given role keys. Used by the bootstrap
   * procedure now and by admins.manage flows in the next phase.
   */
  async createAdmin(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    roleKeys: string[];
  }): Promise<Pick<AdminUser, 'id' | 'email' | 'displayName' | 'status' | 'createdAt'>> {
    const db = await this.database.client();
    const roles = await db.role.findMany({ where: { key: { in: input.roleKeys } } });
    if (roles.length !== input.roleKeys.length) throw new Error('Unknown role key');
    return db.adminUser.create({
      data: {
        email: normaliseEmail(input.email),
        displayName: input.displayName.trim(),
        passwordHash: input.passwordHash,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      select: { id: true, email: true, displayName: true, status: true, createdAt: true },
    });
  }

  /**
   * Principal projection (no password hash). Permissions come from the one
   * resolver (SRS RBAC 005); this service never recalculates the union itself.
   */
  async getPrincipal(adminId: string): Promise<AdminPrincipal | null> {
    const db = await this.database.client();
    const admin = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, displayName: true, status: true, totpEnabledAt: true },
    });
    if (!admin) return null;
    const access = await this.effective.resolve(adminId);
    return {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      status: admin.status,
      totpEnabled: admin.totpEnabledAt !== null,
      roles: access.roles.map((role) => role.key),
      permissions: access.effective,
      inheritedPermissions: access.inherited,
      directPermissions: access.direct,
    };
  }
}
