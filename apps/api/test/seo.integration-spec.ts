import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { SUPER_ADMIN_ROLE } from '../src/identity/permissions.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/** Sitemap feeds, redirects and slug changes (SRS SEO 002/004/007). */
describe('SEO: sitemaps and redirects (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  let limitedCookie: string;
  let businessId: string;
  let businessVersion: number;
  let postId: string;
  let postVersion: number;
  const agent = () => request(app.getHttpServer());
  const post = (path: string, c = cookie) => agent().post(path).set('Origin', ORIGIN).set('Cookie', c);
  const put = (path: string, c = cookie) => agent().put(path).set('Origin', ORIGIN).set('Cookie', c);
  const del = (path: string, c = cookie) => agent().delete(path).set('Origin', ORIGIN).set('Cookie', c);
  const get = (path: string, c = cookie) => agent().get(path).set('Cookie', c);
  const loginAs = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.190');

    // An administrator with every listing and post permission but no redirect permissions.
    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'seo_limited', name: 'Limited', description: 'test' } });
    const perms = await db.permission.findMany({ where: { key: { in: ['listings.read', 'listings.create', 'listings.update', 'listings.publish', 'posts.view', 'posts.create', 'posts.update', 'posts.publish'] } } });
    await db.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
    await seedSuperAdmin(app, { email: 'limited@example.com', password: 'limited-password-12345', displayName: 'Limited' });
    const limited = await db.adminUser.findUniqueOrThrow({ where: { email: 'limited@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: SUPER_ADMIN_ROLE.key } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: limited.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: limited.id, roleId: role.id } });
    limitedCookie = await loginAs('limited@example.com', 'limited-password-12345', '203.0.113.191');

    const mk = async (path: string, body: object) => (await post(path).send(body).expect(201)).body.data.id as string;
    const cafes = await mk('/api/v1/admin/categories', { name: 'Cafes', description: 'Curated Adelaide cafes with an editorial introduction.' });
    const emptyCategory = await mk('/api/v1/admin/categories', { name: 'Empty Category', description: 'Has editorial text but no published listing.' });
    expect(emptyCategory).toBeTruthy();
    const cbd = await mk('/api/v1/admin/areas', { name: 'Adelaide CBD', eligibilitySource: 'council list', editorialIntro: 'The central business district.' });
    const created = await post('/api/v1/admin/businesses')
      .send({
        name: 'Little Collins Espresso',
        description: 'A neighbourhood espresso bar serving single-origin coffee and toasties since 2018.',
        primaryCategoryId: cafes,
        localAreaId: cbd,
        publicPhone: '+61 3 9000 1234',
        address: { line1: '12 Peel St', suburb: 'Adelaide', postcode: '5000', latitude: -34.9235, longitude: 138.5979 },
        eligibilitySource: 'City of Adelaide suburb list',
        contentRightsReviewed: true,
      })
      .expect(201);
    businessId = created.body.data.id;
    const published = await post(`/api/v1/admin/businesses/${businessId}/publish`).send({ expectedVersion: created.body.data.version }).expect(200);
    businessVersion = published.body.data.version;

    const authorId = await mk('/api/v1/admin/authors', { displayName: 'Editor', bio: 'Writes about Adelaide.' });
    const categoryId = await mk('/api/v1/admin/blog-categories', { name: 'Guides', landingContent: 'Guides to the city.' });
    const draft = await post('/api/v1/admin/posts')
      .send({ title: 'Where to find filter coffee', bodyMarkdown: '# Filter coffee\n\nAdelaide roasters pour more filter coffee every year, and this guide walks through the cafes worth a detour, the brewing methods they favour, and the seasonal beans that reward an unhurried morning in the city.\n\nEach entry lists the roaster, the brew method and the best time to visit, so the guide comfortably clears the minimum length for a published article.', excerpt: 'A short guide to filter coffee in Adelaide.', authorId, categoryId })
      .expect(201);
    postId = draft.body.data.id;
    const livePost = await post(`/api/v1/admin/posts/${postId}/publish`).send({ expectedVersion: draft.body.data.version }).expect(200);
    postVersion = livePost.body.data.version;
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('lists only canonical, indexable paths with real last-modified times', async () => {
    const businesses = await agent().get('/api/v1/seo/sitemap/businesses').expect(200);
    expect(businesses.body.data).toEqual([{ path: '/business/little-collins-espresso', lastModified: expect.any(String) }]);
    expect(Number.isNaN(Date.parse(businesses.body.data[0].lastModified))).toBe(false);
    expect(businesses.body.meta.count).toBe(1);

    const editorial = await agent().get('/api/v1/seo/sitemap/editorial').expect(200);
    expect(editorial.body.data.map((e: { path: string }) => e.path)).toEqual(['/blog', '/blog/where-to-find-filter-coffee', '/blog/author/editor']); // an active author with published work has a page (SRS 1.10 BLOG 005)

    const taxonomies = await agent().get('/api/v1/seo/sitemap/taxonomies').expect(200);
    const paths = taxonomies.body.data.map((e: { path: string }) => e.path);
    expect(paths).toContain('/business/category/cafes');
    expect(paths).toContain('/business/area/adelaide-cbd');
    expect(paths).toContain('/blog/category/guides');
    // Editorial text alone is not enough: an empty taxonomy stays out (SEO 003).
    expect(paths).not.toContain('/business/category/empty-category');

    await agent().get('/api/v1/seo/sitemap/private').expect(404);
  });

  it('counts what is published for the About page, and never reports an unavailable count as zero', async () => {
    const res = await agent().get('/api/v1/site/metrics').expect(200);
    expect(res.body.data).toMatchObject({ businesses: 1, articles: 1 });
    expect(res.body.data.categories).toBeGreaterThan(0);
    expect(res.body.data.areas).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(res.body.data.countedAt))).toBe(false);
    // Public, and cacheable, but never stale enough to misstate a figure.
    expect(res.headers['cache-control']).toContain('max-age=300');
  });

  it('lists an information page only once it is published, and the home, directory, About and Contact routes', async () => {
    const draft = await agent().get('/api/v1/seo/sitemap/pages').expect(200);
    // No FAQ is published in this suite, so /faqs (a 404 without one) is not listed.
    expect(draft.body.data.map((e: { path: string }) => e.path)).toEqual(['/', '/business', '/about', '/contact']);

    const realCopy = `<p>${'Adelaide Sphere is an independently edited directory of businesses across the city. '.repeat(4)}</p>`;
    const saved = await put('/api/v1/admin/pages/privacy').send({ expectedVersion: 0, title: 'Privacy Policy', body: realCopy }).expect(200);
    // Still a draft: a page that answers 404 must not be advertised (SEO 002).
    expect((await agent().get('/api/v1/seo/sitemap/pages').expect(200)).body.data.map((e: { path: string }) => e.path)).toEqual(['/', '/business', '/about', '/contact']);

    await post('/api/v1/admin/pages/privacy/publish').send({ expectedVersion: saved.body.data.version }).expect(200);
    const published = await agent().get('/api/v1/seo/sitemap/pages').expect(200);
    expect(published.body.data.map((e: { path: string }) => e.path)).toEqual(['/privacy', '/', '/business', '/about', '/contact']);
    expect(Number.isNaN(Date.parse(published.body.data[0].lastModified))).toBe(false);
  });

  it('drops unpublished content from every feed', async () => {
    const unpublished = await post(`/api/v1/admin/businesses/${businessId}/unpublish`).send({ expectedVersion: businessVersion, reason: 'temporary' }).expect(200);
    const feed = await agent().get('/api/v1/seo/sitemap/businesses').expect(200);
    expect(feed.body.data).toEqual([]);
    const taxonomies = await agent().get('/api/v1/seo/sitemap/taxonomies').expect(200);
    expect(taxonomies.body.data.map((e: { path: string }) => e.path)).not.toContain('/business/area/adelaide-cbd');
    const republished = await post(`/api/v1/admin/businesses/${businessId}/publish`).send({ expectedVersion: unpublished.body.data.version }).expect(200);
    businessVersion = republished.body.data.version;
  });

  it('a published slug change creates a 301 and repoints older aliases instead of chaining', async () => {
    const first = await post(`/api/v1/admin/businesses/${businessId}/slug`).send({ slug: 'little-collins-coffee', expectedVersion: businessVersion, reason: 'Renamed' }).expect(200);
    expect(first.body.data.slug).toBe('little-collins-coffee');
    businessVersion = first.body.data.version;
    const resolved = await agent().get('/api/v1/seo/redirects/resolve?path=/business/little-collins-espresso').expect(200);
    expect(resolved.body.data).toEqual({ kind: 'permanent', status: 301, targetPath: '/business/little-collins-coffee' });

    const second = await post(`/api/v1/admin/businesses/${businessId}/slug`).send({ slug: 'little-collins-bar', expectedVersion: businessVersion }).expect(200);
    businessVersion = second.body.data.version;
    // Both old paths now point straight at the newest one: one hop, never a chain.
    for (const old of ['little-collins-espresso', 'little-collins-coffee']) {
      const res = await agent().get(`/api/v1/seo/redirects/resolve?path=/business/${old}`).expect(200);
      expect(res.body.data.targetPath).toBe('/business/little-collins-bar');
    }
    const db = testDatabase();
    expect(await db.redirect.count({ where: { sourcePath: '/business/little-collins-bar' } })).toBe(0);
    const audit = await db.auditLog.findFirst({ where: { action: 'listing.slug.change' }, orderBy: { createdAt: 'desc' } });
    expect(audit?.targetId).toBe(businessId);
  });

  it('reusing a path that redirects away removes the old rule so no cycle can form', async () => {
    const back = await post(`/api/v1/admin/businesses/${businessId}/slug`).send({ slug: 'little-collins-espresso', expectedVersion: businessVersion }).expect(200);
    businessVersion = back.body.data.version;
    await agent().get('/api/v1/seo/redirects/resolve?path=/business/little-collins-espresso').expect(404);
    const alias = await agent().get('/api/v1/seo/redirects/resolve?path=/business/little-collins-bar').expect(200);
    expect(alias.body.data.targetPath).toBe('/business/little-collins-espresso');
  });

  it('changes an article slug with a redirect and refuses invalid slugs and stale versions', async () => {
    const changed = await post(`/api/v1/admin/posts/${postId}/slug`).send({ slug: 'filter-coffee-guide', expectedVersion: postVersion }).expect(200);
    postVersion = changed.body.data.version;
    const resolved = await agent().get('/api/v1/seo/redirects/resolve?path=/blog/where-to-find-filter-coffee').expect(200);
    expect(resolved.body.data.targetPath).toBe('/blog/filter-coffee-guide');
    const stale = await post(`/api/v1/admin/posts/${postId}/slug`).send({ slug: 'another-slug', expectedVersion: postVersion - 1 }).expect(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');
    const invalid = await post(`/api/v1/admin/posts/${postId}/slug`).send({ slug: 'Not A Slug', expectedVersion: postVersion }).expect(400);
    expect(invalid.body.error.fields.slug).toBeTruthy();
    const same = await post(`/api/v1/admin/posts/${postId}/slug`).send({ slug: 'filter-coffee-guide', expectedVersion: postVersion }).expect(400);
    expect(same.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('manual redirects: validation, 410 entries, listing and deletion, and permission denial', async () => {
    const crossOrigin = await post('/api/v1/admin/redirects').send({ sourcePath: '/business/gone', targetPath: 'https://evil.example/x' }).expect(400);
    expect(crossOrigin.body.error.fields.targetPath).toBeTruthy();
    await post('/api/v1/admin/redirects').send({ sourcePath: '/admin/secret', targetPath: '/business/x' }).expect(400);
    await post('/api/v1/admin/redirects').send({ sourcePath: '/loop', targetPath: '/loop' }).expect(400);

    const gone = await post('/api/v1/admin/redirects').send({ sourcePath: '/business/closed-forever', kind: 'gone', reason: 'Business closed' }).expect(201);
    expect(gone.body.data).toMatchObject({ kind: 'gone', targetPath: null });
    const resolved = await agent().get('/api/v1/seo/redirects/resolve?path=/business/closed-forever').expect(200);
    expect(resolved.body.data).toEqual({ kind: 'gone', status: 410, targetPath: null });

    const list = await get('/api/v1/admin/redirects?kind=gone').expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);

    // No redirects.manage: the API refuses regardless of what the admin UI shows.
    await get('/api/v1/admin/redirects', limitedCookie).expect(403);
    await post('/api/v1/admin/redirects', limitedCookie).send({ sourcePath: '/a', targetPath: '/b' }).expect(403);
    await agent().get('/api/v1/admin/redirects').expect(401);

    await del(`/api/v1/admin/redirects/${gone.body.data.id}`).expect(204);
    await agent().get('/api/v1/seo/redirects/resolve?path=/business/closed-forever').expect(404);
  });

  it('resolve normalises the requested path and refuses non-site paths', async () => {
    const upper = await agent().get('/api/v1/seo/redirects/resolve?path=/Blog/Where-To-Find-Filter-Coffee/').expect(200);
    expect(upper.body.data.targetPath).toBe('/blog/filter-coffee-guide');
    await agent().get('/api/v1/seo/redirects/resolve?path=https://evil.example/blog/x').expect(404);
    await agent().get('/api/v1/seo/redirects/resolve').expect(404);
  });

  it('serves a temporary move as 302 and validates it as strictly as a permanent one', async () => {
    const bad = await post('/api/v1/admin/redirects').send({ sourcePath: '/business/pop-up', kind: 'temporary' }).expect(400);
    expect(bad.body.error.fields.targetPath).toBeTruthy();

    const created = await post('/api/v1/admin/redirects')
      .send({ sourcePath: '/business/pop-up', targetPath: '/business/pop-up-2026', kind: 'temporary', reason: 'Trading from the other site until March' })
      .expect(201);
    expect(created.body.data).toMatchObject({ kind: 'temporary', isActive: true });

    const resolved = await agent().get('/api/v1/seo/redirects/resolve?path=/business/pop-up').expect(200);
    expect(resolved.body.data).toEqual({ kind: 'temporary', status: 302, targetPath: '/business/pop-up-2026' });

    await del(`/api/v1/admin/redirects/${created.body.data.id}`).expect(204);
  });

  it('a redirect that is switched off is indistinguishable from no rule, and comes back when switched on', async () => {
    const created = await post('/api/v1/admin/redirects').send({ sourcePath: '/business/paused', targetPath: '/business/paused-new' }).expect(201);
    await agent().get('/api/v1/seo/redirects/resolve?path=/business/paused').expect(200);

    const off = await post(`/api/v1/admin/redirects/${created.body.data.id}/deactivate`).send({ reason: 'Sent people to the wrong page' }).expect(200);
    expect(off.body.data.isActive).toBe(false);

    // The public route answers exactly as it does for a path nobody has ever
    // configured: an anonymous caller learns nothing about the rule's existence.
    await agent().get('/api/v1/seo/redirects/resolve?path=/business/paused').expect(404);
    await agent().get('/api/v1/seo/redirects/resolve?path=/business/never-configured').expect(404);

    // The rule is still there for an administrator, with the reason it does nothing.
    const preview = await get('/api/v1/admin/redirects/resolve?path=/business/paused').expect(200);
    expect(preview.body.data).toMatchObject({ outcome: 'inactive', status: null, normalisedPath: '/business/paused' });
    expect(preview.body.data.rule.isActive).toBe(false);

    const on = await post(`/api/v1/admin/redirects/${created.body.data.id}/activate`).send({}).expect(200);
    expect(on.body.data.isActive).toBe(true);
    await agent().get('/api/v1/seo/redirects/resolve?path=/business/paused').expect(200);

    // Both state changes are in the activity log, with the path they affected.
    const activity = await get('/api/v1/admin/activity?pageSize=50').expect(200);
    const actions = (activity.body.data as { action: string; targetId: string }[]).filter((entry) => entry.targetId === created.body.data.id).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['seo.redirect.deactivate', 'seo.redirect.activate']));

    await del(`/api/v1/admin/redirects/${created.body.data.id}`).expect(204);
  });

  it('writing over a switched-off source turns it back on, rather than reporting success and doing nothing', async () => {
    const created = await post('/api/v1/admin/redirects').send({ sourcePath: '/business/reused', targetPath: '/business/reused-a' }).expect(201);
    await post(`/api/v1/admin/redirects/${created.body.data.id}/deactivate`).send({}).expect(200);

    const again = await post('/api/v1/admin/redirects').send({ sourcePath: '/business/reused', targetPath: '/business/reused-b' }).expect(201);
    expect(again.body.data).toMatchObject({ isActive: true, targetPath: '/business/reused-b' });
    const resolved = await agent().get('/api/v1/seo/redirects/resolve?path=/business/reused').expect(200);
    expect(resolved.body.data.targetPath).toBe('/business/reused-b');

    await del(`/api/v1/admin/redirects/${again.body.data.id}`).expect(204);
  });

  it('the admin preview explains a path that does nothing, and needs the permission', async () => {
    const none = await get('/api/v1/admin/redirects/resolve?path=/business/nothing-here').expect(200);
    expect(none.body.data).toMatchObject({ outcome: 'no-rule', status: null, rule: null });

    const invalid = await get('/api/v1/admin/redirects/resolve?path=https://evil.example/x').expect(200);
    expect(invalid.body.data).toMatchObject({ outcome: 'invalid-path', normalisedPath: null });

    await get('/api/v1/admin/redirects/resolve?path=/business/nothing-here', limitedCookie).expect(403);
    await agent().get('/api/v1/admin/redirects/resolve?path=/business/nothing-here').expect(401);
  });

  it('repoints a permanent alias that is switched off, and leaves a temporary rule’s destination alone', async () => {
    // A permanent alias, switched off, still points at the old address.
    const alias = await post('/api/v1/admin/redirects').send({ sourcePath: '/business/alias-old', targetPath: '/business/moved-once' }).expect(201);
    await post(`/api/v1/admin/redirects/${alias.body.data.id}/deactivate`).send({}).expect(200);

    // A temporary rule pointing at the same address is an editorial decision.
    await post('/api/v1/admin/redirects')
      .send({ sourcePath: '/business/temp-alias', targetPath: '/business/moved-once', kind: 'temporary' })
      .expect(201);

    // Moving that address again repoints the permanent alias, inactive or not…
    await post('/api/v1/admin/redirects').send({ sourcePath: '/business/moved-once', targetPath: '/business/moved-twice' }).expect(201);

    const list = await get('/api/v1/admin/redirects?pageSize=50').expect(200);
    const rows = list.body.data as { sourcePath: string; targetPath: string | null; isActive: boolean }[];
    expect(rows.find((row) => row.sourcePath === '/business/alias-old')).toMatchObject({ targetPath: '/business/moved-twice', isActive: false });
    // …and leaves the temporary one exactly where the administrator put it.
    expect(rows.find((row) => row.sourcePath === '/business/temp-alias')).toMatchObject({ targetPath: '/business/moved-once' });

    for (const path of ['/business/alias-old', '/business/temp-alias', '/business/moved-once']) {
      const row = rows.find((entry) => entry.sourcePath === path) as { id?: string } | undefined;
      const found = (await get('/api/v1/admin/redirects?pageSize=50').expect(200)).body.data.find((entry: { sourcePath: string }) => entry.sourcePath === path);
      if (found) await del(`/api/v1/admin/redirects/${found.id}`).expect(204);
      void row;
    }
  });
});