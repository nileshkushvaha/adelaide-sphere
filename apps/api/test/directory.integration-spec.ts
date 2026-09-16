import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { SUPER_ADMIN_ROLE } from '../src/identity/permissions.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

describe('Business listings core (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  let readerCookie: string;
  let ids: { food: string; cafes: string; shopping: string; coffee: string; cbd: string; norwood: string };
  const agent = () => request(app.getHttpServer());
  const post = (path: string, c = cookie) => agent().post(path).set('Origin', ORIGIN).set('Cookie', c);
  const patch = (path: string, c = cookie) => agent().patch(path).set('Origin', ORIGIN).set('Cookie', c);
  const loginAs = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };
  const validBody = () => ({
    name: 'Little Collins Espresso',
    description: 'A neighbourhood espresso bar serving single-origin coffee and toasties since 2018.',
    primaryCategoryId: ids.cafes,
    secondaryCategoryIds: [ids.shopping],
    serviceIds: [ids.coffee],
    localAreaId: ids.cbd,
    publicPhone: '+61 3 9000 1234',
    publicUrl: 'https://littlecollins.example',
    address: { line1: '12 Peel St', suburb: 'Adelaide', postcode: '5000', latitude: -34.9235, longitude: 138.5979 },
    privateEnquiryEmail: 'Owner@LittleCollins.example',
    eligibilitySource: 'City of Adelaide suburb list, checked 2026-09-06',
    contentRightsReviewed: true,
  });

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.130');
    // A read-only role fixture: listings.read only (SRS RBAC 001 permission denial independent of the UI).
    const db = testDatabase();
    const readerRole = await db.role.create({ data: { key: 'listings_reader', name: 'Reader', description: 'test' } });
    const readPerm = await db.permission.findUniqueOrThrow({ where: { key: 'listings.read' } });
    await db.rolePermission.create({ data: { roleId: readerRole.id, permissionId: readPerm.id } });
    await seedSuperAdmin(app, { email: 'reader@example.com', password: 'reader-password-12345', displayName: 'Reader' });
    const reader = await db.adminUser.findUniqueOrThrow({ where: { email: 'reader@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: SUPER_ADMIN_ROLE.key } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: reader.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: reader.id, roleId: readerRole.id } });
    readerCookie = await loginAs('reader@example.com', 'reader-password-12345', '203.0.113.131');
    // Taxonomy fixtures
    const mk = async (path: string, body: object) => (await post(path).send(body).expect(201)).body.data.id as string;
    const food = await mk('/api/v1/admin/categories', { name: 'Food & Drink' });
    const cafes = await mk('/api/v1/admin/categories', { name: 'Cafes', parentId: food });
    const shopping = await mk('/api/v1/admin/categories', { name: 'Shopping' });
    const coffee = await mk('/api/v1/admin/services', { name: 'Coffee', synonyms: ['espresso'] });
    const cbd = await mk('/api/v1/admin/areas', { name: 'Adelaide CBD', eligibilitySource: 'council list' });
    const norwood = await mk('/api/v1/admin/areas', { name: 'Norwood', eligibilitySource: 'council list' });
    ids = { food, cafes, shopping, coffee, cbd, norwood };
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('permissions: reader can list/read but not write or publish; anonymous gets 401', async () => {
    await agent().get('/api/v1/admin/businesses').expect(401);
    await agent().get('/api/v1/admin/businesses').set('Cookie', readerCookie).expect(200);
    const denied = await post('/api/v1/admin/businesses', readerCookie).send(validBody()).expect(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
  });

  let id: string;
  let version: number;

  it('creates a draft with nested address, joins, encrypted private email and computed blockers', async () => {
    const res = await post('/api/v1/admin/businesses').send(validBody()).expect(201);
    const b = res.body.data;
    id = b.id;
    version = b.version;
    expect(b).toMatchObject({ slug: 'little-collins-espresso', status: 'draft', secondaryCategoryIds: [ids.shopping], serviceIds: [ids.coffee], address: { line1: '12 Peel St', postcode: '5000', latitude: -34.9235 }, privateEnquiryEmail: 'owner@littlecollins.example', hasPrivateEnquiryEmail: true, publicationBlockers: [], duplicateWarnings: [], version: 1 });
    expect(b.eligibilityVerifiedAt).not.toBeNull();
    expect(b.contentRightsReviewedAt).not.toBeNull();
    const db = testDatabase();
    const row = await db.business.findUniqueOrThrow({ where: { id }, include: { rating: true } });
    expect(row.privateEnquiryEmailEncrypted).toMatch(/^v1:/);
    expect(row.privateEnquiryEmailEncrypted).not.toContain('littlecollins');
    expect(row.rating).toMatchObject({ approvedCount: 0, ratingSum: 0 });
    // Validation: unknown field, invalid postcode, inactive taxonomy, non-SA postcode
    // The year trading began is optional, bounded, and public once recorded.
    const nextYear = new Date().getFullYear() + 1;
    const future = await post('/api/v1/admin/businesses').send({ ...validBody(), name: 'Future Trader', establishedYear: nextYear }).expect(400);
    expect(future.body.error.fields.establishedYear[0]).toMatch(/between 1836 and/);
    const dated = await post('/api/v1/admin/businesses').send({ ...validBody(), name: 'Dated Trader', establishedYear: 1987 }).expect(201);
    expect(dated.body.data.establishedYear).toBe(1987);
    await post('/api/v1/admin/businesses').send({ ...validBody(), city: 'Sydney' }).expect(400);
    await post('/api/v1/admin/businesses').send({ ...validBody(), address: { line1: 'x', suburb: 'y', postcode: '2000' } }).expect(400);
    await post('/api/v1/admin/businesses').send({ ...validBody(), name: 'Other', primaryCategoryId: 'nope' }).expect(400);
    await post('/api/v1/admin/businesses').send({ ...validBody(), name: 'Other', publicUrl: 'ftp://x.example' }).expect(400);
  });

  it('reader sees the listing without the private enquiry email; list hides it too', async () => {
    const detail = await agent().get(`/api/v1/admin/businesses/${id}`).set('Cookie', readerCookie).expect(200);
    expect(detail.body.data).not.toHaveProperty('privateEnquiryEmail');
    expect(detail.body.data.hasPrivateEnquiryEmail).toBe(true);
    const list = await agent().get('/api/v1/admin/businesses?q=espresso&status=draft&categoryId=' + ids.shopping).set('Cookie', cookie).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id, primaryCategoryName: 'Cafes', localAreaName: 'Adelaide CBD', publishable: true, duplicateFlagged: false });
    expect(JSON.stringify(list.body)).not.toMatch(/littlecollins\.example|privateEnquiry/);
    await agent().get('/api/v1/admin/businesses?sort=privateEnquiryEmailEncrypted').set('Cookie', cookie).expect(400);
  });

  it('publication gate blocks an incomplete listing with field-level reasons, then publishes and sets firstPublishedAt once', async () => {
    const draft = (await post('/api/v1/admin/businesses').send({ name: 'Incomplete Co', description: 'Too short', primaryCategoryId: ids.cafes, localAreaId: ids.cbd }).expect(201)).body.data;
    expect(draft.publicationBlockers.length).toBeGreaterThanOrEqual(3);
    const blocked = await post(`/api/v1/admin/businesses/${draft.id}/publish`).send({ expectedVersion: 1 }).expect(409);
    expect(blocked.body.error.code).toBe('PUBLICATION_BLOCKED');
    expect(blocked.body.error.fields.publication).toEqual(expect.arrayContaining(['Description must be at least 40 characters', 'Adelaide eligibility must be verified (record the source)']));
    const denied = await post(`/api/v1/admin/businesses/${id}/publish`, readerCookie).send({ expectedVersion: version }).expect(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    const published = await post(`/api/v1/admin/businesses/${id}/publish`).send({ expectedVersion: version }).expect(200);
    expect(published.body.data).toMatchObject({ status: 'published', version: version + 1 });
    expect(published.body.data.firstPublishedAt).not.toBeNull();
    const first = published.body.data.firstPublishedAt;
    version = published.body.data.version;
    await post(`/api/v1/admin/businesses/${id}/publish`).send({ expectedVersion: version }).expect(409); // already published
    const unpublished = await post(`/api/v1/admin/businesses/${id}/unpublish`).send({ expectedVersion: version, reason: 'edit' }).expect(200);
    expect(unpublished.body.data).toMatchObject({ status: 'draft', publishedAt: null, firstPublishedAt: first });
    version = unpublished.body.data.version;
    const republished = await post(`/api/v1/admin/businesses/${id}/publish`).send({ expectedVersion: version }).expect(200);
    expect(republished.body.data.firstPublishedAt).toBe(first);
    version = republished.body.data.version;
  });

  it('stale edits get 409, published slugs are locked, archived listings cannot be edited, restore returns to draft', async () => {
    const staleRes = await patch(`/api/v1/admin/businesses/${id}`).send({ expectedVersion: version - 1, description: 'x'.repeat(50) }).expect(409);
    expect(staleRes.body.error.code).toBe('STALE_VERSION');
    const locked = await patch(`/api/v1/admin/businesses/${id}`).send({ expectedVersion: version, slug: 'new-slug' }).expect(409);
    expect(locked.body.error.code).toBe('SLUG_LOCKED');
    const edited = await patch(`/api/v1/admin/businesses/${id}`).send({ expectedVersion: version, publicEmail: 'Hello@Example.com', addressVisibility: 'areaOnly', serviceIds: [], secondaryCategoryIds: [] }).expect(200);
    expect(edited.body.data).toMatchObject({ publicEmail: 'hello@example.com', addressVisibility: 'areaOnly', serviceIds: [], secondaryCategoryIds: [], version: version + 1 });
    version = edited.body.data.version;
    const archived = await post(`/api/v1/admin/businesses/${id}/archive`).send({ expectedVersion: version, reason: 'closed' }).expect(200);
    expect(archived.body.data.status).toBe('archived');
    version = archived.body.data.version;
    await patch(`/api/v1/admin/businesses/${id}`).send({ expectedVersion: version, description: 'x'.repeat(50) }).expect(409);
    await post('/api/v1/admin/businesses').send({ ...validBody(), name: 'Another', slug: 'little-collins-espresso' }).expect(409); // slug unique even when archived
    const restored = await post(`/api/v1/admin/businesses/${id}/restore`).send({ expectedVersion: version }).expect(200);
    expect(restored.body.data).toMatchObject({ status: 'draft', archivedAt: null });
    version = restored.body.data.version;
    const db = testDatabase();
    const actions = (await db.auditLog.findMany({ where: { targetId: id }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['listing.create', 'listing.publish', 'listing.unpublish', 'listing.publish', 'listing.update', 'listing.archive', 'listing.restore']);
  });

  it('duplicate detection warns on create and requires an override reason to publish', async () => {
    const dup = (await post('/api/v1/admin/businesses').send({ ...validBody(), name: 'The Little Collins Espresso Pty Ltd', slug: 'little-collins-espresso-2' }).expect(201)).body.data;
    expect(dup.duplicateWarnings).toEqual([{ businessId: id, name: 'Little Collins Espresso', slug: 'little-collins-espresso', match: 'name_and_address' }]);
    const list = await agent().get('/api/v1/admin/businesses?q=little').set('Cookie', cookie).expect(200);
    expect(list.body.data.every((b: { duplicateFlagged: boolean }) => b.duplicateFlagged)).toBe(true);
    const suspected = await post(`/api/v1/admin/businesses/${dup.id}/publish`).send({ expectedVersion: 1 }).expect(409);
    expect(suspected.body.error.code).toBe('DUPLICATE_SUSPECTED');
    await post(`/api/v1/admin/businesses/${dup.id}/publish`).send({ expectedVersion: 1, duplicateOverrideReason: 'abc' }).expect(400); // too short
    const overridden = await post(`/api/v1/admin/businesses/${dup.id}/publish`).send({ expectedVersion: 1, duplicateOverrideReason: 'Different owner and floor; verified by phone' }).expect(200);
    expect(overridden.body.data).toMatchObject({ status: 'published', duplicateOverrideReason: 'Different owner and floor; verified by phone' });
    const db = testDatabase();
    const audit = await db.auditLog.findFirst({ where: { targetId: dup.id, action: 'listing.publish' } });
    expect(audit?.reason).toContain('Different owner');
  });

  it('searches the fields an administrator can see, and filters on a featured placement in force now', async () => {
    const db = testDatabase();
    const created = await post('/api/v1/admin/businesses')
      .send({ ...validBody(), name: 'Norwood Dumplings', publicPhone: '08 8111 2222', address: { line1: '9 The Parade', suburb: 'Norwood', postcode: '5067' } })
      .expect(201);
    const id = created.body.data.id as string;
    const list = async (query: string) => (await agent().get(`/api/v1/admin/businesses?${query}`).set('Cookie', cookie).expect(200)).body.data as { id: string; suburb: string | null; featuredNow: boolean }[];

    // Name, suburb, postcode and the phone as typed with spaces.
    for (const [label, query] of [['name', 'q=dumplings'], ['suburb', 'q=Norwood'], ['postcode', 'q=5067'], ['phone', 'q=8111 2222']] as const) {
      expect((await list(query)).map((row) => row.id), label).toContain(id);
    }
    expect((await list('q=5000')).map((row) => row.id)).not.toContain(id);
    expect((await list('q=dumplings'))[0]!.suburb).toBe('Norwood');

    // Featured is "in force now", not "has ever been featured".
    expect((await list('featured=yes')).map((row) => row.id)).not.toContain(id);
    const ended = await db.featuredPlacement.create({ data: { businessId: id, startsAt: new Date(Date.now() - 7_200_000), endsAt: new Date(Date.now() - 3_600_000), position: 0 } });
    expect((await list('featured=yes')).map((row) => row.id)).not.toContain(id);
    await db.featuredPlacement.update({ where: { id: ended.id }, data: { endsAt: null } });
    expect((await list('featured=yes')).map((row) => row.id)).toContain(id);
    expect((await list('featured=yes'))[0]!.featuredNow).toBe(true);
    expect((await list('featured=no')).map((row) => row.id)).not.toContain(id);
    await db.featuredPlacement.delete({ where: { id: ended.id } });

    // An unsupported sort key is a field error, not a silent default.
    await agent().get('/api/v1/admin/businesses?sort=publishedAt').set('Cookie', cookie).expect(400);
  });

  it('flags a duplicate name on the list without asking per row', async () => {
    // Same name, different addresses: the slug is unique, the normalised name is not.
    const first = await post('/api/v1/admin/businesses').send({ ...validBody(), name: 'Twin Bakery', slug: 'twin-bakery-norwood' }).expect(201);
    const second = await post('/api/v1/admin/businesses').send({ ...validBody(), name: 'Twin  bakery', slug: 'twin-bakery-unley' }).expect(201);
    const rows = (await agent().get('/api/v1/admin/businesses?q=twin').set('Cookie', cookie).expect(200)).body.data as { id: string; duplicateFlagged: boolean }[];
    expect(rows.filter((row) => [first.body.data.id, second.body.data.id].includes(row.id)).every((row) => row.duplicateFlagged)).toBe(true);

    // Archiving one leaves the other alone: a duplicate of an archived listing is not a duplicate.
    await post(`/api/v1/admin/businesses/${second.body.data.id}/archive`).send({ expectedVersion: second.body.data.version }).expect(200);
    const after = (await agent().get('/api/v1/admin/businesses?q=twin').set('Cookie', cookie).expect(200)).body.data as { id: string; duplicateFlagged: boolean }[];
    expect(after.find((row) => row.id === first.body.data.id)!.duplicateFlagged).toBe(false);
  });

  it('taxonomy terms used by active listings cannot be deactivated; archived references do not block', async () => {
    const db = testDatabase();
    const cafes = await db.category.findUniqueOrThrow({ where: { id: ids.cafes } });
    const blocked = await post(`/api/v1/admin/categories/${ids.cafes}/deactivate`).send({ expectedVersion: cafes.version }).expect(409);
    expect(blocked.body.error.code).toBe('TERM_IN_USE');
    const cbd = await db.localArea.findUniqueOrThrow({ where: { id: ids.cbd } });
    await post(`/api/v1/admin/areas/${ids.cbd}/deactivate`).send({ expectedVersion: cbd.version }).expect(409);
    // Create a listing in Norwood, archive it, then Norwood can be deactivated.
    const b = (await post('/api/v1/admin/businesses').send({ name: 'Norwood Only', description: 'x'.repeat(40), primaryCategoryId: ids.shopping, localAreaId: ids.norwood }).expect(201)).body.data;
    await post(`/api/v1/admin/businesses/${b.id}/archive`).send({ expectedVersion: 1 }).expect(200);
    const norwood = await db.localArea.findUniqueOrThrow({ where: { id: ids.norwood } });
    await post(`/api/v1/admin/areas/${ids.norwood}/deactivate`).send({ expectedVersion: norwood.version }).expect(200);
    // Inactive area cannot be chosen for new/edited listings.
    await post('/api/v1/admin/businesses').send({ ...validBody(), name: 'Nope', slug: 'nope', localAreaId: ids.norwood }).expect(400);
  });
});
