import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { ACTIVE_PERMISSION_KEYS, isActivePermissionKey, isPermissionKey, permissionDefinition, type PermissionKey, permissionOrder, SUPER_ADMIN_ROLE } from '../identity/permissions.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { EffectivePermissionsService } from './effective-permissions.service.js';

/** The slice of the Prisma transaction client these invariants need. */
export type TransactionClient = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  adminSession: { updateMany: (args: never) => unknown };
};

/**
 * A privilege change ends the target's existing sessions (SRS AUTH 002: rotate
 * the session on privilege changes), in the same transaction as the change, so a
 * session that was open when access was widened or withdrawn cannot continue on
 * the old footing. Sessions live only in MySQL, so this is the whole revocation.
 */
async function revokeSessionsFor(tx: TransactionClient, adminId: string): Promise<void> {
  const updateMany = tx.adminSession.updateMany as (args: { where: unknown; data: unknown }) => Promise<unknown>;
  await updateMany({ where: { adminId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'privilege_change' } });
}

export interface RequestContext {
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const conflict = (code: string, message: string) => new HttpException({ code, message }, HttpStatus.CONFLICT);
const badRequest = (message: string, fields: Record<string, string[]>) => new HttpException({ code: 'VALIDATION_ERROR', message, fields }, HttpStatus.BAD_REQUEST);
const notFound = () => new HttpException({ code: 'NOT_FOUND', message: 'Resource not found' }, HttpStatus.NOT_FOUND);
const forbidden = (message: string) => new HttpException({ code: 'FORBIDDEN', message }, HttpStatus.FORBIDDEN);

const ROLE_KEY = /^[a-z][a-z0-9_]{1,63}$/;

/**
 * Roles, role permissions and direct administrator permissions (SRS RBAC
 * 003/004/008/011/012).
 *
 * Every mutation here runs in one transaction that contains the change, its
 * audit record and the authorization-version bump that retires the affected
 * administrators' cached permissions — so an access change, its evidence and its
 * revocation can never disagree.
 *
 * Assignment endpoints replace the whole set rather than adding and removing
 * items: replacement is idempotent, the payload states the intended end state,
 * and `expectedVersion` refuses a change written against a stale view (409)
 * instead of silently merging two editors' work.
 */
@Injectable()
export class AuthorizationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly effective: EffectivePermissionsService,
  ) {}

  // --- reads ---------------------------------------------------------------

  /** The registered catalogue, grouped for the admin permission matrix (RBAC 002). */
  async listPermissions() {
    const db = await this.database.client();
    const rows = await db.permission.findMany({ orderBy: [{ module: 'asc' }, { key: 'asc' }] });
    // Catalogue order is sidebar order; the menu item and action come from code,
    // so the matrix reads like the navigation (change log 1.13).
    return rows
      .sort((a, b) => permissionOrder(a.key) - permissionOrder(b.key))
      .map((row) => {
        const definition = isPermissionKey(row.key) ? permissionDefinition(row.key) : null;
        return {
          key: row.key,
          label: row.label || row.key,
          description: row.description,
          module: row.module,
          menuItem: definition?.menuItem ?? row.module,
          action: definition?.action ?? 'Other',
          isActive: row.isActive && isActivePermissionKey(row.key),
          isSystem: row.isSystem,
        };
      });
  }

  async listRoles(params: { page: number; pageSize: number; q?: string }) {
    const db = await this.database.client();
    const where = params.q
      ? { OR: [{ key: { contains: params.q } }, { name: { contains: params.q } }] }
      : {};
    const [total, rows] = await Promise.all([
      db.role.count({ where }),
      db.role.findMany({
        where,
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { _count: { select: { admins: true, permissions: true } } },
      }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        key: row.key,
        name: row.name,
        description: row.description,
        isSystem: row.isSystem,
        isActive: row.isActive,
        version: row.version,
        adminCount: row._count.admins,
        permissionCount: row._count.permissions,
        updatedAt: row.updatedAt.toISOString(),
      })),
      meta: { page: params.page, pageSize: params.pageSize, total, pageCount: Math.max(1, Math.ceil(total / params.pageSize)) },
    };
  }

  async getRole(id: string) {
    const db = await this.database.client();
    const role = await db.role.findUnique({
      where: { id },
      include: { permissions: { select: { permission: { select: { key: true } } } }, _count: { select: { admins: true } } },
    });
    if (!role) throw notFound();
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isActive: role.isActive,
      version: role.version,
      adminCount: role._count.admins,
      permissions: role.permissions.map((entry) => entry.permission.key).sort(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }

  /** An administrator's roles, direct permissions and the resulting effective set. */
  async getAdminAccess(adminId: string) {
    const db = await this.database.client();
    const admin = await db.adminUser.findUnique({
      where: { id: adminId },
      select: { id: true, displayName: true, email: true, status: true, version: true, roles: { select: { roleId: true } } },
    });
    if (!admin) throw notFound();
    const access = await this.effective.load(adminId);
    const roles = await db.role.findMany({ where: { id: { in: admin.roles.map((r) => r.roleId) } }, select: { id: true, key: true, name: true, isActive: true } });
    return {
      adminId: admin.id,
      displayName: admin.displayName,
      email: admin.email,
      status: admin.status,
      version: admin.version,
      roles: roles.map((role) => ({ id: role.id, key: role.key, name: role.name, isActive: role.isActive })),
      directPermissions: access.direct,
      inheritedPermissions: access.inherited,
      effectivePermissions: access.effective,
      /** Where each effective permission comes from: role keys and/or 'direct'. */
      sources: access.sources,
    };
  }

  // --- role mutations ------------------------------------------------------

  async createRole(input: { key: string; name: string; description: string; permissions: string[] }, actor: AdminPrincipal, ctx: RequestContext) {
    const db = await this.database.client();
    const key = input.key.trim().toLowerCase();
    if (!ROLE_KEY.test(key)) throw badRequest('Role key is invalid', { key: ['Use lower-case letters, digits and underscores, 2–64 characters'] });
    if (key === SUPER_ADMIN_ROLE.key) throw badRequest('That key is reserved', { key: ['The protected Super Admin role already exists'] });
    if (await db.role.findUnique({ where: { key } })) throw conflict('DUPLICATE_ROLE', 'A role with that key already exists');
    const permissions = await this.resolvePermissions(input.permissions, actor);

    const role = await db.$transaction(async (tx) => {
      const created = await tx.role.create({ data: { key, name: input.name.trim(), description: input.description.trim(), isSystem: false, isActive: true } });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId: created.id, permissionId: p.id, assignedById: actor.id })) });
      }
      await this.audit.recordWith(tx, {
        action: 'authz.role.create',
        actorAdminId: actor.id,
        targetType: 'role',
        targetId: created.id,
        metadata: { key, name: created.name, permissionCount: permissions.length, permissions: permissions.map((p) => p.key).join(',') },
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return created;
    });
    return this.getRole(role.id);
  }

  async updateRole(
    id: string,
    input: { name?: string; description?: string; isActive?: boolean; expectedVersion: number },
    actor: AdminPrincipal,
    ctx: RequestContext,
  ) {
    const db = await this.database.client();
    const role = await db.role.findUnique({ where: { id } });
    if (!role) throw notFound();
    // A protected role may be renamed for clarity but never deactivated, and its
    // key and protected flag are not editable at all (RBAC 003/011).
    if (role.isSystem && input.isActive === false) throw forbidden('The Super Admin role cannot be deactivated');

    const before = { name: role.name, description: role.description, isActive: role.isActive };
    await db.$transaction(async (tx) => {
      const updated = await tx.role.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          name: input.name?.trim() ?? role.name,
          description: input.description?.trim() ?? role.description,
          isActive: input.isActive ?? role.isActive,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw conflict('STALE_VERSION', 'This role was changed by someone else. Reload before saving again.');
      await this.audit.recordWith(tx, {
        action: 'authz.role.update',
        actorAdminId: actor.id,
        targetType: 'role',
        targetId: id,
        metadata: {
          key: role.key,
          beforeName: before.name,
          afterName: input.name?.trim() ?? before.name,
          beforeActive: before.isActive,
          afterActive: input.isActive ?? before.isActive,
        },
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      // Deactivating a role withdraws access from everyone who holds it.
      if (input.isActive !== undefined && input.isActive !== before.isActive) {
        await this.effective.invalidate(tx, await this.effective.adminIdsWithRole(id));
      }
    });
    return this.getRole(id);
  }

  /** Complete replacement of a role's permissions (RBAC 008). */
  async replaceRolePermissions(id: string, input: { permissions: string[]; expectedVersion: number }, actor: AdminPrincipal, ctx: RequestContext) {
    const db = await this.database.client();
    const role = await db.role.findUnique({ where: { id }, include: { permissions: { select: { permissionId: true, permission: { select: { key: true } } } } } });
    if (!role) throw notFound();
    // The protected role's permission set is owned by the catalogue
    // synchronisation, not by an editor: it always carries everything (RBAC 011).
    if (role.isSystem) throw forbidden('The Super Admin role always carries every permission and cannot be edited');
    const permissions = await this.resolvePermissions(input.permissions, actor);
    const before = role.permissions.map((entry) => entry.permission.key).sort();
    const after = permissions.map((p) => p.key).sort();

    await db.$transaction(async (tx) => {
      const bumped = await tx.role.updateMany({ where: { id, version: input.expectedVersion }, data: { version: { increment: 1 } } });
      if (bumped.count === 0) throw conflict('STALE_VERSION', 'This role was changed by someone else. Reload before saving again.');
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId: id, permissionId: p.id, assignedById: actor.id })) });
      }
      await this.audit.recordWith(tx, {
        action: 'authz.role.permissions',
        actorAdminId: actor.id,
        targetType: 'role',
        targetId: id,
        metadata: {
          key: role.key,
          added: after.filter((key) => !before.includes(key)).join(',') || 'none',
          removed: before.filter((key) => !after.includes(key)).join(',') || 'none',
          count: after.length,
        },
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      const holders = await this.effective.adminIdsWithRole(id);
      await this.effective.invalidate(tx, holders);
      for (const holder of holders) await revokeSessionsFor(tx, holder);
    });
    return this.getRole(id);
  }

  async deleteRole(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const db = await this.database.client();
    const role = await db.role.findUnique({ where: { id }, include: { _count: { select: { admins: true } } } });
    if (!role) throw notFound();
    if (role.isSystem) throw forbidden('A protected system role cannot be deleted');
    // Deleting a role that still grants access would silently change what its
    // holders may do; the assignments are removed deliberately first (RBAC 003).
    if (role._count.admins > 0) throw conflict('ROLE_IN_USE', 'Remove this role from every administrator before deleting it');

    await db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.role.delete({ where: { id } });
      // The audit row keeps the key and name as text, so the history survives the
      // role it describes (RBAC 012).
      await this.audit.recordWith(tx, {
        action: 'authz.role.delete',
        actorAdminId: actor.id,
        targetType: 'role',
        targetId: id,
        metadata: { key: role.key, name: role.name },
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
    });
  }

  // --- administrator assignments -------------------------------------------

  /** Complete replacement of an administrator's roles (RBAC 004/008/011). */
  async replaceAdminRoles(adminId: string, input: { roleIds: string[]; expectedVersion: number }, actor: AdminPrincipal, ctx: RequestContext) {
    const db = await this.database.client();
    this.assertNotSelf(adminId, actor);
    const admin = await db.adminUser.findUnique({ where: { id: adminId }, select: { id: true, version: true, roles: { select: { roleId: true, role: { select: { key: true } } } } } });
    if (!admin) throw notFound();

    const requested = [...new Set(input.roleIds)];
    const roles = await db.role.findMany({ where: { id: { in: requested } }, select: { id: true, key: true, isActive: true, isSystem: true } });
    if (roles.length !== requested.length) throw badRequest('Unknown role', { roleIds: ['One of these roles does not exist'] });
    await this.assertMayAssignRoles(actor, adminId, roles);

    const before = admin.roles.map((entry) => entry.role.key).sort();
    const after = roles.map((role) => role.key).sort();
    const losesProtectedRole = before.includes(SUPER_ADMIN_ROLE.key) && !after.includes(SUPER_ADMIN_ROLE.key);

    await db.$transaction(async (tx) => {
      // Inside the transaction and behind the role-row lock, so two concurrent
      // demotions cannot both believe another super administrator remains.
      if (losesProtectedRole) await this.assertNotLastSuperAdminTx(tx, adminId);
      const bumped = await tx.adminUser.updateMany({ where: { id: adminId, version: input.expectedVersion }, data: { version: { increment: 1 } } });
      if (bumped.count === 0) throw conflict('STALE_VERSION', 'This administrator was changed by someone else. Reload before saving again.');
      await tx.adminRole.deleteMany({ where: { adminId } });
      if (roles.length > 0) await tx.adminRole.createMany({ data: roles.map((role) => ({ adminId, roleId: role.id, assignedById: actor.id })) });
      await revokeSessionsFor(tx, adminId);
      await this.audit.recordWith(tx, {
        action: 'authz.admin.roles',
        actorAdminId: actor.id,
        targetType: 'admin_user',
        targetId: adminId,
        metadata: {
          added: after.filter((key) => !before.includes(key)).join(',') || 'none',
          removed: before.filter((key) => !after.includes(key)).join(',') || 'none',
        },
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      await this.effective.invalidate(tx, [adminId]);
    });
    return this.getAdminAccess(adminId);
  }

  /** Complete replacement of an administrator's direct permissions (RBAC 004/008/011). */
  async replaceAdminPermissions(adminId: string, input: { permissions: string[]; expectedVersion: number }, actor: AdminPrincipal, ctx: RequestContext) {
    const db = await this.database.client();
    this.assertNotSelf(adminId, actor);
    const admin = await db.adminUser.findUnique({ where: { id: adminId }, select: { id: true, directPermissions: { select: { permission: { select: { key: true } } } } } });
    if (!admin) throw notFound();
    const permissions = await this.resolvePermissions(input.permissions, actor);
    const before = admin.directPermissions.map((entry) => entry.permission.key).sort();
    const after = permissions.map((p) => p.key).sort();

    await db.$transaction(async (tx) => {
      const bumped = await tx.adminUser.updateMany({ where: { id: adminId, version: input.expectedVersion }, data: { version: { increment: 1 } } });
      if (bumped.count === 0) throw conflict('STALE_VERSION', 'This administrator was changed by someone else. Reload before saving again.');
      await tx.adminPermission.deleteMany({ where: { adminId } });
      if (permissions.length > 0) {
        await tx.adminPermission.createMany({ data: permissions.map((p) => ({ adminId, permissionId: p.id, assignedById: actor.id })) });
      }
      await revokeSessionsFor(tx, adminId);
      await this.audit.recordWith(tx, {
        action: 'authz.admin.permissions',
        actorAdminId: actor.id,
        targetType: 'admin_user',
        targetId: adminId,
        metadata: {
          added: after.filter((key) => !before.includes(key)).join(',') || 'none',
          removed: before.filter((key) => !after.includes(key)).join(',') || 'none',
        },
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      await this.effective.invalidate(tx, [adminId]);
    });
    return this.getAdminAccess(adminId);
  }

  // --- invariants ----------------------------------------------------------

  /**
   * Nobody edits their own access, whatever they hold: it is the shortest path
   * from a compromised session to full control, and a second administrator
   * making the change leaves a meaningful audit trail (RBAC 011).
   */
  private assertNotSelf(adminId: string, actor: AdminPrincipal): void {
    if (adminId === actor.id) throw forbidden('You cannot change your own roles or permissions. Ask another administrator.');
  }

  /**
   * Resolves permission codes to rows, refusing anything unregistered, retired
   * or that the acting administrator does not hold themselves — an administrator
   * cannot hand out more than they have (RBAC 011).
   */
  private async resolvePermissions(codes: string[], actor: AdminPrincipal) {
    const db = await this.database.client();
    const unique = [...new Set(codes)];
    const unknown = unique.filter((code) => !isActivePermissionKey(code));
    if (unknown.length > 0) throw badRequest('Unknown permission', { permissions: [`${unknown[0]} is not a registered, active permission`] });
    const beyond = unique.filter((code) => !actor.permissions.includes(code));
    if (beyond.length > 0) {
      throw forbidden(`You cannot grant ${permissionDefinition(beyond[0] as PermissionKey).label.toLowerCase()}, because you do not hold it yourself`);
    }
    const rows = await db.permission.findMany({ where: { key: { in: unique }, isActive: true }, select: { id: true, key: true } });
    if (rows.length !== unique.length) {
      throw badRequest('Unknown permission', { permissions: ['Run the permission synchronisation; one of these codes is not in the database'] });
    }
    return rows;
  }

  /**
   * SRS ADM 001/RBAC 011: never demote or disable the last active Super Admin.
   *
   * **Must run inside the transaction that makes the change.** It takes a
   * locking read on the protected role row first, so two requests that would
   * each leave one super administrator behind are serialised: the second one
   * re-counts after the first has committed and is refused. A count outside the
   * transaction is a check-then-write race that lets both succeed and leaves the
   * deployment with no super administrator at all.
   */
  async assertNotLastSuperAdminTx(tx: TransactionClient, adminId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM roles WHERE \`key\` = ${SUPER_ADMIN_ROLE.key} FOR UPDATE`;
    const rows = await tx.$queryRaw<{ others: bigint }[]>`
      SELECT COUNT(DISTINCT u.id) AS others
      FROM admin_users u
      JOIN admin_roles ar ON ar.adminId = u.id
      JOIN roles r ON r.id = ar.roleId
      WHERE u.id <> ${adminId} AND u.status = 'active' AND r.\`key\` = ${SUPER_ADMIN_ROLE.key} AND r.isActive = 1`;
    if (Number(rows[0]?.others ?? 0) === 0) throw conflict('LAST_SUPER_ADMIN', 'At least one active Super Admin must remain');
  }

  /**
   * The invariants that must hold wherever roles are assigned — this module's
   * endpoints and the administrator account endpoints alike (SRS RBAC 011).
   * Keeping them here means there is one implementation to audit rather than a
   * second, weaker copy beside the account screens.
   *
   * Refuses: editing your own access, assigning an unknown or inactive role,
   * granting the protected role without holding it, and granting a role that
   * carries any permission the acting administrator does not hold themselves.
   */
  async assertMayAssignRoles(
    actor: AdminPrincipal,
    targetAdminId: string | null,
    roles: { id: string; key: string; isActive: boolean }[],
  ): Promise<void> {
    if (targetAdminId !== null) this.assertNotSelf(targetAdminId, actor);
    const inactive = roles.filter((role) => !role.isActive);
    if (inactive.length > 0) throw badRequest('Inactive role', { roleIds: [`Role ${inactive[0].key} is inactive and cannot be assigned`] });
    if (roles.some((role) => role.key === SUPER_ADMIN_ROLE.key) && !actor.roles.includes(SUPER_ADMIN_ROLE.key)) {
      throw forbidden('Only a Super Admin can grant the Super Admin role');
    }
    const db = await this.database.client();
    const carried = await db.rolePermission.findMany({
      where: { roleId: { in: roles.map((role) => role.id) }, permission: { isActive: true } },
      select: { permission: { select: { key: true } } },
    });
    const beyond = [...new Set(carried.map((entry) => entry.permission.key))].filter((key) => !actor.permissions.includes(key));
    if (beyond.length > 0) {
      throw forbidden('You cannot grant a role that carries permissions you do not hold yourself');
    }
  }

  /** Resolves role keys to rows for the account endpoints, refusing unknown keys. */
  async rolesByKey(keys: string[]): Promise<{ id: string; key: string; isActive: boolean }[]> {
    const db = await this.database.client();
    const unique = [...new Set(keys)];
    const roles = await db.role.findMany({ where: { key: { in: unique } }, select: { id: true, key: true, isActive: true } });
    if (roles.length !== unique.length) throw badRequest('Unknown role', { roleKeys: ['Unknown role key'] });
    return roles;
  }

  /** Every registered code, for the interface's "select all" and validation. */
  registeredPermissionKeys(): PermissionKey[] {
    return [...ACTIVE_PERMISSION_KEYS];
  }
}
