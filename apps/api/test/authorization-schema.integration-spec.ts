import { closeTestDatabase, testDatabase, truncateApplicationTables } from './integration/harness.js';

/**
 * Schema guarantees proved against the real MySQL container, not a mock (SRS
 * DAT 001, RBAC 003/004/012). These are the rules the application relies on
 * being unable to violate: no duplicate assignment, no orphan, no silent loss of
 * authorization history, and one collation across the access-control tables.
 */
describe('Access-control schema constraints (integration)', () => {
  const db = testDatabase();
  let adminId: string;
  let roleId: string;
  let permissionId: string;

  beforeAll(async () => {
    await truncateApplicationTables();
    const admin = await db.adminUser.create({
      data: { email: 'schema.audit@example.com', displayName: 'Schema Audit', passwordHash: 'placeholder-not-a-real-hash', status: 'active' },
    });
    adminId = admin.id;
    roleId = (await db.role.create({ data: { key: 'schema_audit', name: 'Schema Audit', description: '' } })).id;
    permissionId = (await db.permission.create({ data: { key: 'listings.read', label: 'View listings', description: 'View business listings', module: 'Directory' } })).id;
  });

  afterAll(async () => {
    await truncateApplicationTables();
    await closeTestDatabase();
  });

  /** Asserts the database itself refused, by Prisma's error code (P2002 unique, P2003 foreign key). */
  const failsWith = async (code: string, work: () => Promise<unknown>) => {
    let thrown: unknown;
    try {
      await work();
    } catch (error) {
      thrown = error;
    }
    expect(thrown, `expected the database to refuse with ${code}`).toBeDefined();
    expect((thrown as { code?: string }).code, `expected ${code}, got ${(thrown as Error).message?.slice(0, 120)}`).toBe(code);
  };

  it('rejects a duplicate role assignment, role permission and direct permission', async () => {
    await db.adminRole.create({ data: { adminId, roleId } });
    await failsWith('P2002', () => db.adminRole.create({ data: { adminId, roleId } }));

    await db.rolePermission.create({ data: { roleId, permissionId } });
    await failsWith('P2002', () => db.rolePermission.create({ data: { roleId, permissionId } }));

    await db.adminPermission.create({ data: { adminId, permissionId } });
    await failsWith('P2002', () => db.adminPermission.create({ data: { adminId, permissionId } }));
  });

  it('rejects an assignment that points at an administrator, role or permission that does not exist', async () => {
    await failsWith('P2003', () => db.adminRole.create({ data: { adminId: 'ghost-admin', roleId } }));
    await failsWith('P2003', () => db.adminRole.create({ data: { adminId, roleId: 'ghost-role' } }));
    await failsWith('P2003', () => db.adminPermission.create({ data: { adminId, permissionId: 'ghost-permission' } }));
    await failsWith('P2003', () => db.rolePermission.create({ data: { roleId, permissionId: 'ghost-permission' } }));
  });

  it('refuses to delete a permission that is still assigned, so no grant silently disappears', async () => {
    await failsWith('P2003', () => db.permission.delete({ where: { id: permissionId } }));
    await failsWith('P2003', () => db.role.delete({ where: { id: roleId } }));
  });

  it('removes an administrator’s assignments with the administrator, and keeps their audit history', async () => {
    const doomed = await db.adminUser.create({
      data: { email: 'doomed.audit@example.com', displayName: 'Doomed', passwordHash: 'placeholder-not-a-real-hash', status: 'active' },
    });
    await db.adminRole.create({ data: { adminId: doomed.id, roleId, assignedById: adminId } });
    await db.adminPermission.create({ data: { adminId: doomed.id, permissionId, assignedById: adminId } });
    await db.auditLog.create({ data: { action: 'authz.admin.roles', actorAdminId: doomed.id, targetType: 'admin_user', targetId: adminId } });

    await db.adminUser.delete({ where: { id: doomed.id } });
    expect(await db.adminRole.count({ where: { adminId: doomed.id } })).toBe(0);
    expect(await db.adminPermission.count({ where: { adminId: doomed.id } })).toBe(0);
    // The audit row survives with its actor nulled: history is not evidence that
    // can be erased by deleting an account (RBAC 012).
    const surviving = await db.auditLog.findFirst({ where: { action: 'authz.admin.roles', targetId: adminId } });
    expect(surviving).toBeTruthy();
    expect(surviving!.actorAdminId).toBeNull();
  });

  it('keeps an assignment when the administrator who granted it is deleted', async () => {
    const granter = await db.adminUser.create({
      data: { email: 'granter.audit@example.com', displayName: 'Granter', passwordHash: 'placeholder-not-a-real-hash', status: 'active' },
    });
    const target = await db.adminUser.create({
      data: { email: 'target.audit@example.com', displayName: 'Target', passwordHash: 'placeholder-not-a-real-hash', status: 'active' },
    });
    await db.adminRole.create({ data: { adminId: target.id, roleId, assignedById: granter.id } });
    await db.adminUser.delete({ where: { id: granter.id } });
    const assignment = await db.adminRole.findFirstOrThrow({ where: { adminId: target.id, roleId } });
    expect(assignment.assignedById).toBeNull();
  });

  it('applies one collation and charset across every access-control table', async () => {
    const rows = await db.$queryRawUnsafe<{ TABLE_NAME: string; TABLE_COLLATION: string }[]>(
      `SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.tables
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('admin_users','roles','permissions','admin_roles','role_permissions','admin_permissions','admin_sessions','audit_logs')`,
    );
    expect(rows.length).toBe(8);
    expect([...new Set(rows.map((row) => row.TABLE_COLLATION))]).toEqual(['utf8mb4_unicode_ci']);
  });

  it('indexes the columns the resolver and the audit view filter on', async () => {
    const indexes = await db.$queryRawUnsafe<{ TABLE_NAME: string; COLUMN_NAME: string }[]>(
      `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.statistics
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('admin_roles','role_permissions','admin_permissions','permissions','audit_logs')`,
    );
    const has = (table: string, column: string) => indexes.some((row) => row.TABLE_NAME === table && row.COLUMN_NAME === column);
    // Reverse lookups: "who holds this role", "which roles carry this permission".
    expect(has('admin_roles', 'roleId')).toBe(true);
    expect(has('role_permissions', 'permissionId')).toBe(true);
    expect(has('admin_permissions', 'permissionId')).toBe(true);
    expect(has('permissions', 'module')).toBe(true);
    expect(has('audit_logs', 'action')).toBe(true);
  });

  it('enforces the unique permission code and role key', async () => {
    await failsWith('P2002', () => db.permission.create({ data: { key: 'listings.read', label: 'Duplicate', description: 'x', module: 'Directory' } }));
    await failsWith('P2002', () => db.role.create({ data: { key: 'schema_audit', name: 'Duplicate', description: '' } }));
  });
});
