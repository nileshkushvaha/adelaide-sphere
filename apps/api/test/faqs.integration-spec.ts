import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { SUPER_ADMIN_ROLE } from '../src/identity/permissions.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/** Frequently asked questions (SRS 1.2 FAQ 001–005) against the real MySQL database. */
describe('FAQs (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  let viewerCookie: string;
  const agent = () => request(app.getHttpServer());
  const loginAs = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };
  const create = (body: Record<string, unknown>) =>
    agent().post('/api/v1/admin/faqs').set('Origin', ORIGIN).set('Cookie', cookie).send({ question: 'How do I list my business?', answer: 'Send us the details.', ...body });

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.50');

    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'faq_viewer', name: 'FAQ viewer', description: 'test' } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: 'website.faqs.view' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await seedSuperAdmin(app, { email: 'faq-viewer@example.com', password: 'viewer-password-12345', displayName: 'Viewer' });
    const viewer = await db.adminUser.findUniqueOrThrow({ where: { email: 'faq-viewer@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: SUPER_ADMIN_ROLE.key } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: viewer.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: viewer.id, roleId: role.id } });
    viewerCookie = await loginAs('faq-viewer@example.com', 'viewer-password-12345', '203.0.113.51');
  });

  afterEach(async () => {
    await testDatabase().faq.deleteMany({});
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('creates a question as a draft, and a draft is invisible publicly', async () => {
    const created = await create({}).expect(201);
    expect(created.body.data).toMatchObject({ status: 'draft', version: 1, publishedAt: null });

    const publicList = await agent().get('/api/v1/faqs').expect(200);
    expect(publicList.body.data).toEqual([]);
  });

  it('sanitises the answer on the same path as articles, and refuses one that is only markup', async () => {
    const created = await create({ answer: '<p>Call <strong>us</strong>.</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>' }).expect(201);
    expect(created.body.data.answerHtml).toContain('<strong>us</strong>');
    expect(created.body.data.answerHtml).not.toContain('<script>');
    expect(created.body.data.answerHtml).not.toContain('javascript:');
    // The source is kept exactly as written so a sanitiser change can be re-applied.
    expect(created.body.data.answerSource).toContain('<script>');

    const empty = await create({ answer: '<script>alert(1)</script>' }).expect(400);
    expect(empty.body.error.fields.answer).toBeTruthy();
  });

  it('enforces documented lengths', async () => {
    await create({ question: 'no' }).expect(400);
    await create({ question: 'x'.repeat(301) }).expect(400);
    await create({ answer: 'x'.repeat(8001) }).expect(400);
  });

  it('publishes explicitly, refuses a repeated publish, and shows the question publicly', async () => {
    const created = await create({ groupName: 'Listings' }).expect(201);
    const id = created.body.data.id as string;

    await agent().post(`/api/v1/admin/faqs/${id}/publish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 1 }).expect(201);
    const publicList = await agent().get('/api/v1/faqs').expect(200);
    expect(publicList.body.data).toEqual([{ id, question: 'How do I list my business?', answerHtml: expect.any(String), groupName: 'Listings' }]);

    // Publishing again is a state error, not a silent no-op.
    const again = await agent().post(`/api/v1/admin/faqs/${id}/publish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 2 }).expect(409);
    expect(again.body.error.code).toBe('INVALID_STATE');
  });

  it('unpublishes back out of the public list and keeps the first publication timestamp', async () => {
    const created = await create({}).expect(201);
    const id = created.body.data.id as string;
    const published = await agent().post(`/api/v1/admin/faqs/${id}/publish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 1 }).expect(201);
    const publishedAt = published.body.data.publishedAt as string;

    const unpublished = await agent().post(`/api/v1/admin/faqs/${id}/unpublish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 2 }).expect(201);
    expect(unpublished.body.data.status).toBe('draft');
    expect(unpublished.body.data.publishedAt).toBe(publishedAt);
    expect((await agent().get('/api/v1/faqs').expect(200)).body.data).toEqual([]);
  });

  it('refuses a concurrent edit with 409 STALE_VERSION', async () => {
    const created = await create({}).expect(201);
    const id = created.body.data.id as string;
    const body = { question: 'Updated question?', answer: 'Updated answer.', expectedVersion: 1 };
    await agent().put(`/api/v1/admin/faqs/${id}`).set('Origin', ORIGIN).set('Cookie', cookie).send(body).expect(200);
    const stale = await agent().put(`/api/v1/admin/faqs/${id}`).set('Origin', ORIGIN).set('Cookie', cookie).send(body).expect(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');
  });

  it('serves the public list in display order and applies a reorder in one transaction', async () => {
    const first = (await create({ question: 'First question?', displayOrder: 0 }).expect(201)).body.data.id as string;
    const second = (await create({ question: 'Second question?', displayOrder: 1 }).expect(201)).body.data.id as string;
    for (const id of [first, second]) {
      await agent().post(`/api/v1/admin/faqs/${id}/publish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 1 }).expect(201);
    }
    expect((await agent().get('/api/v1/faqs').expect(200)).body.data.map((r: { question: string }) => r.question)).toEqual(['First question?', 'Second question?']);

    await agent()
      .post('/api/v1/admin/faqs/reorder')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ order: [{ id: second, displayOrder: 0 }, { id: first, displayOrder: 1 }] })
      .expect(204);
    expect((await agent().get('/api/v1/faqs').expect(200)).body.data.map((r: { question: string }) => r.question)).toEqual(['Second question?', 'First question?']);
  });

  it('records an activity event for every mutation', async () => {
    const db = testDatabase();
    const before = await db.auditLog.count({ where: { action: { startsWith: 'website.faq.' } } });
    const id = (await create({}).expect(201)).body.data.id as string;
    await agent().post(`/api/v1/admin/faqs/${id}/publish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 1 }).expect(201);
    await agent().delete(`/api/v1/admin/faqs/${id}`).set('Origin', ORIGIN).set('Cookie', cookie).expect(204);

    const actions = await db.auditLog.findMany({ where: { action: { startsWith: 'website.faq.' } }, select: { action: true } });
    expect(actions.length).toBe(before + 3);
    expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(['website.faq.create', 'website.faq.publish', 'website.faq.delete']));
  });

  it('separates viewing from creating, publishing and deleting', async () => {
    const id = (await create({}).expect(201)).body.data.id as string;
    await agent().get('/api/v1/admin/faqs').set('Cookie', viewerCookie).expect(200);
    await agent().post('/api/v1/admin/faqs').set('Origin', ORIGIN).set('Cookie', viewerCookie).send({ question: 'Another question?', answer: 'Another answer.' }).expect(403);
    await agent().put(`/api/v1/admin/faqs/${id}`).set('Origin', ORIGIN).set('Cookie', viewerCookie).send({ question: 'Changed question?', answer: 'Changed.', expectedVersion: 1 }).expect(403);
    await agent().post(`/api/v1/admin/faqs/${id}/publish`).set('Origin', ORIGIN).set('Cookie', viewerCookie).send({ expectedVersion: 1 }).expect(403);
    await agent().delete(`/api/v1/admin/faqs/${id}`).set('Origin', ORIGIN).set('Cookie', viewerCookie).expect(403);
    await agent().get('/api/v1/admin/faqs').expect(401);
  });

  it('bounds the admin list and the reorder payload', async () => {
    await agent().get('/api/v1/admin/faqs?pageSize=500').set('Cookie', cookie).expect(400);
    await agent().post('/api/v1/admin/faqs/reorder').set('Origin', ORIGIN).set('Cookie', cookie).send({ order: [] }).expect(400);
    const tooMany = Array.from({ length: 201 }, (_, index) => ({ id: `id-${index}`, displayOrder: index }));
    await agent().post('/api/v1/admin/faqs/reorder').set('Origin', ORIGIN).set('Cookie', cookie).send({ order: tooMany }).expect(400);
  });
});
