import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { APP_CREATE_OPTIONS, configureApp } from '../src/app.setup.js';
import { MailerPort } from '../src/auth/mailer/mailer.port.js';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { PUBLIC_ROUTE_KEY, SESSION_ONLY_KEY } from '../src/auth/decorators.js';
import { PasswordService } from '../src/auth/password.service.js';
import { IdentityService } from '../src/identity/identity.service.js';
import { EffectivePermissionsService } from '../src/authorization/effective-permissions.service.js';
import { SENSITIVE_LIMITS } from '../src/authorization/sensitive-throttle.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { CapturingMailer, ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, testDatabase, truncateApplicationTables } from './integration/harness.js';

function cookieOf(res: request.Response): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!raw) throw new Error('no session cookie');
  return `${SESSION_COOKIE_NAME}=${raw.split(';')[0]!.split('=')[1]}`;
}

/**
 * Adversarial suite for the access-control audit (SRS RBAC 002–012, AUTH 002,
 * ADM 001). Each test states the attack it is trying to perform; a passing test
 * means the attack was refused, not that a happy path worked.
 */
describe('Access control — attack scenarios (integration)', () => {
  let app: INestApplication;
  let superCookie: string;
  let attackerCookie: string;
  let attackerId: string;
  const attacker = { email: 'account.manager@example.com', displayName: 'Account Manager', password: 'account-manager-password-1' };

  const agent = () => request(app.getHttpServer());
  const login = (email: string, password: string) =>
    agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.99').send({ email, password });
  const authed = (req: request.Test, cookie: string) => req.set('Origin', ORIGIN).set('Cookie', cookie);
  const grantDirect = async (adminId: string, keys: string[]) => {
    const db = testDatabase();
    await db.adminPermission.deleteMany({ where: { adminId } });
    const permissions = await db.permission.findMany({ where: { key: { in: keys } }, select: { id: true } });
    await db.adminPermission.createMany({ data: permissions.map((p) => ({ adminId, permissionId: p.id })) });
    await db.adminUser.update({ where: { id: adminId }, data: { authzVersion: { increment: 1 } } });
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailerPort).useValue(new CapturingMailer()).compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>({ ...APP_CREATE_OPTIONS, logger: false });
    configureApp(nest, { trustProxy: 1 });
    await nest.init();
    app = nest;
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    superCookie = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password).expect(200));

    const created = await app
      .get(IdentityService)
      .createAdmin({ email: attacker.email, displayName: attacker.displayName, passwordHash: await app.get(PasswordService).hash(attacker.password), roleKeys: [] });
    attackerId = created.id;
    await testDatabase().adminUser.update({ where: { id: attackerId }, data: { status: 'active' } });
    // The attacker manages administrator accounts, which is a normal delegation.
    // It must not let them change what anyone (including themselves) may do.
    await grantDirect(attackerId, ['admins.view']);
    attackerCookie = cookieOf(await login(attacker.email, attacker.password).expect(200));
  });

  beforeEach(async () => {
    // A privilege change revokes the target's sessions (AUTH 002) and privileged
    // mutations are metered (SEC 003), so each test starts from a live session
    // and a fresh budget rather than inheriting the previous test's state.
    await clearThrottleKeys(app);
    superCookie = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password).expect(200));
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  describe('privilege escalation through the administrator account endpoints', () => {
    it('refuses an administrator granting themselves a role (PATCH /admins/{id})', async () => {
      const me = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: attackerId } });
      await authed(agent().patch(`/api/v1/admin/admins/${attackerId}`), attackerCookie)
        .send({ roleKeys: ['super_admin'], expectedVersion: me.version })
        .expect(403);
      const after = await testDatabase().adminRole.count({ where: { adminId: attackerId } });
      expect(after).toBe(0);
    });

    it('refuses granting another administrator a role carrying permissions the actor does not hold', async () => {
      attackerCookie = cookieOf(await login(attacker.email, attacker.password).expect(200));
      const victim = await app
        .get(IdentityService)
        .createAdmin({ email: 'victim@example.com', displayName: 'Victim', passwordHash: await app.get(PasswordService).hash('victim-password-123456'), roleKeys: [] });
      const record = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: victim.id } });
      await authed(agent().patch(`/api/v1/admin/admins/${victim.id}`), attackerCookie)
        .send({ roleKeys: ['super_admin'], expectedVersion: record.version })
        .expect(403);
      expect(await testDatabase().adminRole.count({ where: { adminId: victim.id } })).toBe(0);
    });

    it('refuses creating an administrator with a role the actor could not grant', async () => {
      attackerCookie = cookieOf(await login(attacker.email, attacker.password).expect(200));
      await authed(agent().post('/api/v1/admin/admins'), attackerCookie)
        .send({ email: 'planted.super@example.com', displayName: 'Planted Super', roleKeys: ['super_admin'] })
        .expect(403);
      expect(await testDatabase().adminUser.findUnique({ where: { email: 'planted.super@example.com' } })).toBeNull();
    });

    it('refuses assigning an inactive role through either assignment path', async () => {
      const db = testDatabase();
      const dormant = await db.role.create({ data: { key: 'dormant', name: 'Dormant', description: '', isActive: false } });
      const victim = await db.adminUser.findFirstOrThrow({ where: { email: 'victim@example.com' } });
      await authed(agent().patch(`/api/v1/admin/admins/${victim.id}`), superCookie).send({ roleKeys: ['dormant'], expectedVersion: victim.version }).expect(400);
      await authed(agent().put(`/api/v1/admin/admins/${victim.id}/roles`), superCookie).send({ roleIds: [dormant.id], expectedVersion: victim.version }).expect(400);
    });
  });

  describe('the last active super administrator', () => {
    it('cannot be removed by two concurrent requests that each pass the check alone', async () => {
      const db = testDatabase();
      const superAdmin = await db.adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.normalisedEmail } });
      const second = await app
        .get(IdentityService)
        .createAdmin({ email: 'second.super@example.com', displayName: 'Second Super', passwordHash: await app.get(PasswordService).hash('second-super-password-1'), roleKeys: ['super_admin'] });
      await db.adminUser.update({ where: { id: second.id }, data: { status: 'active' } });
      await grantDirect(attackerId, ['admins.view', 'admins.access.manage']);
      const cookie = cookieOf(await login(attacker.email, attacker.password).expect(200));

      const versions = await db.adminUser.findMany({ where: { id: { in: [superAdmin.id, second.id] } }, select: { id: true, version: true } });
      const versionOf = (id: string) => versions.find((row) => row.id === id)!.version;
      // Both requests are valid on their own: each sees another active super
      // administrator. Only one may be allowed to commit.
      const [a, b] = await Promise.all([
        authed(agent().put(`/api/v1/admin/admins/${superAdmin.id}/roles`), cookie).send({ roleIds: [], expectedVersion: versionOf(superAdmin.id) }),
        authed(agent().put(`/api/v1/admin/admins/${second.id}/roles`), cookie).send({ roleIds: [], expectedVersion: versionOf(second.id) }),
      ]);
      const remaining = await db.adminUser.count({ where: { status: 'active', roles: { some: { role: { key: 'super_admin', isActive: true } } } } });
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(remaining).toBeGreaterThanOrEqual(1);

      // Restore both super administrators for the tests that follow.
      const role = await db.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
      for (const id of [superAdmin.id, second.id]) {
        await db.adminRole.createMany({ data: [{ adminId: id, roleId: role.id }], skipDuplicates: true });
        await db.adminUser.update({ where: { id }, data: { status: 'active', authzVersion: { increment: 1 } } });
      }
      superCookie = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password).expect(200));
    });

    it('cannot be disabled by two concurrent requests', async () => {
      const db = testDatabase();
      const supers = await db.adminUser.findMany({ where: { status: 'active', roles: { some: { role: { key: 'super_admin' } } } }, select: { id: true, version: true } });
      if (supers.length < 2) {
        const extra = await app
          .get(IdentityService)
          .createAdmin({ email: 'third.super@example.com', displayName: 'Third Super', passwordHash: await app.get(PasswordService).hash('third-super-password-12'), roleKeys: ['super_admin'] });
        await db.adminUser.update({ where: { id: extra.id }, data: { status: 'active' } });
        supers.push({ id: extra.id, version: 1 });
      }
      const current = await db.adminUser.findMany({ where: { id: { in: supers.map((s) => s.id) } }, select: { id: true, version: true } });
      const [a, b] = await Promise.all(
        current.slice(0, 2).map((row) => authed(agent().post(`/api/v1/admin/admins/${row.id}/disable`), superCookie).send({ expectedVersion: row.version })),
      );
      const remaining = await db.adminUser.count({ where: { status: 'active', roles: { some: { role: { key: 'super_admin', isActive: true } } } } });
      expect(remaining).toBeGreaterThanOrEqual(1);
      expect([a.status, b.status]).toContain(409);

      for (const row of current.slice(0, 2)) await db.adminUser.update({ where: { id: row.id }, data: { status: 'active', authzVersion: { increment: 1 } } });
      superCookie = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password).expect(200));
    });
  });

  describe('sessions, cache and payloads', () => {
    it('cannot continue with a revoked session, even though its permissions are cached', async () => {
      const db = testDatabase();
      await grantDirect(attackerId, ['admins.view', 'activity.access_control.view']);
      const cookie = cookieOf(await login(attacker.email, attacker.password).expect(200));
      await authed(agent().get('/api/v1/admin/activity'), cookie).expect(200);
      await db.adminSession.updateMany({ where: { admin: { id: attackerId } }, data: { revokedAt: new Date(), revokedReason: 'audit_test' } });
      await authed(agent().get('/api/v1/admin/activity'), cookie).expect(401);
    });

    it('fails safe when the cached permission entry is corrupt', async () => {
      const effective = app.get(EffectivePermissionsService);
      const redis = app.get(RedisService);
      await redis.ensureConnected();
      const expected = await effective.load(attackerId);
      const stamp = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: attackerId }, select: { authzVersion: true } });
      // Anything unusable in the cache must send the resolver to the database.
      for (const poison of ['not json at all', '{"effective":"listings.publish"}', '{}', 'null']) {
        await redis.client.set(`authz:admin:${attackerId}:v${stamp.authzVersion}`, poison);
        const resolved = await effective.resolve(attackerId);
        expect(resolved.effective, poison).toEqual(expected.effective);
      }
    });

    it('never lets a cached entry be read for a different administrator', async () => {
      const effective = app.get(EffectivePermissionsService);
      const superAdmin = await testDatabase().adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.normalisedEmail } });
      const mine = await effective.resolve(attackerId);
      const theirs = await effective.resolve(superAdmin.id);
      expect(mine.effective).not.toEqual(theirs.effective);
      expect(theirs.effective.length).toBeGreaterThan(mine.effective.length);
    });

    it('refuses forged permission codes, forged role ids and unbounded pagination', async () => {
      superCookie = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password).expect(200));
      const victim = await testDatabase().adminUser.findFirstOrThrow({ where: { email: 'victim@example.com' } });
      await authed(agent().put(`/api/v1/admin/admins/${victim.id}/permissions`), superCookie)
        .send({ permissions: ['listings.*'], expectedVersion: victim.version })
        .expect(400);
      await authed(agent().put(`/api/v1/admin/admins/${victim.id}/roles`), superCookie)
        .send({ roleIds: ['00000000-0000-0000-0000-000000000000'], expectedVersion: victim.version })
        .expect(400);
      const bounded = await authed(agent().get('/api/v1/admin/roles?pageSize=1000'), superCookie);
      expect([200, 400]).toContain(bounded.status);
      if (bounded.status === 200) expect(bounded.body.meta.pageSize).toBeLessThanOrEqual(50);
    });

    it('answers 404 rather than leaking whether an identifier exists, for an administrator that is not there', async () => {
      superCookie = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password).expect(200));
      const missing = await authed(agent().get('/api/v1/admin/admins/does-not-exist/access'), superCookie).expect(404);
      expect(JSON.stringify(missing.body)).not.toMatch(/prisma|sql|column|table/i);
    });
  });

  describe('replacement semantics and stored content', () => {
    it('is idempotent: repeating the same replacement changes nothing but the version', async () => {
      superCookie = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password).expect(200));
      const created = await authed(agent().post('/api/v1/admin/roles'), superCookie)
        .send({ key: 'idempotency_probe', name: 'Idempotency probe', description: '', permissions: ['listings.read'] })
        .expect(201);
      const id = created.body.data.id;
      const body = { permissions: ['listings.read', 'listings.update'] };
      const first = await authed(agent().put(`/api/v1/admin/roles/${id}/permissions`), superCookie).send({ ...body, expectedVersion: created.body.data.version }).expect(200);
      const second = await authed(agent().put(`/api/v1/admin/roles/${id}/permissions`), superCookie).send({ ...body, expectedVersion: first.body.data.version }).expect(200);
      expect(second.body.data.permissions).toEqual(first.body.data.permissions);
      expect(await testDatabase().rolePermission.count({ where: { roleId: id } })).toBe(2);
    });

    it('stores role text verbatim and returns it escaped by the envelope, without executing anything', async () => {
      // Role names reach an admin screen; the interface escapes them, and the API
      // must neither execute nor mangle what an editor typed.
      const payload = '<img src=x onerror="alert(1)">';
      const created = await authed(agent().post('/api/v1/admin/roles'), superCookie)
        .send({ key: 'markup_probe', name: payload, description: `select * from roles; -- ${payload}`, permissions: [] })
        .expect(201);
      expect(created.body.data.name).toBe(payload);
      const row = await testDatabase().role.findUniqueOrThrow({ where: { key: 'markup_probe' } });
      expect(row.name).toBe(payload);
      // The list still works: the payload was data, not a query.
      const list = await authed(agent().get(`/api/v1/admin/roles?q=${encodeURIComponent("' OR 1=1 --")}`), superCookie).expect(200);
      expect(Array.isArray(list.body.data)).toBe(true);
      expect(list.body.data.length).toBe(0);
    });

    it('refuses an oversized payload rather than processing it', async () => {
      const huge = Array.from({ length: 5000 }, (_, i) => `listings.read${i}`);
      const res = await authed(agent().post('/api/v1/admin/roles'), superCookie).send({ key: 'oversize', name: 'Oversize', description: '', permissions: huge });
      expect([400, 413]).toContain(res.status);
      expect(await testDatabase().role.findUnique({ where: { key: 'oversize' } })).toBeNull();
    });
  });

  describe('privileged mutation throttling (SEC 003)', () => {
    it('meters authorization mutations but leaves ordinary authorized reads alone', async () => {
      superCookie = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password).expect(200));
      const admin = await testDatabase().adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.normalisedEmail } });
      const redis = app.get(RedisService);
      await redis.ensureConnected();
      for (const name of ['burst', 'sustained']) await redis.client.del(`throttle:authz:${name}:${admin.id}`);

      // Reads stay unmetered: a busy moderator refreshing lists is not abuse.
      for (let i = 0; i < 30; i++) await authed(agent().get('/api/v1/admin/roles'), superCookie).expect(200);

      // Mutations are metered. Creating roles is a privileged mutation, so the
      // ceiling arrives after a realistic burst rather than immediately.
      const statuses: number[] = [];
      for (let i = 0; i < SENSITIVE_LIMITS.burst.max + 2; i++) {
        const res = await authed(agent().post('/api/v1/admin/roles'), superCookie)
          .send({ key: `throttle_probe_${i}`, name: `Throttle probe ${i}`, description: '', permissions: [] });
        statuses.push(res.status);
        if (res.status === 429) {
          // The refusal uses the project envelope, says when to retry, and
          // discloses nothing about the counters.
          expect(res.body.error).toMatchObject({ code: 'RATE_LIMITED' });
          expect(res.body.error.requestId).toBeTruthy();
          expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
          expect(JSON.stringify(res.body)).not.toMatch(/redis|counter|burst|sustained|remaining/i);
          break;
        }
      }
      expect(statuses.filter((status) => status === 201).length).toBeGreaterThanOrEqual(10);
      expect(statuses).toContain(429);

      // Reads still work while the mutation ceiling is in force.
      await authed(agent().get('/api/v1/admin/roles'), superCookie).expect(200);
      for (const name of ['burst', 'sustained']) await redis.client.del(`throttle:authz:${name}:${admin.id}`);
      await testDatabase().role.deleteMany({ where: { key: { startsWith: 'throttle_probe_' } } });
    });
  });

  describe('the current-principal endpoint', () => {
    it('returns only the approved fields', async () => {
      superCookie = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password).expect(200));
      const res = await authed(agent().get('/api/v1/admin/auth/me'), superCookie).expect(200);
      expect(Object.keys(res.body.data).sort()).toEqual(['admin', 'session']);
      expect(Object.keys(res.body.data.admin).sort()).toEqual(
        ['directPermissions', 'displayName', 'email', 'id', 'inheritedPermissions', 'permissions', 'roles', 'totpEnabled'].sort(),
      );
      expect(Object.keys(res.body.data.session).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'idleExpiresAt'].sort());
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/passwordHash|tokenHash|totpSecret|authzVersion|\$2[aby]\$|argon2/i);
    });
  });

  describe('the audit trail', () => {
    it('offers no way to change or delete an authorization audit record', async () => {
      superCookie = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password).expect(200));
      const db = testDatabase();
      const event = await db.auditLog.findFirstOrThrow({ where: { action: { startsWith: 'authz.' } } });
      // Built one at a time: each supertest call starts its own listener.
      const del = await authed(agent().delete(`/api/v1/admin/activity/${event.id}`), superCookie);
      expect([403, 404, 405]).toContain(del.status);
      const patch = await authed(agent().patch(`/api/v1/admin/activity/${event.id}`), superCookie).send({ action: 'tampered' });
      expect([403, 404, 405]).toContain(patch.status);
      const put = await authed(agent().put(`/api/v1/admin/activity/${event.id}`), superCookie).send({ action: 'tampered' });
      expect([403, 404, 405]).toContain(put.status);
      expect((await db.auditLog.findUniqueOrThrow({ where: { id: event.id } })).action).toBe(event.action);
    });

    it('records no secret material in authorization events', async () => {
      const events = await testDatabase().auditLog.findMany({ where: { action: { startsWith: 'authz.' } } });
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(JSON.stringify(event.metadata ?? {})).not.toMatch(/password|token|secret|cookie|authorization|hash/i);
      }
    });
  });
});

