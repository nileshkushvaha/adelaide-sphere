import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { MailerPort } from '../src/auth/mailer/mailer.port.js';
import { ARTIFACT_REVOCATION_REASON, assertRevocableTarget, countAuthArtifacts, revokeAuthArtifacts } from '../src/auth/auth-artifacts.js';
import { CapturingMailer, ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/**
 * A runtime check or a test that requests a reset link and signs in leaves two
 * credentials behind. This proves the cleanup retires both, that a retired link
 * is refused by the real flow, and that the tooling cannot be pointed at
 * production.
 */
describe('Authentication artifact cleanup (integration)', () => {
  let app: INestApplication;
  let mailer: CapturingMailer;
  const agent = () => request(app.getHttpServer());

  beforeAll(async () => {
    await truncateApplicationTables();
    mailer = new CapturingMailer();
    app = await createIntegrationApp({ overrides: [{ token: MailerPort, useValue: mailer }] });
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('retires the reset link and the session a runtime check leaves behind, and the link is then refused', async () => {
    const db = testDatabase();
    // Artifacts as a runtime check creates them: one mailed reset link, one open session.
    await agent().post('/api/v1/admin/auth/forgot-password').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.90').send({ email: TEST_ADMIN.email }).expect(202);
    const link = mailer.sent.at(-1)?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
    expect(link).toBeDefined();
    const login = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.91').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    const cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
    expect(await countAuthArtifacts(db)).toEqual({ activeTokens: 1, liveSessions: 1 });

    const result = await revokeAuthArtifacts(db);
    expect(result).toEqual({ tokensRevoked: 1, sessionsRevoked: 1 });
    expect(await countAuthArtifacts(db)).toEqual({ activeTokens: 0, liveSessions: 0 });

    // The real flow refuses the retired link with its ordinary answer, and the
    // password is unchanged; the session cookie no longer opens anything.
    const refused = await agent().post('/api/v1/admin/auth/reset-password').set('Origin', ORIGIN).send({ token: link, newPassword: 'a-replacement-password-9' }).expect(400);
    expect(refused.body.error.code).toBe('INVALID_RESET_TOKEN');
    await agent().get('/api/v1/admin/auth/me').set('Cookie', cookie).expect(401);
    await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.92').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    const session = await db.adminSession.findFirstOrThrow({ where: { revokedReason: ARTIFACT_REVOCATION_REASON } });
    expect(session.revokedAt).not.toBeNull();

    // Idempotent: a second pass finds nothing to do (the fresh login above is the only live session).
    expect(await revokeAuthArtifacts(db)).toEqual({ tokensRevoked: 0, sessionsRevoked: 1 });
    expect(await countAuthArtifacts(db)).toEqual({ activeTokens: 0, liveSessions: 0 });
  });

  it('refuses production and databases not marked as development, test or e2e', () => {
    expect(() => assertRevocableTarget('production', 'mysql://u:p@db/melbourne_sphere_test')).toThrow(/NODE_ENV=production/);
    expect(() => assertRevocableTarget('development', 'mysql://u:p@db/melbourne_sphere')).toThrow(/must end in _dev, _test or _e2e/);
    expect(() => assertRevocableTarget('development', 'mysql://u:p@db/melbourne_sphere_dev?sslmode=disabled')).not.toThrow();
  });
});
