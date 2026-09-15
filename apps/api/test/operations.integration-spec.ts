import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { SUPER_ADMIN_ROLE } from '../src/identity/permissions.js';
import { ALERT_THRESHOLDS } from '../src/operations/operations.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/** Monitoring signals (SRS MON 001–002). */
describe('Operations status (integration)', () => {
  let app: INestApplication;
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
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.250');

    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'ops_limited', name: 'Limited', description: 'test' } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: 'listings.read' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await seedSuperAdmin(app, { email: 'ops-limited@example.com', password: 'limited-password-12345', displayName: 'Limited' });
    const limited = await db.adminUser.findUniqueOrThrow({ where: { email: 'ops-limited@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: SUPER_ADMIN_ROLE.key } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: limited.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: limited.id, roleId: role.id } });
    limitedCookie = await loginAs('ops-limited@example.com', 'limited-password-12345', '203.0.113.251');
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('reports every alertable signal with its threshold, and no private content', async () => {
    const res = await agent().get('/api/v1/admin/operations/status').set('Cookie', cookie).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data.state).toBe('ok');
    const keys = res.body.data.signals.map((signal: { key: string }) => signal.key);
    expect(keys).toEqual(['oldest_pending_job_age', 'failed_events', 'failed_enquiries', 'scheduled_publishing_lateness', 'moderation_backlog', 'stuck_media_age']);
    for (const signal of res.body.data.signals) {
      expect(Object.keys(signal).sort()).toEqual(['action', 'breached', 'key', 'label', 'threshold', 'unit', 'value']);
      expect(signal.threshold).toBeGreaterThan(0);
    }
    expect(JSON.stringify(res.body)).not.toMatch(/@/); // no addresses anywhere in the payload
  });

  it('marks the state degraded when a signal breaches its threshold', async () => {
    const db = testDatabase();
    await db.outboxEvent.create({
      data: {
        type: 'cache.invalidate',
        resourceType: 'business',
        resourceId: 'b-stuck',
        payload: { tags: 'businesses' },
        status: 'failed',
        attempts: 5,
        lastError: 'web tier unreachable',
      },
    });
    const res = await agent().get('/api/v1/admin/operations/status').set('Cookie', cookie).expect(200);
    expect(res.body.data.state).toBe('degraded');
    const failed = res.body.data.signals.find((signal: { key: string }) => signal.key === 'failed_events');
    expect(failed).toMatchObject({ value: 1, breached: true, threshold: ALERT_THRESHOLDS.failedPurges });
  });

  it('requires the audit permission and a session', async () => {
    await agent().get('/api/v1/admin/operations/status').expect(401);
    await agent().get('/api/v1/admin/operations/status').set('Cookie', limitedCookie).expect(403);
  });
});
