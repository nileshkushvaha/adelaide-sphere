import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { CaptchaPort, type CaptchaResult } from '../src/common/captcha/captcha.port.js';
import { OutboxDispatcher } from '../src/outbox/outbox.dispatcher.js';
import { QueuePort, type QueuedJob } from '../src/outbox/queue.port.js';
import { RedisService } from '../src/redis/redis.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

class AlwaysPassCaptcha extends CaptchaPort {
  readonly configured = true;
  async verify(token: string | undefined): Promise<CaptchaResult> {
    return token === 'valid-token' ? { ok: true } : { ok: false, reason: 'invalid' };
  }
}

/** Records what the dispatcher hands to BullMQ, and can simulate a queue outage (SRS ENQ 003). */
class RecordingQueue extends QueuePort {
  readonly name = 'test-queue';
  jobs: QueuedJob[] = [];
  failing = false;
  async enqueue(job: QueuedJob): Promise<void> {
    if (this.failing) throw new Error('queue unavailable');
    this.jobs.push(job);
  }
}

describe('Enquiries, outbox and delivery states (integration)', () => {
  let app: INestApplication;
  let queue: RecordingQueue;
  let dispatcher: OutboxDispatcher;
  let cookie: string;
  let readerCookie: string;
  let routable: string;
  let unroutable: string;
  const agent = () => request(app.getHttpServer());
  const admin = (req: request.Test, c = cookie) => req.set('Origin', ORIGIN).set('Cookie', c);
  let seq = 0;
  const key = () => `enquiry-key-${Date.now()}-${seq++}`;
  const body = (over: Record<string, unknown> = {}) => ({
    name: 'Jo Visitor',
    email: 'jo@example.com',
    phone: '03 9000 4444',
    subject: 'Catering for twenty people',
    message: 'Do you cater for office breakfasts? We need about twenty serves next Friday.',
    acknowledged: true,
    captchaToken: 'valid-token',
    ...over,
  });
  const send = (id: string | null, payload: Record<string, unknown>, idem = key()) =>
    agent().post(id ? `/api/v1/businesses/${id}/enquiries` : '/api/v1/contact').set('Idempotency-Key', idem).send(payload);
  const clearLimits = async () => {
    const redis = app.get(RedisService);
    await redis.ensureConnected();
    const keys = await redis.client.keys('ms:public:*');
    if (keys.length > 0) await redis.client.del(...keys.map((k) => k.replace(/^ms:/, '')));
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    queue = new RecordingQueue();
    app = await createIntegrationApp({ overrides: [{ token: CaptchaPort, useValue: new AlwaysPassCaptcha() }, { token: QueuePort, useValue: queue }] });
    dispatcher = app.get(OutboxDispatcher);
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.180').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'enquiry_reader', name: 'Enquiry reader', description: 'test' } });
    const perm = await db.permission.findUniqueOrThrow({ where: { key: 'enquiries.read' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    await seedSuperAdmin(app, { email: 'enquiry.reader@example.com', password: 'reader-password-12345', displayName: 'Reader' });
    const reader = await db.adminUser.findUniqueOrThrow({ where: { email: 'enquiry.reader@example.com' } });
    await db.adminRole.deleteMany({ where: { adminId: reader.id } });
    await db.adminRole.create({ data: { adminId: reader.id, roleId: role.id } });
    const readerRes = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.181').send({ email: 'enquiry.reader@example.com', password: 'reader-password-12345' }).expect(200);
    readerCookie = ([] as string[]).concat(readerRes.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;

    const category = (await admin(agent().post('/api/v1/admin/categories')).send({ name: 'Bakeries' }).expect(201)).body.data.id;
    const area = (await admin(agent().post('/api/v1/admin/areas')).send({ name: 'Carlton', eligibilitySource: 'council list' }).expect(201)).body.data.id;
    const make = async (name: string, withRecipient: boolean) => {
      const b = (await admin(agent().post('/api/v1/admin/businesses')).send({
        name, description: 'A listing used by the enquiry tests, long enough to publish.', primaryCategoryId: category, localAreaId: area,
        publicPhone: '03 9000 3333', eligibilitySource: 'council list', contentRightsReviewed: true,
        ...(withRecipient ? { privateEnquiryEmail: 'owner@example.com' } : {}),
      }).expect(201)).body.data;
      await admin(agent().post(`/api/v1/admin/businesses/${b.id}/publish`)).send({ expectedVersion: b.version, duplicateOverrideReason: 'distinct enquiry fixtures' }).expect(200);
      return b.id as string;
    };
    routable = await make('Enquiry Test Bakery', true);
    unroutable = await make('No Route Bakery', false);
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await clearLimits();
    await app.close();
    await closeTestDatabase();
  });

  beforeEach(async () => {
    queue.failing = false;
    await clearLimits();
  });

  let enquiryId: string;

  it('accepts an enquiry with 202 and commits the outbox event in the same transaction', async () => {
    const res = await send(routable, body()).expect(202);
    expect(res.body.data).toMatchObject({ status: 'accepted', receiptId: expect.any(String) });
    expect(res.body.data.message).not.toMatch(/delivered/i);
    const db = testDatabase();
    const enquiry = await db.enquiry.findFirstOrThrow({ where: { businessId: routable } });
    enquiryId = enquiry.id;
    expect(enquiry).toMatchObject({ kind: 'business', deliveryStatus: 'queued', handlingStatus: 'new', acknowledgedVersion: '2026-09-01' });
    expect(enquiry.emailEncrypted).toMatch(/^v1:/);
    expect(enquiry.emailEncrypted).not.toContain('jo@example.com');
    expect(enquiry.phoneEncrypted).toMatch(/^v1:/);
    const event = await db.outboxEvent.findFirstOrThrow({ where: { resourceId: enquiry.id } });
    expect(event).toMatchObject({ type: 'enquiry.accepted', resourceType: 'enquiry', status: 'pending' });
    // Queue payloads carry identifiers only (SRS EVT 001).
    expect(JSON.stringify(event.payload)).not.toMatch(/office breakfasts|jo@example.com/);
  });

  it('refuses a listing with no recipient and validates the acknowledgement and fields', async () => {
    const noRoute = await send(unroutable, body()).expect(409);
    expect(noRoute.body.error.code).toBe('NO_ENQUIRY_ROUTE');
    await send(routable, body({ acknowledged: false })).expect(400);
    const invalid = await send(routable, body({ name: 'A', message: 'too short', subject: '' })).expect(400);
    expect(Object.keys(invalid.body.error.fields).sort()).toEqual(['message', 'name', 'subject']);
    await send(routable, body({ website: 'http://spam.example' })).expect(400);
    await send(routable, body({ captchaToken: 'nope' })).expect(400);
    await send(routable, body({ recipient: 'attacker@example.com' })).expect(400); // no destination field exists
    await agent().post(`/api/v1/businesses/${routable}/enquiries`).send(body()).expect(400); // no Idempotency-Key
    await send('does-not-exist', body()).expect(404);
    const contact = await send(null, body()).expect(409); // no site recipient configured in tests
    expect(contact.body.error.code).toBe('NO_ENQUIRY_ROUTE');
  });

  it('replays an idempotent submission without creating a second enquiry or event', async () => {
    const db = testDatabase();
    const before = await db.enquiry.count();
    const idem = key();
    const first = await send(routable, body({ subject: 'Replay test enquiry' }), idem).expect(202);
    const replay = await send(routable, body({ subject: 'Replay test enquiry' }), idem).expect(202);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(await db.enquiry.count()).toBe(before + 1);
    await send(routable, body({ subject: 'Different subject entirely' }), idem).expect(409);
  });

  it('enforces the per-IP ceiling', async () => {
    let limited: request.Response | null = null;
    for (let i = 0; i < 6; i += 1) {
      const res = await send(routable, body({ subject: `Burst enquiry number ${i}` }));
      if (res.status === 429) {
        limited = res;
        break;
      }
    }
    expect(limited).not.toBeNull();
    expect(limited!.body.error.code).toBe('RATE_LIMITED');
    await clearLimits();
  });

  it('keeps events pending while the queue is down and dispatches them afterwards', async () => {
    const db = testDatabase();
    queue.failing = true;
    const pendingBefore = await db.outboxEvent.count({ where: { status: 'pending' } });
    expect(pendingBefore).toBeGreaterThan(0);
    expect(await dispatcher.runOnce()).toBe(0);
    const stillPending = await db.outboxEvent.findMany({ where: { status: 'pending' } });
    expect(stillPending.length).toBe(pendingBefore); // nothing lost during the outage
    expect(stillPending.every((e) => e.attempts >= 1 && e.lastError === 'queue unavailable')).toBe(true);

    queue.failing = false;
    await db.outboxEvent.updateMany({ where: { status: 'pending' }, data: { availableAt: new Date(Date.now() - 1000) } });
    const dispatched = await dispatcher.runOnce();
    expect(dispatched).toBe(pendingBefore);
    expect(await db.outboxEvent.count({ where: { status: 'pending' } })).toBe(0);
    const job = queue.jobs.find((j) => (j.data as { enquiryId?: string }).enquiryId === enquiryId)!;
    expect(job).toMatchObject({ name: 'enquiry.email' });
    expect(job.id).toBe((await db.outboxEvent.findFirstOrThrow({ where: { resourceId: enquiryId } })).id); // job id is the event id
    expect(JSON.stringify(job.data)).not.toMatch(/office breakfasts|jo@example.com/);
  });

  it('restricts admin views and separates handling from delivery state', async () => {
    await agent().get('/api/v1/admin/enquiries').expect(401);
    const readerList = await admin(agent().get('/api/v1/admin/enquiries'), readerCookie).expect(200);
    // The list carries a masked address: enough to tell two enquiries apart,
    // without putting every visitor's address on screen — and without
    // decrypting twenty of them because someone opened a page (SRS ENQ 007).
    expect(readerList.body.data[0]).toMatchObject({ deliveryStatus: 'queued', handlingStatus: 'new' });
    expect(readerList.body.data[0].email).not.toBe('jo@example.com');
    expect(readerList.body.data[0].email).toMatch(/@example\.com$/);
    // Read-only role cannot change anything.
    await admin(agent().patch(`/api/v1/admin/enquiries/${enquiryId}`), readerCookie).send({ expectedVersion: 1, handlingStatus: 'inProgress' }).expect(403);

    // The whole address is a separate permission, and reading it is recorded.
    await admin(agent().get(`/api/v1/admin/enquiries/${enquiryId}/contact`), readerCookie).expect(403);
    const revealed = await admin(agent().get(`/api/v1/admin/enquiries/${enquiryId}/contact`)).expect(200);
    expect(revealed.body.data.email).toBe('jo@example.com');
    const db = testDatabase();
    const entry = await db.auditLog.findFirst({ where: { action: 'enquiry.contact.reveal', targetId: enquiryId } });
    expect(entry, 'revealing a visitor address must leave a record of who did it').toBeTruthy();

    const filtered = await admin(agent().get(`/api/v1/admin/enquiries?handlingStatus=new&businessId=${routable}`)).expect(200);
    expect(filtered.body.meta.total).toBeGreaterThan(0);
    const updated = await admin(agent().patch(`/api/v1/admin/enquiries/${enquiryId}`)).send({ expectedVersion: 1, handlingStatus: 'inProgress' }).expect(200);
    expect(updated.body.data).toMatchObject({ handlingStatus: 'inProgress', deliveryStatus: 'queued' }); // handling never implies delivery
    await admin(agent().patch(`/api/v1/admin/enquiries/${enquiryId}`)).send({ expectedVersion: 1, handlingStatus: 'closed' }).expect(409);
  });

  it('retries only failed or suppressed deliveries, with an audited reason and a fresh event', async () => {
    const db = testDatabase();
    const current = await db.enquiry.findUniqueOrThrow({ where: { id: enquiryId } });
    await admin(agent().post(`/api/v1/admin/enquiries/${enquiryId}/retry`)).send({ expectedVersion: current.version, reason: 'Owner reported non-delivery' }).expect(409);
    await db.enquiry.update({ where: { id: enquiryId }, data: { deliveryStatus: 'failed', lastError: 'provider rejected' } });
    await admin(agent().post(`/api/v1/admin/enquiries/${enquiryId}/retry`), readerCookie).send({ expectedVersion: current.version, reason: 'Owner reported non-delivery' }).expect(403);
    await admin(agent().post(`/api/v1/admin/enquiries/${enquiryId}/retry`)).send({ expectedVersion: current.version, reason: 'x' }).expect(400);
    const retried = await admin(agent().post(`/api/v1/admin/enquiries/${enquiryId}/retry`)).send({ expectedVersion: current.version, reason: 'Owner reported non-delivery' }).expect(200);
    expect(retried.body.data).toMatchObject({ deliveryStatus: 'queued', lastError: null });
    expect(await db.outboxEvent.count({ where: { resourceId: enquiryId, status: 'pending' } })).toBe(1);
    const actions = (await db.auditLog.findMany({ where: { targetId: enquiryId }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    // The reveal in the previous test is part of this enquiry's history: looking
    // at a visitor's address is an event in its own right, not a side effect.
    expect(actions).toEqual(['enquiry.accepted', 'enquiry.contact.reveal', 'enquiry.handling', 'enquiry.retry']);
  });
});
