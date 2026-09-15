import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { createDatabaseClient, type DatabaseClient } from '@adelaide-sphere/database';

/**
 * Test-only administrator provisioning for the authorization journeys.
 *
 * Rules this module enforces, because a test fixture that can touch production
 * is worse than a skipped test:
 *
 * - it refuses any database whose name is not a development or test database;
 * - it refuses to run with `NODE_ENV=production`;
 * - every password is generated at run time from `crypto.randomBytes`, used
 *   once, held only in memory and never written to a file, a log or a report;
 * - accounts are named with a fixed prefix and removed afterwards — including
 *   any left by an earlier run that failed midway, which is why cleanup runs
 *   before provisioning as well as after.
 */

/** Every account this module creates starts with this, so cleanup is exact. */
export const E2E_ADMIN_PREFIX = 'e2e-authz-';
const E2E_ROLE_PREFIX = 'e2e_authz_';
/** The role-limited persona: open and moderate reviews and comments, nothing else. */
export const MODERATOR_PERMISSIONS: readonly string[] = ['reviews.view', 'reviews.moderate', 'comments.view', 'comments.moderate'];
/** `Algorithm.Argon2id` is a const enum; 2 is its value (matches the API's PasswordService). */
const ARGON2ID = 2;

export interface ProvisionedAdmin {
  id: string;
  email: string;
  /** In memory only, for this run. Never persisted, printed or attached to a report. */
  password: string;
  /** What this persona is expected to be able to do, for the assertions. */
  label: string;
}

export interface ProvisionedFixture {
  superAdmin: ProvisionedAdmin;
  /** Access through one role: moderation only. */
  roleLimited: ProvisionedAdmin;
  /** No roles at all; one permission granted directly. */
  directOnly: ProvisionedAdmin;
  /** Role whose permissions the revocation journey changes. */
  moderatorRoleId: string;
}

function assertSafeTarget(url: string): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to provision test administrators with NODE_ENV=production');
  }
  const database = new URL(url).pathname.replace(/^\//, '').split('?')[0];
  if (!/(_dev|_test|_e2e)$/.test(database)) {
    throw new Error(`Refusing to provision test administrators in "${database}": the database name must end in _dev, _test or _e2e`);
  }
}

export function databaseUrl(): string | null {
  return process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
}

/** True when this environment can provision; the journeys report the reason when it cannot. */
export function canProvision(): boolean {
  const url = databaseUrl();
  if (!url) return false;
  try {
    assertSafeTarget(url);
    return true;
  } catch {
    return false;
  }
}

export function provisioningBlocker(): string {
  const url = databaseUrl();
  if (!url) return 'E2E_DATABASE_URL (or DATABASE_URL) is not set, so test administrators cannot be provisioned';
  try {
    assertSafeTarget(url);
    return '';
  } catch (error) {
    return (error as Error).message;
  }
}

function client(): DatabaseClient {
  const url = databaseUrl();
  if (!url) throw new Error('No database URL for provisioning');
  assertSafeTarget(url);
  return createDatabaseClient({ url, connectionLimit: 2, allowPublicKeyRetrieval: true });
}

/** Removes every account, assignment and session this module may have created. */
export async function cleanUp(db?: DatabaseClient): Promise<void> {
  const database = db ?? client();
  try {
    const admins = await database.adminUser.findMany({ where: { email: { startsWith: E2E_ADMIN_PREFIX } }, select: { id: true } });
    const ids = admins.map((admin) => admin.id);
    if (ids.length > 0) {
      // Sessions and assignments cascade with the account, but they are removed
      // explicitly so a partial failure still leaves nothing usable behind.
      await database.adminSession.deleteMany({ where: { adminId: { in: ids } } });
      await database.passwordResetToken.deleteMany({ where: { adminId: { in: ids } } });
      await database.adminRole.deleteMany({ where: { adminId: { in: ids } } });
      await database.adminPermission.deleteMany({ where: { adminId: { in: ids } } });
      await database.adminUser.deleteMany({ where: { id: { in: ids } } });
    }
    const roles = await database.role.findMany({ where: { key: { startsWith: E2E_ROLE_PREFIX } }, select: { id: true } });
    if (roles.length > 0) {
      const roleIds = roles.map((role) => role.id);
      await database.adminRole.deleteMany({ where: { roleId: { in: roleIds } } });
      await database.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
      await database.role.deleteMany({ where: { id: { in: roleIds } } });
    }
  } finally {
    if (!db) await database.$disconnect();
  }
}

