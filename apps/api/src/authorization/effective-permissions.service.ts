import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';
import { isActivePermissionKey, type PermissionKey } from '../identity/permissions.js';

/** Short lifetime; correctness comes from the version in the key, not from expiry. */
const TTL_SECONDS = 300;

export interface EffectiveAccess {
  /** Active roles the administrator holds, in key order. */
  roles: { key: string; name: string }[];
  /** Permission codes granted through those roles. */
  inherited: PermissionKey[];
  /** Permission codes granted directly to the administrator. */
  direct: PermissionKey[];
  /** The union actually enforced: inherited ∪ direct, sorted and de-duplicated. */
  effective: PermissionKey[];
  /** Which roles (or 'direct') each effective permission came from, for the access editor. */
  sources: Record<string, string[]>;
}

const EMPTY: EffectiveAccess = { roles: [], inherited: [], direct: [], effective: [], sources: {} };

/** The slice of the Prisma client an invalidation needs, so a transaction client fits. */
export type AuthzVersionClient = { adminUser: { updateMany: (args: never) => unknown } };

/**
 * The one place effective permissions are calculated (SRS RBAC 005).
 *
 * effective = permissions of the administrator's **active** roles
 *           ∪ permissions assigned **directly** to the administrator,
 * restricted to permissions that are active in both the database and the code
 * catalogue, and empty unless the administrator's own account is active.
 *
 * There are no deny rules in this revision (RBAC 004): the absence of a grant is
 * denial, so the union needs no precedence handling.
 *
 * Caching (RBAC 009): the Redis key carries the administrator's `authzVersion`,
 * which every access change increments, so a withdrawn permission is unreachable
 * on the next request instead of surviving to a TTL. A cache miss, an unusable
 * value or an unavailable Redis falls back to the database — a cache failure
 * must never grant access, and it must never deny it either.
 */
@Injectable()
export class EffectivePermissionsService {
  private readonly logger = new Logger(EffectivePermissionsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  private key(adminId: string, version: number): string {
    return `authz:admin:${adminId}:v${version}`;
  }

  /** Reads the administrator's status and authorization version; the cache key depends on both. */
  private async stamp(adminId: string): Promise<{ active: boolean; version: number } | null> {
    const db = await this.database.client();
    const row = await db.adminUser.findUnique({ where: { id: adminId }, select: { status: true, authzVersion: true } });
    if (!row) return null;
    return { active: row.status === 'active', version: row.authzVersion };
  }

  async resolve(adminId: string): Promise<EffectiveAccess> {
    const stamp = await this.stamp(adminId);
    // An unknown or non-active administrator has no administrative access at all,
    // whatever their roles say (RBAC 005).
    if (!stamp || !stamp.active) return EMPTY;

    const key = this.key(adminId, stamp.version);
    try {
      await this.redis.ensureConnected();
      const hit = await this.redis.client.get(key);
      if (hit) {
        const parsed = JSON.parse(hit) as EffectiveAccess;
        // A value written by an older shape is ignored rather than trusted.
        if (Array.isArray(parsed.effective)) return parsed;
      }
    } catch (error) {
      this.logger.warn(`permission cache read failed; using the database (${(error as Error).message})`);
    }

    const value = await this.load(adminId);
    try {
      await this.redis.client.set(key, JSON.stringify(value), 'EX', TTL_SECONDS);
    } catch {
      // Nothing to do: the database answer above is authoritative.
    }
    return value;
  }

  /** Uncached calculation, straight from MySQL. */
  async load(adminId: string): Promise<EffectiveAccess> {
    const db = await this.database.client();
    const admin = await db.adminUser.findUnique({
      where: { id: adminId },
      select: {
        status: true,
        roles: {
          where: { role: { isActive: true } },
          select: {
            role: {
              select: {
                key: true,
                name: true,
                permissions: { where: { permission: { isActive: true } }, select: { permission: { select: { key: true } } } },
              },
            },
          },
        },
        directPermissions: { where: { permission: { isActive: true } }, select: { permission: { select: { key: true } } } },
      },
    });
    if (!admin || admin.status !== 'active') return EMPTY;

    const sources: Record<string, string[]> = {};
    const addSource = (permission: string, source: string) => {
      (sources[permission] ??= []).push(source);
    };

    const roles = admin.roles.map((assignment) => ({ key: assignment.role.key, name: assignment.role.name })).sort((a, b) => a.key.localeCompare(b.key));
    const inherited = new Set<PermissionKey>();
    for (const assignment of admin.roles) {
      for (const rolePermission of assignment.role.permissions) {
        const code = rolePermission.permission.key;
        // A row whose code is no longer declared in code grants nothing, even if
        // the database row is still active (RBAC 002).
        if (!isActivePermissionKey(code)) continue;
        inherited.add(code);
        addSource(code, assignment.role.key);
      }
    }
    const direct = new Set<PermissionKey>();
    for (const grant of admin.directPermissions) {
      const code = grant.permission.key;
      if (!isActivePermissionKey(code)) continue;
      direct.add(code);
      addSource(code, 'direct');
    }

    const sort = (set: Set<PermissionKey>) => [...set].sort();
    return {
      roles,
      inherited: sort(inherited),
      direct: sort(direct),
      effective: sort(new Set([...inherited, ...direct])),
      sources,
    };
  }

  /**
   * Retires every cached entry for these administrators by incrementing their
   * authorization version, which changes the cache key (RBAC 009). Runs inside
   * the caller's transaction so the access change and its invalidation commit
   * together; if Redis never sees the delete, the old key is simply orphaned and
   * expires on its own.
   */
  async invalidate(tx: AuthzVersionClient, adminIds: string[]): Promise<void> {
    if (adminIds.length === 0) return;
    const updateMany = tx.adminUser.updateMany as (args: { where: unknown; data: unknown }) => Promise<unknown>;
    await updateMany({ where: { id: { in: adminIds } }, data: { authzVersion: { increment: 1 } } });
  }

  /** Administrators affected by a change to a role: everyone holding it. */
  async adminIdsWithRole(roleId: string): Promise<string[]> {
    const db = await this.database.client();
    const rows = await db.adminRole.findMany({ where: { roleId }, select: { adminId: true } });
    return rows.map((row) => row.adminId);
  }
}
