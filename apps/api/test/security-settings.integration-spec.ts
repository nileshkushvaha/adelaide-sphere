import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { SecurityPolicyService } from '../src/auth/security-policy.service.js';
import { settingGroup } from '../src/settings/registry.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/**
 * Security settings (SRS 1.2 SECS 001–008) against the real MySQL database.
 *
 * The point of every test here is the same: a setting either changes behaviour
 * or does not exist, and no setting can make the product less safe than the
 * specification already requires.
 */
describe('Security settings (integration)', () => {
  let app: INestApplication;
  let policy: SecurityPolicyService;
  let cookie: string;
  const agent = () => request(app.getHttpServer());

  const login = async (email = TEST_ADMIN.email, password = TEST_ADMIN.password, ip = '203.0.113.80') => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password });
    return res;
  };
  const cookieFrom = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;

  const currentVersion = async () => (await agent().get('/api/v1/admin/settings/security').set('Cookie', cookie).expect(200)).body.data.version as number;

  const setSecurity = async (values: Record<string, unknown>) => {
    const res = await agent()
      .put('/api/v1/admin/settings/security')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ expectedVersion: await currentVersion(), values });
    policy.invalidate();
    return res;
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    policy = app.get(SecurityPolicyService);
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
  });

  beforeEach(async () => {
    // These tests end sessions on purpose, so each one starts from its own.
    await clearThrottleKeys(app);
    cookie = cookieFrom(await login());
  });

  afterEach(async () => {
    // Back to the specified defaults between tests.
    await testDatabase().setting.deleteMany({ where: { group: 'security' } });
    policy.invalidate();
    await clearThrottleKeys(app);
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('serves the declared defaults, which are the specification baseline', async () => {
    const res = await agent().get('/api/v1/admin/settings/security').set('Cookie', cookie).expect(200);
    expect(res.body.data.values).toMatchObject({
      sessionIdleMinutes: 30,
      sessionAbsoluteHours: 12,
      passwordResetMinutes: 30,
      passwordMinLength: 12,
      // Three earlier passwords by default (client instruction, 12 September 2026).
      passwordHistoryDepth: 3,
      loginMaxFailedAttempts: 5,
      loginBlockMinutes: 15,
    });
  });

  it('refuses every value that would weaken the specification (SECS 002/004, SECS 007)', async () => {
    const weakenings: [string, unknown][] = [
      ['sessionIdleMinutes', 240], // longer than AUTH 002 allows
      ['sessionAbsoluteHours', 72],
      ['passwordResetMinutes', 120], // longer than AUTH 001 allows
      ['passwordMinLength', 6], // shorter than AUTH 001 allows
      ['loginMaxFailedAttempts', 50], // looser than SEC 002 allows
      ['loginMaxFailedAttempts', 0], // "never block" is not offered
      ['loginBlockMinutes', 1], // shorter window than SEC 002 allows
      ['maxConcurrentSessions', 0], // "nobody may sign in" is not offered
    ];
    for (const [key, value] of weakenings) {
      const res = await setSecurity({ [key]: value });
      expect(res.status, `${key}=${String(value)}`).toBe(400);
      expect(res.body.error.fields[key], `${key}=${String(value)}`).toBeTruthy();
    }
  });

  it('offers no setting that could disable sign-in, password reset or throttling (SECS 007)', () => {
    const keys = settingGroup('security').settings.map((setting) => setting.key);
    // A boolean that switches off a protection is the shape this forbids.
    for (const setting of settingGroup('security').settings) expect(setting.type, setting.key).toBe('integer');
    expect(keys).not.toContain('loginEnabled');
    expect(keys).not.toContain('throttlingEnabled');
    expect(keys).not.toContain('passwordResetEnabled');
    // Every numeric bound has a floor, so none can be set to "off".
    for (const setting of settingGroup('security').settings) {
      // Zero keeps no history of earlier passwords; the current one is still
      // refused, so nothing is switched off.
      if (setting.key === 'passwordHistoryDepth') continue;
      expect(setting.bounds.min, setting.key).toBeGreaterThan(0);
    }
  });

  it('applies a stricter password minimum at the next change, and never to a stored password', async () => {
    await setSecurity({ passwordMinLength: 20 }).then((res) => expect(res.status).toBe(200));

    // The existing password is shorter than the new minimum and still works:
    // raising the policy cannot invalidate a stored hash (SECS 003).
    const stillWorks = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.81');
    expect(stillWorks.status).toBe(200);

    const refused = await agent()
      .post('/api/v1/admin/auth/change-password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ currentPassword: TEST_ADMIN.password, newPassword: 'nineteen-chars-xx' })
      .expect(400);
    expect(JSON.stringify(refused.body)).toMatch(/at least 20/);
  });

  it('refuses a reused password within the depth, and keeps only what the depth needs', async () => {
    const db = testDatabase();
    await setSecurity({ passwordHistoryDepth: 2 }).then((res) => expect(res.status).toBe(200));

    const first = 'first-password-value-1';
    const second = 'second-password-value-2';
    const change = (currentPassword: string, newPassword: string) =>
      agent().post('/api/v1/admin/auth/change-password').set('Origin', ORIGIN).set('Cookie', cookie).send({ currentPassword, newPassword });

    // Changing the password revokes other sessions, so the cookie is refreshed
    // from the response each time.
    await change(TEST_ADMIN.password, first).expect(204);
    cookie = cookieFrom(await login(TEST_ADMIN.email, first, '203.0.113.82'));
    await change(first, second).expect(204);
    cookie = cookieFrom(await login(TEST_ADMIN.email, second, '203.0.113.83'));

    const reused = await change(second, first).expect(400);
    expect(reused.body.error.code).toBe('PASSWORD_REUSED');
    // Never more history than the depth asks for.
    const admin = await db.adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.email } });
    expect(await db.adminPasswordHistory.count({ where: { adminId: admin.id } })).toBeLessThanOrEqual(2);

    // Switching history off clears what was kept — the setting means what it
    // says — and only then can the fixture password be restored for the tests
    // that follow, because until now it was one of the refused ones.
    await setSecurity({ passwordHistoryDepth: 0 }).then((res) => expect(res.status).toBe(200));
    expect(await db.adminPasswordHistory.count({ where: { adminId: admin.id } })).toBe(0);
    await change(second, TEST_ADMIN.password).expect(204);

    // Even with no history kept, the password in use is never accepted as its
    // own replacement: that is not a change.
    const same = await change(TEST_ADMIN.password, TEST_ADMIN.password).expect(400);
    expect(same.body.error.code).toBe('PASSWORD_REUSED');
    expect(same.body.error.message).toMatch(/different from your current one/);
  });

  it('shortens the password reset link lifetime when the setting is narrowed', async () => {
    const db = testDatabase();
    await setSecurity({ passwordResetMinutes: 5 }).then((res) => expect(res.status).toBe(200));
    await db.passwordResetToken.deleteMany({});

    await agent().post('/api/v1/admin/auth/forgot-password').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.85').send({ email: TEST_ADMIN.email }).expect(202);
    const token = await db.passwordResetToken.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    const lifetimeMinutes = Math.round((token.expiresAt.getTime() - token.createdAt.getTime()) / 60_000);
    expect(lifetimeMinutes).toBe(5);
  });

  it('ends the oldest sessions immediately when the concurrent limit is lowered (SECS 006)', async () => {
    const db = testDatabase();
    const admin = await db.adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.email } });
    // Exactly three sessions: this test's own, plus two more.
    await db.adminSession.updateMany({ where: { adminId: admin.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'test_reset' } });
    cookie = cookieFrom(await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.85'));
    await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.86');
    await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.87');
    const before = await db.adminSession.count({ where: { adminId: admin.id, revokedAt: null } });
    expect(before).toBe(3);

    await setSecurity({ maxConcurrentSessions: 1 }).then((res) => expect(res.status).toBe(200));

    const after = await db.adminSession.findMany({ where: { adminId: admin.id, revokedAt: null } });
    expect(after).toHaveLength(1);
    const ended = await db.adminSession.findMany({ where: { adminId: admin.id, revokedAt: { not: null } }, select: { revokedReason: true } });
    expect(ended.some((session) => session.revokedReason === 'session_limit_lowered')).toBe(true);
    // Recorded, like every other security change (SECS 008).
    expect(await db.auditLog.count({ where: { action: 'auth.session.revoke_all' } })).toBeGreaterThan(0);
  });

  it('keeps a new session within the limit by ending the oldest (SECS 002)', async () => {
    const db = testDatabase();
    const admin = await db.adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.email } });
    await setSecurity({ maxConcurrentSessions: 2 }).then((res) => expect(res.status).toBe(200));
    await db.adminSession.updateMany({ where: { adminId: admin.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'test_reset' } });

    for (const ip of ['203.0.113.90', '203.0.113.91', '203.0.113.92']) {
      await login(TEST_ADMIN.email, TEST_ADMIN.password, ip);
    }
    // The third sign-in ended the first: the limit is kept as sessions are made.
    expect(await db.adminSession.count({ where: { adminId: admin.id, revokedAt: null } })).toBe(2);
  });

  it('records every change with a safe before and after summary (SECS 008)', async () => {
    const db = testDatabase();
    await setSecurity({ sessionIdleMinutes: 15 }).then((res) => expect(res.status).toBe(200));
    const entry = await db.auditLog.findFirstOrThrow({ where: { action: 'settings.security.update' }, orderBy: { createdAt: 'desc' } });
    expect(entry.metadata).toMatchObject({ changed: 'sessionIdleMinutes', 'before.sessionIdleMinutes': 30, 'after.sessionIdleMinutes': 15 });
  });

  it('separates viewing security settings from changing them, and refuses both anonymously', async () => {
    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'security_reader', name: 'Security reader', description: 'test' } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: 'security.settings.view' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await seedSuperAdmin(app, { email: 'security-reader@example.com', password: 'reader-password-12345', displayName: 'Reader' });
    const reader = await db.adminUser.findUniqueOrThrow({ where: { email: 'security-reader@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: reader.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: reader.id, roleId: role.id } });
    const readerCookie = cookieFrom(await login('security-reader@example.com', 'reader-password-12345', '203.0.113.94'));

    await agent().get('/api/v1/admin/settings/security').set('Cookie', readerCookie).expect(200);
    await agent().put('/api/v1/admin/settings/security').set('Origin', ORIGIN).set('Cookie', readerCookie).send({ expectedVersion: 0, values: {} }).expect(403);
    await agent().get('/api/v1/admin/settings/security').expect(401);
  });
});
