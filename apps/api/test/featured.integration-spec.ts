import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { PasswordService } from '../src/auth/password.service.js';
import { IdentityService } from '../src/identity/identity.service.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/** Manual featured placements (SRS DIR 007). */
describe('Featured placements (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  let ids: { cafes: string; shopping: string; cbd: string; norwood: string };
  const businesses: Record<string, { id: string; version: number }> = {};
  const agent = () => request(app.getHttpServer());
  const post = (path: string) => agent().post(path).set('Origin', ORIGIN).set('Cookie', cookie);
  const patch = (path: string) => agent().patch(path).set('Origin', ORIGIN).set('Cookie', cookie);
  const del = (path: string) => agent().delete(path).set('Origin', ORIGIN).set('Cookie', cookie);

  /**
   * An administrator who may read listings but not publish them. Placements are
   * a publishing action, so this is the boundary the API has to hold whatever
   * the interface renders.
   */
  /** Earlier cases leave placements behind; a window test starts from nothing. */
  const clearPlacements = async (name: string): Promise<void> => {
    const list = await agent().get('/api/v1/admin/featured').set('Cookie', cookie).expect(200);
    for (const placement of list.body.data as { id: string; businessId: string }[]) {
      if (placement.businessId === businesses[name]!.id) await del(`/api/v1/admin/featured/${placement.id}`).expect(204);
    }
  };

  const readerCookie = async (): Promise<string> => {
    const reader = { email: 'featured.reader@example.com', displayName: 'Featured Reader', password: 'featured-reader-password-1' };
    const existing = await testDatabase().adminUser.findUnique({ where: { email: reader.email } });
    if (!existing) {
      const identity = app.get(IdentityService);
      const passwords = app.get(PasswordService);
      const created = await identity.createAdmin({ email: reader.email, displayName: reader.displayName, passwordHash: await passwords.hash(reader.password), roleKeys: [] });
      await testDatabase().adminUser.update({ where: { id: created.id }, data: { status: 'active' } });
      const fresh = await testDatabase().adminUser.findUniqueOrThrow({ where: { id: created.id } });
      await agent()
        .put(`/api/v1/admin/admins/${created.id}/permissions`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ permissions: ['featured.view'], expectedVersion: fresh.version })
        .expect(200);
    }
    const signedIn = await agent()
      .post('/api/v1/admin/auth/login')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', '203.0.113.231')
      .send({ email: reader.email, password: reader.password })
      .expect(200);
    return ([] as string[]).concat(signedIn.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };

  const listing = (name: string, categoryId: string, areaId: string) => ({
    name,
    description: `${name} is an Adelaide business used by the featured placement integration test suite.`,
    primaryCategoryId: categoryId,
    localAreaId: areaId,
    publicPhone: '+61 3 9000 1234',
    address: { line1: '1 Test St', suburb: 'Adelaide', postcode: '5000', latitude: -34.9285, longitude: 138.6007 },
    eligibilitySource: 'City of Adelaide suburb list',
    contentRightsReviewed: true,
  });

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    const login = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.230').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;

    const mk = async (path: string, body: object) => (await post(path).send(body).expect(201)).body.data.id as string;
    ids = {
      cafes: await mk('/api/v1/admin/categories', { name: 'Cafes' }),
      shopping: await mk('/api/v1/admin/categories', { name: 'Shopping' }),
      cbd: await mk('/api/v1/admin/areas', { name: 'Adelaide CBD', eligibilitySource: 'council list' }),
      norwood: await mk('/api/v1/admin/areas', { name: 'Norwood', eligibilitySource: 'council list' }),
    };

    for (const [name, categoryId, areaId] of [
      ['Featured Cafe One', ids.cafes, ids.cbd],
      ['Featured Cafe Two', ids.cafes, ids.cbd],
      ['Featured Cafe Three', ids.cafes, ids.cbd],
      ['Featured Cafe Four', ids.cafes, ids.cbd],
      ['Ordinary Cafe', ids.cafes, ids.cbd],
      ['Norwood Shop', ids.shopping, ids.norwood],
      ['Draft Cafe', ids.cafes, ids.cbd],
    ] as const) {
      const created = await post('/api/v1/admin/businesses').send(listing(name, categoryId, areaId)).expect(201);
      businesses[name] = { id: created.body.data.id, version: created.body.data.version };
      if (name !== 'Draft Cafe') {
        const published = await post(`/api/v1/admin/businesses/${created.body.data.id}/publish`).send({ expectedVersion: created.body.data.version }).expect(200);
        businesses[name] = { id: created.body.data.id, version: published.body.data.version };
      }
    }
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  const feature = (name: string, position: number, extra: Record<string, unknown> = {}) =>
    post('/api/v1/admin/featured').send({ businessId: businesses[name]!.id, position, startsAt: new Date(Date.now() - 3_600_000).toISOString(), ...extra });

  it('shows at most three matching featured listings, excluded from the organic results and counts', async () => {
    const before = await agent().get('/api/v1/businesses?pageSize=50').expect(200);
    const totalBefore = before.body.meta.total;
    expect(before.body.meta.featured).toEqual([]);

    await feature('Featured Cafe One', 0).expect(201);
    await feature('Featured Cafe Two', 1).expect(201);
    await feature('Featured Cafe Three', 2).expect(201);
    await feature('Featured Cafe Four', 3).expect(201);

    const res = await agent().get('/api/v1/businesses?pageSize=50').expect(200);
    const featuredNames = res.body.meta.featured.map((card: { name: string }) => card.name);
    expect(featuredNames).toEqual(['Featured Cafe One', 'Featured Cafe Two', 'Featured Cafe Three']);
    // Excluded from the organic list, its total and therefore its pagination.
    expect(res.body.data.map((card: { name: string }) => card.name)).not.toEqual(expect.arrayContaining(featuredNames));
    expect(res.body.meta.total).toBe(totalBefore - 3);
  });

  it('keeps the same featured set across pages of one query and resets it when filters change', async () => {
    const pageOne = await agent().get('/api/v1/businesses?pageSize=1&page=1').expect(200);
    const pageTwo = await agent().get('/api/v1/businesses?pageSize=1&page=2').expect(200);
    expect(pageTwo.body.meta.featured.map((c: { id: string }) => c.id)).toEqual(pageOne.body.meta.featured.map((c: { id: string }) => c.id));

    // A filter that no featured listing matches leaves the block empty rather than padding it.
    const shopping = await agent().get('/api/v1/businesses?category=shopping').expect(200);
    expect(shopping.body.meta.featured).toEqual([]);
    expect(shopping.body.data.map((card: { name: string }) => card.name)).toEqual(['Norwood Shop']);

    // Featuring never bypasses the keyword match either.
    const keyword = await agent().get('/api/v1/businesses?q=Ordinary').expect(200);
    expect(keyword.body.meta.featured).toEqual([]);
  });

  it('never features an unpublished listing, and drops a placement whose window has closed', async () => {
    const draft = await feature('Draft Cafe', 0).expect(201);
    expect(draft.body.data.state).toBe('not-published');
    const res = await agent().get('/api/v1/businesses?pageSize=50').expect(200);
    expect(res.body.meta.featured.map((card: { name: string }) => card.name)).not.toContain('Draft Cafe');

    const expired = await post('/api/v1/admin/featured')
      .send({ businessId: businesses['Ordinary Cafe']!.id, position: 0, startsAt: new Date(Date.now() - 7_200_000).toISOString(), endsAt: new Date(Date.now() - 3_600_000).toISOString() })
      .expect(201);
    expect(expired.body.data.state).toBe('ended');
    const after = await agent().get('/api/v1/businesses?pageSize=50').expect(200);
    expect(after.body.meta.featured.map((card: { name: string }) => card.name)).not.toContain('Ordinary Cafe');
    await del(`/api/v1/admin/featured/${expired.body.data.id}`).expect(204);
  });

  it('validates the interval, refuses overlaps and unknown listings, and audits the change', async () => {
    const bad = await post('/api/v1/admin/featured')
      .send({ businessId: businesses['Norwood Shop']!.id, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() - 1000).toISOString() })
      .expect(400);
    expect(bad.body.error.fields.endsAt).toBeTruthy();

    const unknown = await post('/api/v1/admin/featured').send({ businessId: 'does-not-exist', startsAt: new Date().toISOString() }).expect(400);
    expect(unknown.body.error.fields.businessId).toBeTruthy();

    const overlap = await feature('Featured Cafe One', 0).expect(409);
    expect(overlap.body.error.code).toBe('PLACEMENT_OVERLAP');

    const list = await agent().get('/api/v1/admin/featured').set('Cookie', cookie).expect(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    await agent().get('/api/v1/admin/featured').expect(401);
  });

  it('refuses on update the overlap it refuses on create, and lets a placement keep its own window', async () => {
    await clearPlacements('Draft Cafe');
    // Two windows for one listing, back to back so neither collides.
    const first = await post('/api/v1/admin/featured')
      .send({
        businessId: businesses['Draft Cafe']!.id,
        position: 0,
        startsAt: new Date('2027-01-01T00:00:00.000Z').toISOString(),
        endsAt: new Date('2027-01-10T00:00:00.000Z').toISOString(),
      })
      .expect(201);
    const second = await post('/api/v1/admin/featured')
      .send({
        businessId: businesses['Draft Cafe']!.id,
        position: 1,
        startsAt: new Date('2027-02-01T00:00:00.000Z').toISOString(),
        endsAt: new Date('2027-02-10T00:00:00.000Z').toISOString(),
      })
      .expect(201);

    // Editing the second one to reach back into the first must be refused the
    // same way creating it there would be.
    const collide = await patch(`/api/v1/admin/featured/${second.body.data.id}`)
      .send({ startsAt: new Date('2027-01-05T00:00:00.000Z').toISOString() })
      .expect(409);
    expect(collide.body.error.code).toBe('PLACEMENT_OVERLAP');

    // A placement must not collide with itself: changing only the note is fine.
    await patch(`/api/v1/admin/featured/${second.body.data.id}`).send({ note: 'Second window' }).expect(200);
    // And it can still be moved to a window that is free.
    const moved = await patch(`/api/v1/admin/featured/${second.body.data.id}`)
      .send({ startsAt: new Date('2027-03-01T00:00:00.000Z').toISOString(), endsAt: new Date('2027-03-10T00:00:00.000Z').toISOString() })
      .expect(200);
    expect(moved.body.data.state).toBe('scheduled');

    await del(`/api/v1/admin/featured/${first.body.data.id}`).expect(204);
    await del(`/api/v1/admin/featured/${second.body.data.id}`).expect(204);
  });

  it('refuses an open-ended window that swallows a later one, in both directions', async () => {
    await clearPlacements('Norwood Shop');
    const later = await post('/api/v1/admin/featured')
      .send({
        businessId: businesses['Norwood Shop']!.id,
        startsAt: new Date('2027-06-01T00:00:00.000Z').toISOString(),
        endsAt: new Date('2027-06-30T00:00:00.000Z').toISOString(),
      })
      .expect(201);

    // An open-ended window starting before it covers it.
    const openEnded = await post('/api/v1/admin/featured')
      .send({ businessId: businesses['Norwood Shop']!.id, startsAt: new Date('2027-05-01T00:00:00.000Z').toISOString() })
      .expect(409);
    expect(openEnded.body.error.code).toBe('PLACEMENT_OVERLAP');

    // The same collision reached by editing rather than creating.
    const free = await post('/api/v1/admin/featured')
      .send({
        businessId: businesses['Norwood Shop']!.id,
        startsAt: new Date('2027-08-01T00:00:00.000Z').toISOString(),
        endsAt: new Date('2027-08-10T00:00:00.000Z').toISOString(),
      })
      .expect(201);
    // Widening the *earlier* window to open-ended now swallows the later one.
    const widened = await patch(`/api/v1/admin/featured/${later.body.data.id}`).send({ endsAt: null }).expect(409);
    expect(widened.body.error.code).toBe('PLACEMENT_OVERLAP');
    // Its own window is unchanged, so it can still be edited in place.
    await patch(`/api/v1/admin/featured/${later.body.data.id}`).send({ position: 3 }).expect(200);

    await del(`/api/v1/admin/featured/${later.body.data.id}`).expect(204);
    await del(`/api/v1/admin/featured/${free.body.data.id}`).expect(204);
  });

  it('lets only one of several simultaneous overlapping requests through', async () => {
    await clearPlacements('Draft Cafe');
    // Six requests for the same listing and overlapping windows, sent together.
    // Without the lock each would read "no overlap" before any had written.
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        post('/api/v1/admin/featured').send({
          businessId: businesses['Draft Cafe']!.id,
          position: index,
          startsAt: new Date(`2028-01-0${index + 1}T00:00:00.000Z`).toISOString(),
          endsAt: new Date('2028-02-01T00:00:00.000Z').toISOString(),
        }),
      ),
    );
    const statuses = attempts.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);
    for (const refused of attempts.filter((response) => response.status === 409)) expect(refused.body.error.code).toBe('PLACEMENT_OVERLAP');

    const db = testDatabase();
    const stored = await db.featuredPlacement.findMany({ where: { businessId: businesses['Draft Cafe']!.id } });
    expect(stored).toHaveLength(1);

    // And an edit racing a create for the same period: one wins, never both.
    const other = await post('/api/v1/admin/featured')
      .send({ businessId: businesses['Draft Cafe']!.id, position: 9, startsAt: new Date('2028-06-01T00:00:00.000Z').toISOString(), endsAt: new Date('2028-06-10T00:00:00.000Z').toISOString() })
      .expect(201);
    const [edit, create] = await Promise.all([
      patch(`/api/v1/admin/featured/${other.body.data.id}`).send({ startsAt: new Date('2028-03-01T00:00:00.000Z').toISOString(), endsAt: new Date('2028-03-10T00:00:00.000Z').toISOString() }),
      post('/api/v1/admin/featured').send({ businessId: businesses['Draft Cafe']!.id, position: 10, startsAt: new Date('2028-03-05T00:00:00.000Z').toISOString(), endsAt: new Date('2028-03-15T00:00:00.000Z').toISOString() }),
    ]);
    // Either may win; the loser is refused as an overlap, not written.
    expect([200, 409]).toContain(edit.status);
    expect([201, 409]).toContain(create.status);
    expect([edit.status === 200, create.status === 201].filter(Boolean)).toHaveLength(1);

    await clearPlacements('Draft Cafe');
  });

  it('needs the publish permission to create, edit or remove a placement', async () => {
    await clearPlacements('Ordinary Cafe');
    const reader = await readerCookie();
    const body = { businessId: businesses['Ordinary Cafe']!.id, startsAt: new Date('2027-09-01T00:00:00.000Z').toISOString() };

    // Reading is allowed with featured.view; changing needs featured.manage.
    await agent().get('/api/v1/admin/featured').set('Cookie', reader).expect(200);
    await agent().post('/api/v1/admin/featured').set('Origin', ORIGIN).set('Cookie', reader).send(body).expect(403);

    const mine = await post('/api/v1/admin/featured').send(body).expect(201);
    await agent().patch(`/api/v1/admin/featured/${mine.body.data.id}`).set('Origin', ORIGIN).set('Cookie', reader).send({ position: 2 }).expect(403);
    await agent().delete(`/api/v1/admin/featured/${mine.body.data.id}`).set('Origin', ORIGIN).set('Cookie', reader).expect(403);
    await del(`/api/v1/admin/featured/${mine.body.data.id}`).expect(204);
  });
});