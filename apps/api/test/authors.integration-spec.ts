import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/** Public author profiles (SRS BLOG 001/004, SEC 001). */
describe('Author profiles (integration)', () => {
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
    const login = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.200').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    cookie = ([] as string[]).concat(login.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('stores the whole profile, sanitises the biography and normalises links, topics and email', async () => {
    const created = await post('/api/v1/admin/authors')
      .send({
        displayName: 'Alex Editor',
        role: 'Food editor',
        shortBio: 'Writes about Melbourne food.',
        bio: '<h2>About</h2><p>Ten years covering the city.</p><script>alert(1)</script><p style="color:red">Styled</p>',
        pronouns: 'they/them',
        location: 'Fitzroy',
        publicEmail: '  Alex@Example.COM ',
        websiteUrl: 'https://alex.example/profile',
        expertise: ['  Coffee ', 'coffee', 'Markets'],
        links: [
          { kind: 'x', url: 'https://x.com/alexeditor' },
          { kind: 'website', url: 'https://alex.example', label: '  Portfolio  ' },
        ],
      })
      .expect(201);

    const author = created.body.data;
    expect(author).toMatchObject({
      displayName: 'Alex Editor',
      slug: 'alex-editor',
      role: 'Food editor',
      pronouns: 'they/them',
      location: 'Fitzroy',
      publicEmail: 'alex@example.com',
      websiteUrl: 'https://alex.example/profile',
      expertise: ['Coffee', 'Markets'],
      publishedPostCount: 0,
    });
    expect(author.bio).toContain('<h2>About</h2>');
    expect(author.bio).not.toContain('script');
    expect(author.bio).not.toContain('style=');
    expect(author.links).toEqual([
      { kind: 'x', url: 'https://x.com/alexeditor', label: null },
      { kind: 'website', url: 'https://alex.example/', label: 'Portfolio' },
    ]);

    const fetched = await agent().get(`/api/v1/admin/authors/${author.id}`).set('Cookie', cookie).expect(200);
    expect(fetched.body.data.links).toHaveLength(2);
  });

  it('rejects a link on the wrong network, an invalid email and an unusable image', async () => {
    const wrongHost = await post('/api/v1/admin/authors').send({ displayName: 'Wrong Host', links: [{ kind: 'instagram', url: 'https://example.com/me' }] }).expect(400);
    expect(wrongHost.body.error.fields['links.0.url']).toBeTruthy();

    const badEmail = await post('/api/v1/admin/authors').send({ displayName: 'Bad Email', publicEmail: 'not-an-email' }).expect(400);
    expect(badEmail.body.error.fields.publicEmail).toBeTruthy();

    const missingImage = await post('/api/v1/admin/authors').send({ displayName: 'No Image', imageMediaId: 'does-not-exist' }).expect(400);
    expect(missingImage.body.error.fields.imageMediaId).toBeTruthy();
  });

  it('replaces links on update, enforces the expected version and refuses to deactivate a credited author', async () => {
    const created = await post('/api/v1/admin/authors').send({ displayName: 'Version Author', links: [{ kind: 'x', url: 'https://x.com/one' }] }).expect(201);
    const { id, version } = created.body.data;

    const stale = await patch(`/api/v1/admin/authors/${id}`).send({ displayName: 'Version Author', expectedVersion: version + 5 }).expect(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');

    const updated = await patch(`/api/v1/admin/authors/${id}`)
      .send({ displayName: 'Version Author', expectedVersion: version, links: [{ kind: 'linkedin', url: 'https://linkedin.com/in/author' }], expertise: [] })
      .expect(200);
    expect(updated.body.data.links).toEqual([{ kind: 'linkedin', url: 'https://linkedin.com/in/author', label: null }]);
    expect(updated.body.data.expertise).toEqual([]);

    // An author credited on a live article cannot be deactivated (SRS BLOG 002).
    const categoryId = (await post('/api/v1/admin/blog-categories').send({ name: 'Guides' }).expect(201)).body.data.id;
    await post('/api/v1/admin/posts')
      .send({ title: 'A guide to the city', bodyMarkdown: 'Body text for the guide.', excerpt: 'A short guide to the city of Melbourne.', authorId: id, categoryId })
      .expect(201);
    const blocked = await post(`/api/v1/admin/authors/${id}/deactivate`).send({ expectedVersion: updated.body.data.version }).expect(409);
    expect(blocked.body.error.code).toBe('TERM_IN_USE');

    const db = testDatabase();
    const actions = (await db.auditLog.findMany({ where: { targetId: id }, orderBy: { createdAt: 'asc' } })).map((entry) => entry.action);
    expect(actions).toEqual(['blog.author.create', 'blog.author.update']);
  });

  it('remembers an administrator’s own default author, refuses an inactive one, and never exposes the link publicly', async () => {
    const put = (body: Record<string, unknown>) => agent().put('/api/v1/admin/authors/mine').set('Origin', ORIGIN).set('Cookie', cookie).send(body);
    expect((await agent().get('/api/v1/admin/authors/mine').set('Cookie', cookie).expect(200)).body.data).toEqual({ authorId: null, author: null });
    await agent().get('/api/v1/admin/authors/mine').expect(401);

    const mine = (await post('/api/v1/admin/authors').send({ displayName: 'House Byline' }).expect(201)).body.data;
    const chosen = await put({ authorId: mine.id }).expect(200);
    expect(chosen.body.data).toMatchObject({ authorId: mine.id, author: { id: mine.id, displayName: 'House Byline', active: true } });
    expect((await agent().get('/api/v1/admin/authors/mine').set('Cookie', cookie).expect(200)).body.data.authorId).toBe(mine.id);

    const retired = (await post('/api/v1/admin/authors').send({ displayName: 'Retired Byline' }).expect(201)).body.data;
    await post(`/api/v1/admin/authors/${retired.id}/deactivate`).send({ expectedVersion: retired.version }).expect(200);
    expect((await put({ authorId: retired.id }).expect(400)).body.error.fields.authorId).toBeTruthy();
    await put({ authorId: 'does-not-exist' }).expect(400);

    // The preference lives on the administrator; nothing about it reaches public author output.
    const publicPosts = await agent().get('/api/v1/posts').expect(200);
    expect(JSON.stringify(publicPosts.body)).not.toMatch(/defaultAuthor|adminUser/i);
    const adminAuthor = await agent().get(`/api/v1/admin/authors/${mine.id}`).set('Cookie', cookie).expect(200);
    expect(JSON.stringify(adminAuthor.body)).not.toMatch(/defaultAuthor|adminUser/i);
    expect(await testDatabase().auditLog.count({ where: { action: 'blog.author.default.set' } })).toBe(1);

    expect((await put({ authorId: null }).expect(200)).body.data).toEqual({ authorId: null, author: null });
  });
});
