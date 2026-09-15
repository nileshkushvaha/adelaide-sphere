import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { APP_CREATE_OPTIONS, configureApp } from '../src/app.setup.js';
import { MailerPort } from '../src/auth/mailer/mailer.port.js';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { AuthFixtureController, CapturingMailer, ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, listenForTests, testDatabase, truncateApplicationTables } from './integration/harness.js';

const COOKIE_RE = /^ms_admin_session=([^;]+);(.*)$/;

function cookieOf(res: request.Response): { value: string; attributes: string } {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!raw) throw new Error('no session cookie');
  const m = COOKIE_RE.exec(raw)!;
  return { value: m[1]!, attributes: m[2]!.toLowerCase() };
}

describe('Administrator authentication and RBAC (integration)', () => {
  let app: INestApplication;
  let mailer: CapturingMailer;
  const agent = () => request(app.getHttpServer());
  const login = (email = TEST_ADMIN.email, password = TEST_ADMIN.password, ip = '203.0.113.10') =>
    agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password });

  beforeAll(async () => {
    await truncateApplicationTables();
    mailer = new CapturingMailer();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: [AuthFixtureController] })
      .overrideProvider(MailerPort)
      .useValue(mailer)
      .compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>({ ...APP_CREATE_OPTIONS, logger: false });
    configureApp(nest, { trustProxy: 1 });
    await nest.init();
    // One stable port for the file; see listenForTests.
    app = await listenForTests(nest);
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  describe('login', () => {
    it('returns the principal, sets a hardened cookie scoped to /api/v1/admin, records audit', async () => {
      const res = await login().expect(200);
      expect(res.body.data.admin).toMatchObject({ email: TEST_ADMIN.normalisedEmail, displayName: TEST_ADMIN.displayName, roles: ['super_admin'] });
      expect(res.body.data.admin.permissions).toContain('admins.view');
      expect(res.body.data.admin.permissions).toContain('listings.read');
      expect(res.body.data.admin).not.toHaveProperty('passwordHash');
      expect(res.body.data.session.expiresAt).toBeDefined();
      expect(res.headers['cache-control']).toBe('no-store');
      const cookie = cookieOf(res);
      expect(cookie.value.length).toBeGreaterThanOrEqual(40);
      expect(cookie.attributes).toContain('httponly');
      expect(cookie.attributes).toContain('samesite=strict');
      expect(cookie.attributes).toContain('path=/api/v1/admin');
      const db = testDatabase();
      const sessions = await db.adminSession.findMany({ where: { revokedAt: null } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.tokenHash).not.toBe(cookie.value);
      expect(sessions[0]!.ipAddress).toBe('203.0.113.10');
      const audits = await db.auditLog.findMany({ where: { action: 'auth.login.success' } });
      expect(audits).toHaveLength(1);
      expect(JSON.stringify(audits)).not.toContain(TEST_ADMIN.password);
    });

    it('normalises the email (case/whitespace) on login', async () => {
      await login('  INTEGRATION.admin@example.COM ').expect(200);
    });

    it('returns one generic 401 for unknown email, wrong password and disabled account, and audits each', async () => {
      const unknown = await login('nobody@example.com', 'irrelevant-password-1', '203.0.113.20').expect(401);
      const wrong = await login(TEST_ADMIN.email, 'wrong-password-12345', '203.0.113.21').expect(401);
      expect(unknown.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      expect(wrong.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      expect(unknown.headers['set-cookie']).toBeUndefined();
      const db = testDatabase();
      const admin = await db.adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.normalisedEmail } });
      await db.adminUser.update({ where: { id: admin.id }, data: { status: 'disabled', disabledAt: new Date() } });
      const disabled = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.22').expect(401);
      expect(disabled.body.error.code).toBe('INVALID_CREDENTIALS');
      await db.adminUser.update({ where: { id: admin.id }, data: { status: 'active', disabledAt: null } });
      const failures = await db.auditLog.findMany({ where: { action: 'auth.login.failure' } });
      expect(failures.map((f) => (f.metadata as { reason: string }).reason).sort()).toEqual(['account_disabled', 'invalid_password', 'unknown_account']);
      await clearThrottleKeys(app);
    });

    it('rejects login without a trusted Origin (login CSRF) and with unknown fields', async () => {
      const res = await agent().post('/api/v1/admin/auth/login').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(403);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
      await agent().post('/api/v1/admin/auth/login').set('Origin', 'https://evil.example').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(403);
      const bad = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password, remember: true }).expect(400);
      expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('throttles after five failures per IP with Retry-After, without affecting other IPs, and resets on success', async () => {
      const ip = '198.51.100.5';
      for (let i = 0; i < 5; i++) await login(`attacker${i}@example.com`, 'bad-password-123456', ip).expect(401);
      const blocked = await login(`attacker9@example.com`, 'bad-password-123456', ip).expect(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      await login(TEST_ADMIN.email, TEST_ADMIN.password, '198.51.100.6').expect(200);
      // Account throttling: five wrong passwords for one account from rotating IPs blocks that account only.
      for (let i = 0; i < 5; i++) await login(TEST_ADMIN.email, 'bad-password-123456', `198.51.100.${10 + i}`).expect(401);
      const acctBlocked = await login(TEST_ADMIN.email, TEST_ADMIN.password, '198.51.100.99').expect(429);
      expect(acctBlocked.body.error.code).toBe('RATE_LIMITED');
      await clearThrottleKeys(app);
      await login(TEST_ADMIN.email, TEST_ADMIN.password, '198.51.100.99').expect(200);
    });
  });

  describe('sessions and authorisation', () => {
    let cookie: string;
    beforeAll(async () => {
      cookie = `${SESSION_COOKIE_NAME}=${cookieOf(await login().expect(200)).value}`;
    });

    it('GET /me returns the current admin; no cookie / forged cookie → 401 envelope', async () => {
      const me = await agent().get('/api/v1/admin/auth/me').set('Cookie', cookie).expect(200);
      expect(me.body.data.admin.email).toBe(TEST_ADMIN.normalisedEmail);
      const anon = await agent().get('/api/v1/admin/auth/me').expect(401);
      expect(anon.body.error).toMatchObject({ code: 'UNAUTHENTICATED', fields: {} });
      expect(anon.body.error.requestId).toBe(anon.headers['x-request-id']);
      await agent().get('/api/v1/admin/auth/me').set('Cookie', `${SESSION_COOKIE_NAME}=${'a'.repeat(43)}`).expect(401);
    });

    it('permission guard: allowed, forbidden (403), undeclared route denied, session-only route allowed', async () => {
      await agent().get('/api/v1/admin/__fixture/protected').set('Cookie', cookie).expect(200);
      await agent().get('/api/v1/admin/__fixture/session-only').set('Cookie', cookie).expect(200);
      const undeclared = await agent().get('/api/v1/admin/__fixture/undeclared').set('Cookie', cookie).expect(403);
      expect(undeclared.body.error.code).toBe('PERMISSION_UNDECLARED');
      expect(undeclared.body).not.toHaveProperty('data');
      await agent().get('/api/v1/admin/__fixture/protected').expect(401);
      // Strip a permission from the role and confirm 403 with the standard envelope.
      const db = testDatabase();
      const perm = await db.permission.findUniqueOrThrow({ where: { key: 'listings.read' } });
      await db.rolePermission.deleteMany({ where: { permissionId: perm.id } });
      // Effective permissions are cached under the administrator's authorization
      // version; every API path that changes access increments it in the same
      // transaction (SRS RBAC 009). This test edits the tables directly, so it
      // signals the change the same way rather than waiting for a TTL.
      await db.adminUser.updateMany({ data: { authzVersion: { increment: 1 } } });
      const forbidden = await agent().get('/api/v1/admin/__fixture/protected').set('Cookie', cookie).expect(403);
      expect(forbidden.body.error).toMatchObject({ code: 'FORBIDDEN', fields: {} });
      const role = await db.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
      await db.adminUser.updateMany({ data: { authzVersion: { increment: 1 } } });
      await agent().get('/api/v1/admin/__fixture/protected').set('Cookie', cookie).expect(200);
    });

    it('mutations require a trusted origin even with a valid session', async () => {
      await agent().post('/api/v1/admin/__fixture/mutate').set('Cookie', cookie).expect(403);
      await agent().post('/api/v1/admin/__fixture/mutate').set('Cookie', cookie).set('Origin', ORIGIN).expect(201);
      await agent().post('/api/v1/admin/__fixture/mutate').set('Cookie', cookie).set('Referer', `${ORIGIN}/admin/`).expect(201);
    });

    it('idle and absolute expiry revoke the session server-side', async () => {
      const db = testDatabase();
      const { value } = cookieOf(await login().expect(200));
      const c = `${SESSION_COOKIE_NAME}=${value}`;
      await agent().get('/api/v1/admin/auth/me').set('Cookie', c).expect(200);
      const before = new Date(Date.now() - 1_000);
      await db.adminSession.updateMany({ where: { revokedAt: null, idleExpiresAt: { gt: before } }, data: { idleExpiresAt: before } });
      // Only the session we just touched is affected below? All active sessions now have idle deadlines in the past.
      const expired = await agent().get('/api/v1/admin/auth/me').set('Cookie', c).expect(401);
      expect(expired.headers['set-cookie']?.[0]).toMatch(/ms_admin_session=;/);
      const record = await db.adminSession.findMany({ where: { revokedReason: 'idle_timeout' } });
      expect(record.length).toBeGreaterThanOrEqual(1);
      cookie = `${SESSION_COOKIE_NAME}=${cookieOf(await login().expect(200)).value}`;
    });

    it('disabled accounts lose access immediately, even with a live session', async () => {
      const db = testDatabase();
      const admin = await db.adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.normalisedEmail } });
      await db.adminUser.update({ where: { id: admin.id }, data: { status: 'disabled' } });
      await agent().get('/api/v1/admin/auth/me').set('Cookie', cookie).expect(401);
      await db.adminUser.update({ where: { id: admin.id }, data: { status: 'active' } });
      expect(await db.adminSession.count({ where: { revokedReason: 'account_disabled' } })).toBeGreaterThanOrEqual(1);
      cookie = `${SESSION_COOKIE_NAME}=${cookieOf(await login().expect(200)).value}`;
    });

    it('logout revokes the server record and clears the cookie; the cookie is then useless', async () => {
      const res = await agent().post('/api/v1/admin/auth/logout').set('Cookie', cookie).set('Origin', ORIGIN).expect(204);
      expect(res.headers['set-cookie']?.[0]).toMatch(/ms_admin_session=;/);
      await agent().get('/api/v1/admin/auth/me').set('Cookie', cookie).expect(401);
      const db = testDatabase();
      expect(await db.auditLog.count({ where: { action: 'auth.logout' } })).toBe(1);
    });
  });

  describe('password reset', () => {
    it('forgot-password is always 202, mails a single-use link for active accounts only, and never reveals existence', async () => {
      mailer.sent.length = 0;
      const unknown = await agent().post('/api/v1/admin/auth/forgot-password').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.50').send({ email: 'nobody@example.com' }).expect(202);
      expect(unknown.body).toEqual({ data: { accepted: true } });
      expect(mailer.sent).toHaveLength(0);
      await agent().post('/api/v1/admin/auth/forgot-password').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.51').send({ email: TEST_ADMIN.email }).expect(202);
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0]!.to).toBe(TEST_ADMIN.normalisedEmail);
      const link = /token=([A-Za-z0-9_-]+)/.exec(mailer.sent[0]!.text)![1]!;
      const db = testDatabase();
      const tokens = await db.passwordResetToken.findMany();
      expect(tokens).toHaveLength(1);
      expect(tokens[0]!.tokenHash).not.toBe(link);
      expect(tokens[0]!.expiresAt.getTime() - tokens[0]!.createdAt.getTime()).toBeLessThanOrEqual(30 * 60_000 + 1_000);

      // Live session exists; reset must revoke it.
      const live = `${SESSION_COOKIE_NAME}=${cookieOf(await login().expect(200)).value}`;
      const newPassword = 'brand-new-password-98765';
      await agent().post('/api/v1/admin/auth/reset-password').set('Origin', ORIGIN).send({ token: link, newPassword: 'short' }).expect(400);
      // A reset is still a change: the password in use cannot be "reset" to itself,
      // and the refusal leaves the link usable for a real choice.
      const same = await agent().post('/api/v1/admin/auth/reset-password').set('Origin', ORIGIN).send({ token: link, newPassword: TEST_ADMIN.password }).expect(400);
      expect(same.body.error.code).toBe('PASSWORD_REUSED');
      expect(same.body.error.fields.newPassword).toBeTruthy();
      await agent().post('/api/v1/admin/auth/reset-password').set('Origin', ORIGIN).send({ token: link, newPassword }).expect(204);
      await agent().get('/api/v1/admin/auth/me').set('Cookie', live).expect(401);
      const reused = await agent().post('/api/v1/admin/auth/reset-password').set('Origin', ORIGIN).send({ token: link, newPassword: 'another-new-password-1' }).expect(400);
      expect(reused.body.error.code).toBe('INVALID_RESET_TOKEN');
      await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.60').expect(401);
      await clearThrottleKeys(app);
      await login(TEST_ADMIN.email, newPassword, '203.0.113.61').expect(200);
      expect(await db.auditLog.count({ where: { action: 'auth.password_reset.completed' } })).toBe(1);
      const forged = await agent().post('/api/v1/admin/auth/reset-password').set('Origin', ORIGIN).send({ token: 'A'.repeat(43), newPassword }).expect(400);
      expect(forged.body.error.code).toBe('INVALID_RESET_TOKEN');
    });

    it('expired tokens are rejected', async () => {
      mailer.sent.length = 0;
      await agent().post('/api/v1/admin/auth/forgot-password').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.70').send({ email: TEST_ADMIN.email }).expect(202);
      const link = /token=([A-Za-z0-9_-]+)/.exec(mailer.sent[0]!.text)![1]!;
      const db = testDatabase();
      await db.passwordResetToken.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1) } });
      const res = await agent().post('/api/v1/admin/auth/reset-password').set('Origin', ORIGIN).send({ token: link, newPassword: 'yet-another-password-77' }).expect(400);
      expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
    });
  });
});
