import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { SUPER_ADMIN_ROLE } from '../src/identity/permissions.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/** Navigation menus (SRS 1.9 MENU 001–006) against the real MySQL database. */
describe('Menus (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  let viewerCookie: string;
  const agent = () => request(app.getHttpServer());
  const admin = (method: 'get' | 'post' | 'put' | 'delete', path: string, as = cookie) => agent()[method](`/api/v1/admin/menus${path}`).set('Origin', ORIGIN).set('Cookie', as);
  const loginAs = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };
  const createMenu = async (name: string) => (await admin('post', '').send({ name }).expect(201)).body.data as { id: string; version: number };
  const location = async (key: string) => ((await admin('get', '/locations').expect(200)).body.data as { location: string; version: number; menuId: string | null }[]).find((row) => row.location === key)!;
  const publishedPage = (slug: string, status: 'published' | 'draft' = 'published') =>
    testDatabase().staticPage.create({ data: { slug, title: `Page ${slug}`, sanitizedBody: '<p>Body</p>', bodySource: '<p>Body</p>', status, publishedAt: status === 'published' ? new Date() : null } });

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.60');

    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'menu_viewer', name: 'Menu viewer', description: 'test' } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: 'website.menus.view' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await seedSuperAdmin(app, { email: 'menu-viewer@example.com', password: 'viewer-password-12345', displayName: 'Viewer' });
    const viewer = await db.adminUser.findUniqueOrThrow({ where: { email: 'menu-viewer@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: SUPER_ADMIN_ROLE.key } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: viewer.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: viewer.id, roleId: role.id } });
    viewerCookie = await loginAs('menu-viewer@example.com', 'viewer-password-12345', '203.0.113.61');
  });

  beforeEach(async () => {
    const db = testDatabase();
    await db.menuLocation.deleteMany({});
    await db.menu.deleteMany({});
    // The migration inserts the four locations; truncation between suites removes them.
    for (const key of ['primary', 'secondary', 'footer', 'footer_bottom'] as const) await db.menuLocation.create({ data: { location: key } });
  });

  afterEach(async () => {
    await testDatabase().staticPage.deleteMany({ where: { slug: { startsWith: 'menu-test-' } } });
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('refuses anonymous callers and callers without the manage permission', async () => {
    await agent().get('/api/v1/admin/menus').expect(401);
    await admin('get', '', viewerCookie).expect(200);
    await admin('get', '/locations', viewerCookie).expect(200);
    await admin('post', '', viewerCookie).send({ name: 'Nope' }).expect(403);
    await admin('get', '/link-sources?type=route', viewerCookie).expect(403);
  });

  it('saves a nested tree, resolves it publicly, and hides unpublished content with everything under it', async () => {
    const live = await publishedPage('menu-test-live');
    const draft = await publishedPage('menu-test-draft', 'draft');
    const menu = await createMenu('Main');
    const saved = await admin('put', `/${menu.id}`)
      .send({
        name: 'Main',
        expectedVersion: menu.version,
        items: [
          { key: 'a', parentKey: null, type: 'route', routeKey: 'blog' },
          { key: 'b', parentKey: 'a', type: 'page', refId: live.id, icon: 'info' },
          { key: 'c', parentKey: 'b', type: 'custom', url: 'https://example.com', label: 'Partner', openInNewTab: true },
          { key: 'd', parentKey: null, type: 'page', refId: draft.id },
          { key: 'e', parentKey: 'd', type: 'route', routeKey: 'about' },
        ],
      })
      .expect(200);
    expect(saved.body.data.version).toBe(2);
    expect(saved.body.data.items.map((row: { source: { state: string } }) => row.source.state)).toEqual(['ok', 'ok', 'ok', 'unpublished', 'ok']);

    const primary = await location('primary');
    await admin('put', '/locations/primary').send({ menuId: menu.id, expectedVersion: primary.version }).expect(200);

    const res = await agent().get('/api/v1/site/menus').expect(200);
    expect(res.headers['cache-control']).toContain('max-age=300');
    expect(res.body.data.primary).toEqual([
      expect.objectContaining({
        label: 'Blog',
        href: '/blog',
        children: [
          expect.objectContaining({
            label: 'Page menu-test-live',
            href: '/menu-test-live',
            icon: 'info',
            children: [expect.objectContaining({ label: 'Partner', external: true, newTab: true, rel: 'noopener noreferrer' })],
          }),
        ],
      }),
    ]);
  });

  it('writes the activity record and the cache purge in the same transaction as the save', async () => {
    const db = testDatabase();
    const menu = await createMenu('Footer');
    const footer = await location('footer');
    await admin('put', '/locations/footer').send({ menuId: menu.id, expectedVersion: footer.version }).expect(200);
    const outboxBefore = await db.outboxEvent.count();
    await admin('put', `/${menu.id}`)
      .send({ name: 'Footer', expectedVersion: 1, items: [{ key: 'h', parentKey: null, type: 'heading', label: 'Site' }, { key: 'x', parentKey: 'h', type: 'route', routeKey: 'home' }] })
      .expect(200);
    expect(await db.auditLog.count({ where: { action: 'website.menu.update', targetId: menu.id } })).toBe(1);
    expect(await db.outboxEvent.count()).toBeGreaterThan(outboxBefore);
  });

  it('refuses unsafe links, broken trees and references to records that do not exist, writing nothing', async () => {
    const menu = await createMenu('Checks');
    const save = (items: unknown[]) => admin('put', `/${menu.id}`).send({ name: 'Checks', expectedVersion: 1, items });

    const script = await save([{ key: 'a', parentKey: null, type: 'custom', label: 'x', url: 'javascript:alert(1)' }]).expect(400);
    expect(script.body.error.fields['items[0].url']).toBeTruthy();
    const orphan = await save([{ key: 'a', parentKey: 'missing', type: 'route', routeKey: 'home' }]).expect(400);
    expect(orphan.body.error.fields['items[0].parentKey']).toBeTruthy();
    const tooDeep = await save([
      { key: 'a', parentKey: null, type: 'route', routeKey: 'home' },
      { key: 'b', parentKey: 'a', type: 'route', routeKey: 'home' },
      { key: 'c', parentKey: 'b', type: 'route', routeKey: 'home' },
      { key: 'd', parentKey: 'c', type: 'route', routeKey: 'home' },
    ]).expect(400);
    expect(tooDeep.body.error.fields['items[3].parentKey']).toBeTruthy();
    const ghost = await save([{ key: 'a', parentKey: null, type: 'page', refId: 'cm000000000000000000000000' }]).expect(400);
    expect(ghost.body.error.fields['items[0].refId']).toBeTruthy();
    await save([{ key: 'a', parentKey: null, type: 'route', routeKey: 'home', icon: 'skull' }]).expect(400);

    const unchanged = (await admin('get', `/${menu.id}`).expect(200)).body.data;
    expect(unchanged).toMatchObject({ version: 1, items: [] });
  });

  it('refuses a stale save, a menu that does not fit its location, deleting an assigned menu and clearing the primary location', async () => {
    const menu = await createMenu('Nested');
    const items = [
      { key: 'a', parentKey: null, type: 'route', routeKey: 'home' },
      { key: 'b', parentKey: 'a', type: 'route', routeKey: 'blog' },
    ];
    await admin('put', `/${menu.id}`).send({ name: 'Nested', expectedVersion: 1, items }).expect(200);
    const stale = await admin('put', `/${menu.id}`).send({ name: 'Nested', expectedVersion: 1, items }).expect(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');

    const secondary = await location('secondary');
    const exceeds = await admin('put', '/locations/secondary').send({ menuId: menu.id, expectedVersion: secondary.version }).expect(400);
    expect(exceeds.body.error.code).toBe('MENU_EXCEEDS_LOCATION');

    const primary = await location('primary');
    await admin('put', '/locations/primary').send({ menuId: menu.id, expectedVersion: primary.version }).expect(200);
    const staleLocation = await admin('put', '/locations/primary').send({ menuId: menu.id, expectedVersion: primary.version }).expect(409);
    expect(staleLocation.body.error.code).toBe('STALE_VERSION');
    expect((await location('primary')).menuId).toBe(menu.id);
    const assigned = await admin('delete', `/${menu.id}`).expect(409);
    expect(assigned.body.error.code).toBe('MENU_ASSIGNED');
    const cleared = await admin('put', '/locations/primary').send({ menuId: null, expectedVersion: (await location('primary')).version }).expect(409);
    expect(cleared.body.error.code).toBe('LOCATION_REQUIRED');
  });

  it('keeps an item whose page is deleted, reports it missing to editors and hides it publicly', async () => {
    const page = await publishedPage('menu-test-gone');
    const menu = await createMenu('Legal');
    await admin('put', `/${menu.id}`).send({ name: 'Legal', expectedVersion: 1, items: [{ key: 'a', parentKey: null, type: 'page', refId: page.id }] }).expect(200);
    const bottom = await location('footer_bottom');
    await admin('put', '/locations/footer_bottom').send({ menuId: menu.id, expectedVersion: bottom.version }).expect(200);

    await testDatabase().staticPage.delete({ where: { id: page.id } });
    const detail = (await admin('get', `/${menu.id}`).expect(200)).body.data;
    expect(detail.items[0]).toMatchObject({ refId: null, source: { state: 'missing' } });
    expect((await agent().get('/api/v1/site/menus').expect(200)).body.data.footer_bottom).toEqual([]);
  });

  it('bounds the link-source search and accepts the largest permitted tree within the body limit', async () => {
    await admin('get', '/link-sources?type=page&pageSize=51').expect(400);
    await admin('get', '/link-sources?type=unknown').expect(400);
    const routes = await admin('get', '/link-sources?type=route&q=blog').expect(200);
    expect(routes.body.data).toEqual([expect.objectContaining({ id: 'blog', href: '/blog' })]);

    const menu = await createMenu('Largest');
    const items = Array.from({ length: 60 }, (_, index) => ({
      key: `${String(index).padStart(2, '0')}${'k'.repeat(62)}`,
      parentKey: null,
      type: 'custom',
      url: `https://example.com/${'p'.repeat(280)}`,
      label: 'L'.repeat(80),
      titleAttribute: 'T'.repeat(100),
      description: 'D'.repeat(120),
      icon: 'globe',
      style: 'link',
      openInNewTab: true,
      relNofollow: true,
    }));
    expect(Buffer.byteLength(JSON.stringify({ name: 'Largest', expectedVersion: 1, items }))).toBeLessThan(64 * 1024);
    await admin('put', `/${menu.id}`).send({ name: 'Largest', expectedVersion: 1, items }).expect(200);
    await admin('put', `/${menu.id}`).send({ name: 'Largest', expectedVersion: 2, items: [...items, { ...items[0], key: 'one-too-many' }] }).expect(400);
  });
});