async function createAdmin(
  db: DatabaseClient,
  suffix: string,
  label: string,
  options: { roleIds?: string[]; permissionKeys?: string[]; status?: 'active' | 'disabled' } = {},
): Promise<ProvisionedAdmin> {
  const password = `e2e-${randomBytes(24).toString('base64url')}`;
  const email = `${E2E_ADMIN_PREFIX}${suffix}@adelaidesphere.invalid`;
  const admin = await db.adminUser.create({
    data: {
      email,
      displayName: `E2E ${label}`,
      passwordHash: await hash(password, { algorithm: ARGON2ID, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      status: options.status ?? 'active',
    },
  });
  for (const roleId of options.roleIds ?? []) await db.adminRole.create({ data: { adminId: admin.id, roleId } });
  for (const key of options.permissionKeys ?? []) {
    const permission = await db.permission.findUnique({ where: { key } });
    if (!permission) throw new Error(`Permission ${key} is not in the catalogue; run admin:seed-rbac`);
    await db.adminPermission.create({ data: { adminId: admin.id, permissionId: permission.id } });
  }
  return { id: admin.id, email, password, label };
}

/**
 * Creates the smallest set of administrators the authorization journeys need:
 * one super administrator, one whose access comes from a role, and one whose
 * access comes only from a direct grant.
 */
export async function provision(): Promise<{ fixture: ProvisionedFixture; dispose: () => Promise<void> }> {
  const db = client();
  await cleanUp(db);

  const superRole = await db.role.findUnique({ where: { key: 'super_admin' } });
  if (!superRole) throw new Error('The super_admin role is missing; run admin:seed-rbac against this database');

  const moderatorRole = await db.role.create({
    data: { key: `${E2E_ROLE_PREFIX}moderator`, name: 'E2E Moderator', description: 'Journey fixture: moderation only', isActive: true },
  });
  // SRS 1.13 per-menu permissions: a screen opens with its View code, and the
  // action codes (moderate) act on it. A code missing from the catalogue fails
  // the run rather than silently provisioning a weaker role.
  for (const key of MODERATOR_PERMISSIONS) {
    const permission = await db.permission.findUnique({ where: { key } });
    if (!permission) throw new Error(`Permission ${key} is not in the catalogue; run admin:seed-rbac`);
    await db.rolePermission.create({ data: { roleId: moderatorRole.id, permissionId: permission.id } });
  }

  const fixture: ProvisionedFixture = {
    superAdmin: await createAdmin(db, 'super', 'Super', { roleIds: [superRole.id] }),
    roleLimited: await createAdmin(db, 'moderator', 'Moderator', { roleIds: [moderatorRole.id] }),
    directOnly: await createAdmin(db, 'direct', 'Direct grant', { permissionKeys: ['listings.read'] }),
    moderatorRoleId: moderatorRole.id,
  };

  return {
    fixture,
    dispose: async () => {
      await cleanUp(db);
      await db.$disconnect();
    },
  };
}

/** Replaces a role's permissions directly, for the live-revocation journey. */
export async function setRolePermissions(roleId: string, keys: string[]): Promise<void> {
  const db = client();
  try {
    await db.rolePermission.deleteMany({ where: { roleId } });
    for (const key of keys) {
      const permission = await db.permission.findUnique({ where: { key } });
      if (permission) await db.rolePermission.create({ data: { roleId, permissionId: permission.id } });
    }
    // The application does this inside its own transaction; a direct change must
    // signal it the same way or the cached permissions stay valid (SRS RBAC 009).
    const holders = await db.adminRole.findMany({ where: { roleId }, select: { adminId: true } });
    await db.adminUser.updateMany({ where: { id: { in: holders.map((h) => h.adminId) } }, data: { authzVersion: { increment: 1 } } });
  } finally {
    await db.$disconnect();
  }
}

/** Every information page a journey creates starts with this, so cleanup is exact. */
export const E2E_PAGE_PREFIX = 'e2e-page-';

/**
 * Removes the pages the page-builder journey created, with their versions,
 * kept copies and redirects, even when the journey stopped half way. Guarded
 * like provisioning: never against a production database.
 */
export async function removeE2ePages(): Promise<void> {
  const db = client();
  try {
    const pages = await db.staticPage.findMany({ where: { slug: { startsWith: E2E_PAGE_PREFIX } }, select: { id: true } });
    const ids = pages.map((page) => page.id);
    if (ids.length > 0) {
      await db.contentRevision.deleteMany({ where: { resourceType: 'static_page', resourceId: { in: ids } } });
      await db.redirect.deleteMany({ where: { resourceType: 'static_page', resourceId: { in: ids } } });
      await db.staticPage.deleteMany({ where: { id: { in: ids } } });
    }
    await db.redirect.deleteMany({ where: { sourcePath: { startsWith: `/${E2E_PAGE_PREFIX}` } } });
  } finally {
    await db.$disconnect();
  }
}
