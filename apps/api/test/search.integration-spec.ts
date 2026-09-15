import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

describe('Public directory search and detail (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  const agent = () => request(app.getHttpServer());
  const admin = (req: request.Test) => req.set('Origin', ORIGIN).set('Cookie', cookie);
  const ids: Record<string, string> = {};

  const createBusiness = async (body: Record<string, unknown>, publish = true) => {
    const created = (await admin(agent().post('/api/v1/admin/businesses')).send({ description: 'A published listing with a description long enough for the publication gate.', eligibilitySource: 'council list', contentRightsReviewed: true, publicPhone: '03 9000 0000', ...body }).expect(201)).body.data;
    if (publish) await admin(agent().post(`/api/v1/admin/businesses/${created.id}/publish`)).send({ expectedVersion: created.version, duplicateOverrideReason: 'distinct test fixtures with similar names' }).expect(200);
    return created.id as string;
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.150').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
    const mk = async (path: string, body: object) => (await admin(agent().post(path)).send(body).expect(201)).body.data.id as string;
    ids.food = await mk('/api/v1/admin/categories', { name: 'Food & Drink' });
    ids.cafes = await mk('/api/v1/admin/categories', { name: 'Cafes', parentId: ids.food });
    ids.bars = await mk('/api/v1/admin/categories', { name: 'Bars', parentId: ids.food });
    ids.plumbers = await mk('/api/v1/admin/categories', { name: 'Plumbers' });
    ids.coffee = await mk('/api/v1/admin/services', { name: 'Specialty coffee', synonyms: ['espresso', 'flat white'] });
    ids.cbd = await mk('/api/v1/admin/areas', { name: 'Melbourne CBD', eligibilitySource: 'council list' });
    ids.carlton = await mk('/api/v1/admin/areas', { name: 'Carlton', eligibilitySource: 'council list' });

    ids.espresso = await createBusiness({ name: 'Espresso Lane', slug: 'espresso-lane', primaryCategoryId: ids.cafes, localAreaId: ids.cbd, serviceIds: [ids.coffee], address: { line1: '1 Leigh St', suburb: 'Adelaide', postcode: '5000', latitude: -34.9239, longitude: 138.5988 }, publicUrl: 'https://espresso.example/', links: [{ kind: 'instagram', url: 'https://instagram.com/espressolane' }], privateEnquiryEmail: 'secret@espresso.example' });
    ids.laneway = await createBusiness({ name: 'Laneway Espresso Bar', slug: 'laneway-espresso-bar', primaryCategoryId: ids.cafes, localAreaId: ids.carlton, secondaryCategoryIds: [ids.bars] });
    ids.pipes = await createBusiness({ name: 'Carlton Pipes', slug: 'carlton-pipes', primaryCategoryId: ids.plumbers, localAreaId: ids.carlton, description: 'Emergency plumbing. We also fix the espresso machine at the local cafe when asked.', addressVisibility: 'areaOnly', address: { line1: '9 Private St', suburb: 'Carlton', postcode: '5067' } });
    ids.beans = await createBusiness({ name: 'Beans & Co', slug: 'beans-and-co', primaryCategoryId: ids.cafes, localAreaId: ids.cbd });
    ids.draft = await createBusiness({ name: 'Espresso Draft', slug: 'espresso-draft', primaryCategoryId: ids.cafes, localAreaId: ids.cbd }, false);
    ids.nightcap = await createBusiness({ name: 'Nightcap', slug: 'nightcap', primaryCategoryId: ids.bars, localAreaId: ids.cbd });
    const db = testDatabase();
    await db.businessRating.update({ where: { businessId: ids.laneway }, data: { approvedCount: 4, ratingSum: 18 } }); // 4.5
    await db.businessRating.update({ where: { businessId: ids.beans }, data: { approvedCount: 10, ratingSum: 42 } }); // 4.2
    await db.businessRating.update({ where: { businessId: ids.pipes }, data: { approvedCount: 1, ratingSum: 3 } }); // 3.0
    // Distinct firstPublishedAt for a deterministic "newest" order.
    const stamps: [string, string][] = [[ids.espresso, '2026-01-01'], [ids.laneway, '2026-02-01'], [ids.pipes, '2026-03-01'], [ids.beans, '2026-04-01'], [ids.nightcap, '2026-05-01']];
    for (const [id, date] of stamps) await db.business.update({ where: { id }, data: { firstPublishedAt: new Date(`${date}T00:00:00Z`) } });
    await admin(agent().put(`/api/v1/admin/businesses/${ids.espresso}/hours`)).send({ expectedVersion: (await db.business.findUniqueOrThrow({ where: { id: ids.espresso } })).version, mode: 'scheduled', weekly: { monday: { state: 'open24' }, tuesday: { state: 'open24' }, wednesday: { state: 'open24' }, thursday: { state: 'open24' }, friday: { state: 'open24' }, saturday: { state: 'open24' }, sunday: { state: 'open24' } }, exceptions: [{ date: '2020-01-01', kind: 'closed' }, { date: '2099-12-25', kind: 'closed', note: 'Christmas' }] }).expect(200);
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  const names = (res: request.Response) => res.body.data.map((b: { name: string }) => b.name);

  it('lists published businesses only, name A–Z by default, with facets and cache headers', async () => {
    const res = await agent().get('/api/v1/businesses').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    expect(names(res)).toEqual(['Beans & Co', 'Carlton Pipes', 'Espresso Lane', 'Laneway Espresso Bar', 'Nightcap']);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 5, pageCount: 1, sort: 'name' });
    expect(res.body.meta.facets.categories).toEqual([{ slug: 'cafes', name: 'Cafes', count: 3 }, { slug: 'bars', name: 'Bars', count: 2 }, { slug: 'plumbers', name: 'Plumbers', count: 1 }]);
    expect(res.body.meta.facets.areas).toEqual([{ slug: 'melbourne-cbd', name: 'Melbourne CBD', count: 3 }, { slug: 'carlton', name: 'Carlton', count: 2 }]);
    const card = res.body.data[0];
    expect(card).toEqual({ id: ids.beans, name: 'Beans & Co', slug: 'beans-and-co', primaryCategory: { name: 'Cafes', slug: 'cafes' }, localArea: { name: 'Melbourne CBD', slug: 'melbourne-cbd' }, rating: { average: 4.2, count: 10 }, image: null });
    expect(JSON.stringify(res.body)).not.toMatch(/secret@|privateEnquiry|Espresso Draft/);
  });

  it('ranks keyword matches: exact name, prefix, contains, labels/synonyms, description', async () => {
    const res = await agent().get('/api/v1/businesses?q=  ESPRESSO ').expect(200);
    expect(res.body.meta.sort).toBe('relevance');
    // "Espresso Lane" (prefix) < "Laneway Espresso Bar" (contains) < "Beans & Co" (synonym "espresso" via Specialty coffee? no — only Espresso Lane has the service) …
    expect(names(res)).toEqual(['Espresso Lane', 'Laneway Espresso Bar', 'Carlton Pipes']);
    const exact = await agent().get('/api/v1/businesses?q=nightcap').expect(200);
    expect(names(exact)).toEqual(['Nightcap']);
    const synonym = await agent().get('/api/v1/businesses?q=flat white').expect(200);
    expect(names(synonym)).toEqual(['Espresso Lane']);
    const category = await agent().get('/api/v1/businesses?q=plumb').expect(200);
    expect(names(category)).toEqual(['Carlton Pipes']);
    const none = await agent().get('/api/v1/businesses?q=zzzz').expect(200);
    expect(none.body.data).toEqual([]);
    expect(none.body.meta.total).toBe(0);
    const wildcard = await agent().get('/api/v1/businesses?q=%25').expect(200); // a literal % must not match everything
    expect(wildcard.body.meta.total).toBe(0);
  });

  it('combines category (with descendants), area and minRating filters with AND', async () => {
    expect(names(await agent().get('/api/v1/businesses?category=food-and-drink').expect(200))).toEqual(['Beans & Co', 'Espresso Lane', 'Laneway Espresso Bar', 'Nightcap']);
    expect(names(await agent().get('/api/v1/businesses?category=bars').expect(200))).toEqual(['Laneway Espresso Bar', 'Nightcap']); // secondary category counts
    expect(names(await agent().get('/api/v1/businesses?category=cafes&area=carlton').expect(200))).toEqual(['Laneway Espresso Bar']);
    expect(names(await agent().get('/api/v1/businesses?minRating=4').expect(200))).toEqual(['Beans & Co', 'Laneway Espresso Bar']);
    expect(names(await agent().get('/api/v1/businesses?minRating=4&area=carlton&q=espresso').expect(200))).toEqual(['Laneway Espresso Bar']);
    const unknown = await agent().get('/api/v1/businesses?category=does-not-exist').expect(200);
    expect(unknown.body).toMatchObject({ data: [], meta: { total: 0 } });
    const facets = (await agent().get('/api/v1/businesses?area=carlton').expect(200)).body.meta.facets;
    // A facet counts primary and secondary categories, as the category filter matches them: Laneway Espresso Bar is a cafe that is also listed under Bars.
    expect(facets.categories).toEqual([{ slug: 'bars', name: 'Bars', count: 1 }, { slug: 'cafes', name: 'Cafes', count: 1 }, { slug: 'plumbers', name: 'Plumbers', count: 1 }]);
    const barsInCarlton = await agent().get('/api/v1/businesses?area=carlton&category=bars').expect(200);
    expect(barsInCarlton.body.meta.total).toBe(1);
    expect(facets.areas.map((a: { slug: string }) => a.slug)).toEqual(['melbourne-cbd', 'carlton']); // area facet ignores the area filter itself
  });

  it('sorts by rating (rated first), newest and name with stable ties', async () => {
    expect(names(await agent().get('/api/v1/businesses?sort=rating').expect(200))).toEqual(['Laneway Espresso Bar', 'Beans & Co', 'Carlton Pipes', 'Espresso Lane', 'Nightcap']);
    expect(names(await agent().get('/api/v1/businesses?sort=newest').expect(200))).toEqual(['Nightcap', 'Beans & Co', 'Carlton Pipes', 'Laneway Espresso Bar', 'Espresso Lane']);
    expect((await agent().get('/api/v1/businesses?sort=relevance').expect(200)).body.meta.sort).toBe('name');
  });

  it('paginates with bounds and field errors for invalid input', async () => {
    const page2 = await agent().get('/api/v1/businesses?pageSize=2&page=2').expect(200);
    expect(names(page2)).toEqual(['Espresso Lane', 'Laneway Espresso Bar']);
    expect(page2.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 5, pageCount: 3 });
    expect((await agent().get('/api/v1/businesses?page=99').expect(200)).body.data).toEqual([]);
    for (const bad of ['pageSize=51', 'minRating=6', 'sort=random', 'category=Bad%20Slug', 'page=201&pageSize=50', `q=${'x'.repeat(121)}`]) {
      const res = await agent().get(`/api/v1/businesses?${bad}`).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(res.body.error.fields).length).toBeGreaterThan(0);
    }
  });

  it('serves the public detail projection with hours, links, address rules and related listings', async () => {
    const res = await agent().get('/api/v1/businesses/espresso-lane').expect(200);
    const b = res.body.data;
    expect(b).toMatchObject({
      name: 'Espresso Lane',
      primaryCategory: { slug: 'cafes' },
      services: [{ name: 'Specialty coffee', slug: 'specialty-coffee' }],
      contact: { phone: { display: '03 9000 0000', telHref: 'tel:+61390000000' }, email: null, website: 'https://espresso.example/' },
      links: [{ kind: 'instagram', url: 'https://instagram.com/espressolane', label: null }],
      addressVisibility: 'full',
      address: { line1: '1 Leigh St', suburb: 'Adelaide', postcode: '5000', latitude: -34.9239, longitude: 138.5988, directionsUrl: 'https://www.google.com/maps/dir/?api=1&destination=-34.9239%2C138.5988' },
      hours: { mode: 'scheduled', status: { state: 'open' }, exceptions: [{ date: '2099-12-25', kind: 'closed', note: 'Christmas' }] },
      rating: null,
      acceptsEnquiries: true,
    });
    expect(b.related.map((r: { name: string }) => r.name)).toEqual(['Beans & Co', 'Laneway Espresso Bar']); // same area first, then other areas; drafts excluded
    expect(JSON.stringify(b)).not.toMatch(/secret@|privateEnquiry|eligibility|contentRights|normalized/);

    const hidden = (await agent().get('/api/v1/businesses/carlton-pipes').expect(200)).body.data;
    expect(hidden.addressVisibility).toBe('areaOnly');
    expect(hidden.address).toBeNull();
    expect(JSON.stringify(hidden)).not.toContain('Private St');
    expect(hidden.hours).toMatchObject({ mode: 'unknown', status: { state: 'unknown' } });
    expect(hidden.related).toEqual([]);

    await agent().get('/api/v1/businesses/espresso-draft').expect(404);
    await agent().get('/api/v1/businesses/nope').expect(404);
    const related = await agent().get(`/api/v1/businesses/${ids.espresso}/related`).expect(200);
    expect(related.body.data).toHaveLength(2);
    await agent().get(`/api/v1/businesses/${ids.draft}/related`).expect(404);
  });

  it('hides archived listings from search and detail', async () => {
    const db = testDatabase();
    const nightcap = await db.business.findUniqueOrThrow({ where: { id: ids.nightcap } });
    await admin(agent().post(`/api/v1/admin/businesses/${ids.nightcap}/archive`)).send({ expectedVersion: nightcap.version }).expect(200);
    expect(names(await agent().get('/api/v1/businesses?q=nightcap').expect(200))).toEqual([]);
    await agent().get('/api/v1/businesses/nightcap').expect(404);
  });
});