/**
 * Whole-surface enforcement sweep (SRS RBAC 006). It walks the routes Nest
 * actually registered — not a list someone maintains — and proves that an
 * administrator holding no permissions is refused everywhere except the routes
 * that are deliberately public or session-only. A new endpoint that forgets its
 * permission fails this test on the day it is added.
 */
describe('Every admin route denies by default (integration)', () => {
  let app: INestApplication;
  let permissionlessCookie: string;
  const powerless = { email: 'powerless@example.com', displayName: 'Powerless', password: 'powerless-password-12345' };
  const agent = () => request(app.getHttpServer());

  /** Reachable with a valid session and no permission, by design. */
  const SESSION_ONLY = [
    '/api/v1/admin/auth/me',
    '/api/v1/admin/auth/logout',
    '/api/v1/admin/auth/change-password',
    '/api/v1/admin/auth/sessions',
    // Self-service revocation: scoped to the caller's own sessions in the
    // service (a session id belonging to someone else answers 404, see the IDOR
    // test below), so it needs a session and no permission.
    '/api/v1/admin/auth/sessions/:id',
    '/api/v1/admin/auth/totp/enroll',
    '/api/v1/admin/auth/totp/verify',
    '/api/v1/admin/auth/totp/disable',
    // The settings registry is metadata about groups, filtered to the ones the
    // caller may view (SRS 1.2 SET 002, RBAC 007/010): an administrator with no
    // permissions gets an empty list, never a group they cannot open.
    '/api/v1/admin/settings/registry',
    '/api/v1/admin/dashboard',
  ];
  /** Reachable without any session, by design (login and recovery). */
  const PUBLIC = [
    '/api/v1/admin/auth/login',
    '/api/v1/admin/auth/forgot-password',
    '/api/v1/admin/auth/reset-password',
    '/api/v1/admin/auth/accept-setup',
    '/api/v1/admin/auth/totp/challenge',
  ];

  beforeAll(async () => {
    await truncateApplicationTables();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailerPort).useValue(new CapturingMailer()).compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>({ ...APP_CREATE_OPTIONS, logger: false });
    configureApp(nest, { trustProxy: 1 });
    await nest.init();
    app = nest;
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    const created = await app
      .get(IdentityService)
      .createAdmin({ email: powerless.email, displayName: powerless.displayName, passwordHash: await app.get(PasswordService).hash(powerless.password), roleKeys: [] });
    await testDatabase().adminUser.update({ where: { id: created.id }, data: { status: 'active' } });
    permissionlessCookie = cookieOf(
      await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.98').send({ email: powerless.email, password: powerless.password }).expect(200),
    );
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  const registeredRoutes = (): { method: string; path: string }[] => {
    const instance = app.getHttpAdapter().getInstance() as { router?: { stack: unknown[] }; _router?: { stack: unknown[] } };
    const stack = (instance.router ?? instance._router)?.stack ?? [];
    const out: { method: string; path: string }[] = [];
    for (const layer of stack as { route?: { path: string | string[]; methods: Record<string, boolean> } }[]) {
      if (!layer.route) continue;
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const path of paths) {
        if (typeof path !== 'string' || !path.startsWith('/api/v1/admin')) continue;
        for (const [method, enabled] of Object.entries(layer.route.methods)) if (enabled) out.push({ method: method.toUpperCase(), path });
      }
    }
    return out;
  };

  it('found the admin surface to test', () => {
    const routes = registeredRoutes();
    // If this ever reads zero the sweep below would pass vacuously.
    expect(routes.length).toBeGreaterThan(50);
  });

  /**
   * The two allowlists above are the only exemptions from the sweep, so an
   * entry that does not correspond to a real route is a way for a future route
   * to be exempted silently. Both are checked against the running router and
   * against the declaration the guard itself reads.
   */
  it('exempts only routes that exist and really are declared open', () => {
    const registered = new Set(registeredRoutes().map((route) => route.path));
    const reflector = app.get(Reflector);
    const declarationOf = (path: string): 'PUBLIC' | 'SESSION ONLY' | 'OTHER' => {
      const container = (app as unknown as { container: { getModules(): Map<string, { controllers: Map<unknown, { instance: object; metatype?: new (...args: never[]) => object }> }> } }).container;
      for (const module of container.getModules().values()) {
        for (const wrapper of module.controllers.values()) {
          const metatype = wrapper.metatype;
          if (!metatype) continue;
          const controllerPath = Reflect.getMetadata('path', metatype) as string | undefined;
          const prototype = Object.getPrototypeOf(wrapper.instance);
          for (const name of Object.getOwnPropertyNames(prototype)) {
            if (name === 'constructor') continue;
            const handler = prototype[name] as ((...args: never[]) => unknown) | undefined;
            if (typeof handler !== 'function') continue;
            const methodPath = Reflect.getMetadata('path', handler) as string | undefined;
            if (methodPath === undefined) continue;
            const full = `/${['/api/v1', controllerPath, methodPath].filter((part) => part && part !== '/').map((part) => String(part).replace(/^\/+|\/+$/g, '')).join('/')}`;
            if (full !== path) continue;
            const targets = [handler, metatype] as Parameters<Reflector['getAllAndOverride']>[1];
            if (reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, targets)) return 'PUBLIC';
            if (reflector.getAllAndOverride<boolean>(SESSION_ONLY_KEY, targets)) return 'SESSION ONLY';
            return 'OTHER';
          }
        }
      }
      return 'OTHER';
    };

    const problems: string[] = [];
    for (const path of PUBLIC) {
      if (!registered.has(path)) problems.push(`${path} is allowlisted as public but is not a route`);
      else if (declarationOf(path) !== 'PUBLIC') problems.push(`${path} is allowlisted as public but is not declared @Public`);
    }
    for (const path of SESSION_ONLY) {
      if (!registered.has(path)) problems.push(`${path} is allowlisted as session-only but is not a route`);
      else if (declarationOf(path) !== 'SESSION ONLY') problems.push(`${path} is allowlisted as session-only but is not declared @SessionOnly`);
    }
    expect(problems).toEqual([]);
  });

  it('refuses an administrator with no permissions on every route that is not deliberately open', async () => {
    const routes = registeredRoutes().filter((route) => !SESSION_ONLY.includes(route.path) && !PUBLIC.includes(route.path));
    const leaks: string[] = [];
    for (const route of routes) {
      // Concrete values for path parameters: authorization must be refused
      // before anything is looked up, so a non-existent id is the right probe.
      const path = route.path.replace(/:[A-Za-z]+/g, 'audit-probe-id');
      const req = agent()[route.method.toLowerCase() as 'get'](path).set('Origin', ORIGIN).set('Cookie', permissionlessCookie);
      const res = await (route.method === 'GET' || route.method === 'DELETE' ? req : req.send({}));
      // 403 is the expected answer; 400/404 would mean the handler ran first.
      if (res.status !== 403) leaks.push(`${route.method} ${route.path} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('does not let one administrator revoke another administrator’s session by id', async () => {
    const db = testDatabase();
    // Give the victim a live session to aim at.
    await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.97').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    const victim = await db.adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.normalisedEmail } });
    const victimSession = await db.adminSession.findFirst({ where: { adminId: victim.id, revokedAt: null } });
    expect(victimSession, 'expected a session to attack').toBeTruthy();
    await agent().delete(`/api/v1/admin/auth/sessions/${victimSession!.id}`).set('Origin', ORIGIN).set('Cookie', permissionlessCookie).expect(404);
    expect((await db.adminSession.findUniqueOrThrow({ where: { id: victimSession!.id } })).revokedAt).toBeNull();
  });

  it('refuses an anonymous caller on every route that is not public', async () => {
    const routes = registeredRoutes().filter((route) => !PUBLIC.includes(route.path));
    const leaks: string[] = [];
    for (const route of routes) {
      const path = route.path.replace(/:[A-Za-z]+/g, 'audit-probe-id');
      const req = agent()[route.method.toLowerCase() as 'get'](path).set('Origin', ORIGIN);
      const res = await (route.method === 'GET' || route.method === 'DELETE' ? req : req.send({}));
      if (res.status !== 401) leaks.push(`${route.method} ${route.path} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });
});
