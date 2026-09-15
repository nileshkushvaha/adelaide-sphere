import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { SUPER_ADMIN_ROLE } from '../src/identity/permissions.js';
import { SETTING_GROUPS } from '../src/settings/registry.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/**
 * Owned settings groups and their registry (SRS 1.2 SET 001–005, RBAC 006/013),
 * against the real MySQL database.
 */
describe('Settings groups (integration)', () => {
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
    cookie = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.10');

    // An administrator with an unrelated permission: authenticated, but holding
    // nothing this module declares.
    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'settings_none', name: 'No settings', description: 'test' } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: 'listings.read' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await seedSuperAdmin(app, { email: 'settings-limited@example.com', password: 'limited-password-12345', displayName: 'Limited' });
    const limited = await db.adminUser.findUniqueOrThrow({ where: { email: 'settings-limited@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: SUPER_ADMIN_ROLE.key } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: limited.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: limited.id, roleId: role.id } });
    limitedCookie = await loginAs('settings-limited@example.com', 'limited-password-12345', '203.0.113.11');
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('publishes the declared groups as metadata, with no stored value and no secret', async () => {
    const res = await agent().get('/api/v1/admin/settings/registry').set('Cookie', cookie).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data.map((group: { key: string }) => group.key).sort()).toEqual(SETTING_GROUPS.map((g) => g.key).sort());
    // Metadata only: no group carries a stored value, and no declared setting
    // key is credential-shaped (SET 004). Prose may mention that a secret is
    // *not* a setting, which is the point, so the assertion is on the data.
    for (const group of res.body.data as { settings: { key: string }[] }[]) {
      expect(group).not.toHaveProperty('values');
      for (const setting of group.settings) {
        expect(setting).not.toHaveProperty('value');
        // A name whose *last word* is a credential noun holds a credential;
        // `passwordMinLength` is a policy number (SET 004).
        expect(setting.key, setting.key).not.toMatch(/(^|[a-z])(key|secret|token|password|credential)s?$/i);
      }
    }
  });

  it('filters the registry to the groups the caller may view (RBAC 010)', async () => {
    const res = await agent().get('/api/v1/admin/settings/registry').set('Cookie', limitedCookie).expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('refuses the registry to an anonymous caller', async () => {
    await agent().get('/api/v1/admin/settings/registry').expect(401);
  });

  it('serves a group at version 0 with its declared defaults before anything is stored', async () => {
    const res = await agent().get('/api/v1/admin/settings/security').set('Cookie', cookie).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data).toMatchObject({ group: 'security', version: 0, updatedByAdminId: null });
    // The declared defaults, which are the specification baseline (SECS 002–004).
    expect(res.body.data.values).toMatchObject({ sessionIdleMinutes: 30, passwordMinLength: 12, loginMaxFailedAttempts: 5 });
    // A group with nothing declared yet serves an empty document, not an error.
    const email = await agent().get('/api/v1/admin/settings/email').set('Cookie', cookie).expect(200);
    expect(email.body.data.values).toEqual({});
  });

  it('refuses each group to an administrator without its permission, and without saying which one is missing', async () => {
    for (const path of ['security', 'email', 'operations']) {
      const res = await agent().get(`/api/v1/admin/settings/${path}`).set('Cookie', limitedCookie).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(JSON.stringify(res.body)).not.toMatch(/security\.settings|system\.settings/);
      await agent().put(`/api/v1/admin/settings/${path}`).set('Origin', ORIGIN).set('Cookie', limitedCookie).send({ expectedVersion: 0, values: {} }).expect(403);
    }
  });

  it('refuses an unauthenticated write with 401 rather than 403', async () => {
    await agent().put('/api/v1/admin/settings/security').set('Origin', ORIGIN).send({ expectedVersion: 0, values: {} }).expect(401);
  });

  it('rejects an unknown setting key with field errors rather than ignoring it', async () => {
    const res = await agent()
      .put('/api/v1/admin/settings/security')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ expectedVersion: 0, values: { sessionIdleMinutesTypo: 15 } })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields.sessionIdleMinutesTypo).toEqual(['Unknown setting']);
  });

  it('rejects a payload that is not the declared shape', async () => {
    await agent().put('/api/v1/admin/settings/security').set('Origin', ORIGIN).set('Cookie', cookie).send({ values: {} }).expect(400);
    await agent().put('/api/v1/admin/settings/security').set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: -1, values: {} }).expect(400);
    await agent().put('/api/v1/admin/settings/security').set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 0, values: 'nope' }).expect(400);
  });

  it('refuses a concurrent change with 409 STALE_VERSION', async () => {
    const res = await agent()
      .put('/api/v1/admin/settings/operations')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ expectedVersion: 7, values: {} })
      .expect(409);
    expect(res.body.error.code).toBe('STALE_VERSION');
  });

  it('treats a save that changes nothing as a no-op: no row, no version bump, no audit event', async () => {
    const db = testDatabase();
    const before = await db.auditLog.count({ where: { action: { startsWith: 'settings.' } } });
    const res = await agent().put('/api/v1/admin/settings/email').set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 0, values: {} }).expect(200);
    expect(res.body.data.version).toBe(0);
    expect(await db.setting.count({ where: { group: 'email' } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: { startsWith: 'settings.' } } })).toBe(before);
  });

  it('keys every group by its own name, and exposes no route for a group it does not own', async () => {
    const db = testDatabase();
    // Groups share one table but never one row: each is addressed by (group, key).
    // Nothing in this suite writes a value, so no group has a row.
    expect(await db.setting.count({ where: { group: { in: ['security', 'email', 'operations'] } } })).toBe(0);
    // The website group is owned by SettingsService and has its own routes.
    await agent().get('/api/v1/admin/settings/website').set('Cookie', cookie).expect(404);
  });
});
