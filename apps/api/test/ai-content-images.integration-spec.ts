import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import request from 'supertest';
import type { DatabaseClient } from '@adelaide-sphere/database';
import { claimOperation, recoverOperations, type ImageRequest, type ProviderResult, type TextRequest } from '@adelaide-sphere/database/automation';
import { aiPublicationDecision } from '@adelaide-sphere/database/editorial';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { SUPER_ADMIN_ROLE } from '../src/identity/permissions.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/**
 * AI Content Phase 1E: featured images (plan §N T6/T7/T9 with T3/T5/T8), on
 * the isolated `*_test` MySQL database only. The image and text providers are
 * fakes and storage is in memory: no request reaches any real provider and
 * nothing is paid. The worker's real media processing turns the stored image
 * into renditions, exactly as it does for an upload.
 */
type Transport = (req: { url: URL; address: string; family: 4 | 6; headers: Record<string, string>; timeoutMs: number }) => Promise<{ status: number; headers: Record<string, string | undefined>; body: Readable }>;
type Lease = { operationId: string; owner: string; fencingToken: number };
type Storage = { getBytes(b: string, k: string): Promise<Buffer>; put(b: string, k: string, body: Buffer, t: string): Promise<void>; delete(b: string, k: string): Promise<void> };
const worker = <T,>(file: string) => import(new URL(`../../worker/src/${file}`, import.meta.url).href) as Promise<T>;
let runAiOperation: (db: DatabaseClient, data: { operationId: string }, owner: string, deps: Record<string, unknown>) => Promise<string>;
let processMediaAsset: (data: { eventId: string; mediaId: string }, deps: { db: DatabaseClient; storage: Storage; randomKey: () => string }) => Promise<string>;
// The worker's own image library, to make real PNG bytes for the fake provider.
const sharp = createRequire(new URL('../../worker/package.json', import.meta.url))('sharp') as (input: unknown) => { png(): { toBuffer(): Promise<Buffer> } };
const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 200, g: 150, b: 90 } } }).png().toBuffer();

const PUBLIC = '93.184.216.34';
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const CAFE = `<html><head><title>Example Cafe</title>${ld({ '@type': 'CafeOrCoffeeShop', name: 'Example Cafe', telephone: '+61 8 8000 0000', openingHours: 'Mo-Fr 07:00-15:00', address: '1 Example St, Norwood SA 5067' })}</head><body><p>Example Cafe, open Mo-Fr 07:00-15:00.</p></body></html>`;
const DISCLOSURE = 'Illustrative image created with AI.';

/** A covered article built from the request's verified claims, with a featured-image brief. */
function textProvider() {
  const results = new Map<string, TextRequest>();
  return {
    id: 'openai',
    async submit(r: TextRequest) {
      const id = `resp_${randomUUID().replace(/-/g, '')}`;
      results.set(id, r);
      return { kind: 'accepted' as const, responseId: id };
    },
    async retrieve(id: string): Promise<{ kind: 'done'; result: ProviderResult }> {
      const r = results.get(id)!;
      const input = JSON.parse(r.input) as { claims: { id: string; kind: string; value: string }[] };
      const hours = input.claims.find((c) => c.kind === 'opening_hours')!;
      const output = {
        title: 'Example Cafe in Norwood',
        slug: `example-cafe-${randomUUID().slice(0, 8)}`,
        excerpt: 'When Example Cafe opens, from its own website.',
        seoTitle: 'Example Cafe opening hours',
        seoDescription: 'Opening hours for Example Cafe.',
        seoKeywords: ['norwood cafe'],
        tagIds: [],
        sections: [
          { id: 'hours', heading: 'When to go', paragraphs: [{ text: `Example Cafe lists its hours as ${hours.value}.`, claimIds: [hours.id] }] },
          { id: 'tips', heading: 'Before you go', paragraphs: [{ text: 'Check the hours before you visit, because they can change without notice. Bring a keep cup, arrive early on weekends, and expect a short wait when the morning rush is on. Seats by the window go quickly.', claimIds: [] }] },
        ],
        faqs: [],
        internalLinks: [],
        imageBriefs: [{ placement: 'featured', prompt: 'An illustrative scene of a cafe counter with pastries, not a real venue', aspectRatio: '16:9', altDraft: 'Illustration of a cafe counter', captionDraft: '' }],
      };
      return { kind: 'done', result: { status: 'completed', output, refusal: null, incompleteReason: null, usage: { inputTokens: 2000, cachedInputTokens: 0, outputTokens: 1500 }, reasoningTokens: 0, model: r.model, serviceTier: 'default', errorCode: null } };
    },
  };
}

