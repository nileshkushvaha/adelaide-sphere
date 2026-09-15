import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { CaptchaPort, CaptchaUnavailableError, type CaptchaResult } from '../src/common/captcha/captcha.port.js';
import { RedisService } from '../src/redis/redis.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/** Replaces Turnstile: accepts a known token, rejects others, and can simulate provider failure (SRS SEC 002/003). */
class TestCaptcha extends CaptchaPort {
  readonly configured = true;
  unavailable = false;
  lastAction: string | null = null;
  async verify(token: string | undefined, action: string): Promise<CaptchaResult> {
    this.lastAction = action;
    if (this.unavailable) throw new CaptchaUnavailableError();
    if (token === 'valid-token') return { ok: true };
    return { ok: false, reason: token ? 'invalid' : 'missing' };
  }
}

describe('Reviews, moderation and abuse reports (integration)', () => {
  let app: INestApplication;
  let captcha: TestCaptcha;
  let cookie: string;
  let readerCookie: string;
  let businessId: string;
  let otherBusinessId: string;
  const agent = () => request(app.getHttpServer());
  const admin = (req: request.Test, c = cookie) => req.set('Origin', ORIGIN).set('Cookie', c);
  let keySeq = 0;
  const key = () => `idem-key-${Date.now()}-${keySeq++}`;
  const submission = (over: Record<string, unknown> = {}) => ({
    rating: 5,
    displayName: 'Jo Visitor',
    email: 'jo@example.com',
    text: 'Excellent coffee and friendly staff every single morning this month.',
    acknowledged: true,
    captchaToken: 'valid-token',
    ...over,
  });
  const submit = (body: Record<string, unknown>, idem = key(), id = businessId) => agent().post(`/api/v1/businesses/${id}/reviews`).set('Idempotency-Key', idem).send(body);
  const clearLimits = async () => {
    const redis = app.get(RedisService);
    await redis.ensureConnected();
    const keys = await redis.client.keys('ms:public:*');
    if (keys.length > 0) await redis.client.del(...keys.map((k) => k.replace(/^ms:/, '')));
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    captcha = new TestCaptcha();
    app = await createIntegrationApp({ overrides: [{ token: CaptchaPort, useValue: captcha }] });
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.170').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'listings_only', name: 'Listings only', description: 'test' } });
    const perm = await db.permission.findUniqueOrThrow({ where: { key: 'listings.read' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    await seedSuperAdmin(app, { email: 'reviews.reader@example.com', password: 'reader-password-12345', displayName: 'Reader' });
    const reader = await db.adminUser.findUniqueOrThrow({ where: { email: 'reviews.reader@example.com' } });
    await db.adminRole.deleteMany({ where: { adminId: reader.id } });
    await db.adminRole.create({ data: { adminId: reader.id, roleId: role.id } });
    const readerRes = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.171').send({ email: 'reviews.reader@example.com', password: 'reader-password-12345' }).expect(200);
    readerCookie = ([] as string[]).concat(readerRes.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;

    const category = (await admin(agent().post('/api/v1/admin/categories')).send({ name: 'Cafes' }).expect(201)).body.data.id;
    const area = (await admin(agent().post('/api/v1/admin/areas')).send({ name: 'Melbourne CBD', eligibilitySource: 'council list' }).expect(201)).body.data.id;
    const make = async (name: string, publish: boolean) => {
      const b = (await admin(agent().post('/api/v1/admin/businesses')).send({ name, description: 'A listing used by the review tests, long enough to publish.', primaryCategoryId: category, localAreaId: area, publicPhone: '03 9000 2222', eligibilitySource: 'council list', contentRightsReviewed: true }).expect(201)).body.data;
      if (publish) await admin(agent().post(`/api/v1/admin/businesses/${b.id}/publish`)).send({ expectedVersion: b.version, duplicateOverrideReason: 'distinct review fixtures' }).expect(200);
      return b.id as string;
    };
    businessId = await make('Review Test Cafe', true);
    otherBusinessId = await make('Unpublished Cafe', false);
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await clearLimits();
    await app.close();
    await closeTestDatabase();
  });

  beforeEach(async () => {
    captcha.unavailable = false;
    await clearLimits();
  });

  let reviewId: string;

  it('accepts a valid submission as pending with a neutral receipt and keeps it out of public reads', async () => {
    const res = await submit(submission()).expect(201);
    expect(res.body.data).toEqual({ receiptId: expect.any(String), status: 'pending', message: 'Submitted for moderation' });
    expect(captcha.lastAction).toBe('review');
    const db = testDatabase();
    const row = await db.review.findFirstOrThrow({ where: { businessId } });
    reviewId = row.id;
    expect(row.status).toBe('pending');
    expect(row.privateEmailEncrypted).toMatch(/^v1:/);
    expect(row.privateEmailEncrypted).not.toContain('jo@example.com');
    expect(row.emailHash).toHaveLength(64);
    expect(row.submitterIpHash).toHaveLength(64);
    expect(row.acknowledgedVersion).toBe('2026-09-01');
    expect(res.body.data.receiptId).not.toBe(row.id);

    const publicList = await agent().get(`/api/v1/businesses/${businessId}/reviews`).expect(200);
    expect(publicList.body).toMatchObject({ data: [], meta: { total: 0 } });
    const detail = await agent().get('/api/v1/businesses/review-test-cafe').expect(200);
    expect(detail.body.data.rating).toBeNull();
    expect(JSON.stringify(publicList.body) + JSON.stringify(detail.body)).not.toMatch(/jo@example\.com|Excellent coffee/);
  });

  it('rejects invalid fields, missing acknowledgement, honeypots, bad captcha and unpublished targets', async () => {
    const bad = await submit(submission({ rating: 6, displayName: 'A', text: 'too short' })).expect(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(['displayName', 'rating', 'text']);
    await submit(submission({ acknowledged: false })).expect(400);
    await submit(submission({ website: 'http://spam.example' })).expect(400); // honeypot
    const captchaFail = await submit(submission({ captchaToken: 'nope' })).expect(400);
    expect(captchaFail.body.error.code).toBe('CAPTCHA_FAILED');
    await submit(submission({ extra: 'field' })).expect(400);
    await submit(submission(), key(), otherBusinessId).expect(404);
    await agent().post(`/api/v1/businesses/${businessId}/reviews`).send(submission()).expect(400); // no Idempotency-Key
    await agent().get(`/api/v1/businesses/${otherBusinessId}/reviews`).expect(404);
  });

  it('returns the original receipt on replay and refuses a reused key with a different body', async () => {
    const idem = key();
    const first = await submit(submission({ email: 'replay@example.com' }), idem).expect(201);
    const replay = await submit(submission({ email: 'replay@example.com' }), idem).expect(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.headers['idempotent-replay']).toBe('true');
    const conflict = await submit(submission({ email: 'replay@example.com', rating: 3 }), idem).expect(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    const db = testDatabase();
    expect(await db.review.count({ where: { businessId, displayName: 'Jo Visitor', emailHash: { not: undefined } } })).toBeGreaterThan(0);
    expect(await db.review.count({ where: { businessId } })).toBe(2); // the replay created nothing
  });

  it('fails safe when the verifier or limiter is unavailable, and enforces the per-IP ceiling', async () => {
    captcha.unavailable = true;
    const unavailable = await submit(submission()).expect(503);
    expect(unavailable.body.error.code).toBe('SERVICE_UNAVAILABLE');
    captcha.unavailable = false;
    let limited: request.Response | null = null;
    for (let i = 0; i < 8; i += 1) {
      const res = await submit(submission({ email: `burst${i}@example.com` }));
      if (res.status === 429) {
        limited = res;
        break;
      }
    }
    expect(limited).not.toBeNull();
    expect(limited!.body.error.code).toBe('RATE_LIMITED');
    await clearLimits();
  });

  it('flags a repeat submission from the same email for the same business', async () => {
    const db = testDatabase();
    await submit(submission({ email: 'repeat@example.com', text: 'First visit was good, the pastries were fresh and the staff helpful.' })).expect(201);
    await submit(submission({ email: 'Repeat@Example.com', text: 'Second visit, still good, though the queue was longer this time around.' })).expect(201);
    const rows = await db.review.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
    const repeats = rows.filter((r) => r.repeatFlagged);
    expect(repeats).toHaveLength(1);
    const flaggedList = await admin(agent().get('/api/v1/admin/reviews?repeatFlagged=true')).expect(200);
    expect(flaggedList.body.meta.total).toBe(1);
  });

  it('moderates with permission checks, aggregate updates that never double count, and audit entries', async () => {
    await agent().get('/api/v1/admin/reviews').expect(401);
    await admin(agent().get('/api/v1/admin/reviews'), readerCookie).expect(403);
    const list = await admin(agent().get(`/api/v1/admin/reviews?status=pending&businessId=${businessId}`)).expect(200);
    // Enough of the address to tell two reviewers apart, and no more.
    expect(list.body.data[0]).toMatchObject({ status: 'pending', businessName: 'Review Test Cafe', email: expect.stringContaining('\u2022') });
    const target = list.body.data.find((r: { id: string }) => r.id === reviewId);
    expect(target).toBeTruthy();

    await admin(agent().post(`/api/v1/admin/reviews/${reviewId}/reject`)).send({ expectedVersion: target.version }).expect(400); // reason required
    await admin(agent().post(`/api/v1/admin/reviews/${reviewId}/approve`), readerCookie).send({ expectedVersion: target.version }).expect(403);
    await admin(agent().post(`/api/v1/admin/reviews/${reviewId}/approve`)).send({ expectedVersion: target.version + 5 }).expect(409);

    const approved = await admin(agent().post(`/api/v1/admin/reviews/${reviewId}/approve`)).send({ expectedVersion: target.version }).expect(200);
    expect(approved.body.data).toMatchObject({ status: 'approved', moderatorAdminId: expect.any(String) });
    const db = testDatabase();
    expect(await db.businessRating.findUniqueOrThrow({ where: { businessId } })).toMatchObject({ approvedCount: 1, ratingSum: 5 });
    await admin(agent().post(`/api/v1/admin/reviews/${reviewId}/approve`)).send({ expectedVersion: approved.body.data.version }).expect(409); // already approved

    const publicList = await agent().get(`/api/v1/businesses/${businessId}/reviews`).expect(200);
    expect(publicList.body.data).toEqual([{ id: reviewId, displayName: 'Jo Visitor', rating: 5, text: expect.stringContaining('Excellent coffee'), redacted: false, createdAt: expect.any(String) }]);
    const detail = await agent().get('/api/v1/businesses/review-test-cafe').expect(200);
    expect(detail.body.data.rating).toEqual({ average: 5, count: 1 });

    const rejected = await admin(agent().post(`/api/v1/admin/reviews/${reviewId}/reject`)).send({ expectedVersion: approved.body.data.version, reason: 'Contains personal information' }).expect(200);
    expect(rejected.body.data.status).toBe('rejected');
    expect(await db.businessRating.findUniqueOrThrow({ where: { businessId } })).toMatchObject({ approvedCount: 0, ratingSum: 0 });
    expect((await agent().get(`/api/v1/businesses/${businessId}/reviews`).expect(200)).body.data).toEqual([]);

    const reapproved = await admin(agent().post(`/api/v1/admin/reviews/${reviewId}/approve`)).send({ expectedVersion: rejected.body.data.version }).expect(200);
    expect(await db.businessRating.findUniqueOrThrow({ where: { businessId } })).toMatchObject({ approvedCount: 1, ratingSum: 5 });
    const actions = (await db.auditLog.findMany({ where: { targetId: reviewId }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['review.submitted', 'review.approve', 'review.reject', 'review.approve']);
    reviewId = reapproved.body.data.id;
  });

  it('redacts the published text while preserving the original and the rating', async () => {
    const current = (await admin(agent().get(`/api/v1/admin/reviews/${reviewId}`)).expect(200)).body.data;
    const redacted = await admin(agent().patch(`/api/v1/admin/reviews/${reviewId}/redaction`)).send({ expectedVersion: current.version, publicText: 'Excellent coffee and friendly staff.', reason: 'Removed a named staff member' }).expect(200);
    expect(redacted.body.data).toMatchObject({ originalText: current.originalText, rating: current.rating, redactionReason: 'Removed a named staff member' });
    const publicRow = (await agent().get(`/api/v1/businesses/${businessId}/reviews`).expect(200)).body.data[0];
    expect(publicRow).toMatchObject({ text: 'Excellent coffee and friendly staff.', redacted: true });
    const restored = await admin(agent().patch(`/api/v1/admin/reviews/${reviewId}/redaction`)).send({ expectedVersion: redacted.body.data.version, publicText: null, reason: 'Restored after review' }).expect(200);
    expect(restored.body.data.publicText).toBeNull();
    expect((await agent().get(`/api/v1/businesses/${businessId}/reviews`).expect(200)).body.data[0].redacted).toBe(false);

    // The reviewer's whole address needs its own permission, and is recorded.
    const db = testDatabase();
    await admin(agent().get(`/api/v1/admin/reviews/${reviewId}/email`), readerCookie).expect(403);
    const revealed = await admin(agent().get(`/api/v1/admin/reviews/${reviewId}/email`)).expect(200);
    expect(revealed.body.data.email).toBe('jo@example.com');
    expect(await db.auditLog.count({ where: { action: 'review.email.reveal', targetId: reviewId } })).toBe(1);
  });

  it('handles abuse reports without disclosing targets or reporters', async () => {
    const report = await agent().post('/api/v1/reports').set('Idempotency-Key', key()).send({ reviewId, reason: 'privacy', details: 'Mentions my full name.', email: 'reporter@example.com', captchaToken: 'valid-token' }).expect(201);
    expect(report.body.data).toMatchObject({ status: 'received' });
    const db = testDatabase();
    const row = await db.abuseReport.findFirstOrThrow({ where: { reviewId } });
    expect(row.targetSnapshot).toContain('Excellent coffee');
    expect(row.reporterEmailEncrypted).toMatch(/^v1:/);

    // Unknown or unapproved targets get the same neutral answer and create nothing.
    const neutral = await agent().post('/api/v1/reports').set('Idempotency-Key', key()).send({ reviewId: 'does-not-exist', reason: 'spam', captchaToken: 'valid-token' }).expect(201);
    expect(neutral.body.data.status).toBe('received');
    expect(await db.abuseReport.count()).toBe(1);

    await agent().get('/api/v1/admin/reports').expect(401);
    await admin(agent().get('/api/v1/admin/reports'), readerCookie).expect(403);
    const list = await admin(agent().get('/api/v1/admin/reports?status=open')).expect(200);
    // The queue shows a masked address; the whole one is a separate, recorded step.
    expect(list.body.data[0]).toMatchObject({ targetType: 'review', reviewId, commentId: null, reason: 'privacy', targetStatus: 'approved' });
    expect(list.body.data[0].reporterEmail).not.toBe('reporter@example.com');
    expect(list.body.data[0].reporterEmail).toMatch(/@example\.com$/);
    const reportId = list.body.data[0].id;
    const investigating = await admin(agent().post(`/api/v1/admin/reports/${reportId}/investigate`)).send({ expectedVersion: list.body.data[0].version }).expect(200);
    expect(investigating.body.data.status).toBe('investigating');
    await admin(agent().post(`/api/v1/admin/reports/${reportId}/investigate`)).send({ expectedVersion: investigating.body.data.version }).expect(409);
    const resolved = await admin(agent().post(`/api/v1/admin/reports/${reportId}/resolve`)).send({ expectedVersion: investigating.body.data.version, outcome: 'retain', note: 'No personal information found' }).expect(200);
    expect(resolved.body.data).toMatchObject({ status: 'resolved', outcome: 'retain', resolvedAt: expect.any(String) });
    // Resolving a report never changes the review itself (SRS REP 002).
    expect((await admin(agent().get(`/api/v1/admin/reviews/${reviewId}`)).expect(200)).body.data.status).toBe('approved');
    await admin(agent().post(`/api/v1/admin/reports/${reportId}/resolve`)).send({ expectedVersion: resolved.body.data.version, outcome: 'remove' }).expect(409);
    const audit = (await db.auditLog.findMany({ where: { targetType: 'abuse_report' }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(audit).toEqual(['report.submitted', 'report.investigate', 'report.resolve']);

    await admin(agent().get(`/api/v1/admin/reports/${reportId}/reporter-email`), readerCookie).expect(403);
    const reporter = await admin(agent().get(`/api/v1/admin/reports/${reportId}/reporter-email`)).expect(200);
    expect(reporter.body.data.email).toBe('reporter@example.com');
    expect(await db.auditLog.count({ where: { action: 'report.email.reveal', targetId: reportId } })).toBe(1);
  });
  it('publishes the approved rating distribution, zeros included, and nothing before the first approval', async () => {
    // The listing under test is a second business so the other specs' state
    // cannot leak into the histogram.
    const db = testDatabase();
    // Its own published listing, so no other spec's moderation can reach the
    // histogram under test.
    const category = (await db.category.findFirstOrThrow({ where: { active: true } })).id;
    const area = (await db.localArea.findFirstOrThrow({ where: { active: true } })).id;
    const created = (
      await admin(agent().post('/api/v1/admin/businesses'))
        .send({ name: 'Rating Histogram Cafe', description: 'A listing used by the rating distribution test, long enough to publish.', primaryCategoryId: category, localAreaId: area, publicPhone: '03 9000 3333', eligibilitySource: 'council list', contentRightsReviewed: true })
        .expect(201)
    ).body.data;
    await admin(agent().post(`/api/v1/admin/businesses/${created.id}/publish`)).send({ expectedVersion: created.version, duplicateOverrideReason: 'distinct review fixtures' }).expect(200);
    const listingId = created.id as string;
    const slug = created.slug as string;
    const before = await agent().get(`/api/v1/businesses/${slug}`).expect(200);
    expect(before.body.data.rating).toBeNull();
    // An unrated listing gets an empty array, never five zero buckets that
    // could be drawn as a chart of nothing.
    expect(before.body.data.ratingBreakdown).toEqual([]);

    await clearLimits();
    for (const [i, rating] of [5, 5, 3].entries()) {
      await submit(submission({ rating, email: `dist${i}@example.com`, text: `Rating ${rating}: a genuine sentence about this business.` }), key(), listingId).expect(201);
      await clearLimits();
    }
    const pending = await admin(agent().get(`/api/v1/admin/reviews?status=pending&businessId=${listingId}`)).expect(200);
    expect(pending.body.data).toHaveLength(3);
    for (const review of pending.body.data as { id: string; version: number }[]) {
      await admin(agent().post(`/api/v1/admin/reviews/${review.id}/approve`)).send({ expectedVersion: review.version }).expect(200);
    }

    const after = await agent().get(`/api/v1/businesses/${slug}`).expect(200);
    expect(after.body.data.rating).toEqual({ average: 4.3, count: 3 });
    expect(after.body.data.ratingBreakdown).toEqual([
      { stars: 5, count: 2 },
      { stars: 4, count: 0 },
      { stars: 3, count: 1 },
      { stars: 2, count: 0 },
      { stars: 1, count: 0 },
    ]);
    // The buckets are the whole approved set, not the page of reviews a client
    // happens to have loaded.
    expect(after.body.data.ratingBreakdown.reduce((sum: number, bucket: { count: number }) => sum + bucket.count, 0)).toBe(after.body.data.rating.count);
  });
});