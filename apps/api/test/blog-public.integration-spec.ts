import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { CaptchaPort, type CaptchaResult } from '../src/common/captcha/captcha.port.js';
import { RedisService } from '../src/redis/redis.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

class PassCaptcha extends CaptchaPort {
  readonly configured = true;
  async verify(token: string | undefined): Promise<CaptchaResult> {
    return token === 'valid-token' ? { ok: true } : { ok: false, reason: 'invalid' };
  }
}

describe('Public blog and comments (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  const agent = () => request(app.getHttpServer());
  const admin = (req: request.Test) => req.set('Origin', ORIGIN).set('Cookie', cookie);
  const ids: Record<string, string> = {};
  let seq = 0;
  const key = () => `comment-key-${Date.now()}-${seq++}`;
  const comment = (over: Record<string, unknown> = {}) => ({ displayName: 'Sam Reader', email: 'sam@example.com', text: 'Great guide, thanks for the tips.', acknowledged: true, captchaToken: 'valid-token', ...over });
  const clearLimits = async () => {
    const redis = app.get(RedisService);
    await redis.ensureConnected();
    const keys = await redis.client.keys('ms:public:*');
    if (keys.length > 0) await redis.client.del(...keys.map((k) => k.replace(/^ms:/, '')));
  };
  const body = 'Melbourne laneways hide small operators worth finding. '.repeat(8);

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp({ overrides: [{ token: CaptchaPort, useValue: new PassCaptcha() }] });
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.200').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;

    ids.author = (await admin(agent().post('/api/v1/admin/authors')).send({ displayName: 'Alex Editor', bio: 'Writes about Melbourne.' }).expect(201)).body.data.id;
    ids.guides = (await admin(agent().post('/api/v1/admin/blog-categories')).send({ name: 'City guides', landingContent: '## City guides\n\nOur guides to the city.' }).expect(201)).body.data.id;
    ids.news = (await admin(agent().post('/api/v1/admin/blog-categories')).send({ name: 'News' }).expect(201)).body.data.id;
    ids.coffee = (await admin(agent().post('/api/v1/admin/blog-tags')).send({ name: 'Coffee', landingContent: 'Everything coffee in Adelaide.' }).expect(201)).body.data.id;
    ids.thin = (await admin(agent().post('/api/v1/admin/blog-tags')).send({ name: 'Thin tag' }).expect(201)).body.data.id;

    const make = async (title: string, categoryId: string, tagIds: string[], publish: boolean, commentsEnabled = true) => {
      const post = (await admin(agent().post('/api/v1/admin/posts')).send({ title, excerpt: `${title} — a short summary for the index page.`, bodyMarkdown: body, authorId: ids.author, categoryId, tagIds, commentsEnabled }).expect(201)).body.data;
      if (publish) await admin(agent().post(`/api/v1/admin/posts/${post.id}/publish`)).send({ expectedVersion: post.version }).expect(200);
      return post.id as string;
    };
    ids.main = await make('Where to find laneway coffee', ids.guides, [ids.coffee], true);
    ids.second = await make('A weekend in Carlton', ids.guides, [], true);
    ids.third = await make('Coffee roasters to watch', ids.news, [ids.coffee], true);
    ids.closed = await make('Comments are closed here', ids.news, [], true, false);
    ids.draft = await make('Still being written', ids.news, [], false);
    // Deterministic order for the index.
    const db = testDatabase();
    const stamps: [string, string][] = [[ids.main, '2026-04-01'], [ids.second, '2026-03-01'], [ids.third, '2026-02-01'], [ids.closed, '2026-01-01']];
    for (const [id, date] of stamps) await db.post.update({ where: { id }, data: { publishedAt: new Date(`${date}T00:00:00Z`) } });
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await clearLimits();
    await app.close();
    await closeTestDatabase();
  });

  beforeEach(clearLimits);

  it('lists published articles newest first with filters and a 12-per-page default', async () => {
    const res = await agent().get('/api/v1/posts').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    expect(res.body.data.map((p: { title: string }) => p.title)).toEqual(['Where to find laneway coffee', 'A weekend in Carlton', 'Coffee roasters to watch', 'Comments are closed here']);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 12, total: 4 });
    expect(JSON.stringify(res.body)).not.toContain('Still being written');
    expect((await agent().get('/api/v1/posts?category=city-guides').expect(200)).body.meta.total).toBe(2);
    expect((await agent().get('/api/v1/posts?tag=coffee').expect(200)).body.meta.total).toBe(2);
    expect((await agent().get('/api/v1/posts?q=carlton').expect(200)).body.meta.total).toBe(1);
    expect((await agent().get('/api/v1/posts?category=unknown-slug').expect(200)).body.meta.total).toBe(0);
    await agent().get('/api/v1/posts?pageSize=200').expect(400);
    const page2 = await agent().get('/api/v1/posts?pageSize=2&page=2').expect(200);
    expect(page2.body.data.map((p: { title: string }) => p.title)).toEqual(['Coffee roasters to watch', 'Comments are closed here']);
  });

  it('serves a published article with byline, tags and related articles, and hides drafts', async () => {
    const res = await agent().get('/api/v1/posts/where-to-find-laneway-coffee').expect(200);
    const post = res.body.data;
    expect(post).toMatchObject({
      title: 'Where to find laneway coffee',
      author: { displayName: 'Alex Editor', slug: 'alex-editor' },
      category: { name: 'City guides', slug: 'city-guides' },
      tags: [{ name: 'Coffee', slug: 'coffee' }],
      commentsEnabled: true,
      approvedCommentCount: 0,
    });
    expect(post.body).toContain('<p>');
    // Same category first, then shared tags; never itself or unpublished content.
    expect(post.related.map((r: { title: string }) => r.title)).toEqual(['A weekend in Carlton', 'Coffee roasters to watch']);
    expect(post.related.length).toBeLessThanOrEqual(4);
    expect(JSON.stringify(post)).not.toContain('Still being written');
    await agent().get('/api/v1/posts/still-being-written').expect(404);
    await agent().get('/api/v1/posts/no-such-article').expect(404);
  });

  it('exposes editorial taxonomy with published counts and landing content', async () => {
    const categories = (await agent().get('/api/v1/blog-categories').expect(200)).body.data;
    expect(categories.find((c: { slug: string }) => c.slug === 'city-guides')).toMatchObject({ postCount: 2, landingContent: expect.stringContaining('<h2>City guides</h2>') });
    const tags = (await agent().get('/api/v1/tags').expect(200)).body.data;
    expect(tags.find((t: { slug: string }) => t.slug === 'coffee')).toMatchObject({ postCount: 2 });
    // A tag without landing content is the "thin" case the web layer marks noindex.
    expect(tags.find((t: { slug: string }) => t.slug === 'thin-tag')).toMatchObject({ postCount: 0, landingContent: null });
  });

  it('accepts comments as pending, rejects closed or unpublished articles, and replays idempotently', async () => {
    const res = await agent().post(`/api/v1/posts/${ids.main}/comments`).set('Idempotency-Key', key()).send(comment()).expect(201);
    expect(res.body.data).toMatchObject({ status: 'pending', message: 'Submitted for moderation' });
    const db = testDatabase();
    const row = await db.comment.findFirstOrThrow({ where: { postId: ids.main } });
    ids.comment = row.id;
    expect(row.status).toBe('pending');
    expect(row.privateEmailEncrypted).toMatch(/^v1:/);
    expect(row.privateEmailEncrypted).not.toContain('sam@example.com');

    const closed = await agent().post(`/api/v1/posts/${ids.closed}/comments`).set('Idempotency-Key', key()).send(comment()).expect(409);
    expect(closed.body.error.code).toBe('COMMENTS_CLOSED');
    await agent().post(`/api/v1/posts/${ids.draft}/comments`).set('Idempotency-Key', key()).send(comment()).expect(404);
    await agent().post(`/api/v1/posts/${ids.main}/comments`).set('Idempotency-Key', key()).send(comment({ acknowledged: false })).expect(400);
    await agent().post(`/api/v1/posts/${ids.main}/comments`).set('Idempotency-Key', key()).send(comment({ text: 'x' })).expect(400);
    await agent().post(`/api/v1/posts/${ids.main}/comments`).set('Idempotency-Key', key()).send(comment({ website: 'http://spam.example' })).expect(400);
    await agent().post(`/api/v1/posts/${ids.main}/comments`).set('Idempotency-Key', key()).send(comment({ captchaToken: 'nope' })).expect(400);
    await agent().post(`/api/v1/posts/${ids.main}/comments`).send(comment()).expect(400); // no key

    const idem = key();
    const first = await agent().post(`/api/v1/posts/${ids.main}/comments`).set('Idempotency-Key', idem).send(comment({ text: 'A second thought about the guide.' })).expect(201);
    const replay = await agent().post(`/api/v1/posts/${ids.main}/comments`).set('Idempotency-Key', idem).send(comment({ text: 'A second thought about the guide.' })).expect(201);
    expect(replay.body).toEqual(first.body);
    expect(await db.comment.count({ where: { postId: ids.main } })).toBe(2);

    // Pending comments are invisible publicly and do not count.
    expect((await agent().get(`/api/v1/posts/${ids.main}/comments`).expect(200)).body).toMatchObject({ data: [], meta: { total: 0 } });
    expect((await agent().get('/api/v1/posts/where-to-find-laneway-coffee').expect(200)).body.data.approvedCommentCount).toBe(0);
  });

  it('moderates comments with the review rules and keeps counts correct', async () => {
    await agent().get('/api/v1/admin/comments').expect(401);
    const list = await admin(agent().get(`/api/v1/admin/comments?status=pending&postId=${ids.main}`)).expect(200);
    expect(list.body.meta.total).toBe(2);
    // The queue identifies a commenter without printing their address in full.
    expect(list.body.data[0]).toMatchObject({ postTitle: 'Where to find laneway coffee' });
    expect(list.body.data[0].email).not.toBe('sam@example.com');
    expect(list.body.data[0].email).toMatch(/@example\.com$/);
    const target = list.body.data.find((c: { id: string }) => c.id === ids.comment)!;
    await admin(agent().post(`/api/v1/admin/comments/${ids.comment}/reject`)).send({ expectedVersion: target.version }).expect(400); // reason required
    const approved = await admin(agent().post(`/api/v1/admin/comments/${ids.comment}/approve`)).send({ expectedVersion: target.version }).expect(200);
    expect(approved.body.data.status).toBe('approved');
    await admin(agent().post(`/api/v1/admin/comments/${ids.comment}/approve`)).send({ expectedVersion: approved.body.data.version }).expect(409);

    const publicList = await agent().get(`/api/v1/posts/${ids.main}/comments`).expect(200);
    expect(publicList.body.data).toEqual([{ id: ids.comment, displayName: 'Sam Reader', text: 'Great guide, thanks for the tips.', redacted: false, createdAt: expect.any(String), parentId: null, staff: false, replies: [] }]);
    expect((await agent().get('/api/v1/posts/where-to-find-laneway-coffee').expect(200)).body.data.approvedCommentCount).toBe(1);

    const redacted = await admin(agent().patch(`/api/v1/admin/comments/${ids.comment}/redaction`)).send({ expectedVersion: approved.body.data.version, publicText: 'Great guide.', reason: 'Removed a personal detail' }).expect(200);
    expect(redacted.body.data.originalText).toBe('Great guide, thanks for the tips.');
    expect((await agent().get(`/api/v1/posts/${ids.main}/comments`).expect(200)).body.data[0]).toMatchObject({ text: 'Great guide.', redacted: true });

    const rejected = await admin(agent().post(`/api/v1/admin/comments/${ids.comment}/reject`)).send({ expectedVersion: redacted.body.data.version, reason: 'Off topic after all' }).expect(200);
    expect(rejected.body.data.status).toBe('rejected');
    expect((await agent().get(`/api/v1/posts/${ids.main}/comments`).expect(200)).body.meta.total).toBe(0);
    expect((await agent().get('/api/v1/posts/where-to-find-laneway-coffee').expect(200)).body.data.approvedCommentCount).toBe(0);
    const db = testDatabase();
    const actions = (await db.auditLog.findMany({ where: { targetId: ids.comment }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['comment.submitted', 'comment.approve', 'comment.redact', 'comment.reject']);
  });

  it('accepts an abuse report against an approved comment and requires exactly one target', async () => {
    const db = testDatabase();
    const approved = await admin(agent().post(`/api/v1/admin/comments/${ids.comment}/approve`)).send({ expectedVersion: (await db.comment.findUniqueOrThrow({ where: { id: ids.comment } })).version }).expect(200);
    expect(approved.body.data.status).toBe('approved');
    const report = await agent().post('/api/v1/reports').set('Idempotency-Key', key()).send({ commentId: ids.comment, reason: 'offensive', captchaToken: 'valid-token' }).expect(201);
    expect(report.body.data.status).toBe('received');
    const row = await db.abuseReport.findFirstOrThrow({ where: { commentId: ids.comment } });
    expect(row.reviewId).toBeNull();
    expect(row.targetSnapshot).toContain('Great guide.');
    await agent().post('/api/v1/reports').set('Idempotency-Key', key()).send({ reason: 'spam', captchaToken: 'valid-token' }).expect(400);
    await agent().post('/api/v1/reports').set('Idempotency-Key', key()).send({ reviewId: 'r1', commentId: 'c1', reason: 'spam', captchaToken: 'valid-token' }).expect(400);
    const adminList = await admin(agent().get('/api/v1/admin/reports?status=open')).expect(200);
    expect(adminList.body.data[0]).toMatchObject({ targetType: 'comment', commentId: ids.comment, reviewId: null, targetStatus: 'approved' });
    const flagged = await admin(agent().get('/api/v1/admin/comments?reported=true')).expect(200);
    expect(flagged.body.meta.total).toBe(1);

    // Reading a commenter's whole address is its own step, and it is recorded.
    const revealed = await admin(agent().get(`/api/v1/admin/comments/${ids.comment}/email`)).expect(200);
    expect(revealed.body.data.email).toBe('sam@example.com');
    expect(await db.auditLog.count({ where: { action: 'comment.email.reveal', targetId: ids.comment } })).toBe(1);
  });
});