function imageProvider() {
  const state = {
    calls: [] as ImageRequest[],
    mode: 'ok' as 'ok' | 'unknown' | 'rate_limited' | 'invalid' | 'garbage' | 'wrong_size',
    usage: { textInputTokens: 60, imageInputTokens: 0, imageOutputTokens: 1600, textOutputTokens: 0 },
  };
  const provider = {
    id: 'openai',
    async generate(r: ImageRequest) {
      state.calls.push(r);
      if (state.mode === 'unknown') return { kind: 'unknown' as const, errorClass: 'image_timeout' };
      if (state.mode === 'rate_limited') return { kind: 'rejected' as const, errorClass: 'rate_limited', retryable: true, retryAfterMs: 90_000 };
      if (state.mode === 'invalid') return { kind: 'rejected' as const, errorClass: 'invalid_request', retryable: false, retryAfterMs: 0 };
      const bytes = state.mode === 'garbage' ? Buffer.from('this is not an image at all') : await png(1536, 1024);
      return { kind: 'generated' as const, bytes, usage: state.usage, size: state.mode === 'wrong_size' ? '1024x1024' : r.size, quality: r.quality };
    },
  };
  return { provider, state };
}

function memoryStorage() {
  const objects = new Map<string, Buffer>();
  const storage: Storage = {
    async getBytes(bucket, key) {
      const body = objects.get(`${bucket}/${key}`);
      if (!body) throw new Error('missing');
      return body;
    },
    async put(bucket, key, body) {
      objects.set(`${bucket}/${key}`, body);
    },
    async delete(bucket, key) {
      objects.delete(`${bucket}/${key}`);
    },
  };
  return { storage, objects };
}

