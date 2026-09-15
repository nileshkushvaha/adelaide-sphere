import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { APP_CREATE_OPTIONS, configureApp } from '../src/app.setup.js';
import { MailerPort } from '../src/auth/mailer/mailer.port.js';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { PasswordService } from '../src/auth/password.service.js';
import { IdentityService } from '../src/identity/identity.service.js';
import { EffectivePermissionsService } from '../src/authorization/effective-permissions.service.js';
import { RedisService } from '../src/redis/redis.service.js';
import { CapturingMailer, ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, testDatabase, truncateApplicationTables } from './integration/harness.js';

function cookieOf(res: request.Response): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!raw) throw new Error('no session cookie');
  return `${SESSION_COOKIE_NAME}=${raw.split(';')[0]!.split('=')[1]}`;
}

/**
 * Access control against the real MySQL and Redis (SRS RBAC 002–012, test group
 * T15). These are the guarantees that cannot be proven with mocks: effective
 * permissions over real joins, 401/403 at the API boundary regardless of what
 * any interface shows, the privileged invariants, transactional assignment with
 * version checks, and cache behaviour including a Redis outage.
 */
describe('Administrator roles, permissions and enforcement (integration)', () => {
  let app: INestApplication;
  let superCookie: string;
  let staffCookie: string;
  let staffId: string;
  let editorRoleId: string;
  const staff = { email: 'staff.member@example.com', displayName: 'Staff Member', password: 'staff-member-password-12' };

  const agent = () => request(app.getHttpServer());
  const login = (email: string, password: string) => agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.91').send({ email, password });
  const authed = (req: request.Test, cookie: string) => req.set('Origin', ORIGIN).set('Cookie', cookie);

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

    // A second administrator with no roles and no direct permissions.
    const identity = app.get(IdentityService);
    const passwords = app.get(PasswordService);
    const created = await identity.createAdmin({ email: staff.email, displayName: staff.displayName, passwordHash: await passwords.hash(staff.password), roleKeys: [] });
    staffId = created.id;
    await testDatabase().adminUser.update({ where: { id: staffId }, data: { status: 'active' } });
    staffCookie = cookieOf(await login(staff.email, staff.password).expect(200));
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

  describe('the permission catalogue and roles', () => {
    it('publishes the registered catalogue with labels and modules, and refuses it without permission', async () => {
      await agent().get('/api/v1/admin/permissions').expect(401);
      await authed(agent().get('/api/v1/admin/permissions'), staffCookie).expect(403);
      const res = await authed(agent().get('/api/v1/admin/permissions'), superCookie).expect(200);
      const entry = res.body.data.find((p: { key: string }) => p.key === 'roles.update');
      expect(entry).toMatchObject({ module: 'Configuration', isActive: true, isSystem: true });
      expect(entry.label.length).toBeGreaterThan(2);
      // The catalogue is code-declared: there is no create endpoint to call.
      await authed(agent().post('/api/v1/admin/permissions'), superCookie).send({ key: 'invented.permission' }).expect(404);
    });

    it('creates a role with permissions and refuses a duplicate or reserved key', async () => {
      const res = await authed(agent().post('/api/v1/admin/roles'), superCookie)
        .send({ key: 'Editor', name: 'Editor', description: 'Writes and publishes articles', permissions: ['posts.update', 'posts.publish', 'media.upload', 'media.view'] })
        .expect(201);
      editorRoleId = res.body.data.id;
      expect(res.body.data).toMatchObject({ key: 'editor', isSystem: false, isActive: true, version: 1 });
      expect(res.body.data.permissions).toEqual(['media.upload', 'media.view', 'posts.publish', 'posts.update']);

      await authed(agent().post('/api/v1/admin/roles'), superCookie).send({ key: 'editor', name: 'Editor again', description: '', permissions: [] }).expect(409);
      await authed(agent().post('/api/v1/admin/roles'), superCookie).send({ key: 'super_admin', name: 'Copy', description: '', permissions: [] }).expect(400);
      // A code outside the catalogue cannot be granted, however it is spelled.
      await authed(agent().post('/api/v1/admin/roles'), superCookie).send({ key: 'ghost', name: 'Ghost', description: '', permissions: ['posts.everything'] }).expect(400);
    });

    it('refuses a payload with fields the DTO does not declare', async () => {
      await authed(agent().post('/api/v1/admin/roles'), superCookie)
        .send({ key: 'sneaky', name: 'Sneaky', description: '', permissions: [], isSystem: true })
        .expect(400);
    });
  });

  describe('effective permissions', () => {
    it('is empty for an administrator with no role and no direct permission', async () => {
      const res = await authed(agent().get('/api/v1/admin/auth/me'), staffCookie).expect(200);
      expect(res.body.data.admin.permissions).toEqual([]);
      expect(res.body.data.admin.roles).toEqual([]);
    });

    it('inherits through an assigned role, and the assignment is refused without admins.access.manage', async () => {
      await authed(agent().put(`/api/v1/admin/admins/${staffId}/roles`), staffCookie).send({ roleIds: [editorRoleId], expectedVersion: 1 }).expect(403);
      const admin = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: staffId } });
      const res = await authed(agent().put(`/api/v1/admin/admins/${staffId}/roles`), superCookie).send({ roleIds: [editorRoleId], expectedVersion: admin.version }).expect(200);
      expect(res.body.data.inheritedPermissions).toEqual(['media.upload', 'media.view', 'posts.publish', 'posts.update']);
      expect(res.body.data.directPermissions).toEqual([]);
      expect(res.body.data.effectivePermissions).toEqual(['media.upload', 'media.view', 'posts.publish', 'posts.update']);
      expect(res.body.data.sources['posts.update']).toEqual(['editor']);
    });

    it('adds direct permissions to the union, collapses duplicates and records their source', async () => {
      const admin = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: staffId } });
      const res = await authed(agent().put(`/api/v1/admin/admins/${staffId}/permissions`), superCookie)
        // 'posts.update' is already inherited: the union must not double it.
        .send({ permissions: ['reviews.moderate', 'posts.update', 'reviews.moderate'], expectedVersion: admin.version })
        .expect(200);
      expect(res.body.data.directPermissions).toEqual(['posts.update', 'reviews.moderate']);
      expect(res.body.data.effectivePermissions).toEqual(['media.upload', 'media.view', 'posts.publish', 'posts.update', 'reviews.moderate']);
      expect(res.body.data.sources['posts.update'].sort()).toEqual(['direct', 'editor']);
    });

    it('takes a union across several roles', async () => {
      const moderator = await authed(agent().post('/api/v1/admin/roles'), superCookie)
        .send({ key: 'moderator', name: 'Moderator', description: 'Handles the queues', permissions: ['comments.moderate', 'reports.manage'] })
        .expect(201);
      const admin = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: staffId } });
      const res = await authed(agent().put(`/api/v1/admin/admins/${staffId}/roles`), superCookie)
        .send({ roleIds: [editorRoleId, moderator.body.data.id], expectedVersion: admin.version })
        .expect(200);
      expect(res.body.data.inheritedPermissions).toEqual(['comments.moderate', 'media.upload', 'media.view', 'posts.publish', 'posts.update', 'reports.manage']);
    });

    it('contributes nothing from an inactive role, and nothing at all from an inactive administrator', async () => {
      const role = await testDatabase().role.findUniqueOrThrow({ where: { key: 'moderator' } });
      await authed(agent().patch(`/api/v1/admin/roles/${role.id}`), superCookie).send({ isActive: false, expectedVersion: role.version }).expect(200);
      const effective = app.get(EffectivePermissionsService);
      const afterDeactivation = await effective.load(staffId);
      expect(afterDeactivation.effective).not.toContain('comments.moderate');
      expect(afterDeactivation.effective).toContain('posts.publish');

      await testDatabase().adminUser.update({ where: { id: staffId }, data: { status: 'disabled' } });
      expect((await effective.load(staffId)).effective).toEqual([]);
      await testDatabase().adminUser.update({ where: { id: staffId }, data: { status: 'active' } });

      // Reactivate the role for the remaining cases.
      const reread = await testDatabase().role.findUniqueOrThrow({ where: { key: 'moderator' } });
      await authed(agent().patch(`/api/v1/admin/roles/${reread.id}`), superCookie).send({ isActive: true, expectedVersion: reread.version }).expect(200);
    });

    it('contributes nothing from a permission retired in the database', async () => {
      const effective = app.get(EffectivePermissionsService);
      await testDatabase().permission.update({ where: { key: 'media.upload' }, data: { isActive: false } });
      expect((await effective.load(staffId)).effective).not.toContain('media.upload');
      await testDatabase().permission.update({ where: { key: 'media.upload' }, data: { isActive: true } });
      expect((await effective.load(staffId)).effective).toContain('media.upload');
    });
  });

  describe('enforcement at the API boundary', () => {
    it('answers 401 unauthenticated and 403 without the permission, on a route reached directly', async () => {
      await agent().get('/api/v1/admin/roles').expect(401);
      // A privilege change ends the target's sessions (AUTH 002), so this test
      // signs in again rather than reusing a cookie from before the assignment.
      staffCookie = cookieOf(await login(staff.email, staff.password).expect(200));
      const denied = await authed(agent().get('/api/v1/admin/roles'), staffCookie).expect(403);
      // The refusal says nothing about which permission was missing or where it comes from.
      expect(JSON.stringify(denied.body)).not.toMatch(/roles\.view|super_admin|role/i);
      expect(denied.body.error).toMatchObject({ code: 'FORBIDDEN' });
      expect(denied.body.error.requestId).toBeTruthy();
    });

    it('allows the operation once the permission is granted, then ends the session and the access when it is removed', async () => {
      const fresh = cookieOf(await login(staff.email, staff.password).expect(200));
      await authed(agent().get('/api/v1/admin/media'), fresh).expect(200); // media.view, inherited from the Editor role

      const admin = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: staffId } });
      await authed(agent().put(`/api/v1/admin/admins/${staffId}/roles`), superCookie).send({ roleIds: [], expectedVersion: admin.version }).expect(200);
      const withDirectOnly = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: staffId } });
      await authed(agent().put(`/api/v1/admin/admins/${staffId}/permissions`), superCookie).send({ permissions: [], expectedVersion: withDirectOnly.version }).expect(200);

      // The open session is revoked by the privilege change itself (AUTH 002),
      // so the next request is refused before authorization is even consulted.
      await authed(agent().get('/api/v1/admin/media'), fresh).expect(401);
      expect(await testDatabase().adminSession.count({ where: { adminId: staffId, revokedAt: null } })).toBe(0);
      // And signing in again gives an account that now holds nothing.
      const after = cookieOf(await login(staff.email, staff.password).expect(200));
      await authed(agent().get('/api/v1/admin/media'), after).expect(403);
    });

    it('keeps two codes on the same resource apart', async () => {
      const admin = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: staffId } });
      await authed(agent().put(`/api/v1/admin/admins/${staffId}/permissions`), superCookie).send({ permissions: ['admins.view'], expectedVersion: admin.version }).expect(200);
      const cookie = cookieOf(await login(staff.email, staff.password).expect(200));
      // admins.manage reads the access screen but must not grant the assignment endpoint.
      await authed(agent().get(`/api/v1/admin/admins/${staffId}/access`), cookie).expect(200);
      await authed(agent().put(`/api/v1/admin/admins/${staffId}/roles`), cookie).send({ roleIds: [], expectedVersion: 1 }).expect(403);
    });
  });

  describe('privileged invariants', () => {
    it('refuses an administrator changing their own roles or permissions', async () => {
      const superAdmin = await testDatabase().adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.normalisedEmail } });
      await authed(agent().put(`/api/v1/admin/admins/${superAdmin.id}/roles`), superCookie).send({ roleIds: [], expectedVersion: superAdmin.version }).expect(403);
      await authed(agent().put(`/api/v1/admin/admins/${superAdmin.id}/permissions`), superCookie).send({ permissions: [], expectedVersion: superAdmin.version }).expect(403);
    });

    it('refuses granting a permission the acting administrator does not hold', async () => {
      // Give the staff member the ability to assign access, but nothing else.
      const admin = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: staffId } });
      await authed(agent().put(`/api/v1/admin/admins/${staffId}/permissions`), superCookie)
        .send({ permissions: ['admins.access.manage', 'admins.view', 'roles.view', 'roles.create'], expectedVersion: admin.version })
        .expect(200);
      const cookie = cookieOf(await login(staff.email, staff.password).expect(200));
      // They cannot mint a role carrying a permission they do not have themselves.
      await authed(agent().post('/api/v1/admin/roles'), cookie).send({ key: 'escalation', name: 'Escalation', description: '', permissions: ['settings.general.update'] }).expect(403);
      await authed(agent().post('/api/v1/admin/roles'), cookie).send({ key: 'narrow', name: 'Narrow', description: '', permissions: ['roles.view'] }).expect(201);
    });

    it('protects the last active super administrator and the protected role', async () => {
      const superAdmin = await testDatabase().adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.normalisedEmail } });
      const superRole = await testDatabase().role.findUniqueOrThrow({ where: { key: 'super_admin' } });
      // Removing the role from the only active super administrator is refused
      // (attempted by another administrator, so the self-edit rule is not what fails).
      const assigner = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: staffId } });
      await testDatabase().adminPermission.create({
        data: { adminId: staffId, permissionId: (await testDatabase().permission.findUniqueOrThrow({ where: { key: 'admins.access.manage' } })).id },
      }).catch(() => undefined);
      await testDatabase().adminUser.update({ where: { id: staffId }, data: { authzVersion: { increment: 1 } } });
      const staffAgain = cookieOf(await login(staff.email, staff.password).expect(200));
      const conflictRes = await authed(agent().put(`/api/v1/admin/admins/${superAdmin.id}/roles`), staffAgain)
        .send({ roleIds: [], expectedVersion: superAdmin.version })
        .expect(409);
      expect(conflictRes.body.error.code).toBe('LAST_SUPER_ADMIN');
      expect(assigner.id).toBe(staffId);

      // The protected role cannot be deleted, deactivated or edited by hand.
      await authed(agent().delete(`/api/v1/admin/roles/${superRole.id}`), superCookie).expect(403);
      await authed(agent().patch(`/api/v1/admin/roles/${superRole.id}`), superCookie).send({ isActive: false, expectedVersion: superRole.version }).expect(403);
      await authed(agent().put(`/api/v1/admin/roles/${superRole.id}/permissions`), superCookie).send({ permissions: ['listings.read'], expectedVersion: superRole.version }).expect(403);
    });

    it('refuses to delete a role that is still assigned, and refuses an inactive role assignment', async () => {
      const role = await testDatabase().role.findUniqueOrThrow({ where: { key: 'editor' } });
      const target = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: staffId } });
      await authed(agent().put(`/api/v1/admin/admins/${staffId}/roles`), superCookie).send({ roleIds: [role.id], expectedVersion: target.version }).expect(200);
      const inUse = await authed(agent().delete(`/api/v1/admin/roles/${role.id}`), superCookie).expect(409);
      expect(inUse.body.error.code).toBe('ROLE_IN_USE');

      const reread = await testDatabase().role.findUniqueOrThrow({ where: { key: 'editor' } });
      await authed(agent().patch(`/api/v1/admin/roles/${reread.id}`), superCookie).send({ isActive: false, expectedVersion: reread.version }).expect(200);
      const after = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: staffId } });
      await authed(agent().put(`/api/v1/admin/admins/${staffId}/roles`), superCookie).send({ roleIds: [reread.id], expectedVersion: after.version }).expect(400);
    });

    it('refuses a stale write and leaves nothing half-applied', async () => {
      const role = await testDatabase().role.findUniqueOrThrow({ where: { key: 'narrow' } });
      const before = await testDatabase().rolePermission.count({ where: { roleId: role.id } });
      const stale = await authed(agent().put(`/api/v1/admin/roles/${role.id}/permissions`), superCookie)
        .send({ permissions: ['listings.read', 'listings.update'], expectedVersion: role.version + 5 })
        .expect(409);
      expect(stale.body.error.code).toBe('STALE_VERSION');
      // The transaction rolled back: the old set is exactly as it was.
      expect(await testDatabase().rolePermission.count({ where: { roleId: role.id } })).toBe(before);
    });
  });

  describe('audit and caching', () => {
    it('records every access change with the actor, target, request id and a safe summary', async () => {
      const events = await testDatabase().auditLog.findMany({ where: { action: { startsWith: 'authz.' } }, orderBy: { createdAt: 'asc' } });
      const actions = [...new Set(events.map((event) => event.action))];
      expect(actions).toEqual(expect.arrayContaining(['authz.role.create', 'authz.role.update', 'authz.admin.roles', 'authz.admin.permissions']));
      const assignment = events.find((event) => event.action === 'authz.admin.roles')!;
      expect(assignment.actorAdminId).toBeTruthy();
      expect(assignment.targetType).toBe('admin_user');
      expect(assignment.requestId).toBeTruthy();
      expect(JSON.stringify(assignment.metadata)).toMatch(/added|removed/);
      // No secret, no password material, no full request body.
      expect(JSON.stringify(assignment.metadata)).not.toMatch(/password|token|secret|hash/i);
    });

    it('rolls the audit record back with the change it describes', async () => {
      const before = await testDatabase().auditLog.count({ where: { action: 'authz.role.permissions' } });
      const role = await testDatabase().role.findUniqueOrThrow({ where: { key: 'narrow' } });
      await authed(agent().put(`/api/v1/admin/roles/${role.id}/permissions`), superCookie).send({ permissions: ['roles.view'], expectedVersion: role.version + 9 }).expect(409);
      expect(await testDatabase().auditLog.count({ where: { action: 'authz.role.permissions' } })).toBe(before);
    });

    it('serves repeated resolutions from Redis and re-resolves after a version bump', async () => {
      const effective = app.get(EffectivePermissionsService);
      const redis = app.get(RedisService);
      await redis.ensureConnected();
      const first = await effective.resolve(staffId);
      const stamp = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: staffId }, select: { authzVersion: true } });
      expect(await redis.client.get(`authz:admin:${staffId}:v${stamp.authzVersion}`)).toBeTruthy();

      // A direct database change without a version bump is deliberately not seen:
      // this is what proves the cache is actually being used.
      const permission = await testDatabase().permission.findUniqueOrThrow({ where: { key: 'activity.system.view' } });
      await testDatabase().adminPermission.create({ data: { adminId: staffId, permissionId: permission.id } });
      expect((await effective.resolve(staffId)).effective).toEqual(first.effective);

      // The version bump every API path performs makes it visible at once.
      await testDatabase().adminUser.update({ where: { id: staffId }, data: { authzVersion: { increment: 1 } } });
      expect((await effective.resolve(staffId)).effective).toContain('activity.system.view');
    });

    it('falls back to the database when Redis is unavailable, without granting or losing access', async () => {
      const effective = app.get(EffectivePermissionsService);
      const expected = await effective.load(staffId);
      const redis = app.get(RedisService);
      const broken = { get: async () => { throw new Error('redis down'); }, set: async () => { throw new Error('redis down'); } };
      const original = Object.getOwnPropertyDescriptor(redis, 'client');
      Object.defineProperty(redis, 'client', { configurable: true, get: () => broken });
      try {
        const resolved = await effective.resolve(staffId);
        expect(resolved.effective).toEqual(expected.effective);
        expect(resolved.effective.length).toBeGreaterThan(0);
      } finally {
        if (original) Object.defineProperty(redis, 'client', original);
        else Reflect.deleteProperty(redis as object, 'client');
      }
    });
  });
});
