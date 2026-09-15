import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';
import { RedisService } from '../src/redis/redis.service.js';

describe('Home settings and search suggestions (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  let readerCookie: string;
  const agent = () => request(app.getHttpServer());
  const admin = (req: request.Test, c = cookie) => req.set('Origin', ORIGIN).set('Cookie', c);
  const login = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };
  const clearRateKeys = async () => {
    const redis = app.get(RedisService);
    await redis.ensureConnected();
    // keyPrefix applies to commands but not to KEYS patterns/results (see clearThrottleKeys).
    const keys = await redis.client.keys('ms:public:suggestions:*');
    if (keys.length > 0) await redis.client.del(...keys.map((k) => k.replace(/^ms:/, '')));
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.160');
    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'settings_reader', name: 'Reader', description: 'test' } });
    const perm = await db.permission.findUniqueOrThrow({ where: { key: 'listings.read' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    await seedSuperAdmin(app, { email: 'settings.reader@example.com', password: 'reader-password-12345', displayName: 'Reader' });
    const reader = await db.adminUser.findUniqueOrThrow({ where: { email: 'settings.reader@example.com' } });
    await db.adminRole.deleteMany({ where: { adminId: reader.id } });
    await db.adminRole.create({ data: { adminId: reader.id, roleId: role.id } });
    readerCookie = await login('settings.reader@example.com', 'reader-password-12345', '203.0.113.161');

    const mk = async (path: string, body: object) => (await admin(agent().post(path)).send(body).expect(201)).body.data.id as string;
    const cafes = await mk('/api/v1/admin/categories', { name: 'Cafes' });
    await mk('/api/v1/admin/categories', { name: 'Cafeteria supplies', parentId: cafes });
    await mk('/api/v1/admin/services', { name: 'Specialty coffee', synonyms: ['cafe latte'] });
    await mk('/api/v1/admin/services', { name: 'Catering' });
    const inactive = await mk('/api/v1/admin/categories', { name: 'Cafes retired' });
    const inactiveRow = await db.category.findUniqueOrThrow({ where: { id: inactive } });
    await admin(agent().post(`/api/v1/admin/categories/${inactive}/deactivate`)).send({ expectedVersion: inactiveRow.version }).expect(200);
    const area = await mk('/api/v1/admin/areas', { name: 'Melbourne CBD', eligibilitySource: 'council list' });
    for (const name of ['Cafe Lumen', 'Cafeteria Nine', 'Draft Cafe']) {
      const b = (await admin(agent().post('/api/v1/admin/businesses')).send({ name, description: 'A listing used by the suggestion tests, long enough to publish.', primaryCategoryId: cafes, localAreaId: area, publicPhone: '03 9000 1111', eligibilitySource: 'council list', contentRightsReviewed: true }).expect(201)).body.data;
      if (name !== 'Draft Cafe') await admin(agent().post(`/api/v1/admin/businesses/${b.id}/publish`)).send({ expectedVersion: b.version, duplicateOverrideReason: 'distinct fixtures with similar names' }).expect(200);
    }
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await clearRateKeys();
    await app.close();
    await closeTestDatabase();
  });

  it('serves documented defaults before an admin saves anything', async () => {
    const publicHome = await agent().get('/api/v1/home').expect(200);
    expect(publicHome.headers['cache-control']).toBe('public, max-age=60');
    expect(publicHome.body.data).toEqual({ heroHeadline: 'Discover Adelaide businesses', heroPhrases: ['local services', 'places to eat', 'independent shops'], heroSlides: [] });
    expect(publicHome.body.data.counters).toBeUndefined();
    const adminView = await admin(agent().get('/api/v1/admin/settings/home')).expect(200);
    expect(adminView.body.data).toMatchObject({ version: 0, countersEnabled: false, updatedByAdminId: null });
  });

  it('requires settings.manage, validates, versions and audits changes', async () => {
    await agent().get('/api/v1/admin/settings/home').expect(401);
    await admin(agent().get('/api/v1/admin/settings/home'), readerCookie).expect(403);
    await admin(agent().put('/api/v1/admin/settings/home'), readerCookie).send({ expectedVersion: 0, heroHeadline: 'x', heroPhrases: ['a b', 'c d'], countersEnabled: false }).expect(403);

    const invalid = await admin(agent().put('/api/v1/admin/settings/home')).send({ expectedVersion: 0, heroHeadline: 'Discover Adelaide businesses', heroPhrases: ['only one'], countersEnabled: false }).expect(400);
    expect(invalid.body.error.fields.heroPhrases).toBeDefined();
    await admin(agent().put('/api/v1/admin/settings/home')).send({ expectedVersion: 0, heroHeadline: 'Discover Adelaide businesses', heroPhrases: ['cafes', 'CAFES'], countersEnabled: false }).expect(400);
    await admin(agent().put('/api/v1/admin/settings/home')).send({ expectedVersion: 0, heroHeadline: 'Discover Adelaide businesses', heroPhrases: ['a b', 'c d'], countersEnabled: false, extra: 1 }).expect(400);

    const saved = await admin(agent().put('/api/v1/admin/settings/home')).send({ expectedVersion: 0, heroHeadline: '  Discover   Adelaide businesses ', heroPhrases: [' local services ', 'places to eat', 'independent shops'], countersEnabled: true }).expect(200);
    expect(saved.body.data).toMatchObject({ version: 1, heroHeadline: 'Discover Adelaide businesses', heroPhrases: ['local services', 'places to eat', 'independent shops'], countersEnabled: true });
    await admin(agent().put('/api/v1/admin/settings/home')).send({ expectedVersion: 0, heroHeadline: 'Stale write', heroPhrases: ['a b', 'c d'], countersEnabled: false }).expect(409);

    const withCounters = await agent().get('/api/v1/home').expect(200);
    expect(withCounters.body.data.counters).toEqual({ businesses: 2, categories: 1, areas: 1 }); // published records only
    const db = testDatabase();
    const audit = await db.auditLog.findFirst({ where: { action: 'settings.home.update' } });
    expect(audit?.metadata).toMatchObject({ phrases: 3, countersEnabled: true });
    const reverted = await admin(agent().put('/api/v1/admin/settings/home')).send({ expectedVersion: 1, heroHeadline: 'Discover Adelaide businesses', heroPhrases: ['local services', 'places to eat'], countersEnabled: false }).expect(200);
    expect(reverted.body.data.version).toBe(2);
    expect((await agent().get('/api/v1/home').expect(200)).body.data.counters).toBeUndefined();
  });

  it('groups suggestions from active and published records, caps at eight and honours the minimum length', async () => {
    await clearRateKeys();
    const res = await agent().get('/api/v1/search/suggestions?q=  CAF ').expect(200);
    const { categories, services, businesses } = res.body.data;
    expect(categories.map((c: { label: string }) => c.label)).toEqual(['Cafes', 'Cafeteria supplies']); // inactive category excluded
    expect(services.map((s: { label: string; hint: string | null }) => [s.label, s.hint])).toEqual([['Specialty coffee', 'cafe latte']]); // matched via synonym
    expect(businesses.map((b: { label: string; hint: string | null }) => [b.label, b.hint])).toEqual([['Cafe Lumen', 'Melbourne CBD'], ['Cafeteria Nine', 'Melbourne CBD']]); // draft excluded
    expect(categories.length + services.length + businesses.length).toBeLessThanOrEqual(8);

    const short = await agent().get('/api/v1/search/suggestions?q=c').expect(200);
    expect(short.body.data).toEqual({ categories: [], services: [], businesses: [] });
    await agent().get('/api/v1/search/suggestions').expect(400);
    await agent().get(`/api/v1/search/suggestions?q=${'x'.repeat(121)}`).expect(400);
    const wildcard = await agent().get('/api/v1/search/suggestions?q=%25').expect(200);
    expect(wildcard.body.data.businesses).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/Draft Cafe|Cafes retired/);
  });

  it('applies a public rate ceiling with Retry-After', async () => {
    await clearRateKeys();
    let limited: request.Response | null = null;
    for (let i = 0; i < 34; i += 1) {
      const res = await agent().get('/api/v1/search/suggestions?q=cafe');
      if (res.status === 429) {
        limited = res;
        break;
      }
    }
    expect(limited).not.toBeNull();
    expect(limited!.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited!.headers['retry-after'])).toBeGreaterThan(0);
    await clearRateKeys();
    await agent().get('/api/v1/search/suggestions?q=cafe').expect(200);
  });
  it('manages the general settings: permissions, validation, versioning, audit and the public shell payload', async () => {
    // Nothing saved yet: the public payload still describes a usable shell.
    const before = await agent().get('/api/v1/site/settings').expect(200);
    expect(before.body.data).toMatchObject({ name: 'Adelaide Sphere', headerTopBarEnabled: false, social: [] });
    expect(before.body.data.contact).toEqual({ email: null, phone: null, websiteUrl: null, address: null });

    await agent().get('/api/v1/admin/settings/general').expect(401);
    await admin(agent().get('/api/v1/admin/settings/general'), readerCookie).expect(403);
    await admin(agent().put('/api/v1/admin/settings/general'), readerCookie).send({ expectedVersion: 0, applicationName: 'Nope' }).expect(403);

    // A development address would be a dead contact route on every page.
    const invalid = await admin(agent().put('/api/v1/admin/settings/general'))
      .send({ expectedVersion: 0, applicationName: 'Adelaide Sphere', supportEmail: 'listings@adelaidesphere.local', social: { facebook: 'https://evil.example/ms' } })
      .expect(400);
    expect(Object.keys(invalid.body.error.fields).sort()).toEqual(['social.facebook', 'supportEmail']);
    // Unknown fields are rejected by the DTO allowlist.
    await admin(agent().put('/api/v1/admin/settings/general')).send({ expectedVersion: 0, applicationName: 'Adelaide Sphere', unexpected: true }).expect(400);
    // Branding must reference an asset that exists and is processed.
    const missingMedia = await admin(agent().put('/api/v1/admin/settings/general')).send({ expectedVersion: 0, applicationName: 'Adelaide Sphere', logoMediaId: 'does-not-exist' }).expect(400);
    expect(missingMedia.body.error.fields.logoMediaId).toBeDefined();

    const saved = await admin(agent().put('/api/v1/admin/settings/general'))
      .send({
        expectedVersion: 0,
        applicationName: '  Melbourne   Sphere ',
        shortName: 'Sphere',
        tagline: 'Find local businesses across Adelaide',
        supportEmail: 'Listings@AdelaideSphere.com.au',
        supportPhone: '03 9000 0000',
        websiteUrl: 'https://adelaidesphere.com',
        address: 'Level 2, 100 King William Street\nAdelaide SA 5000',
        headerTopBarEnabled: true,
        social: { facebook: 'https://www.facebook.com/adelaidesphere', x: 'https://twitter.com/adelaidesphere', pinterest: 'https://www.pinterest.com.au/adelaidesphere' },
        copyrightText: '© {year} {name}. All rights reserved.',
        footerText: 'An independent directory for Adelaide, South Australia.',
      })
      .expect(200);
    expect(saved.body.data).toMatchObject({ applicationName: 'Adelaide Sphere', version: 1, supportEmail: 'listings@adelaidesphere.com.au' });
    expect(saved.body.data.supportPhoneDisplay).toEqual({ display: '03 9000 0000', telHref: 'tel:+61390000000' });

    // A second writer with the stale version is refused rather than overwriting.
    await admin(agent().put('/api/v1/admin/settings/general')).send({ expectedVersion: 0, applicationName: 'Stale write' }).expect(409);

    const publicPayload = await agent().get('/api/v1/site/settings').expect(200);
    expect(publicPayload.body.data).toMatchObject({
      name: 'Adelaide Sphere',
      shortName: 'Sphere',
      headerTopBarEnabled: true,
      footer: { copyrightText: '© {year} {name}. All rights reserved.', text: 'An independent directory for Adelaide, South Australia.' },
    });
    expect(publicPayload.body.data.contact).toEqual({
      email: 'listings@adelaidesphere.com.au',
      phone: { display: '03 9000 0000', telHref: 'tel:+61390000000' },
      websiteUrl: 'https://adelaidesphere.com/',
      address: 'Level 2, 100 King William Street\nAdelaide SA 5000',
    });
    // Platforms keep a fixed order and only configured ones are published.
    expect(publicPayload.body.data.social).toEqual([
      { platform: 'facebook', url: 'https://www.facebook.com/adelaidesphere' },
      { platform: 'x', url: 'https://twitter.com/adelaidesphere' },
      { platform: 'pinterest', url: 'https://www.pinterest.com.au/adelaidesphere' },
    ]);

    const db = testDatabase();
    const audit = await db.auditLog.findFirst({ where: { action: 'settings.general.update' }, orderBy: { createdAt: 'desc' } });
    expect(audit).toBeTruthy();
    // The audit records the shape of the change, never the values themselves.
    expect(audit?.metadata).toMatchObject({ headerTopBarEnabled: true, socialLinks: 3, hasSupportEmail: true, hasSupportPhone: true });
    expect(JSON.stringify(audit?.metadata)).not.toContain('adelaidesphere.com');

    // Clearing optional fields empties them rather than keeping the old value.
    const cleared = await admin(agent().put('/api/v1/admin/settings/general')).send({ expectedVersion: 1, applicationName: 'Adelaide Sphere', supportEmail: '', headerTopBarEnabled: false }).expect(200);
    expect(cleared.body.data).toMatchObject({ supportEmail: null, supportPhone: null, version: 2 });
    expect((await agent().get('/api/v1/site/settings').expect(200)).body.data.contact.email).toBeNull();
  });

  it('refuses to show a contact bar with nothing in it', async () => {
    const current = (await admin(agent().get('/api/v1/admin/settings/general')).expect(200)).body.data;
    const refused = await admin(agent().put('/api/v1/admin/settings/general')).send({ expectedVersion: current.version, applicationName: 'Adelaide Sphere', headerTopBarEnabled: true }).expect(400);
    expect(refused.body.error.fields.headerTopBarEnabled).toBeDefined();
  });
});
