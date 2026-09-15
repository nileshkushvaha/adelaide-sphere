import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuditService } from '../src/audit/audit.service.js';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { SUPER_ADMIN_ROLE } from '../src/identity/permissions.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/** The consolidated activity log (SRS 1.2 ACT 001–006) against the real MySQL database. */
describe('Activity log (integration)', () => {
  let app: INestApplication;
  let audit: AuditService;
  let cookie: string;
  let limitedCookie: string;
  const agent = () => request(app.getHttpServer());
  const loginAs = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    audit = app.get(AuditService);
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.40');

    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'activity_none', name: 'No activity', description: 'test' } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: 'listings.read' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await seedSuperAdmin(app, { email: 'activity-limited@example.com', password: 'limited-password-12345', displayName: 'Limited' });
    const limited = await db.adminUser.findUniqueOrThrow({ where: { email: 'activity-limited@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: SUPER_ADMIN_ROLE.key } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: limited.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: limited.id, roleId: role.id } });
    limitedCookie = await loginAs('activity-limited@example.com', 'limited-password-12345', '203.0.113.41');

    // Events across three categories, including a refused one.
    await audit.recordOrThrow({ action: 'listing.publish', targetType: 'business', targetId: 'biz-1', requestId: 'req-shared' });
    await audit.recordOrThrow({ action: 'authz.role.update', targetType: 'role', targetId: 'role-1', requestId: 'req-shared' });
    await audit.recordOrThrow({ action: 'authz.role.update.refused', targetType: 'role', targetId: 'role-1', requestId: 'req-other' });
    await audit.recordOrThrow({ action: 'email.resend', targetType: 'email_delivery', targetId: 'del-1', requestId: 'req-other' });
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('gives every event a category, a label and an outcome derived from its code', async () => {
    const res = await agent().get('/api/v1/admin/activity?pageSize=50').set('Cookie', cookie).expect(200);
    const byAction = Object.fromEntries((res.body.data as { action: string }[]).map((row) => [row.action, row]));
    expect(byAction['listing.publish']).toMatchObject({ category: 'content', domainLabel: 'Business listings', outcome: 'success' });
    expect(byAction['authz.role.update']).toMatchObject({ category: 'access_control', outcome: 'success' });
    expect(byAction['authz.role.update.refused']).toMatchObject({ category: 'access_control', outcome: 'failure' });
    expect(byAction['email.resend']).toMatchObject({ category: 'communication', outcome: 'success' });
  });

  it('filters by category, by outcome and by request id in the database', async () => {
    const access = await agent().get('/api/v1/admin/activity?category=access_control&pageSize=50').set('Cookie', cookie).expect(200);
    expect(access.body.data.map((r: { action: string }) => r.action).sort()).toEqual(['authz.role.update', 'authz.role.update.refused']);

    const refused = await agent().get('/api/v1/admin/activity?outcome=failure&pageSize=50').set('Cookie', cookie).expect(200);
    expect(refused.body.data.every((r: { outcome: string }) => r.outcome === 'failure')).toBe(true);
    expect(refused.body.data.map((r: { action: string }) => r.action)).toContain('authz.role.update.refused');

    const succeeded = await agent().get('/api/v1/admin/activity?outcome=success&pageSize=50').set('Cookie', cookie).expect(200);
    expect(succeeded.body.data.every((r: { outcome: string }) => r.outcome === 'success')).toBe(true);

    const request = await agent().get('/api/v1/admin/activity?requestId=req-shared&pageSize=50').set('Cookie', cookie).expect(200);
    expect(request.body.data.map((r: { action: string }) => r.action).sort()).toEqual(['authz.role.update', 'listing.publish']);
  });

  it('is append-only through the API: nothing creates, edits or deletes an event', async () => {
    const db = testDatabase();
    const row = await db.auditLog.findFirstOrThrow();
    await agent().post('/api/v1/admin/activity').set('Origin', ORIGIN).set('Cookie', cookie).send({ action: 'made.up' }).expect(404);
    await agent().patch(`/api/v1/admin/activity/${row.id}`).set('Origin', ORIGIN).set('Cookie', cookie).send({}).expect(404);
    await agent().delete(`/api/v1/admin/activity/${row.id}`).set('Origin', ORIGIN).set('Cookie', cookie).expect(404);
  });

  it('never records a secret, even when a caller passes one', async () => {
    await audit.recordOrThrow({
      action: 'system.test',
      metadata: { password: 'hunter2', token: 'abc', secretValue: 'shh', apiKeyHash: 'x', safe: 'kept' } as Record<string, string>,
    });
    const res = await agent().get('/api/v1/admin/activity?action=system.test&pageSize=50').set('Cookie', cookie).expect(200);
    const metadata = JSON.stringify(res.body.data[0].metadata);
    expect(metadata).not.toContain('hunter2');
    expect(metadata).not.toContain('abc');
    expect(metadata).toContain('kept');
  });

  it('bounds the page size and refuses an unknown filter value', async () => {
    await agent().get('/api/v1/admin/activity?pageSize=500').set('Cookie', cookie).expect(400);
    await agent().get('/api/v1/admin/activity?category=everything').set('Cookie', cookie).expect(400);
    await agent().get('/api/v1/admin/activity?outcome=maybe').set('Cookie', cookie).expect(400);
  });

  it('refuses the log without the permission, and to an anonymous caller', async () => {
    await agent().get('/api/v1/admin/activity').set('Cookie', limitedCookie).expect(403);
    await agent().get('/api/v1/admin/activity').expect(401);
  });

  it('applies the 365-day retention policy and reports counts, not content (ACT 006)', async () => {
    const db = testDatabase();
    const old = await db.auditLog.create({ data: { action: 'listing.update', targetType: 'business', targetId: 'old-1' } });
    await db.$executeRaw`UPDATE audit_logs SET createdAt = DATE_SUB(NOW(), INTERVAL 400 DAY) WHERE id = ${old.id}`;

    const before = await db.auditLog.count();
    const result = await audit.purgeExpired();
    expect(result.removed).toBe(1);
    expect(await db.auditLog.count()).toBe(before - 1);
    expect(await db.auditLog.findUnique({ where: { id: old.id } })).toBeNull();

    // Idempotent: running it again removes nothing.
    expect((await audit.purgeExpired()).removed).toBe(0);
  });
});
