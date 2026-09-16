import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

describe('Blog editorial core (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  let writerCookie: string;
  let authorId: string;
  let categoryId: string;
  let tagId: string;
  const agent = () => request(app.getHttpServer());
  const admin = (req: request.Test, c = cookie) => req.set('Origin', ORIGIN).set('Cookie', c);
  const body = 'Adelaide laneways are full of small operators. '.repeat(8);
  const login = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.190');
    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'post_writer', name: 'Writer', description: 'test' } });
    // What the retired posts.write carried over to (change log 1.13).
    const perms = await db.permission.findMany({ where: { key: { in: ['posts.view', 'posts.create', 'posts.update', 'authors.view', 'blog_categories.view', 'blog_tags.view'] } } });
    await db.rolePermission.createMany({ data: perms.map((perm) => ({ roleId: role.id, permissionId: perm.id })) });
    await seedSuperAdmin(app, { email: 'writer@example.com', password: 'writer-password-12345', displayName: 'Writer' });
    const writer = await db.adminUser.findUniqueOrThrow({ where: { email: 'writer@example.com' } });
    await db.adminRole.deleteMany({ where: { adminId: writer.id } });
    await db.adminRole.create({ data: { adminId: writer.id, roleId: role.id } });
    writerCookie = await login('writer@example.com', 'writer-password-12345', '203.0.113.191');

    authorId = (await admin(agent().post('/api/v1/admin/authors')).send({ displayName: 'Alex Editor', bio: 'Writes about Adelaide.' }).expect(201)).body.data.id;
    categoryId = (await admin(agent().post('/api/v1/admin/blog-categories')).send({ name: 'City guides', landingContent: '## City guides\n\nOur guides to Adelaide.' }).expect(201)).body.data.id;
    tagId = (await admin(agent().post('/api/v1/admin/blog-tags')).send({ name: 'Coffee' }).expect(201)).body.data.id;
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  let postId: string;
  let version: number;

  it('creates authors and taxonomy with generated slugs and sanitised landing content', async () => {
    const author = (await admin(agent().get('/api/v1/admin/authors')).expect(200)).body.data[0];
    expect(author).toMatchObject({ displayName: 'Alex Editor', slug: 'alex-editor', active: true, postCount: 0 });
    const category = (await admin(agent().get('/api/v1/admin/blog-categories')).expect(200)).body.data[0];
    expect(category.slug).toBe('city-guides');
    expect(category.landingContent).toContain('<h2>City guides</h2>');
    const injected = await admin(agent().post('/api/v1/admin/blog-tags')).send({ name: 'Nightlife', landingContent: '<script>alert(1)</script>Nightlife in Adelaide.' }).expect(201);
    expect(injected.body.data.landingContent).not.toContain('<script');
    expect(injected.body.data.landingContent).toContain('Nightlife in Adelaide.');
    await agent().get('/api/v1/admin/authors').expect(401);
  });

  it('creates a draft, sanitises the body and never publishes automatically', async () => {
    const created = await admin(agent().post('/api/v1/admin/posts'))
      .send({ title: 'Best laneway coffee in Adelaide', excerpt: 'Where to find the best coffee in the laneways.', bodyMarkdown: `${body}\n\n<script>alert(1)</script>\n\nRead more at [example](https://example.com).`, authorId, categoryId, tagIds: [tagId] })
      .expect(201);
    postId = created.body.data.id;
    version = created.body.data.version;
    expect(created.body.data).toMatchObject({ slug: 'best-laneway-coffee-in-adelaide', status: 'draft', commentsEnabled: true, publicationBlockers: [] });
    expect(created.body.data.sanitizedBody).not.toContain('<script');
    expect(created.body.data.sanitizedBody).toContain('rel="noopener noreferrer nofollow"');
    expect(created.body.data.bodyMarkdown).toContain('<script>'); // the source is preserved verbatim
    await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Duplicate slug test', slug: 'best-laneway-coffee-in-adelaide', authorId, categoryId }).expect(409);
    await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Unknown author', authorId: 'nope', categoryId }).expect(400);
  });

  it('writes a summary from the opening text when the writer leaves it empty, and suggests a free address', async () => {
    const opening = 'Norwood has more independent cafés per street than anywhere else in the city.';
    // The summary ends at the last whole sentence that fits in 160 characters (deriveExcerpt, SRS 1.10 BLOG 002 (3)).
    const summary = `${opening} Each one roasts its own beans and bakes every morning.`;
    const created = await admin(agent().post('/api/v1/admin/posts'))
      .send({ title: 'Cafés of Norwood', excerpt: '', bodyFormat: 'html', bodyMarkdown: `<p>${opening} ${'Each one roasts its own beans and bakes every morning. '.repeat(6)}</p>`, authorId, categoryId })
      .expect(201);
    expect(created.body.data.excerpt).toBe(summary);
    // Emptying it again on an edit rewrites it from the current text.
    const cleared = await admin(agent().patch(`/api/v1/admin/posts/${created.body.data.id}`)).send({ expectedVersion: created.body.data.version, excerpt: '' }).expect(200);
    expect(cleared.body.data.excerpt).toBe(summary);
    const clash = await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Cafés of Norwood', slug: created.body.data.slug, authorId, categoryId }).expect(409);
    expect(clash.body.error.fields.slug[0]).toContain(`${created.body.data.slug}-2`);
  });

  it('blocks publication until every requirement is met and locks the slug afterwards', async () => {
    const thin = (await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Thin article', excerpt: 'short', bodyMarkdown: 'tiny', authorId, categoryId }).expect(201)).body.data;
    const blocked = await admin(agent().post(`/api/v1/admin/posts/${thin.id}/publish`)).send({ expectedVersion: thin.version }).expect(409);
    expect(blocked.body.error.code).toBe('PUBLICATION_BLOCKED');
    expect(blocked.body.error.fields.publication).toEqual(
      expect.arrayContaining(['Write a summary of at least 20 characters — 5 characters so far', 'Write at least 200 characters in the article — 4 characters so far']),
    );

    await admin(agent().post(`/api/v1/admin/posts/${postId}/publish`), writerCookie).send({ expectedVersion: version }).expect(403);
    const published = await admin(agent().post(`/api/v1/admin/posts/${postId}/publish`)).send({ expectedVersion: version }).expect(200);
    expect(published.body.data).toMatchObject({ status: 'published' });
    expect(published.body.data.firstPublishedAt).not.toBeNull();
    version = published.body.data.version;
    const db = testDatabase();
    expect(await db.outboxEvent.count({ where: { resourceId: postId, type: 'post.published' } })).toBe(1);
    const locked = await admin(agent().patch(`/api/v1/admin/posts/${postId}`)).send({ expectedVersion: version, slug: 'new-slug' }).expect(409);
    expect(locked.body.error.code).toBe('SLUG_LOCKED');
  });

  it('records a revision when a published article changes and keeps the first publication date', async () => {
    const db = testDatabase();
    const before = await db.post.findUniqueOrThrow({ where: { id: postId } });
    const updated = await admin(agent().patch(`/api/v1/admin/posts/${postId}`))
      .send({ expectedVersion: version, bodyMarkdown: `${body}\n\nUpdated with a new closing paragraph.`, revisionReason: 'Added closing paragraph' })
      .expect(200);
    version = updated.body.data.version;
    expect(updated.body.data.sanitizedBody).toContain('Updated with a new closing paragraph.');
    const revisions = (await admin(agent().get(`/api/v1/admin/posts/${postId}/revisions`)).expect(200)).body.data;
    expect(revisions[0]).toMatchObject({ version: before.version, reason: 'Added closing paragraph' });
    const after = await db.post.findUniqueOrThrow({ where: { id: postId } });
    expect(after.firstPublishedAt?.toISOString()).toBe(before.firstPublishedAt?.toISOString());
    const snapshot = await db.contentRevision.findFirstOrThrow({ where: { resourceId: postId } });
    expect(snapshot.sanitizedSnapshot).toBe(before.sanitizedBody);
    expect(await db.outboxEvent.count({ where: { resourceId: postId, type: 'post.updated' } })).toBe(1);
  });

  it('renders unsaved content without storing it, and serves a draft only through a live preview link', async () => {
    const db = testDatabase();
    const rendered = await admin(agent().post('/api/v1/admin/posts/preview-render'))
      .send({ title: 'Not saved yet', bodyFormat: 'html', bodyMarkdown: `<p>${'Unsaved words about Adelaide laneways. '.repeat(4)}</p><script>alert(1)</script>`, authorId, categoryId })
      .expect(200);
    expect(rendered.headers['x-robots-tag']).toContain('noindex');
    expect(rendered.body.data).toMatchObject({ title: 'Not saved yet', excerptGenerated: true, authorName: 'Alex Editor', noindex: true });
    expect(rendered.body.data.sanitizedBody).not.toContain('<script');
    expect(await db.post.count({ where: { title: 'Not saved yet' } })).toBe(0);
    await agent().post('/api/v1/admin/posts/preview-render').set('Origin', ORIGIN).send({}).expect(401);

    const draft = (await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Draft for preview link', excerpt: 'A draft that only a preview link can show.', bodyMarkdown: body, authorId, categoryId }).expect(201)).body.data;
    const link = await admin(agent().post(`/api/v1/admin/posts/${draft.id}/preview-link`)).send({}).expect(201);
    const token = String(link.body.data.path).split('/').pop()!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const shown = await agent().get(`/api/v1/preview/posts/${token}`).expect(200);
    expect(shown.body.data).toMatchObject({ id: draft.id, title: 'Draft for preview link', related: [] });
    expect(shown.headers['x-robots-tag']).toContain('noindex');
    expect(shown.headers['cache-control']).toContain('no-store');
    // The ordinary public read still refuses the draft.
    await agent().get(`/api/v1/posts/${draft.slug}`).expect(404);
    await agent().get('/api/v1/preview/posts/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA').expect(404);
    await agent().get('/api/v1/preview/posts/not-a-token').expect(404);

    // Ending the editor's session ends the link.
    const editor = await db.adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.email } });
    await db.adminSession.updateMany({ where: { adminId: editor.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'test' } });
    await agent().get(`/api/v1/preview/posts/${token}`).expect(404);
    cookie = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.192');
  });

  it('keeps autosaved work without touching the article, and restores an earlier version as a new one', async () => {
    const db = testDatabase();
    const draft = (await admin(agent().post('/api/v1/admin/posts')).send({ title: 'History article', excerpt: 'An article whose history is kept.', bodyFormat: 'html', bodyMarkdown: '<p>First words.</p>', authorId, categoryId }).expect(201)).body.data;

    // Autosave: private, repeatable, never a version change.
    await admin(agent().put(`/api/v1/admin/posts/${draft.id}/autosave`)).send({ title: 'History article', excerpt: 'x', bodyMarkdown: '<p>Typing…</p>', bodyFormat: 'html', baseVersion: draft.version }).expect(200);
    await admin(agent().put(`/api/v1/admin/posts/${draft.id}/autosave`)).send({ title: 'History article', excerpt: 'x', bodyMarkdown: '<p>Typing more…</p>', bodyFormat: 'html', baseVersion: draft.version }).expect(200);
    const kept = (await admin(agent().get(`/api/v1/admin/posts/${draft.id}/autosave`)).expect(200)).body.data;
    expect(kept).toMatchObject({ bodyMarkdown: '<p>Typing more…</p>', stale: false });
    expect((await db.post.findUniqueOrThrow({ where: { id: draft.id } })).version).toBe(draft.version);
    expect(await db.postAutosave.count({ where: { postId: draft.id } })).toBe(1);
    expect((await admin(agent().get(`/api/v1/admin/posts/${draft.id}/autosave`), writerCookie).expect(200)).body.data).toBeNull();

    // A save of changed text keeps the previous version (drafts too) and supersedes the autosave.
    const saved = (await admin(agent().patch(`/api/v1/admin/posts/${draft.id}`)).send({ expectedVersion: draft.version, bodyFormat: 'html', bodyMarkdown: '<p>Second words.</p>' }).expect(200)).body.data;
    expect(await db.postAutosave.count({ where: { postId: draft.id } })).toBe(0);
    const history = (await admin(agent().get(`/api/v1/admin/posts/${draft.id}/revisions`)).expect(200)).body.data;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ version: draft.version, actorName: expect.any(String) });
    const first = (await admin(agent().get(`/api/v1/admin/posts/${draft.id}/revisions/${history[0].id}`)).expect(200)).body.data;
    expect(first).toMatchObject({ bodySource: '<p>First words.</p>', bodyFormat: 'html', title: 'History article' });

    // Restore: stale versions refused; the current text becomes a version first.
    await admin(agent().post(`/api/v1/admin/posts/${draft.id}/revisions/${first.id}/restore`)).send({ expectedVersion: draft.version }).expect(409);
    const restored = (await admin(agent().post(`/api/v1/admin/posts/${draft.id}/revisions/${first.id}/restore`)).send({ expectedVersion: saved.version }).expect(200)).body.data;
    expect(restored.bodyMarkdown).toBe('<p>First words.</p>');
    expect(restored.version).toBe(saved.version + 1);
    const after = (await admin(agent().get(`/api/v1/admin/posts/${draft.id}/revisions`)).expect(200)).body.data;
    expect(after.map((r: { version: number }) => r.version)).toEqual([saved.version, draft.version]);
    expect(await db.auditLog.count({ where: { action: 'blog.post.revision.restore', targetId: draft.id } })).toBe(1);

    await admin(agent().delete(`/api/v1/admin/posts/${draft.id}/autosave`)).expect(204);
    await agent().get(`/api/v1/admin/posts/${draft.id}/autosave`).expect(401);
  });

  it('previews only for authorised admins and never publicly', async () => {
    const preview = await admin(agent().get(`/api/v1/admin/posts/${postId}/preview`)).expect(200);
    expect(preview.body.data).toMatchObject({ noindex: true, authorName: 'Alex Editor' });
    expect(preview.headers['cache-control']).toContain('no-store');
    expect(preview.headers['x-robots-tag']).toContain('noindex');
    await agent().get(`/api/v1/admin/posts/${postId}/preview`).expect(401);
    await agent().get(`/api/v1/posts/${postId}`).expect(404); // no public blog route exists yet
  });

  // Publication at the scheduled time is the worker's task; its behaviour is covered in apps/worker/src/scheduled-tasks.spec.ts.
  it('schedules in UTC and refuses past times', async () => {
    const db = testDatabase();
    const draft = (await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Spring festival guide', excerpt: 'What is on across the city this spring.', bodyMarkdown: body, authorId, categoryId }).expect(201)).body.data;
    const past = await admin(agent().post(`/api/v1/admin/posts/${draft.id}/schedule`)).send({ expectedVersion: draft.version, scheduledAt: '2020-01-01T00:00:00.000Z' }).expect(409);
    expect(past.body.error.fields.publication).toEqual(['Choose a time in the future']);
    // 2026-10-04 is the ACDT transition; 10:00 Adelaide is 23:30Z on the 3rd.
    const scheduledAt = '2026-10-03T23:30:00.000Z';
    const scheduled = await admin(agent().post(`/api/v1/admin/posts/${draft.id}/schedule`)).send({ expectedVersion: draft.version, scheduledAt }).expect(200);
    expect(scheduled.body.data).toMatchObject({ status: 'scheduled', scheduledAt, publishFailure: null });
    // The API itself publishes nothing on a timer any more.
    expect((await db.post.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('scheduled');
    // A refused scheduled publication is cleared by the next deliberate change.
    await db.post.update({ where: { id: draft.id }, data: { status: 'draft', scheduledAt: null, publishFailure: 'Choose an author', version: { increment: 1 } } });
    const refused = (await admin(agent().get(`/api/v1/admin/posts/${draft.id}`)).expect(200)).body.data;
    expect(refused.publishFailure).toBe('Choose an author');
    const rescheduled = await admin(agent().post(`/api/v1/admin/posts/${draft.id}/schedule`)).send({ expectedVersion: refused.version, scheduledAt }).expect(200);
    expect(rescheduled.body.data.publishFailure).toBeNull();
  });

  it('leaves a permanent redirect behind when a category or tag moves address', async () => {
    const db = testDatabase();
    const tag = (await admin(agent().post('/api/v1/admin/blog-tags')).send({ name: 'Rooftop bars' }).expect(201)).body.data;
    expect(tag.slug).toBe('rooftop-bars');
    const moved = await admin(agent().patch(`/api/v1/admin/blog-tags/${tag.id}`))
      .send({ name: 'Rooftop bars', slug: 'rooftops', expectedVersion: tag.version })
      .expect(200);
    expect(moved.body.data.slug).toBe('rooftops');
    // A tag has a public landing page, so the address it used to live at must
    // keep working for anyone who saved or linked it (SRS SEO 004).
    const redirect = await db.redirect.findUniqueOrThrow({ where: { sourcePath: '/blog/tag/rooftop-bars' } });
    expect(redirect).toMatchObject({ targetPath: '/blog/tag/rooftops', kind: 'permanent', resourceType: 'blog_tag', resourceId: tag.id });

    const category = (await admin(agent().post('/api/v1/admin/blog-categories')).send({ name: 'Day trips' }).expect(201)).body.data;
    await admin(agent().patch(`/api/v1/admin/blog-categories/${category.id}`)).send({ name: 'Day trips', slug: 'daytrips', expectedVersion: category.version }).expect(200);
    expect(await db.redirect.findUniqueOrThrow({ where: { sourcePath: '/blog/category/day-trips' } })).toMatchObject({ targetPath: '/blog/category/daytrips', resourceType: 'blog_category' });

    // Renaming without moving leaves no rule: there is nothing to redirect.
    const after = (await admin(agent().get('/api/v1/admin/blog-tags')).expect(200)).body.data.find((row: { id: string }) => row.id === tag.id);
    await admin(agent().patch(`/api/v1/admin/blog-tags/${tag.id}`)).send({ name: 'Rooftop drinking', expectedVersion: after.version }).expect(200);
    expect(await db.redirect.count({ where: { resourceId: tag.id } })).toBe(1);
  });

  it('prevents deactivating an author or category still used by a live article', async () => {
    const db = testDatabase();
    const author = await db.author.findUniqueOrThrow({ where: { id: authorId } });
    const blockedAuthor = await admin(agent().post(`/api/v1/admin/authors/${authorId}/deactivate`)).send({ expectedVersion: author.version }).expect(409);
    expect(blockedAuthor.body.error.code).toBe('TERM_IN_USE');
    const category = await db.blogCategory.findUniqueOrThrow({ where: { id: categoryId } });
    await admin(agent().post(`/api/v1/admin/blog-categories/${categoryId}/deactivate`)).send({ expectedVersion: category.version }).expect(409);
    const tag = await db.blogTag.findUniqueOrThrow({ where: { id: tagId } });
    await admin(agent().post(`/api/v1/admin/blog-tags/${tagId}/deactivate`)).send({ expectedVersion: tag.version }).expect(409);
  });

  it('archives and restores with the documented transitions and filters the list', async () => {
    const db = testDatabase();
    const current = await db.post.findUniqueOrThrow({ where: { id: postId } });
    await admin(agent().post(`/api/v1/admin/posts/${postId}/restore`)).send({ expectedVersion: current.version }).expect(409); // not archived
    const archived = await admin(agent().post(`/api/v1/admin/posts/${postId}/archive`)).send({ expectedVersion: current.version, reason: 'Superseded' }).expect(200);
    expect(archived.body.data.status).toBe('archived');
    await admin(agent().patch(`/api/v1/admin/posts/${postId}`)).send({ expectedVersion: archived.body.data.version, title: 'Edited while archived' }).expect(409);
    const restored = await admin(agent().post(`/api/v1/admin/posts/${postId}/restore`)).send({ expectedVersion: archived.body.data.version }).expect(200);
    expect(restored.body.data).toMatchObject({ status: 'draft', publishedAt: null });
    const list = await admin(agent().get('/api/v1/admin/posts?status=published&sort=publishedAt&order=desc')).expect(200);
    expect(list.body.data.every((p: { status: string }) => p.status === 'published')).toBe(true);
    const byTag = await admin(agent().get(`/api/v1/admin/posts?tagId=${tagId}`)).expect(200);
    expect(byTag.body.meta.total).toBe(1);
    const actions = (await db.auditLog.findMany({ where: { targetId: postId }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['blog.post.create', 'blog.post.publish', 'blog.post.update', 'blog.post.archive', 'blog.post.restore']);
  });
});
