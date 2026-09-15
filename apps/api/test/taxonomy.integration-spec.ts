import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

describe('Taxonomy and local areas (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  const agent = () => request(app.getHttpServer());
  const post = (path: string) => agent().post(path).set('Origin', ORIGIN).set('Cookie', cookie);
  const patch = (path: string) => agent().patch(path).set('Origin', ORIGIN).set('Cookie', cookie);

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.120').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!;
    cookie = raw.split(';')[0]!;
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('public endpoints are anonymous and cacheable; admin endpoints need taxonomy.manage', async () => {
    const cats = await agent().get('/api/v1/categories').expect(200);
    expect(cats.body).toEqual({ data: [] });
    expect(cats.headers['cache-control']).toBe('public, max-age=300');
    await agent().get('/api/v1/admin/categories').expect(401);
    await agent().post('/api/v1/admin/categories').set('Origin', ORIGIN).send({ name: 'X' }).expect(401);
  });

  it('categories: slug generation, uniqueness, two-level nesting, cycles and public tree', async () => {
    const food = (await post('/api/v1/admin/categories').send({ name: 'Food & Drink' }).expect(201)).body.data;
    expect(food).toMatchObject({ slug: 'food-and-drink', active: true, version: 1, parentId: null });
    const dup = await post('/api/v1/admin/categories').send({ name: 'Food and Drink' }).expect(409);
    expect(dup.body.error.code).toBe('SLUG_IN_USE');
    await post('/api/v1/admin/categories').send({ name: 'Bad', slug: 'Not Valid' }).expect(400);
    const cafes = (await post('/api/v1/admin/categories').send({ name: 'Cafes', parentId: food.id }).expect(201)).body.data;
    const depth = await post('/api/v1/admin/categories').send({ name: 'Espresso bars', parentId: cafes.id }).expect(409);
    expect(depth.body.error.code).toBe('CATEGORY_DEPTH');
    await post('/api/v1/admin/categories').send({ name: 'Orphan', parentId: 'nope' }).expect(400);
    const cycle = await patch(`/api/v1/admin/categories/${food.id}`).send({ expectedVersion: 1, parentId: food.id }).expect(409);
    expect(cycle.body.error.code).toBe('CATEGORY_CYCLE');
    const nestParent = await patch(`/api/v1/admin/categories/${food.id}`).send({ expectedVersion: 1, parentId: cafes.id }).expect(409);
    expect(nestParent.body.error.code).toBe('CATEGORY_DEPTH');
    const renamed = await patch(`/api/v1/admin/categories/${cafes.id}`).send({ expectedVersion: 1, name: 'Cafés', slug: 'cafes-melbourne' }).expect(200);
    expect(renamed.body.data).toMatchObject({ name: 'Cafés', slug: 'cafes-melbourne', version: 2 });
    await patch(`/api/v1/admin/categories/${cafes.id}`).send({ expectedVersion: 1, name: 'Stale' }).expect(409);
    const tree = await agent().get('/api/v1/categories').expect(200);
    const bare = { description: null, image: null, seoTitle: null, seoDescription: null, seoKeywords: null, shareImage: null };
    expect(tree.body.data).toEqual([{ id: food.id, name: 'Food & Drink', slug: 'food-and-drink', ...bare, children: [{ id: cafes.id, name: 'Cafés', slug: 'cafes-melbourne', ...bare, children: [] }] }]);
  });

  it('deactivation rules: children block a parent, inactive parent blocks child activation, inactive items vanish from public reads', async () => {
    const db = testDatabase();
    const food = await db.category.findUniqueOrThrow({ where: { slug: 'food-and-drink' } });
    const cafes = await db.category.findUniqueOrThrow({ where: { slug: 'cafes-melbourne' } });
    const blocked = await post(`/api/v1/admin/categories/${food.id}/deactivate`).send({ expectedVersion: food.version }).expect(409);
    expect(blocked.body.error.code).toBe('TERM_IN_USE');
    const offCafes = await post(`/api/v1/admin/categories/${cafes.id}/deactivate`).send({ expectedVersion: cafes.version, reason: 'test' }).expect(200);
    expect(offCafes.body.data.active).toBe(false);
    const offFood = await post(`/api/v1/admin/categories/${food.id}/deactivate`).send({ expectedVersion: food.version }).expect(200);
    expect((await agent().get('/api/v1/categories').expect(200)).body.data).toEqual([]);
    const childFirst = await post(`/api/v1/admin/categories/${cafes.id}/activate`).send({ expectedVersion: offCafes.body.data.version }).expect(409);
    expect(childFirst.body.error.code).toBe('PARENT_INACTIVE');
    await post(`/api/v1/admin/categories/${food.id}/activate`).send({ expectedVersion: offFood.body.data.version }).expect(200);
    await post(`/api/v1/admin/categories/${cafes.id}/activate`).send({ expectedVersion: offCafes.body.data.version }).expect(200);
    const list = await agent().get('/api/v1/admin/categories?status=active&sort=name&order=asc').set('Cookie', cookie).expect(200);
    expect(list.body.data.map((c: { slug: string }) => c.slug)).toEqual(['cafes-melbourne', 'food-and-drink']);
    expect(list.body.meta.total).toBe(2);
    const audits = await db.auditLog.findMany({ where: { action: { startsWith: 'taxonomy.category.' } } });
    expect(new Set(audits.map((a) => a.action))).toEqual(new Set(['taxonomy.category.create', 'taxonomy.category.update', 'taxonomy.category.deactivate', 'taxonomy.category.activate']));
  });

  it('services: synonyms are normalised, deduplicated, replaced on update and exposed publicly', async () => {
    await post('/api/v1/admin/services').send({ name: 'Coffee', synonyms: ['x'] }).expect(400); // too short is a validation error, not silently dropped
    const created = await post('/api/v1/admin/services').send({ name: 'Coffee', synonyms: ['Espresso', ' flat   white ', 'espresso'] }).expect(201);
    expect(created.body.data.synonyms).toEqual(['espresso', 'flat white']);
    const updated = await patch(`/api/v1/admin/services/${created.body.data.id}`).send({ expectedVersion: 1, synonyms: ['latte'] }).expect(200);
    expect(updated.body.data).toMatchObject({ synonyms: ['latte'], version: 2 });
    const pub = await agent().get('/api/v1/services').expect(200);
    expect(pub.body.data).toEqual([{ id: created.body.data.id, name: 'Coffee', slug: 'coffee', synonyms: ['latte'] }]);
    await post(`/api/v1/admin/services/${created.body.data.id}/deactivate`).send({ expectedVersion: 2 }).expect(200);
    expect((await agent().get('/api/v1/services').expect(200)).body.data).toEqual([]);
    await post('/api/v1/admin/services').send({ name: 'Coffee', synonyms: Array.from({ length: 21 }, (_, i) => `syn${i}`) }).expect(400);
  });

  it('services: an icon must come from the shared library, and reaches the public listing', async () => {
    await post('/api/v1/admin/services').send({ name: 'Wifi', icon: 'not-an-icon' }).expect(400);
    const chosen = (await post('/api/v1/admin/services').send({ name: 'Wifi', icon: 'wifi' }).expect(201)).body.data;
    expect(chosen.icon).toBe('wifi');
    // Left empty, the name decides on the public site; the record says so with null.
    const matched = (await post('/api/v1/admin/services').send({ name: 'Late opening' }).expect(201)).body.data;
    expect(matched.icon).toBeNull();
    const cleared = await patch(`/api/v1/admin/services/${chosen.id}`).send({ expectedVersion: 1, icon: null }).expect(200);
    expect(cleared.body.data.icon).toBeNull();
  });

  it('categories and areas carry an image and search appearance, and refuse an image that is not ready', async () => {
    const db = testDatabase();
    const ready = await db.mediaAsset.create({ data: { sourceName: 'tile.jpg', mimeType: 'image/jpeg', bytes: 10, checksum: 'a'.repeat(64), objectKey: 'q/tile.jpg', status: 'ready', readyAt: new Date(), altText: 'Cafés in a laneway' } });
    const pending = await db.mediaAsset.create({ data: { sourceName: 'pending.jpg', mimeType: 'image/jpeg', bytes: 10, checksum: 'b'.repeat(64), objectKey: 'q/pending.jpg', status: 'quarantined' } });
    const refused = await post('/api/v1/admin/categories').send({ name: 'Bars', imageMediaId: pending.id }).expect(400);
    expect(refused.body.error.fields.imageMediaId[0]).toMatch(/still being processed/);
    const bars = (await post('/api/v1/admin/categories').send({ name: 'Bars', imageMediaId: ready.id, seoTitle: 'Bars in Adelaide', seoDescription: 'Where to drink.', seoKeywords: 'bars, melbourne' }).expect(201)).body.data;
    expect(bars).toMatchObject({ imageMediaId: ready.id, seoTitle: 'Bars in Adelaide', seoKeywords: 'bars, melbourne', ogImageMediaId: null });
    const tree = (await agent().get('/api/v1/categories').expect(200)).body.data.find((c: { slug: string }) => c.slug === 'bars');
    expect(tree).toMatchObject({ seoTitle: 'Bars in Adelaide', seoDescription: 'Where to drink.', shareImage: null });
    // The image resolves only once a rendition exists; with none it is null rather than a broken address.
    expect(tree.image).toBeNull();
    const area = (await post('/api/v1/admin/areas').send({ name: 'Fitzroy', seoTitle: 'Fitzroy businesses', ogImageMediaId: ready.id }).expect(201)).body.data;
    expect(area).toMatchObject({ seoTitle: 'Fitzroy businesses', ogImageMediaId: ready.id });
    // The image is now in use, so the library refuses to delete it (SRS MED 004).
    const usage = await agent().get(`/api/v1/admin/media/${ready.id}`).set('Cookie', cookie).expect(200);
    expect(usage.body.data.usages).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'category', id: bars.id }), expect.objectContaining({ kind: 'area', id: area.id })]));
    // Retired so the ordering test below sees only its own areas.
    await post(`/api/v1/admin/areas/${area.id}/deactivate`).send({ expectedVersion: 1 }).expect(200);
  });

  it('local areas: allowlist entries with eligibility source, ordering and no city entity', async () => {
    const carlton = (await post('/api/v1/admin/areas').send({ name: 'Carlton', eligibilitySource: 'City of Melbourne council area', sortOrder: 2 }).expect(201)).body.data;
    expect(carlton.eligibilityVerifiedAt).not.toBeNull();
    const cbd = (await post('/api/v1/admin/areas').send({ name: 'Melbourne CBD', sortOrder: 1, editorialIntro: 'The city centre.' }).expect(201)).body.data;
    expect(cbd.eligibilityVerifiedAt).toBeNull();
    const pub = await agent().get('/api/v1/areas').expect(200);
    expect(pub.body.data.map((a: { slug: string }) => a.slug)).toEqual(['melbourne-cbd', 'carlton']);
    expect(JSON.stringify(pub.body)).not.toMatch(/eligibility|version/);
    await post('/api/v1/admin/areas').send({ name: 'Sydney', state: 'NSW' }).expect(400); // unknown field: no expansion controls
    const ctx = await agent().get('/api/v1/site/context').expect(200);
    expect(ctx.body.data.city).toBe('Melbourne');
    const off = await post(`/api/v1/admin/areas/${cbd.id}/deactivate`).send({ expectedVersion: 1 }).expect(200);
    expect(off.body.data.active).toBe(false);
    expect((await agent().get('/api/v1/areas').expect(200)).body.data.map((a: { slug: string }) => a.slug)).toEqual(['carlton']);
  });
});