describe('AI Content Phase 1E featured images (real MySQL/API, fake providers)', () => {
  let app: INestApplication;
  let cookie: string;
  let viewerCookie: string;
  let authorId: string;
  let categoryId: string;
  let images: ReturnType<typeof imageProvider>;
  let text: ReturnType<typeof textProvider>;
  let media: ReturnType<typeof memoryStorage>;
  const db = () => testDatabase();
  const agent = () => request(app.getHttpServer());
  const admin = (req: request.Test, c = cookie) => req.set('Origin', ORIGIN).set('Cookie', c);
  const base = '/api/v1/admin/ai-content';
  const transport: Transport = async (req) => {
    const body = req.url.toString() === 'https://cafe.example.org/' ? CAFE : '';
    return { status: body ? 200 : 404, headers: { 'content-type': 'text/html' }, body: Readable.from([Buffer.from(body)]) };
  };
  const deps = () => ({
    fetchOptions: { transport, resolve: async () => [PUBLIC] },
    textProviders: { openai: text },
    imageProviders: { openai: images.provider },
    storage: media.storage,
    randomKey: () => randomUUID().replace(/-/g, ''),
    sleep: async () => undefined,
    pollIntervalMs: 0,
    maxWaitMs: 60_000,
  });
  const login = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };
  async function saveSettings(values: Record<string, unknown>) {
    const current = (await admin(agent().get('/api/v1/admin/settings/ai-content')).expect(200)).body.data;
    return admin(agent().put('/api/v1/admin/settings/ai-content')).send({ expectedVersion: current.version, values });
  }
  const detail = async (id: string) => (await admin(agent().get(`${base}/topics/${id}`)).expect(200)).body.data;
  async function drain(itemId: string) {
    const due = await db().$queryRaw<{ id: string }[]>`SELECT id FROM ai_operations WHERE state = 'pending' AND nextAttemptAt <= UTC_TIMESTAMP(3) AND itemId = ${itemId} ORDER BY createdAt`;
    const results: string[] = [];
    for (const op of due) results.push(await runAiOperation(db(), { operationId: op.id }, 'test-worker', deps()));
    return results;
  }
  async function confirmFacts(topicId: string) {
    const topic = await detail(topicId);
    const post = await db().post.findUniqueOrThrow({ where: { id: topic.postId } });
    return admin(agent().post(`${base}/topics/${topicId}/confirm-facts`)).send({ expectedVersion: topic.version, postVersion: post.version, note: 'Checked every statement against the venue page' });
  }
  /** A drafted article with verified research and confirmed facts: ready for images. */
  async function draft(title: string) {
    const item = (await admin(agent().post(`${base}/topics`)).set('Idempotency-Key', randomUUID()).send({ title, priority: 0 }).expect(201)).body.data;
    await admin(agent().put(`${base}/topics/${item.id}/sources`)).send({ expectedVersion: (await detail(item.id)).version, sources: [{ url: 'https://cafe.example.org/' }] }).expect(200);
    await admin(agent().post(`${base}/topics/${item.id}/research`)).send({ expectedVersion: (await detail(item.id)).version, action: 'approve' }).expect(200);
    expect(await drain(item.id)).toEqual(['packet:verified']);
    await admin(agent().put(`${base}/topics/${item.id}/article`)).send({ expectedVersion: (await detail(item.id)).version, categoryId }).expect(200);
    const started = await admin(agent().post(`${base}/topics/${item.id}/generate`)).set('Idempotency-Key', randomUUID()).send({ expectedVersion: (await detail(item.id)).version, scope: 'full' });
    expect(started.body.error ?? null).toBeNull();
    expect([...(await drain(item.id)), ...(await drain(item.id))]).toEqual(['generated:covered', 'applied:created']);
    expect((await confirmFacts(item.id)).status).toBe(200);
    return detail(item.id);
  }
  const generateImage = async (id: string, key = randomUUID(), prompt?: string, c = cookie) =>
    admin(agent().post(`${base}/topics/${id}/images`), c).set('Idempotency-Key', key).send({ expectedVersion: (await detail(id)).version, ...(prompt ? { prompt } : {}) });
  const jobFor = (itemId: string) => db().aIImageJob.findFirstOrThrow({ where: { itemId }, orderBy: { imageVersion: 'desc' }, include: { operation: true } });
  const bucket = (scope: 'day' | 'image_day' | 'image_month') => db().aIBudgetBucket.findFirst({ where: { scope } });
  async function storedImage(itemId: string) {
    expect((await generateImage(itemId)).status).toBe(201);
    expect(await drain(itemId)).toEqual(['image:stored']);
    const job = await jobFor(itemId);
    expect(await processMediaAsset({ eventId: 'test', mediaId: job.mediaAssetId! }, { db: db(), storage: media.storage, randomKey: () => randomUUID().replace(/-/g, '') })).toBe('ready');
    return job;
  }
  async function approveImage(jobId: string, postId: string, altText = 'Illustration of a café counter with pastries under warm light', c = cookie) {
    const post = await db().post.findUniqueOrThrow({ where: { id: postId } });
    return admin(agent().post(`${base}/images/${jobId}/approve`), c).send({ expectedPostVersion: post.version, altText, altWrittenFromImage: true });
  }
  async function approveArticle(topicId: string) {
    const topic = await detail(topicId);
    const post = await db().post.findUniqueOrThrow({ where: { id: topic.postId } });
    return admin(agent().post(`${base}/topics/${topicId}/approve`)).send({ expectedVersion: topic.version, postVersion: post.version });
  }
  /** An ordinary uploaded image, ready in the media library (no AI involved). */
  async function uploadedImage() {
    return db().mediaAsset.create({ data: { sourceName: 'photo.jpg', mimeType: 'image/jpeg', bytes: 1000, width: 1600, height: 900, checksum: 'c'.repeat(64), objectKey: `quarantine/${randomUUID()}.jpg`, status: 'ready', altText: 'A photograph of a laneway', credit: 'Staff photographer' } });
  }
  const publishReasons = (postId: string) => db().$transaction(async (tx) => {
    const decision = await aiPublicationDecision(tx, { postId, action: 'publish', path: 'scheduled' });
    return decision.linked ? decision.reasons : [];
  });

  beforeAll(async () => {
    ({ runAiOperation } = await worker<{ runAiOperation: typeof runAiOperation }>('ai-content/operations.ts'));
    ({ processMediaAsset } = await worker<{ processMediaAsset: typeof processMediaAsset }>('media-processing.ts'));
    await truncateApplicationTables();
    await testDatabase().$executeRaw`UPDATE ai_automation_controls SET paidCallsHaltedAt = NULL, paidHaltReason = NULL`;
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.70');
    await seedSuperAdmin(app, { email: 'ai-viewer-1e@example.com', password: 'viewer-1e-password-12345', displayName: 'Viewer 1E' });
    const viewer = await db().adminUser.findUniqueOrThrow({ where: { email: 'ai-viewer-1e@example.com' } });
    const superRole = await db().role.findUniqueOrThrow({ where: { key: SUPER_ADMIN_ROLE.key } });
    await db().adminRole.delete({ where: { adminId_roleId: { adminId: viewer.id, roleId: superRole.id } } });
    const role = await db().role.create({ data: { key: 'ai_viewer_1e', name: 'AI viewer 1E', description: 'test' } });
    const perms = await db().permission.findMany({ where: { key: { in: ['ai_content.view', 'ai_content.review', 'posts.view', 'posts.update'] } } });
    await db().rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
    await db().adminRole.create({ data: { adminId: viewer.id, roleId: role.id } });
    viewerCookie = await login('ai-viewer-1e@example.com', 'viewer-1e-password-12345', '203.0.113.71');
    authorId = (await admin(agent().post('/api/v1/admin/authors')).send({ displayName: 'Casey Editor', bio: 'Edits local guides.' }).expect(201)).body.data.id;
    categoryId = (await admin(agent().post('/api/v1/admin/blog-categories')).send({ name: 'Cafes' }).expect(201)).body.data.id;
    await admin(agent().post(`${base}/sources`)).send({ host: 'cafe.example.org', label: 'Example Cafe', tier: 'official_business' }).expect(201);
    for (const [model, input, output] of [['gpt-5.6-terra', 2_000_000, 12_000_000], ['gpt-5.6-luna', 200_000, 1_200_000]] as const) {
      const price = (await admin(agent().post(`${base}/prices`)).send({ version: `openai-${model}-t`, provider: 'openai', model, currency: 'USD', inputMicrosPerMTok: input, cachedInputMicrosPerMTok: input / 10, outputMicrosPerMTok: output, longContextThresholdTokens: 272_000, sourceUrl: 'https://developers.openai.com/api/docs/pricing', effectiveFrom: '2026-07-30T00:00:00.000Z' }).expect(201)).body.data;
      await admin(agent().post(`${base}/prices/${price.id}/approve`)).expect(200);
    }
    // Generous text caps and a per-article cap that fits a draft plus an image; image caps are set per test.
    expect((await saveSettings({ enabled: true, titleMode: 'manual', articleAuthorId: authorId, hardDailyLimitMinor: 100_000, hardMonthlyLimitMinor: 100_000, maxWorkflowCostMinor: 100 })).status).toBe(200);
  });

  beforeEach(() => {
    text = textProvider();
    images = imageProvider();
    media = memoryStorage();
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  describe('fail-closed prerequisites (owner rules)', () => {
    it('refuses automatic mode, a price without a bound, a zero image budget, manual articles and prompts naming places, and spends nothing', async () => {
      const topic = await draft('Norwood bakery counter');
      expect((await saveSettings({ imageMode: 'automatic' })).status).toBe(400);
      // No approved image price yet.
      expect((await generateImage(topic.id)).body.error.code).toBe('PRICE_UNKNOWN');
      // An image price must name its size, quality and per-image output bound.
      const unbounded = await admin(agent().post(`${base}/prices`)).send({ version: 'openai-image-unbounded', provider: 'openai', model: 'gpt-image-2.5-flare', currency: 'USD', inputMicrosPerMTok: 5_000_000, cachedInputMicrosPerMTok: 1_250_000, outputMicrosPerMTok: 30_000_000, longContextThresholdTokens: 32_000, sourceUrl: 'https://developers.openai.com/api/docs/pricing', effectiveFrom: '2026-09-19T00:00:00.000Z' });
      expect(unbounded.status).toBe(400);
      expect(Object.keys(unbounded.body.error.fields).sort()).toEqual(['imageQuality', 'imageSize', 'maxOutputTokens']);
      const price = (await admin(agent().post(`${base}/prices`)).send({ version: 'openai-gpt-image-2.5-flare-t', provider: 'openai', model: 'gpt-image-2.5-flare', currency: 'USD', inputMicrosPerMTok: 5_000_000, cachedInputMicrosPerMTok: 1_250_000, outputMicrosPerMTok: 30_000_000, longContextThresholdTokens: 32_000, imageSize: '1536x1024', imageQuality: 'medium', maxOutputTokens: 2000, sourceUrl: 'https://developers.openai.com/api/docs/pricing', effectiveFrom: '2026-09-19T00:00:00.000Z' }).expect(201)).body.data;
      await admin(agent().post(`${base}/prices/${price.id}/approve`)).expect(200);
      // Owner rule: no image budget until one is set (defaults are zero).
      expect((await generateImage(topic.id)).body.error.code).toBe('BUDGET_EXCEEDED');
      expect((await saveSettings({ imageDailyLimitMinor: 100, imageMonthlyLimitMinor: 1000 })).status).toBe(200);
      // A per-article manual override means prompt only.
      await admin(agent().put(`${base}/topics/${topic.id}/article`)).send({ expectedVersion: (await detail(topic.id)).version, imageMode: 'manual' }).expect(200);
      expect((await detail(topic.id)).categoryId).toBe(categoryId); // the override never clears the category
      expect((await generateImage(topic.id)).body.error.code).toBe('IMAGE_MODE_MANUAL');
      await admin(agent().put(`${base}/topics/${topic.id}/article`)).send({ expectedVersion: (await detail(topic.id)).version, imageMode: null }).expect(200);
      const named = await generateImage(topic.id, randomUUID(), 'The shopfront of Example Cafe on The Parade at dusk');
      expect(named.status).toBe(400);
      expect(named.body.error.fields.prompt[0]).toMatch(/Example Cafe/);
      expect(await db().aIOperation.count({ where: { kind: 'image' } })).toBe(0);
      expect(await bucket('image_day')).toBeNull();
      expect(images.state.calls).toHaveLength(0);
    });
  });

  describe('generation, media pipeline, approval and publication (T6/T7/T9)', () => {
    it('reserves once, sends once, stores through quarantine, attaches only on approval, and publishes with the disclosure', async () => {
      const topic = await draft('Kent Town pastry bar');
      expect((await approveArticle(topic.id)).status).toBe(200);
      const post0 = await db().post.findUniqueOrThrow({ where: { id: topic.postId } });
      // The featured image is required: the approved article cannot publish without one.
      const blocked = await admin(agent().post(`/api/v1/admin/posts/${post0.id}/publish`)).send({ expectedVersion: post0.version }).expect(409);
      expect(blocked.body.error.fields.publication).toEqual(expect.arrayContaining([expect.stringMatching(/Add a featured image/)]));

      const textDay = (await bucket('day'))!;
      const key = randomUUID();
      const first = await generateImage(topic.id, key);
      expect(first.body.error ?? null).toBeNull();
      // The same click again is the same operation, image version and reservation.
      expect((await generateImage(topic.id, key)).body.data.operationId).toBe(first.body.data.operationId);
      let job = await jobFor(topic.id);
      expect(job).toMatchObject({ status: 'requested', imageVersion: 1, model: 'gpt-image-2.5-flare', size: '1536x1024', quality: 'medium', disclosureText: DISCLOSURE, mediaAssetId: null });
      expect(job.prompt).toMatch(/cafe counter with pastries[\s\S]*not a photograph of a real place/);
      expect(job.operation).toMatchObject({ kind: 'image', costState: 'reserved', providerPhase: 'prepared' });
      // Charged to the separate image budget only.
      expect((await bucket('image_day'))!.reservedMicros).toBe(job.operation.reservedMicros);
      expect((await bucket('day'))!.reservedMicros).toBe(textDay.reservedMicros);

      expect(await drain(topic.id)).toEqual(['image:stored']);
      expect(images.state.calls).toHaveLength(1);
      job = await jobFor(topic.id);
      expect(job.status).toBe('stored');
      // Priced from reported usage: 60 text tokens at USD 5/M plus 1,600 image tokens at USD 30/M.
      expect(job.operation).toMatchObject({ costState: 'settled', settledMicros: 300 + 48_000, providerPhase: 'done', state: 'succeeded' });
      const asset = await db().mediaAsset.findUniqueOrThrow({ where: { id: job.mediaAssetId! } });
      expect(asset).toMatchObject({ status: 'quarantined', kind: 'image', mimeType: 'image/png', width: 1536, height: 1024, checksum: job.checksum, altText: null });
      expect(asset.objectKey).toMatch(/^quarantine\//);
      expect(media.objects.has(`quarantine/${asset.objectKey}`)).toBe(true);
      expect(await db().outboxEvent.count({ where: { type: 'media.uploaded', resourceId: asset.id } })).toBe(1);
      // Nothing is attached automatically, and a redelivered job does nothing.
      expect((await db().post.findUniqueOrThrow({ where: { id: post0.id } })).coverMediaId).toBeNull();
      expect(await runAiOperation(db(), { operationId: job.operationId }, 'late', deps())).toBe('not claimable');
      expect(images.state.calls).toHaveLength(1);

      // Not approvable until the media pipeline has made it ready.
      expect((await approveImage(job.id, post0.id)).body.error.code).toBe('IMAGE_NOT_READY');
      expect(await processMediaAsset({ eventId: 'e1', mediaId: asset.id }, { db: db(), storage: media.storage, randomKey: () => randomUUID().replace(/-/g, '') })).toBe('ready');

      // Alt text must be written from the actual image, by someone allowed to approve and edit.
      expect((await approveImage(job.id, post0.id, 'Illustration of a cafe counter')).body.error.fields.altText[0]).toMatch(/generated image/);
      await admin(agent().post(`${base}/images/${job.id}/approve`)).send({ expectedPostVersion: post0.version, altText: 'A warm counter', altWrittenFromImage: false }).expect(400);
      expect((await approveImage(job.id, post0.id, 'A warm café counter', viewerCookie)).status).toBe(403);
      await admin(agent().post(`${base}/images/${job.id}/approve`)).send({ expectedPostVersion: post0.version + 5, altText: 'A warm café counter', altWrittenFromImage: true }).expect(409);
      const approved = await approveImage(job.id, post0.id);
      expect(approved.status).toBe(200);
      const post1 = await db().post.findUniqueOrThrow({ where: { id: post0.id } });
      expect(post1).toMatchObject({ coverMediaId: asset.id, coverAlt: 'Illustration of a café counter with pastries under warm light', version: post0.version + 1 });
      expect(await db().aIImageJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: 'approved', approvedChecksum: asset.checksum, approvedPostVersion: post1.version });
      // A material change: the earlier fact confirmation and article approval no longer count.
      expect(await db().aIApproval.count({ where: { itemId: topic.id, invalidatedAt: null } })).toBe(0);
      expect((await detail(topic.id)).status).toBe('ready_for_review');
      expect((await approveArticle(topic.id)).body.error.code).toBe('FACTS_NOT_CONFIRMED');
      expect((await confirmFacts(topic.id)).status).toBe(200);
      expect((await approveArticle(topic.id)).status).toBe(200);
      expect(await publishReasons(post1.id)).toEqual([]);
      await admin(agent().post(`/api/v1/admin/posts/${post1.id}/publish`)).send({ expectedVersion: post1.version }).expect(200);
      const pub = (await agent().get(`/api/v1/posts/${post1.slug}`).expect(200)).body.data;
      expect(pub.coverDisclosure).toBe(DISCLOSURE);
      expect(pub.coverCredit).toBeNull();
      expect(pub.cover.length).toBeGreaterThan(0);
      // Only the site's own re-encoded renditions are public: no provider URL, never the original.
      for (const variant of pub.cover) expect(variant.url).toMatch(/\/media\/[a-z0-9]+\/[a-f0-9]+\.webp$/);
      expect(JSON.stringify(pub)).not.toMatch(/openai|quarantine/);
    });

    it('keeps an approval only for the exact image and alt text; a regeneration supersedes it; an uploaded image needs no AI approval', async () => {
      const topic = await draft('Stepney tea room');
      const job = await storedImage(topic.id);
      expect((await approveImage(job.id, topic.postId)).status).toBe(200);
      expect(await publishReasons(topic.postId)).not.toEqual(expect.arrayContaining([expect.stringMatching(/featured image/)]));
      // A person edits the alt text: the image approval no longer matches (both publication paths share this policy).
      let post = await db().post.findUniqueOrThrow({ where: { id: topic.postId } });
      await admin(agent().patch(`/api/v1/admin/posts/${post.id}`)).send({ expectedVersion: post.version, coverAlt: 'Something else entirely' }).expect(200);
      expect(await publishReasons(post.id)).toEqual(expect.arrayContaining([expect.stringMatching(/approve the AI-generated featured image and its alt text/)]));
      // Re-approving the same image with its alt text restores it.
      expect((await approveImage(job.id, post.id, 'Illustration of a tea room table with cups')).status).toBe(200);
      expect(await publishReasons(post.id)).not.toEqual(expect.arrayContaining([expect.stringMatching(/featured image/)]));
      // A regenerated image supersedes the approved one, even while the old one is still the featured image.
      const second = await storedImage(topic.id);
      expect(second.imageVersion).toBe(2);
      expect((await db().aIImageJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('superseded');
      expect(await publishReasons(post.id)).toEqual(expect.arrayContaining([expect.stringMatching(/approve the AI-generated featured image/)]));
      expect((await approveImage(job.id, post.id, 'Illustration of a tea room table')).body.error.code).toBe('INVALID_TRANSITION');
      // An uploaded, ready image with alt text satisfies the image policy without any AI approval.
      const upload = await uploadedImage();
      post = await db().post.findUniqueOrThrow({ where: { id: post.id } });
      await admin(agent().patch(`/api/v1/admin/posts/${post.id}`)).send({ expectedVersion: post.version, coverMediaId: upload.id, coverAlt: 'A photograph of a laneway' }).expect(200);
      expect(await publishReasons(post.id)).not.toEqual(expect.arrayContaining([expect.stringMatching(/featured image/)]));
    });

    it('never lets a late image result replace a featured image a person chose meanwhile', async () => {
      const topic = await draft('Marden noodle bar');
      expect((await generateImage(topic.id)).status).toBe(201);
      const upload = await uploadedImage();
      const post = await db().post.findUniqueOrThrow({ where: { id: topic.postId } });
      await admin(agent().patch(`/api/v1/admin/posts/${post.id}`)).send({ expectedVersion: post.version, coverMediaId: upload.id, coverAlt: 'A photograph of a laneway' }).expect(200);
      expect(await drain(topic.id)).toEqual(['image:stored']);
      expect((await db().post.findUniqueOrThrow({ where: { id: post.id } })).coverMediaId).toBe(upload.id);
    });
  });

  describe('unknown outcomes, refusals, unusable results and budgets (T6/T7)', () => {
    it('holds an unknown image outcome: no re-send, no new request, abandonment counts the reservation, the article is untouched', async () => {
      const topic = await draft('Payneham gelato cart');
      images.state.mode = 'unknown';
      await generateImage(topic.id);
      expect(await drain(topic.id)).toEqual(['outcome_unknown:image_timeout']);
      const job = await jobFor(topic.id);
      expect(job).toMatchObject({ status: 'outcome_unknown' });
      expect(job.operation).toMatchObject({ state: 'outcome_unknown', costState: 'reserved', providerPhase: 'sending' });
      expect(await claimOperation(db(), { operationId: job.operationId, owner: 'retry' })).toBeNull();
      expect((await generateImage(topic.id)).body.error.code).toBe('IMAGE_IN_PROGRESS');
      expect(images.state.calls).toHaveLength(1);
      await admin(agent().post(`${base}/operations/${job.operationId}/resolve`)).send({ action: 'reconcile', note: 'Try looking it up' }).expect(409);
      const before = (await bucket('image_day'))!;
      await admin(agent().post(`${base}/operations/${job.operationId}/resolve`)).send({ action: 'abandon', note: 'No response; provider dashboard checked; counting the charge.' }).expect(200);
      expect(await jobFor(topic.id)).toMatchObject({ status: 'failed', failureCode: 'outcome_abandoned', operation: { costState: 'uncertain', settledMicros: job.operation.reservedMicros } });
      const after = (await bucket('image_day'))!;
      expect(after.settledMicros - before.settledMicros).toBe(job.operation.reservedMicros);
      expect((await detail(topic.id)).status).toBe('ready_for_review');
    });

    it('treats a worker lost mid-send as unknown, never as a reason to send again', async () => {
      const topic = await draft('Glynde dumpling window');
      await generateImage(topic.id);
      const job = await jobFor(topic.id);
      const lease = (await claimOperation(db(), { operationId: job.operationId, owner: 'crashing', leaseMs: 200 })) as Lease;
      expect(lease).not.toBeNull();
      await db().aIOperation.update({ where: { id: job.operationId }, data: { providerPhase: 'sending' } });
      await new Promise((r) => setTimeout(r, 350));
      await recoverOperations(db());
      expect(await jobFor(topic.id)).toMatchObject({ status: 'outcome_unknown', operation: { state: 'outcome_unknown', errorClass: 'worker_lost_during_send' } });
      expect(images.state.calls).toHaveLength(0);
    });

    it('retries a rate limit no sooner than the wait, fails a refusal with the reservation released, and never fails the article', async () => {
      const topic = await draft('Hackney bagel bench');
      images.state.mode = 'rate_limited';
      await generateImage(topic.id);
      expect(await drain(topic.id)).toEqual(['rejected:rate_limited:retrying']);
      const waiting = await jobFor(topic.id);
      expect(waiting.operation).toMatchObject({ state: 'pending', costState: 'reserved', providerPhase: 'prepared' });
      expect(waiting.operation.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(Date.now() + 80_000);
      await db().aIOperation.update({ where: { id: waiting.operationId }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      images.state.mode = 'invalid';
      expect(await drain(topic.id)).toEqual(['rejected:invalid_request:failed']);
      expect(await jobFor(topic.id)).toMatchObject({ status: 'failed', operation: { state: 'failed', costState: 'released' } });
      expect((await detail(topic.id)).status).toBe('ready_for_review');
    });

    it('records an unusable paid result as charged and failed, and halts paid calls when the result is not what was priced', async () => {
      const topic = await draft('Evandale waffle stall');
      images.state.mode = 'garbage';
      await generateImage(topic.id);
      expect(await drain(topic.id)).toEqual(['image_unusable:invalid_image']);
      expect(await jobFor(topic.id)).toMatchObject({ status: 'failed', failureCode: 'invalid_image', mediaAssetId: null, operation: { costState: 'settled' } });
      images.state.mode = 'wrong_size';
      await generateImage(topic.id);
      expect(await drain(topic.id)).toEqual(['image:stored']);
      expect((await jobFor(topic.id)).operation.costState).toBe('uncertain');
      expect((await admin(agent().get(`${base}/budget`)).expect(200)).body.data.paidHaltReason).toMatch(/requested 1536x1024 medium/);
      expect((await generateImage(topic.id)).body.error.code).toBe('PAID_CALLS_HALTED');
      await admin(agent().post(`${base}/budget/resume`)).send({ note: 'Size mismatch was a test fixture.' }).expect(200);
    });

    it('never reserves beyond the image cap when two requests race, and counts images in the per-article cap', async () => {
      const a = await draft('Felixstow pizza oven');
      const b = await draft('Firle ramen counter');
      const perImage = (await db().aIOperation.findFirstOrThrow({ where: { kind: 'image', costState: { in: ['settled', 'uncertain'] } } })).reservedMicros;
      const day = (await bucket('image_day'))!;
      const limitMinor = Math.floor((day.reservedMicros + day.settledMicros + perImage * 1.5) / 10_000);
      expect((await saveSettings({ imageDailyLimitMinor: limitMinor })).status).toBe(200);
      const [va, vb] = [(await detail(a.id)).version, (await detail(b.id)).version];
      const results = await Promise.all([
        admin(agent().post(`${base}/topics/${a.id}/images`)).set('Idempotency-Key', randomUUID()).send({ expectedVersion: va }),
        admin(agent().post(`${base}/topics/${b.id}/images`)).set('Idempotency-Key', randomUUID()).send({ expectedVersion: vb }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe('BUDGET_EXCEEDED');
      const after = (await bucket('image_day'))!;
      expect(after.reservedMicros + after.settledMicros).toBeLessThanOrEqual(limitMinor * 10_000);
      await drain(a.id);
      await drain(b.id);
      await saveSettings({ imageDailyLimitMinor: 100 });
      // The article's text already spent part of its cap; an image that would take it over is refused.
      const c = await draft('Joslin tapas corner');
      const spent = (await db().aIOperation.aggregate({ where: { itemId: c.id }, _sum: { settledMicros: true } }))._sum.settledMicros!;
      expect((await saveSettings({ maxWorkflowCostMinor: Math.floor((spent + perImage / 2) / 10_000) })).status).toBe(200);
      expect((await generateImage(c.id)).body.error.code).toBe('WORKFLOW_CAP_EXCEEDED');
      await saveSettings({ maxWorkflowCostMinor: 100 });
    });

    it('denies generating and approving images to administrators without those permissions', async () => {
      const topic = await draft('Beulah laksa stall');
      expect((await generateImage(topic.id, randomUUID(), undefined, viewerCookie)).status).toBe(403);
      await admin(agent().get(`${base}/topics/${topic.id}/images`), viewerCookie).expect(200);
      const job = await storedImage(topic.id);
      expect((await approveImage(job.id, topic.postId, 'A warm café counter', viewerCookie)).status).toBe(403);
      await admin(agent().post(`${base}/images/${job.id}/reject`), viewerCookie).send({ note: 'Looks like a real shopfront' }).expect(200);
      expect((await jobFor(topic.id)).status).toBe('rejected');
      expect((await approveImage(job.id, topic.postId)).body.error.code).toBe('INVALID_TRANSITION');
    });
  });
});
