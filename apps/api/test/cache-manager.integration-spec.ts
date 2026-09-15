import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/**
 * Cache manager (SRS 1.2 CMGR 001–005) against the real Redis and MySQL.
 *
 * The tests that matter most are the ones proving what this interface *cannot*
 * do: reach a session, a throttle counter, the authorization cache or the queue,
 * or accept anything but a registered name.
 */
describe('Cache manager (integration)', () => {
  let app: INestApplication;
  let redis: RedisService;
  let cookie: string;
  let viewerCookie: string;
  const agent = () => request(app.getHttpServer());
  const loginAs = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };
  const clear = (body: Record<string, unknown>, as = cookie) => agent().post('/api/v1/admin/system/cache/clear').set('Origin', ORIGIN).set('Cookie', as).send(body);

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    redis = app.get(RedisService);
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.100');

    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'cache_viewer', name: 'Cache viewer', description: 'test' } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: 'system.cache.view' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await seedSuperAdmin(app, { email: 'cache-viewer@example.com', password: 'viewer-password-12345', displayName: 'Viewer' });
    const viewer = await db.adminUser.findUniqueOrThrow({ where: { email: 'cache-viewer@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: viewer.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: viewer.id, roleId: role.id } });
    viewerCookie = await loginAs('cache-viewer@example.com', 'viewer-password-12345', '203.0.113.101');
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('reports Redis availability and the registered caches, with counts marked approximate', async () => {
    const res = await agent().get('/api/v1/admin/system/cache').set('Cookie', cookie).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data.redis.available).toBe(true);
    expect(res.body.data.namespaces.map((n: { key: string }) => n.key)).toEqual(['search', 'business']);
    for (const namespace of res.body.data.namespaces) expect(namespace.approximate).toBe(true);
    expect(res.body.data.tags.map((t: { key: string }) => t.key)).toContain('alerts');
  });

  it('clears a registered namespace and reports what it removed', async () => {
    await redis.ensureConnected();
    const namespace = (await redis.client.get('cache:public:ns')) ?? '1';
    await redis.client.set(`cache:${namespace}:search:q=cafe`, '{"data":[]}');
    await redis.client.set(`cache:${namespace}:search:q=bakery`, '{"data":[]}');

    const res = await clear({ kind: 'namespace', key: 'search' }).expect(200);
    expect(res.body.data.cleared).toBeGreaterThanOrEqual(2);
    expect(await redis.client.get(`cache:${namespace}:search:q=cafe`)).toBeNull();
  });

  it('cannot reach sessions, throttle counters, the authorization cache or the queue (CMGR 004)', async () => {
    await redis.ensureConnected();
    const untouchable = {
      'throttle:login:ip:203.0.113.200': '3',
      'authz:admin:someone:v1': '["listings.read"]',
      'bull:enquiry.email:1': 'job',
      'idempotency:abc': 'receipt',
    };
    for (const [key, value] of Object.entries(untouchable)) await redis.client.set(key, value);

    // Every registered namespace, cleared: none of the above may be affected.
    for (const key of ['search', 'business']) await clear({ kind: 'namespace', key }).expect(200);

    for (const [key, value] of Object.entries(untouchable)) {
      expect(await redis.client.get(key), key).toBe(value);
      await redis.client.del(key);
    }
  });

  it('accepts only registered names — never a pattern, a raw key or a store-wide clear', async () => {
    for (const key of ['*', 'search:*', 'cache:*', 'session', 'throttle', 'bull', '', 'FLUSHALL']) {
      const res = await clear({ kind: 'namespace', key });
      // 404 for an unknown name, 400 when the payload itself is not acceptable.
      expect([400, 404], key).toContain(res.status);
    }
    expect((await clear({ kind: 'everything', key: 'search' })).status).toBe(400);
  });

  it('separates seeing the caches from clearing them, and refuses anonymously', async () => {
    await agent().get('/api/v1/admin/system/cache').set('Cookie', viewerCookie).expect(200);
    await clear({ kind: 'namespace', key: 'search' }, viewerCookie).expect(403);
    await agent().get('/api/v1/admin/system/cache').expect(401);
    await agent().post('/api/v1/admin/system/cache/clear').set('Origin', ORIGIN).send({ kind: 'namespace', key: 'search' }).expect(401);
  });

  it('clears a public page cache through the ordinary invalidation pipeline (CMGR 005)', async () => {
    const db = testDatabase();
    await db.outboxEvent.deleteMany({});
    await clear({ kind: 'tag', key: 'alerts' }).expect(200);

    const events = await db.outboxEvent.findMany({});
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0]!.payload)).toContain('alerts');
    // The same event type a publication writes, so the same worker purges it.
    expect(events[0]!.type).toBe('cache.invalidate');
  });

  it('records every clearing with what was cleared (CMGR 003)', async () => {
    const db = testDatabase();
    const before = await db.auditLog.count({ where: { action: 'system.cache.clear' } });
    await clear({ kind: 'namespace', key: 'business' }).expect(200);
    await clear({ kind: 'tag', key: 'faqs' }).expect(200);

    const entries = await db.auditLog.findMany({ where: { action: 'system.cache.clear' }, orderBy: { createdAt: 'desc' }, take: 2 });
    expect(await db.auditLog.count({ where: { action: 'system.cache.clear' } })).toBe(before + 2);
    expect(entries.map((entry) => entry.targetType).sort()).toEqual(['cache_namespace', 'cache_tag']);
  });

  it('records when each cache was last cleared, so the screen is not guessing', async () => {
    await clear({ kind: 'namespace', key: 'search' }).expect(200);
    const res = await agent().get('/api/v1/admin/system/cache').set('Cookie', cookie).expect(200);
    const search = res.body.data.namespaces.find((n: { key: string }) => n.key === 'search');
    expect(Date.parse(search.lastClearedAt as string)).toBeGreaterThan(Date.now() - 60_000);
  });
});
