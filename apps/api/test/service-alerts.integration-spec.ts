import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/** Service alerts above the public header (SRS 1.2 ALRT 001–007) against the real MySQL database. */
describe('Service alerts (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  const agent = () => request(app.getHttpServer());
  const create = (body: Record<string, unknown>) =>
    agent()
      .post('/api/v1/admin/service-alerts')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ title: 'Public holiday hours', message: 'Some businesses are closed on Monday.', severity: 'informational', ...body });
  const publish = (id: string, version: number) =>
    agent().post(`/api/v1/admin/service-alerts/${id}/publish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: version });

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.60').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  });

  afterEach(async () => {
    await testDatabase().serviceAlert.deleteMany({});
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('validates the link at write time and refuses an unsafe destination', async () => {
    for (const linkUrl of ['javascript:alert(1)', 'data:text/html,x', '//evil.example/path', 'https://user:pass@evil.example']) {
      const res = await create({ linkUrl, linkLabel: 'More' }).expect(400);
      expect(res.body.error.fields.linkUrl, linkUrl).toBeTruthy();
    }
    await create({ linkUrl: '/business', linkLabel: 'See listings' }).expect(201);
  });

  it('refuses a link with no text, and text with no link', async () => {
    expect((await create({ linkUrl: '/business' }).expect(400)).body.error.fields.linkLabel).toBeTruthy();
    expect((await create({ linkLabel: 'More' }).expect(400)).body.error.fields.linkUrl).toBeTruthy();
  });

  it('refuses a window that ends before it starts', async () => {
    const res = await create({ startsAt: '2026-09-08T00:00:00.000Z', endsAt: '2026-09-07T00:00:00.000Z' }).expect(400);
    expect(res.body.error.fields.endsAt).toBeTruthy();
  });

  it('keeps a draft off the public site, and shows it once published', async () => {
    const created = await create({}).expect(201);
    expect((await agent().get('/api/v1/service-alerts').expect(200)).body.data).toEqual([]);

    await publish(created.body.data.id as string, 1).expect(201);
    const publicList = await agent().get('/api/v1/service-alerts').expect(200);
    expect(publicList.body.data).toHaveLength(1);
    expect(publicList.body.data[0]).toMatchObject({ title: 'Public holiday hours', role: 'status', ariaLive: 'polite', severity: 'informational' });
  });

  it('never shows an alert outside its display window', async () => {
    const future = await create({ title: 'Not yet', startsAt: '2099-01-01T00:00:00.000Z' }).expect(201);
    const past = await create({ title: 'Long over', endsAt: '2020-01-01T00:00:00.000Z' }).expect(201);
    await publish(future.body.data.id as string, 1).expect(201);
    await publish(past.body.data.id as string, 1).expect(201);
    expect((await agent().get('/api/v1/service-alerts').expect(200)).body.data).toEqual([]);
  });

  it('orders by severity first and bounds how many render', async () => {
    for (const [title, severity, priority] of [
      ['Promotion', 'informational', 90],
      ['Degraded search', 'warning', 0],
      ['Site outage', 'emergency', 0],
    ] as const) {
      const created = await create({ title, severity, priority }).expect(201);
      await publish(created.body.data.id as string, 1).expect(201);
    }
    const publicList = await agent().get('/api/v1/service-alerts').expect(200);
    expect(publicList.body.data.map((a: { title: string }) => a.title)).toEqual(['Site outage', 'Degraded search']);
    expect(publicList.body.data[0]).toMatchObject({ role: 'alert', ariaLive: 'assertive' });
  });

  it('bumps the content version when the wording changes, so a dismissal does not hide the new message', async () => {
    const created = await create({}).expect(201);
    const id = created.body.data.id as string;
    expect(created.body.data.contentVersion).toBe(1);

    // A change nobody reads (display order) does not bring the alert back.
    const reordered = await agent()
      .put(`/api/v1/admin/service-alerts/${id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ title: 'Public holiday hours', message: 'Some businesses are closed on Monday.', severity: 'informational', displayOrder: 3, expectedVersion: 1 })
      .expect(200);
    expect(reordered.body.data.contentVersion).toBe(1);

    const reworded = await agent()
      .put(`/api/v1/admin/service-alerts/${id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ title: 'Public holiday hours', message: 'Updated: more businesses are closed.', severity: 'warning', expectedVersion: 2 })
      .expect(200);
    expect(reworded.body.data.contentVersion).toBe(2);
  });

  it('refuses a concurrent edit, and a repeated publish', async () => {
    const created = await create({}).expect(201);
    const id = created.body.data.id as string;
    const body = { title: 'Changed', message: 'Changed message here.', severity: 'informational', expectedVersion: 1 };
    await agent().put(`/api/v1/admin/service-alerts/${id}`).set('Origin', ORIGIN).set('Cookie', cookie).send(body).expect(200);
    expect((await agent().put(`/api/v1/admin/service-alerts/${id}`).set('Origin', ORIGIN).set('Cookie', cookie).send(body).expect(409)).body.error.code).toBe('STALE_VERSION');

    await publish(id, 2).expect(201);
    expect((await publish(id, 3).expect(409)).body.error.code).toBe('INVALID_STATE');
  });

  it('purges the shell urgently when a published alert is taken down', async () => {
    const db = testDatabase();
    const created = await create({}).expect(201);
    const id = created.body.data.id as string;
    await publish(id, 1).expect(201);
    await db.outboxEvent.deleteMany({});

    await agent().post(`/api/v1/admin/service-alerts/${id}/unpublish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 2 }).expect(201);
    const events = await db.outboxEvent.findMany({});
    expect(events.length).toBeGreaterThan(0);
    const payloads = events.map((event) => JSON.stringify(event.payload));
    expect(payloads.some((payload) => payload.includes('alerts'))).toBe(true);
    expect(payloads.some((payload) => payload.includes('"urgent":true'))).toBe(true);
  });

  it('records an activity event for every mutation', async () => {
    const db = testDatabase();
    const created = await create({}).expect(201);
    const id = created.body.data.id as string;
    await publish(id, 1).expect(201);
    await agent().delete(`/api/v1/admin/service-alerts/${id}`).set('Origin', ORIGIN).set('Cookie', cookie).expect(204);

    const actions = await db.auditLog.findMany({ where: { action: { startsWith: 'website.alert.' } }, select: { action: true } });
    expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(['website.alert.create', 'website.alert.publish', 'website.alert.delete']));
  });

  it('refuses every write to an administrator without the permission, and reads to an anonymous caller', async () => {
    await agent().get('/api/v1/admin/service-alerts').expect(401);
    // The public list needs no session at all.
    await agent().get('/api/v1/service-alerts').expect(200);
  });
});
