import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { OutboxService } from '../src/outbox/outbox.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/** Publication changes leave a retryable purge behind (SRS CACHE 001–003). */
describe('Cache invalidation (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  let business: { id: string; version: number; slug: string };
  const agent = () => request(app.getHttpServer());
  const post = (path: string) => agent().post(path).set('Origin', ORIGIN).set('Cookie', cookie);

  const tagsOf = (payload: unknown): string[] => String((payload as { tags?: string })?.tags ?? '').split(',').filter(Boolean);

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    const login = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.240').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;

    const categoryId = (await post('/api/v1/admin/categories').send({ name: 'Cafes' }).expect(201)).body.data.id;
    const areaId = (await post('/api/v1/admin/areas').send({ name: 'Melbourne CBD', eligibilitySource: 'council list' }).expect(201)).body.data.id;
    const created = await post('/api/v1/admin/businesses')
      .send({
        name: 'Cache Test Cafe',
        description: 'A listing used to prove that publication changes purge the cached public reads.',
        primaryCategoryId: categoryId,
        localAreaId: areaId,
        publicPhone: '+61 3 9000 1234',
        address: { line1: '1 Test St', suburb: 'Adelaide', postcode: '5000', latitude: -34.9285, longitude: 138.6007 },
        eligibilitySource: 'City of Melbourne suburb list',
        contentRightsReviewed: true,
      })
      .expect(201);
    business = { id: created.body.data.id, version: created.body.data.version, slug: created.body.data.slug };
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('records a purge in the same transaction as publication, and again on removal', async () => {
    const db = testDatabase();
    const published = await post(`/api/v1/admin/businesses/${business.id}/publish`).send({ expectedVersion: business.version }).expect(200);
    business.version = published.body.data.version;

    const afterPublish = await db.outboxEvent.findMany({ where: { type: 'cache.invalidate', resourceId: business.id }, orderBy: { occurredAt: 'asc' } });
    expect(afterPublish).toHaveLength(1);
    expect(tagsOf(afterPublish[0]?.payload)).toEqual(expect.arrayContaining(['businesses', `business:${business.slug}`, 'sitemap']));
    expect((afterPublish[0]!.payload as { urgent?: boolean }).urgent).toBe(false);

    const unpublished = await post(`/api/v1/admin/businesses/${business.id}/unpublish`).send({ expectedVersion: business.version, reason: 'temporary' }).expect(200);
    business.version = unpublished.body.data.version;
    const afterUnpublish = await db.outboxEvent.findMany({ where: { type: 'cache.invalidate', resourceId: business.id }, orderBy: { occurredAt: 'asc' } });
    expect(afterUnpublish).toHaveLength(2);
    // A removal is urgent: it must not wait for a TTL (SRS CACHE 002).
    expect((afterUnpublish[1]!.payload as { urgent?: boolean }).urgent).toBe(true);
  });

  it('serves the search from cache but never a stale publication state', async () => {
    const republished = await post(`/api/v1/admin/businesses/${business.id}/publish`).send({ expectedVersion: business.version }).expect(200);
    business.version = republished.body.data.version;

    const first = await agent().get('/api/v1/businesses?q=Cache').expect(200);
    expect(first.body.data.map((card: { name: string }) => card.name)).toEqual(['Cache Test Cafe']);
    // A second identical read is served from the cache and matches exactly.
    const second = await agent().get('/api/v1/businesses?q=Cache').expect(200);
    expect(second.body).toEqual(first.body);

    const removed = await post(`/api/v1/admin/businesses/${business.id}/unpublish`).send({ expectedVersion: business.version, reason: 'removed' }).expect(200);
    business.version = removed.body.data.version;
    // The namespace moved on, so the cached entry can no longer be reached.
    const afterRemoval = await agent().get('/api/v1/businesses?q=Cache').expect(200);
    expect(afterRemoval.body.data).toEqual([]);
  });

  it('dispatches the purge to the queue so a failure is retried rather than lost', async () => {
    const outbox = app.get(OutboxService);
    const claimed = await outbox.claim(10);
    expect(claimed.some((event) => event.type === 'cache.invalidate')).toBe(true);
  });
});
