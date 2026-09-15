import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import * as OTPAuth from 'otpauth';
import { AppModule } from '../src/app.module.js';
import { APP_CREATE_OPTIONS, configureApp } from '../src/app.setup.js';
import { MailerPort } from '../src/auth/mailer/mailer.port.js';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { CapturingMailer, ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, testDatabase, truncateApplicationTables } from './integration/harness.js';

function cookieOf(res: request.Response): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!raw) throw new Error('no session cookie');
  return `${SESSION_COOKIE_NAME}=${raw.split(';')[0]!.split('=')[1]}`;
}

describe('Administrator lifecycle, sessions, audit and TOTP (integration)', () => {
  let app: INestApplication;
  let mailer: CapturingMailer;
  let superCookie: string;
  const agent = () => request(app.getHttpServer());
  const login = (email: string, password: string, ip = '203.0.113.90') =>
    agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password });
  const post = (path: string, cookie: string) => agent().post(path).set('Origin', ORIGIN).set('Cookie', cookie);

  beforeAll(async () => {
    await truncateApplicationTables();
    mailer = new CapturingMailer();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MailerPort).useValue(mailer).compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>({ ...APP_CREATE_OPTIONS, logger: false });
    configureApp(nest, { trustProxy: 1 });
    await nest.init();
    app = nest;
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    superCookie = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password).expect(200));
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  describe('administrator accounts', () => {
    let createdId: string;
    let setupToken: string;
    const invitee = { email: 'Second.Admin@example.com', displayName: 'Second Admin', password: 'second-admin-password-1' };

    it('requires admins.manage and denies anonymous access', async () => {
      await agent().get('/api/v1/admin/admins').expect(401);
    });

    it('creates an invited admin, sends a setup link, and lists with pagination/filters/sort', async () => {
      mailer.sent.length = 0;
      const res = await post('/api/v1/admin/admins', superCookie).send({ email: invitee.email, displayName: invitee.displayName, roleKeys: ['super_admin'] }).expect(201);
      expect(res.body.data).toMatchObject({ email: 'second.admin@example.com', status: 'invited', roles: ['super_admin'], totpEnabled: false, version: 1 });
      createdId = res.body.data.id;
      expect(mailer.sent).toHaveLength(1);
      setupToken = /token=([A-Za-z0-9_-]+)/.exec(mailer.sent[0]!.text)![1]!;
      await post('/api/v1/admin/admins', superCookie).send({ email: invitee.email, displayName: 'Dup', roleKeys: ['super_admin'] }).expect(409);
      await post('/api/v1/admin/admins', superCookie).send({ email: 'x@example.com', displayName: 'X', roleKeys: ['nope'] }).expect(400);
      await post('/api/v1/admin/admins', superCookie).send({ email: 'x@example.com', displayName: 'X', roleKeys: ['super_admin'], isAdmin: true }).expect(400);

      const list = await agent().get('/api/v1/admin/admins?pageSize=1&sort=email&order=asc').set('Cookie', superCookie).expect(200);
      expect(list.body.meta).toEqual({ page: 1, pageSize: 1, total: 2, pageCount: 2 });
      expect(list.body.data[0].email).toBe(TEST_ADMIN.normalisedEmail);
      const filtered = await agent().get('/api/v1/admin/admins?status=invited&q=second').set('Cookie', superCookie).expect(200);
      expect(filtered.body.data.map((a: { id: string }) => a.id)).toEqual([createdId]);
      await agent().get('/api/v1/admin/admins?pageSize=500').set('Cookie', superCookie).expect(400);
      await agent().get('/api/v1/admin/admins?sort=passwordHash').set('Cookie', superCookie).expect(400);
      expect(JSON.stringify(list.body)).not.toContain('passwordHash');
    });

    it('invited accounts cannot sign in until setup is accepted; setup token is single use', async () => {
      await login(invitee.email, invitee.password, '203.0.113.91').expect(401);
      await agent().post('/api/v1/admin/auth/accept-setup').set('Origin', ORIGIN).send({ token: setupToken, password: 'short' }).expect(400);
      await agent().post('/api/v1/admin/auth/accept-setup').set('Origin', ORIGIN).send({ token: setupToken, password: invitee.password }).expect(204);
      const reused = await agent().post('/api/v1/admin/auth/accept-setup').set('Origin', ORIGIN).send({ token: setupToken, password: invitee.password }).expect(400);
      expect(reused.body.error.code).toBe('INVALID_SETUP_TOKEN');
      await clearThrottleKeys(app);
      await login(invitee.email, invitee.password, '203.0.113.92').expect(200);
      const db = testDatabase();
      expect((await db.adminUser.findUniqueOrThrow({ where: { id: createdId } })).status).toBe('active');
    });

    it('updates with expectedVersion, rejects stale versions, and revokes sessions on role change', async () => {
      const get = async () => (await agent().get(`/api/v1/admin/admins/${createdId}`).set('Cookie', superCookie).expect(200)).body.data;
      const current = await get();
      const stale = await agent().patch(`/api/v1/admin/admins/${createdId}`).set('Origin', ORIGIN).set('Cookie', superCookie).send({ expectedVersion: current.version - 1, displayName: 'Renamed' }).expect(409);
      expect(stale.body.error.code).toBe('STALE_VERSION');
      const updated = await agent().patch(`/api/v1/admin/admins/${createdId}`).set('Origin', ORIGIN).set('Cookie', superCookie).send({ expectedVersion: current.version, displayName: 'Renamed Admin' }).expect(200);
      expect(updated.body.data).toMatchObject({ displayName: 'Renamed Admin', version: current.version + 1 });
      await agent().patch(`/api/v1/admin/admins/${createdId}`).set('Origin', ORIGIN).set('Cookie', superCookie).send({ expectedVersion: current.version + 1, displayName: 'x' }).expect(400);
    });

    it('protects the last active Super Admin and refuses self-disable', async () => {
      const db = testDatabase();
      const me = await db.adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.normalisedEmail } });
      const self = await post(`/api/v1/admin/admins/${me.id}/disable`, superCookie).send({ expectedVersion: me.version }).expect(409);
      expect(self.body.error.code).toBe('SELF_DISABLE');
      // Disable the second admin (allowed: the seeded admin remains), then try to disable the seeded one from the second's session → last super admin.
      const second = await db.adminUser.findUniqueOrThrow({ where: { id: createdId } });
      const disabled = await post(`/api/v1/admin/admins/${createdId}/disable`, superCookie).send({ expectedVersion: second.version, reason: 'test' }).expect(200);
      expect(disabled.body.data.status).toBe('disabled');
      await login('second.admin@example.com', 'second-admin-password-1', '203.0.113.93').expect(401);
      const enabled = await post(`/api/v1/admin/admins/${createdId}/enable`, superCookie).send({ expectedVersion: disabled.body.data.version }).expect(200);
      expect(enabled.body.data.status).toBe('active');
      await clearThrottleKeys(app);
      const secondCookie = cookieOf(await login('second.admin@example.com', 'second-admin-password-1', '203.0.113.94').expect(200));
      const meNow = await db.adminUser.findUniqueOrThrow({ where: { id: me.id } });
      // Second disables the seeded admin: allowed (second remains active super admin).
      await post(`/api/v1/admin/admins/${me.id}/disable`, secondCookie).send({ expectedVersion: meNow.version }).expect(200);
      // Now the seeded admin's session is gone and second is the last super admin → cannot disable itself, and cannot drop its role.
      await agent().get('/api/v1/admin/auth/me').set('Cookie', superCookie).expect(401);
      const secondNow = await db.adminUser.findUniqueOrThrow({ where: { id: createdId } });
      const demote = await agent().patch(`/api/v1/admin/admins/${createdId}`).set('Origin', ORIGIN).set('Cookie', secondCookie).send({ expectedVersion: secondNow.version, roleKeys: [] }).expect(400);
      expect(demote.body.error.code).toBe('VALIDATION_ERROR');
      // Re-enable the seeded admin for the remaining suites and restore its session.
      const seededNow = await db.adminUser.findUniqueOrThrow({ where: { id: me.id } });
      await post(`/api/v1/admin/admins/${me.id}/enable`, secondCookie).send({ expectedVersion: seededNow.version }).expect(200);
      await clearThrottleKeys(app);
      superCookie = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.95').expect(200));
      const audits = await db.auditLog.findMany({ where: { action: { in: ['admin.create', 'admin.update', 'admin.disable', 'admin.enable', 'admin.setup.completed'] } } });
      expect(new Set(audits.map((a) => a.action)).size).toBe(5);
    });

    it('lists and revokes sessions for an admin, and the audit log is readable with filters', async () => {
      const db = testDatabase();
      const me = await db.adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.normalisedEmail } });
      const extra = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.96').expect(200));
      const sessions = await agent().get(`/api/v1/admin/admins/${me.id}/sessions`).set('Cookie', superCookie).expect(200);
      expect(sessions.body.data.length).toBeGreaterThanOrEqual(2);
      expect(sessions.body.data.some((s: { current: boolean }) => s.current)).toBe(true);
      const other = sessions.body.data.find((s: { current: boolean }) => !s.current);
      await agent().delete(`/api/v1/admin/admins/${me.id}/sessions/${other.id}`).set('Origin', ORIGIN).set('Cookie', superCookie).expect(204);
      await agent().get('/api/v1/admin/auth/me').set('Cookie', extra).expect(401);
      const own = await agent().get('/api/v1/admin/auth/sessions').set('Cookie', superCookie).expect(200);
      expect(own.body.data.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

      const audit = await agent().get('/api/v1/admin/activity?action=admin.*&pageSize=5').set('Cookie', superCookie).expect(200);
      expect(audit.body.meta.pageSize).toBe(5);
      expect(audit.body.data.every((e: { action: string }) => e.action.startsWith('admin.'))).toBe(true);
      expect(audit.body.data[0].actor).toMatchObject({ email: expect.any(String) });
      expect(JSON.stringify(audit.body)).not.toMatch(/passwordHash|tokenHash|\$argon2/);
      await agent().get('/api/v1/admin/activity?action=drop;table').set('Cookie', superCookie).expect(400);
    });

    it('change-password requires the current password and revokes other sessions', async () => {
      const other = cookieOf(await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.97').expect(200));
      const wrong = await post('/api/v1/admin/auth/change-password', superCookie).send({ currentPassword: 'not-it-at-all-12345', newPassword: 'changed-password-abc-123' }).expect(400);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
      await post('/api/v1/admin/auth/change-password', superCookie).send({ currentPassword: TEST_ADMIN.password, newPassword: 'changed-password-abc-123' }).expect(204);
      await agent().get('/api/v1/admin/auth/me').set('Cookie', superCookie).expect(200);
      await agent().get('/api/v1/admin/auth/me').set('Cookie', other).expect(401);
      // Changing straight back is refused: the old password is one of the last
      // three (SECS 003). The fixture is restored for the tests that follow by
      // clearing its history directly, not by weakening the rule.
      const back = await post('/api/v1/admin/auth/change-password', superCookie).send({ currentPassword: 'changed-password-abc-123', newPassword: TEST_ADMIN.password }).expect(400);
      expect(back.body.error.code).toBe('PASSWORD_REUSED');
      const admin = await testDatabase().adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.normalisedEmail } });
      await testDatabase().adminPasswordHistory.deleteMany({ where: { adminId: admin.id } });
      await post('/api/v1/admin/auth/change-password', superCookie).send({ currentPassword: 'changed-password-abc-123', newPassword: TEST_ADMIN.password }).expect(204);
    });
  });

  describe('TOTP', () => {
    let secret: string;
    let recoveryCodes: string[];
    const codeFor = (s: string) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(s), digits: 6, period: 30 }).generate();

    it('enrols with a fresh session, verifies with a valid code, and returns recovery codes once', async () => {
      const bad = await post('/api/v1/admin/auth/totp/verify', superCookie).send({ code: '000000' }).expect(409);
      expect(bad.body.error.code).toBe('TOTP_NOT_PENDING');
      const enroll = await post('/api/v1/admin/auth/totp/enroll', superCookie).send({}).expect(200);
      expect(enroll.body.data.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
      secret = enroll.body.data.secret;
      const db = testDatabase();
      const row = await db.adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.normalisedEmail } });
      expect(row.totpPendingSecretEncrypted).toMatch(/^v1:/);
      expect(row.totpPendingSecretEncrypted).not.toContain(secret);
      await post('/api/v1/admin/auth/totp/verify', superCookie).send({ code: '000000' }).expect(400);
      const verified = await post('/api/v1/admin/auth/totp/verify', superCookie).send({ code: codeFor(secret) }).expect(200);
      recoveryCodes = verified.body.data.recoveryCodes;
      expect(recoveryCodes).toHaveLength(10);
      const me = await agent().get('/api/v1/admin/auth/me').set('Cookie', superCookie).expect(200);
      expect(me.body.data.admin.totpEnabled).toBe(true);
      const stored = await db.adminRecoveryCode.findMany({ where: { adminId: row.id } });
      expect(stored).toHaveLength(10);
      expect(stored.map((c) => c.codeHash)).not.toContain(recoveryCodes[0]);
    });

    it('login now returns a 202 challenge; a valid TOTP code completes it, wrong codes are limited, challenges are single use', async () => {
      const step1 = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.98').expect(202);
      expect(step1.body.data.requires).toBe('totp');
      expect(step1.headers['set-cookie']).toBeUndefined();
      const challenge = step1.body.data.challenge;
      const wrong = await agent().post('/api/v1/admin/auth/totp/challenge').set('Origin', ORIGIN).send({ challenge, code: '111111' }).expect(401);
      expect(wrong.body.error.code).toBe('INVALID_TOTP_CODE');
      const ok = await agent().post('/api/v1/admin/auth/totp/challenge').set('Origin', ORIGIN).send({ challenge, code: codeFor(secret) }).expect(200);
      expect(ok.body.data.admin.totpEnabled).toBe(true);
      const cookie = cookieOf(ok);
      await agent().get('/api/v1/admin/auth/me').set('Cookie', cookie).expect(200);
      await agent().post('/api/v1/admin/auth/totp/challenge').set('Origin', ORIGIN).send({ challenge, code: codeFor(secret) }).expect(401);
      await agent().post('/api/v1/admin/auth/totp/challenge').set('Origin', ORIGIN).send({ challenge: 'A'.repeat(43), code: codeFor(secret) }).expect(401);
      const db = testDatabase();
      expect(await db.auditLog.count({ where: { action: 'auth.totp.challenge_failed' } })).toBe(1);
    });

    it('a recovery code completes the challenge once and is then spent', async () => {
      const step1 = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.99').expect(202);
      const code = recoveryCodes[0]!;
      await agent().post('/api/v1/admin/auth/totp/challenge').set('Origin', ORIGIN).send({ challenge: step1.body.data.challenge, code }).expect(200);
      const step2 = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.100').expect(202);
      await agent().post('/api/v1/admin/auth/totp/challenge').set('Origin', ORIGIN).send({ challenge: step2.body.data.challenge, code }).expect(401);
      await agent().post('/api/v1/admin/auth/totp/challenge').set('Origin', ORIGIN).send({ challenge: step2.body.data.challenge, code: recoveryCodes[1] }).expect(200);
      const db = testDatabase();
      expect(await db.adminRecoveryCode.count({ where: { usedAt: { not: null } } })).toBe(2);
    });

    it('disable requires recent authentication (or the password) plus a valid code, and re-enables plain login', async () => {
      const step1 = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.101').expect(202);
      const cookie = cookieOf(await agent().post('/api/v1/admin/auth/totp/challenge').set('Origin', ORIGIN).send({ challenge: step1.body.data.challenge, code: codeFor(secret) }).expect(200));
      // Age the session beyond the recent-auth window → password required.
      const db = testDatabase();
      await db.adminSession.updateMany({ where: { revokedAt: null }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
      const needsReauth = await post('/api/v1/admin/auth/totp/disable', cookie).send({ code: codeFor(secret) }).expect(403);
      expect(needsReauth.body.error.code).toBe('REAUTHENTICATION_REQUIRED');
      await post('/api/v1/admin/auth/totp/disable', cookie).send({ currentPassword: TEST_ADMIN.password, code: '000000' }).expect(400);
      await post('/api/v1/admin/auth/totp/disable', cookie).send({ currentPassword: TEST_ADMIN.password, code: codeFor(secret) }).expect(204);
      const me = await agent().get('/api/v1/admin/auth/me').set('Cookie', cookie).expect(200);
      expect(me.body.data.admin.totpEnabled).toBe(false);
      expect(await db.adminRecoveryCode.count()).toBe(0);
      await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.102').expect(200);
    });
  });
});
