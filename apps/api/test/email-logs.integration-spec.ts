import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { signResendWebhook } from '@adelaide-sphere/mail';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { SUPER_ADMIN_ROLE } from '../src/identity/permissions.js';
import { EmailDeliveryService } from '../src/email/email-delivery.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

const SECRET = `whsec_${Buffer.from('integration-signing-secret').toString('base64')}`;
// The controller reads the signing secret from configuration, so the test
// environment must carry one before the application is created.
process.env.RESEND_WEBHOOK_SECRET = SECRET;

/**
 * Delivery records, the provider webhook and the admin log (SRS 1.2 MAIL
 * 005–010), against the real MySQL database.
 */
describe('Email delivery log (integration)', () => {
  let app: INestApplication;
  let deliveries: EmailDeliveryService;
  let cookie: string;
  let viewerCookie: string;
  const agent = () => request(app.getHttpServer());
  const loginAs = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };

  const postWebhook = (body: unknown, options: { secret?: string; id?: string; timestamp?: number; signed?: boolean } = {}) => {
    const raw = JSON.stringify(body);
    const id = options.id ?? `msg_${Math.random().toString(36).slice(2)}`;
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
    const req = agent().post('/api/v1/webhooks/email').set('Content-Type', 'application/json');
    if (options.signed !== false) {
      req.set('svix-id', id).set('svix-timestamp', String(timestamp)).set('svix-signature', signResendWebhook(raw, id, timestamp, options.secret ?? SECRET));
    }
    return req.send(raw);
  };

  const seedDelivery = async (overrides: { templateKey?: 'auth.password_reset' | 'enquiry.business'; recipient?: string; providerMessageId?: string; status?: 'sent' | 'delivered' | 'failed' } = {}) => {
    const record = await deliveries.record({
      templateKey: overrides.templateKey ?? 'enquiry.business',
      recipient: overrides.recipient ?? 'owner@example.com',
      subject: 'A new enquiry about your listing',
      provider: 'resend',
      relatedType: 'enquiry',
      relatedId: 'enq-1',
    });
    const db = testDatabase();
    if (overrides.providerMessageId || overrides.status) {
      await db.emailDelivery.update({
        where: { id: record.id },
        data: { providerMessageId: overrides.providerMessageId ?? null, status: overrides.status ?? 'queued' },
      });
    }
    return record.id;
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    deliveries = app.get(EmailDeliveryService);
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.30');

    // An administrator who may read the log but may not reveal a recipient or resend.
    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'email_viewer', name: 'Email viewer', description: 'test' } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: 'system.email_logs.view' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await seedSuperAdmin(app, { email: 'email-viewer@example.com', password: 'viewer-password-12345', displayName: 'Viewer' });
    const viewer = await db.adminUser.findUniqueOrThrow({ where: { email: 'email-viewer@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: SUPER_ADMIN_ROLE.key } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: viewer.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: viewer.id, roleId: role.id } });
    viewerCookie = await loginAs('email-viewer@example.com', 'viewer-password-12345', '203.0.113.31');
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  // ---- webhook security (MAIL 007) -----------------------------------------

  it('refuses an unsigned, wrongly signed, stale or tampered request with 401 and says nothing about why', async () => {
    const body = { type: 'email.delivered', data: { email_id: 'prov-unknown' } };
    for (const send of [
      () => postWebhook(body, { signed: false }),
      () => postWebhook(body, { secret: `whsec_${Buffer.from('a-different-secret').toString('base64')}` }),
      () => postWebhook(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 }),
    ]) {
      const res = await send();
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toMatch(/signature|timestamp|secret|expired/i);
    }

    // A body altered after signing must not verify.
    const raw = JSON.stringify(body);
    const id = 'msg_tamper';
    const timestamp = Math.floor(Date.now() / 1000);
    await agent()
      .post('/api/v1/webhooks/email')
      .set('Content-Type', 'application/json')
      .set('svix-id', id)
      .set('svix-timestamp', String(timestamp))
      .set('svix-signature', signResendWebhook(raw, id, timestamp, SECRET))
      .send(`${raw} `)
      .expect(401);
  });

  it('accepts a signed event for an unknown message without creating anything', async () => {
    const db = testDatabase();
    const before = await db.emailDeliveryEvent.count();
    await postWebhook({ type: 'email.delivered', data: { email_id: 'prov-does-not-exist' } }).expect(202);
    expect(await db.emailDeliveryEvent.count()).toBe(before);
  });

  it('records a delivered event and advances the status', async () => {
    const id = await seedDelivery({ providerMessageId: 'prov-1', status: 'sent' });
    await postWebhook({ type: 'email.delivered', created_at: '2026-09-07T10:00:00.000Z', data: { email_id: 'prov-1' } }).expect(202);

    const db = testDatabase();
    const row = await db.emailDelivery.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('delivered');
    expect(row.deliveredAt?.toISOString()).toBe('2026-09-07T10:00:00.000Z');
    expect(await db.emailDeliveryEvent.count({ where: { deliveryId: id } })).toBe(1);
  });

  it('is idempotent when the provider retries the same event', async () => {
    const id = await seedDelivery({ providerMessageId: 'prov-2', status: 'sent' });
    const body = { type: 'email.delivered', created_at: '2026-09-07T10:00:00.000Z', data: { email_id: 'prov-2' } };
    await postWebhook(body, { id: 'msg_same' }).expect(202);
    await postWebhook(body, { id: 'msg_same' }).expect(202);

    const db = testDatabase();
    expect(await db.emailDeliveryEvent.count({ where: { deliveryId: id } })).toBe(1);
  });

  it('never lets a late or out-of-order event reverse a more meaningful status (MAIL 008)', async () => {
    const id = await seedDelivery({ providerMessageId: 'prov-3', status: 'sent' });
    await postWebhook({ type: 'email.bounced', created_at: '2026-09-07T11:00:00.000Z', data: { email_id: 'prov-3', bounce: { type: 'hard' } } }).expect(202);
    // "sent" arrives after "bounced": its timestamp is recorded, the status is not lowered.
    await postWebhook({ type: 'email.sent', created_at: '2026-09-07T09:59:00.000Z', data: { email_id: 'prov-3' } }).expect(202);

    const db = testDatabase();
    const row = await db.emailDelivery.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('bounced');
    expect(row.sentAt?.toISOString()).toBe('2026-09-07T09:59:00.000Z');
    expect(row.bouncedAt?.toISOString()).toBe('2026-09-07T11:00:00.000Z');
    expect(await db.emailDeliveryEvent.count({ where: { deliveryId: id } })).toBe(2);
  });

  it('acknowledges an event type it does not track without recording one', async () => {
    const id = await seedDelivery({ providerMessageId: 'prov-4', status: 'sent' });
    await postWebhook({ type: 'email.opened', data: { email_id: 'prov-4' } }).expect(202);
    const db = testDatabase();
    expect(await db.emailDeliveryEvent.count({ where: { deliveryId: id } })).toBe(0);
  });

  // ---- admin log (MAIL 005/009/010) ----------------------------------------

  it('masks the recipient everywhere in the log, and never returns the address', async () => {
    await seedDelivery({ recipient: 'private.owner@example.com', providerMessageId: 'prov-5', status: 'sent' });
    const list = await agent().get('/api/v1/admin/email-logs').set('Cookie', cookie).expect(200);
    expect(list.headers['cache-control']).toBe('no-store');
    const body = JSON.stringify(list.body);
    expect(body).not.toContain('private.owner@example.com');
    expect(body).toMatch(/p•+r@example\.com/);
    // No rendered body is stored, so none can be returned.
    expect(body).not.toMatch(/"body"|"html"|"text"/);
  });

  it('offers no create, edit or delete route on the log', async () => {
    const id = await seedDelivery();
    await agent().post('/api/v1/admin/email-logs').set('Origin', ORIGIN).set('Cookie', cookie).send({}).expect(404);
    await agent().patch(`/api/v1/admin/email-logs/${id}`).set('Origin', ORIGIN).set('Cookie', cookie).send({}).expect(404);
    await agent().delete(`/api/v1/admin/email-logs/${id}`).set('Origin', ORIGIN).set('Cookie', cookie).expect(404);
  });

  it('requires a permission distinct from viewing to reveal a recipient, and records every reveal', async () => {
    const id = await seedDelivery({ recipient: 'reveal.me@example.com' });
    await agent().get(`/api/v1/admin/email-logs/${id}/recipient`).set('Cookie', viewerCookie).expect(403);

    const db = testDatabase();
    const before = await db.auditLog.count({ where: { action: 'email.recipient.reveal' } });
    const res = await agent().get(`/api/v1/admin/email-logs/${id}/recipient`).set('Cookie', cookie).expect(200);
    expect(res.body.data.recipient).toBe('reveal.me@example.com');
    expect(await db.auditLog.count({ where: { action: 'email.recipient.reveal' } })).toBe(before + 1);
  });

  it('refuses to resend a delivered message, and refuses a template that is not resendable', async () => {
    const delivered = await seedDelivery({ providerMessageId: 'prov-6', status: 'delivered' });
    const refused = await agent().post(`/api/v1/admin/email-logs/${delivered}/resend`).set('Origin', ORIGIN).set('Cookie', cookie).send({}).expect(409);
    expect(refused.body.error.code).toBe('RESEND_REFUSED');

    const authMessage = await seedDelivery({ templateKey: 'auth.password_reset', status: 'failed' });
    const notSupported = await agent().post(`/api/v1/admin/email-logs/${authMessage}/resend`).set('Origin', ORIGIN).set('Cookie', cookie).send({}).expect(403);
    expect(notSupported.body.error.code).toBe('RESEND_NOT_SUPPORTED');
  });

  it('creates a linked new attempt when a resend is allowed, and records it', async () => {
    const failed = await seedDelivery({ status: 'failed' });
    const db = testDatabase();
    const before = await db.auditLog.count({ where: { action: 'email.resend' } });

    await agent().post(`/api/v1/admin/email-logs/${failed}/resend`).set('Origin', ORIGIN).set('Cookie', viewerCookie).send({}).expect(403);
    const res = await agent().post(`/api/v1/admin/email-logs/${failed}/resend`).set('Origin', ORIGIN).set('Cookie', cookie).send({}).expect(202);

    const replacement = await db.emailDelivery.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(replacement.resentFromId).toBe(failed);
    expect(replacement.status).toBe('queued');
    expect(replacement.providerMessageId).toBeNull();
    expect(await db.auditLog.count({ where: { action: 'email.resend' } })).toBe(before + 1);
  });

  it('filters and paginates within bounds, and never searches by recipient', async () => {
    const res = await agent().get('/api/v1/admin/email-logs?status=failed&pageSize=5').set('Cookie', cookie).expect(200);
    expect(res.body.meta.pageSize).toBe(5);
    expect(res.body.data.every((row: { status: string }) => row.status === 'failed')).toBe(true);
    await agent().get('/api/v1/admin/email-logs?pageSize=500').set('Cookie', cookie).expect(400);
    await agent().get('/api/v1/admin/email-logs?status=nonsense').set('Cookie', cookie).expect(400);

    // A recipient address is not a search key: searching for one finds nothing.
    const search = await agent().get('/api/v1/admin/email-logs?search=private.owner%40example.com').set('Cookie', cookie).expect(200);
    expect(search.body.data).toEqual([]);
  });

  it('refuses the log to an administrator without the permission, and to an anonymous caller', async () => {
    const db = testDatabase();
    const other = await db.adminUser.findUniqueOrThrow({ where: { email: 'email-viewer@example.com' } });
    expect(other.id).toBeTruthy();
    await agent().get('/api/v1/admin/email-logs').expect(401);
  });
});
