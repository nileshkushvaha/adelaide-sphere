import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/**
 * Testimonials and client/partner organisations (SRS 1.2 TSTM 001–005, PTNR
 * 001–005) against the real MySQL database. Both modules exist to enforce one
 * thing above all: nothing reaches the public site without recorded permission.
 */
describe('Testimonials and partners (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  const agent = () => request(app.getHttpServer());

  const createTestimonial = (body: Record<string, unknown> = {}) =>
    agent()
      .post('/api/v1/admin/testimonials')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ displayName: 'Jo Nguyen', relationship: 'Owner, Carlton Corner Bakery', quote: 'Being listed brought us regulars from three suburbs away.', ...body });

  const createPartner = (body: Record<string, unknown> = {}) =>
    agent().post('/api/v1/admin/partners').set('Origin', ORIGIN).set('Cookie', cookie).send({ name: 'City of Melbourne', relationshipLabel: 'Community partner', ...body });

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.70').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  });

  afterEach(async () => {
    const db = testDatabase();
    await db.testimonial.deleteMany({});
    await db.partnerOrganisation.deleteMany({});
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  // ---- testimonials --------------------------------------------------------

  it('creates a testimonial as a draft, invisible publicly until it is published', async () => {
    const created = await createTestimonial().expect(201);
    expect(created.body.data).toMatchObject({ status: 'draft' });
    expect((await agent().get('/api/v1/testimonials').expect(200)).body.data).toEqual([]);

    // Publication is the administrator's decision; there is no consent record
    // to gate it (client instruction, 12 Sep 2026 — SRS 1.8).
    await agent().post(`/api/v1/admin/testimonials/${created.body.data.id}/publish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 1 }).expect(201);
    expect((await agent().get('/api/v1/testimonials').expect(200)).body.data).toHaveLength(1);
  });

  it('publishes a quote on the administrator\'s word alone, with no consent record to keep', async () => {
    const created = await createTestimonial().expect(201);
    const id = created.body.data.id as string;
    // The approval endpoint was removed with the columns behind it (SRS 1.8).
    await agent().post(`/api/v1/admin/testimonials/${id}/approve`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 1 }).expect(404);
    expect(created.body.data).not.toHaveProperty('approvedAt');

    await agent().post(`/api/v1/admin/testimonials/${id}/publish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 1 }).expect(201);
    const publicList = await agent().get('/api/v1/testimonials').expect(200);
    expect(publicList.body.data).toHaveLength(1);
    expect(publicList.body.data[0]).toMatchObject({ displayName: 'Jo Nguyen', relationship: 'Owner, Carlton Corner Bakery' });
    // A quote carries the rating the administrator recorded with it, and null
    // when they recorded none — the home-page slider shows stars only for the
    // ones that have it (client instruction, 13 Sep 2026). It is still not a
    // review: nothing here counts towards a business's rating.
    expect(publicList.body.data[0]).toMatchObject({ rating: null });

    const rated = await createTestimonial({ displayName: 'Priya Shah', rating: 5 }).expect(201);
    await agent().post(`/api/v1/admin/testimonials/${rated.body.data.id}/publish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 1 }).expect(201);
    const withRating = (await agent().get('/api/v1/testimonials').expect(200)).body.data as { displayName: string; rating: number | null }[];
    expect(withRating.find((row) => row.displayName === 'Priya Shah')?.rating).toBe(5);
  });

  it('keeps a published quote published when its words are edited', async () => {
    const created = await createTestimonial().expect(201);
    const id = created.body.data.id as string;
    await agent().post(`/api/v1/admin/testimonials/${id}/publish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 1 }).expect(201);

    const edited = await agent()
      .put(`/api/v1/admin/testimonials/${id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ displayName: 'Jo Nguyen', quote: 'A completely different sentence about the listing service.', expectedVersion: 2 })
      .expect(200);
    expect(edited.body.data.status).toBe('published');
    expect(edited.body.data).not.toHaveProperty('approvalNote');
  });

  it('strips markup from a quote and enforces its bounds', async () => {
    const created = await createTestimonial({ quote: '<p>They were <strong>excellent</strong> to deal with, start to finish.</p><script>alert(1)</script>' }).expect(201);
    expect(created.body.data.quote).not.toContain('<');
    expect(created.body.data.quote).toContain('excellent');

    await createTestimonial({ quote: 'Too short' }).expect(400);
    await createTestimonial({ quote: 'x'.repeat(1001) }).expect(400);
    await createTestimonial({ displayName: 'J' }).expect(400);
  });

  it('refuses a listing or image that does not exist', async () => {
    expect((await createTestimonial({ businessId: 'does-not-exist' }).expect(400)).body.error.fields.businessId).toBeTruthy();
    expect((await createTestimonial({ mediaId: 'does-not-exist' }).expect(400)).body.error.fields.mediaId).toBeTruthy();
  });

  // ---- partners ------------------------------------------------------------

  it('refuses to publish an organisation with no logo or no alternative text, because the strip would be broken', async () => {
    const created = await createPartner().expect(201);
    const id = created.body.data.id as string;

    // Both refusals are about the page being renderable and readable, not about
    // permission: a missing image or an unnamed logo fails for every visitor.
    const noLogo = await agent().post(`/api/v1/admin/partners/${id}/publish`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 1 }).expect(409);
    expect(noLogo.body.error.code).toBe('LOGO_REQUIRED');

    // Authorisation cannot be recorded before there is a mark to authorise.
    const earlyAuthorise = await agent().post(`/api/v1/admin/partners/${id}/authorise`).set('Origin', ORIGIN).set('Cookie', cookie).send({ expectedVersion: 1 }).expect(409);
    expect(earlyAuthorise.body.error.code).toBe('LOGO_REQUIRED');
  });

  it('validates the website address at write time', async () => {
    for (const websiteUrl of ['javascript:alert(1)', 'not a url', 'ftp://example.com']) {
      expect((await createPartner({ websiteUrl }).expect(400)).body.error.fields.websiteUrl, websiteUrl).toBeTruthy();
    }
    await createPartner({ websiteUrl: 'https://www.melbourne.vic.gov.au' }).expect(201);
  });

  it('never shows an unpublished organisation publicly', async () => {
    await createPartner().expect(201);
    expect((await agent().get('/api/v1/partners').expect(200)).body.data).toEqual([]);
  });

  it('records an activity event for every mutation in both modules', async () => {
    const db = testDatabase();
    await createTestimonial().expect(201);
    const partner = (await createPartner().expect(201)).body.data.id as string;
    await agent().delete(`/api/v1/admin/partners/${partner}`).set('Origin', ORIGIN).set('Cookie', cookie).expect(204);

    const actions = (await db.auditLog.findMany({ where: { action: { startsWith: 'website.' } }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['website.testimonial.create', 'website.partner.create', 'website.partner.delete']));
  });

  it('separates creating and publishing from deleting', async () => {
    const db = testDatabase();
    // An administrator who may create and publish, but may not delete.
    const role = await db.role.create({ data: { key: 'showcase_editor', name: 'Showcase editor', description: 'test' } });
    for (const key of ['website.testimonials.view', 'website.testimonials.create', 'website.testimonials.publish']) {
      const permission = await db.permission.findUniqueOrThrow({ where: { key } });
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    await seedSuperAdmin(app, { email: 'showcase-editor@example.com', password: 'editor-password-12345', displayName: 'Editor' });
    const editor = await db.adminUser.findUniqueOrThrow({ where: { email: 'showcase-editor@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: editor.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: editor.id, roleId: role.id } });
    const login = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.71').send({ email: 'showcase-editor@example.com', password: 'editor-password-12345' }).expect(200);
    const editorCookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;

    const created = await agent()
      .post('/api/v1/admin/testimonials')
      .set('Origin', ORIGIN)
      .set('Cookie', editorCookie)
      .send({ displayName: 'Sam Patel', quote: 'The editors checked everything before our listing went live.' })
      .expect(201);
    // Removing a testimonial for good stays a separate permission from putting
    // one on the site.
    await agent().delete(`/api/v1/admin/testimonials/${created.body.data.id}`).set('Origin', ORIGIN).set('Cookie', editorCookie).expect(403);
  });

  it('refuses both admin surfaces to an anonymous caller, and serves both public lists without a session', async () => {
    await agent().get('/api/v1/admin/testimonials').expect(401);
    await agent().get('/api/v1/admin/partners').expect(401);
    await agent().get('/api/v1/testimonials').expect(200);
    await agent().get('/api/v1/partners').expect(200);
  });
});
