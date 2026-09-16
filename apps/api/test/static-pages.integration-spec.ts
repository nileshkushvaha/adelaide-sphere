import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

const realCopy = '<h2>How we work</h2><p>Adelaide Sphere is an independent directory of businesses inside the City of Adelaide. Our editors verify every listing against the approved boundary before it is published, and we correct details when readers tell us something has changed.</p>';

/** Information pages (SRS CFG 002). */
describe('Static pages (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  const agent = () => request(app.getHttpServer());
  const put = (path: string) => agent().put(path).set('Origin', ORIGIN).set('Cookie', cookie);
  const post = (path: string) => agent().post(path).set('Origin', ORIGIN).set('Cookie', cookie);

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    const login = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.220').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('lists the fixed page set, including pages that have never been edited', async () => {
    const res = await agent().get('/api/v1/admin/pages').set('Cookie', cookie).expect(200);
    expect(res.body.data.map((page: { slug: string }) => page.slug)).toEqual(['privacy', 'terms', 'review-guidelines']);
    for (const page of res.body.data) expect(page.isSystem).toBe(true);
    expect(res.body.data.map((page: { template: string }) => page.template)).toEqual(['generic', 'generic', 'generic']);
    // No editable contact or about page: both are product routes (CFG 001;
    // About at client instruction, 13 Sep 2026).
    await agent().get('/api/v1/admin/pages/contact').set('Cookie', cookie).expect(404);
    await agent().get('/api/v1/admin/pages/about').set('Cookie', cookie).expect(404);
    await agent().get('/api/v1/pages/about').expect(404);
    expect(res.body.data[0]).toMatchObject({ status: 'draft', version: 0 });
    expect(res.body.data[0].publicationBlockers.length).toBeGreaterThan(0);
    await agent().get('/api/v1/admin/pages/not-a-page').set('Cookie', cookie).expect(404);
  });

  it('saves sanitised content, refuses placeholder copy at publish, then publishes and serves it publicly', async () => {
    const saved = await put('/api/v1/admin/pages/privacy')
      .send({ expectedVersion: 0, title: 'Privacy', body: `${realCopy}<script>alert(1)</script>`, bodyFormat: 'html' })
      .expect(200);
    expect(saved.body.data.sanitizedBody).toContain('<h2>How we work</h2>');
    expect(saved.body.data.sanitizedBody).not.toContain('script');
    expect(saved.body.data.status).toBe('draft');

    // Draft pages are invisible to the public site.
    await agent().get('/api/v1/pages/privacy').expect(404);

    const placeholder = await put('/api/v1/admin/pages/privacy')
      .send({ expectedVersion: saved.body.data.version, title: 'Privacy', body: '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua, placeholder legal copy to be written later.</p>' })
      .expect(200);
    const blocked = await post('/api/v1/admin/pages/privacy/publish').send({ expectedVersion: placeholder.body.data.version }).expect(409);
    expect(blocked.body.error.code).toBe('PUBLICATION_BLOCKED');
    expect(blocked.body.error.fields.publication.join(' ')).toMatch(/placeholder/i);

    const fixed = await put('/api/v1/admin/pages/privacy').send({ expectedVersion: placeholder.body.data.version, title: 'Privacy', body: realCopy }).expect(200);
    const published = await post('/api/v1/admin/pages/privacy/publish').send({ expectedVersion: fixed.body.data.version }).expect(200);
    expect(published.body.data.status).toBe('published');

    const publicPage = await agent().get('/api/v1/pages/privacy').expect(200);
    expect(publicPage.body.data).toMatchObject({ slug: 'privacy', title: 'Privacy' });
    expect(publicPage.body.data.body).toContain('<h2>How we work</h2>');
    const list = await agent().get('/api/v1/pages').expect(200);
    expect(list.body.data).toEqual([{ slug: 'privacy', title: 'Privacy' }]);

    // Every save keeps the version it replaces, draft or published (change log 1.17):
    // the placeholder, fixed and edited saves each keep one; the first save created the row.
    const edited = await put('/api/v1/admin/pages/privacy').send({ expectedVersion: published.body.data.version, title: 'Privacy', body: `${realCopy}<p>We updated this page.</p>`, revisionReason: 'Clarified retention' }).expect(200);
    expect(edited.body.data.version).toBe(published.body.data.version + 1);
    const db = testDatabase();
    const revisions = await db.contentRevision.findMany({ where: { resourceType: 'static_page' }, orderBy: { version: 'asc' } });
    expect(revisions).toHaveLength(3);
    expect(revisions.map((revision) => revision.reason)).toEqual([null, null, 'Clarified retention']);
    // The edit keeps the published text it replaced.
    expect(revisions[2]?.version).toBe(published.body.data.version);
    expect(revisions[2]?.sanitizedSnapshot).not.toContain('We updated this page.');
  });

  it('refuses to write a page the registry does not know', async () => {
    await put('/api/v1/admin/pages/contact').send({ expectedVersion: 0, title: 'Contact us', body: realCopy }).expect(404);
    await post('/api/v1/admin/pages/contact/publish').send({ expectedVersion: 1 }).expect(404);
    await agent().get('/api/v1/pages/contact').expect(404);
  });

  it('refuses stale saves and unauthenticated access', async () => {
    const stale = await put('/api/v1/admin/pages/terms').send({ expectedVersion: 9, title: 'Terms of use', body: realCopy }).expect(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');
    await agent().get('/api/v1/admin/pages').expect(401);
    await agent().put('/api/v1/admin/pages/terms').set('Origin', ORIGIN).send({ expectedVersion: 0, title: 'Terms', body: realCopy }).expect(401);
  });

  /**
   * Pages an administrator creates (SRS 1.7). The closed slug set is gone; what
   * replaced it is validation, and these are the cases that matter.
   */
  describe('pages an administrator creates', () => {
    const create = (body: Record<string, unknown>) => post('/api/v1/admin/pages').send({ slug: 'community-guidelines', title: 'Community guidelines', body: realCopy, ...body });

    it('creates a page at a chosen address, as a draft, and serves it once published', async () => {
      const created = await create({}).expect(201);
      expect(created.body.data).toMatchObject({ slug: 'community-guidelines', status: 'draft', isSystem: false, canDelete: true, template: 'generic', version: 1 });

      // A draft is invisible, exactly as a system page's draft is.
      await agent().get('/api/v1/pages/community-guidelines').expect(404);

      await post('/api/v1/admin/pages/community-guidelines/publish').send({ expectedVersion: created.body.data.version }).expect(200);
      const publicPage = await agent().get('/api/v1/pages/community-guidelines').expect(200);
      expect(publicPage.body.data).toMatchObject({ slug: 'community-guidelines', title: 'Community guidelines' });

      // It joins the footer list and the sitemap on the same terms as any other.
      expect((await agent().get('/api/v1/pages').expect(200)).body.data.map((page: { slug: string }) => page.slug)).toContain('community-guidelines');
      expect((await agent().get('/api/v1/seo/sitemap/pages').expect(200)).body.data.map((entry: { path: string }) => entry.path)).toContain('/community-guidelines');

      // And it appears in the admin list after the system pages.
      const list = await agent().get('/api/v1/admin/pages').set('Cookie', cookie).expect(200);
      expect(list.body.data.map((page: { slug: string }) => page.slug)).toEqual(['privacy', 'terms', 'review-guidelines', 'community-guidelines']);
    });

    it('refuses an address the site itself serves, or one already taken', async () => {
      for (const slug of ['blog', 'business', 'contact', 'about', 'api', 'admin', 'sitemap.xml']) {
        const res = await create({ slug }).expect(400);
        expect(res.body.error.fields.slug[0], slug).toMatch(/used by the site itself/i);
      }
      const taken = await create({ slug: 'community-guidelines' }).expect(400);
      expect(taken.body.error.fields.slug[0]).toMatch(/already uses that address/i);
    });

    it('refuses an address that is not a plain lower-case slug', async () => {
      for (const slug of ['Community Guidelines', '../etc/passwd', 'a/b', 'x'.repeat(80)]) {
        await create({ slug }).expect(400);
      }
      // Nothing was created by any of those attempts.
      const list = await agent().get('/api/v1/admin/pages').set('Cookie', cookie).expect(200);
      // The three system pages and the one created above (About is a product route since 13 Sep 2026).
      expect(list.body.data).toHaveLength(4);
    });

    it('will not delete a system page, or a page that is still published', async () => {
      const system = await agent().delete('/api/v1/admin/pages/privacy').set('Origin', ORIGIN).set('Cookie', cookie).expect(409);
      expect(system.body.error.code).toBe('PAGE_IS_SYSTEM');

      const published = await agent().delete('/api/v1/admin/pages/community-guidelines').set('Origin', ORIGIN).set('Cookie', cookie).expect(409);
      expect(published.body.error.code).toBe('PAGE_PUBLISHED');
      // Still there, still served.
      await agent().get('/api/v1/pages/community-guidelines').expect(200);
    });

    it('deletes an unpublished page and stops serving its address', async () => {
      const current = await agent().get('/api/v1/admin/pages/community-guidelines').set('Cookie', cookie).expect(200);
      await post('/api/v1/admin/pages/community-guidelines/unpublish').send({ expectedVersion: current.body.data.version, reason: 'Replaced by the new guidelines' }).expect(200);
      await agent().delete('/api/v1/admin/pages/community-guidelines').set('Origin', ORIGIN).set('Cookie', cookie).expect(204);

      await agent().get('/api/v1/pages/community-guidelines').expect(404);
      await agent().get('/api/v1/admin/pages/community-guidelines').set('Cookie', cookie).expect(404);
      expect((await agent().get('/api/v1/seo/sitemap/pages').expect(200)).body.data.map((entry: { path: string }) => entry.path)).not.toContain('/community-guidelines');

      const actions = (await testDatabase().auditLog.findMany({ where: { action: { startsWith: 'settings.page.' } }, select: { action: true } })).map((row) => row.action);
      expect(actions).toEqual(expect.arrayContaining(['settings.page.create', 'settings.page.publish', 'settings.page.unpublish', 'settings.page.delete']));
    });

    it('refuses creation and deletion without settings.manage', async () => {
      await agent().post('/api/v1/admin/pages').set('Origin', ORIGIN).send({ slug: 'x-page', title: 'X', body: realCopy }).expect(401);
      await agent().delete('/api/v1/admin/pages/x-page').set('Origin', ORIGIN).expect(401);
    });
  });
});
