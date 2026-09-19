import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import request from 'supertest';
import type { DatabaseClient } from '@adelaide-sphere/database';
import { claimOperation, planSlots, recoverOperations, type ImageRequest, type ProviderResult, type TextRequest } from '@adelaide-sphere/database/automation';
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
type XaiCtor = new (key: string, fetchImpl: (url: string, init: { body?: string }) => Promise<{ status: number; headers: { get(n: string): string | null }; text(): Promise<string> }>) => { id: string; generate(r: ImageRequest): Promise<unknown> };
let XaiImageProvider: XaiCtor;
let GeminiImageProvider: XaiCtor;
let TASK_IMPLEMENTATIONS: Record<string, (ctx: { db: DatabaseClient; now: Date; queue: never }) => Promise<string>>;
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
    mode: 'ok' as 'ok' | 'unknown' | 'rate_limited' | 'invalid' | 'garbage' | 'wrong_size' | 'substituted',
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
      const mismatch = state.mode === 'wrong_size' ? `1024x1024 ${r.quality}, requested 1536x1024 ${r.quality}` : null;
      const servedModel = state.mode === 'substituted' ? 'gpt-image-2' : null;
      return { kind: 'generated' as const, bytes, usage: state.usage, images: 1, servedModel, providerRequestId: 'req_fixture_1', mismatch };
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
  /** The real xAI adapter over a fixture fetch (no network): what it sent, and what the fixture answers. */
  let gemini: { id: string; generate(r: ImageRequest): Promise<unknown> } | null = null;
  let xai: { provider: { id: string; generate(r: ImageRequest): Promise<unknown> }; sent: Record<string, unknown>[]; model: string } | null = null;
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
    imageProviders: { openai: images.provider, ...(xai ? { xai: xai.provider } : {}), ...(gemini ? { google: gemini } : {}) },
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
    ({ XaiImageProvider } = await worker<{ XaiImageProvider: XaiCtor }>('ai-content/xai-image-provider.ts'));
    ({ GeminiImageProvider } = await worker<{ GeminiImageProvider: XaiCtor }>('ai-content/gemini-image-provider.ts'));
    ({ TASK_IMPLEMENTATIONS } = await worker<{ TASK_IMPLEMENTATIONS: typeof TASK_IMPLEMENTATIONS }>('scheduled-tasks.ts'));
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
      // An image price must name its resolution, quality, billing unit and per-image output bound.
      const unbounded = await admin(agent().post(`${base}/prices`)).send({ version: 'openai-image-unbounded', provider: 'openai', model: 'gpt-image-2.5-flare', currency: 'USD', inputMicrosPerMTok: 5_000_000, cachedInputMicrosPerMTok: 1_250_000, outputMicrosPerMTok: 30_000_000, longContextThresholdTokens: 32_000, sourceUrl: 'https://developers.openai.com/api/docs/pricing', effectiveFrom: '2026-09-19T00:00:00.000Z' });
      expect(unbounded.status).toBe(400);
      expect(Object.keys(unbounded.body.error.fields).sort()).toEqual(['imageQuality', 'imageResolution', 'maxOutputTokens', 'pricingUnit']);
      const price = (await admin(agent().post(`${base}/prices`)).send({ version: 'openai-gpt-image-2.5-flare-t', provider: 'openai', model: 'gpt-image-2.5-flare', currency: 'USD', inputMicrosPerMTok: 5_000_000, cachedInputMicrosPerMTok: 1_250_000, outputMicrosPerMTok: 30_000_000, longContextThresholdTokens: 32_000, imageResolution: '1k', imageQuality: 'medium', pricingUnit: 'token', maxOutputTokens: 2000, sourceUrl: 'https://developers.openai.com/api/docs/pricing', effectiveFrom: '2026-09-19T00:00:00.000Z' }).expect(201)).body.data;
      await admin(agent().post(`${base}/prices/${price.id}/approve`)).expect(200);
      // Owner rule: no image budget until one is set (defaults are zero), which is not an over-threshold warning.
      expect((await generateImage(topic.id)).body.error.code).toBe('BUDGET_EXCEEDED');
      expect((await admin(agent().get(`${base}/budget`)).expect(200)).body.data).toMatchObject({ imageDay: { limitMicros: 0, warning: false }, imageMonth: { limitMicros: 0, warning: false } });
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
      expect(job).toMatchObject({ status: 'requested', imageVersion: 1, model: 'gpt-image-2.5-flare', size: '1536x1024', aspectRatio: '3:2', resolution: '1k', quality: 'medium', disclosureText: DISCLOSURE, mediaAssetId: null });
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
      // A different model served than the approved one (AI-PROVIDER-13): settled as uncertain, paid calls halted,
      // the image never becomes a candidate, and the provider's request ID and the served model are kept.
      images.state.mode = 'substituted';
      await generateImage(topic.id);
      expect(await drain(topic.id)).toEqual(['image_unusable:model_substituted']);
      expect(await jobFor(topic.id)).toMatchObject({ status: 'failed', failureCode: 'model_substituted', mediaAssetId: null, servedModel: 'gpt-image-2', providerRequestId: 'req_fixture_1', operation: { costState: 'uncertain' } });
      expect((await admin(agent().get(`${base}/budget`)).expect(200)).body.data.paidHaltReason).toBeTruthy();
      expect((await generateImage(topic.id)).body.error.code).toBe('PAID_CALLS_HALTED');
      await admin(agent().post(`${base}/budget/resume`)).send({ note: 'Model substitution was a test fixture.' }).expect(200);
      images.state.mode = 'ok';
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

  describe('a per-image provider through the same pipeline (provider amendment 01, xAI adapter over fixtures)', () => {
    it('reserves the highest approved configuration, settles at the reported cost, halts on a cost or model the approved price does not explain', async () => {
      const bytes = (await png(1600, 900)).toString('base64');
      // What the fixture answers: the model, and usage.cost_in_usd_ticks (1 USD = 10^10 ticks), or no usage at all.
      const state = { sent: [] as Record<string, unknown>[], model: 'grok-imagine-image-2.0', ticks: 600_000_000 as number | null };
      xai = {
        sent: state.sent,
        model: state.model,
        provider: new XaiImageProvider('xai-fixture-key', async (_url, init) => {
          state.sent.push(JSON.parse(init.body!));
          const usage = state.ticks === null ? {} : { usage: { cost_in_usd_ticks: state.ticks } };
          return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ data: [{ b64_json: bytes }], model: state.model, ...usage }) };
        }),
      };
      const topic = await draft('Brompton churro van');
      const proposal = { provider: 'xai', model: 'grok-imagine-image-2.0', currency: 'USD', inputMicrosPerMTok: 0, cachedInputMicrosPerMTok: 0, outputMicrosPerMTok: 0, longContextThresholdTokens: 32_000, sourceUrl: 'https://docs.x.ai/developers/pricing', effectiveFrom: '2026-09-19T00:00:00.000Z' };
      // The unit must match the model's billing, a per-image price needs its amount, and it has no token output rate.
      const wrong = await admin(agent().post(`${base}/prices`)).send({ ...proposal, version: 'xai-wrong', imageResolution: '1k', imageQuality: 'medium', pricingUnit: 'token', outputMicrosPerMTok: 30_000_000, maxOutputTokens: 2000 });
      expect(wrong.status).toBe(400);
      expect(Object.keys(wrong.body.error.fields).sort()).toEqual(['outputMicrosPerMTok', 'perImageMicros', 'pricingUnit']);
      expect((await admin(agent().post(`${base}/prices`)).send({ ...proposal, version: 'xai-retired', model: 'grok-imagine-image-quality', imageResolution: '1k', imageQuality: 'medium', pricingUnit: 'image', perImageMicros: 50_000 })).body.error.fields.model).toBeDefined();
      // "auto" is billed at the quality served, so it cannot be priced in advance.
      expect((await admin(agent().post(`${base}/prices`)).send({ ...proposal, version: 'xai-auto', imageResolution: '1k', imageQuality: 'auto', pricingUnit: 'image', perImageMicros: 40_000 })).body.error.fields.imageQuality).toBeDefined();
      // Configuration-dependent prices (owner-checked, 19 Sep 2026): one approved price per resolution and quality.
      const priceFor = async (resolution: string, quality: string, perImageMicros: number) =>
        (await admin(agent().post(`${base}/prices`)).send({ ...proposal, version: `xai-2.0-${resolution}-${quality}`, imageResolution: resolution, imageQuality: quality, pricingUnit: 'image', perImageMicros }).expect(201)).body.data;
      const oneMedium = await priceFor('1k', 'medium', 60_000);
      const twoMedium = await priceFor('2k', 'medium', 80_000);
      await priceFor('1k', 'low', 40_000);
      // Proposed prices nothing: switching the provider alone does not make a call possible.
      expect(JSON.stringify((await saveSettings({ imageProvider: 'xai', imageModel: 'gpt-image-2.5-flare' })).body.error.fields.imageModel)).toMatch(/grok-imagine-image-2.0/);
      expect((await saveSettings({ imageProvider: 'xai', imageModel: 'grok-imagine-image-2.0', imageAspectRatio: '16:9', imageResolution: '1k', imageQuality: 'auto' })).body.error.fields).toHaveProperty('imageQuality');
      expect((await saveSettings({ imageProvider: 'xai', imageModel: 'grok-imagine-image-2.0', imageAspectRatio: '16:9', imageResolution: '1k', imageQuality: 'medium', imageDailyLimitMinor: 100_000, imageMonthlyLimitMinor: 100_000 })).status).toBe(200);
      expect((await generateImage(topic.id)).body.error.code).toBe('PRICE_UNKNOWN');
      await admin(agent().post(`${base}/prices/${oneMedium.id}/approve`)).expect(200);
      await admin(agent().post(`${base}/prices/${twoMedium.id}/approve`)).expect(200);
      // Approving one configuration never retires another's price.
      expect((await db().aIPriceSchedule.findMany({ where: { model: 'grok-imagine-image-2.0', status: 'approved' } })).map((p) => p.imageSize).sort()).toEqual(['1k', '2k']);

      // 1K medium, reported as USD 0.06: reserved at the highest approved configuration (2K medium), settled at the reported cost.
      expect((await generateImage(topic.id)).status).toBe(201);
      expect(await drain(topic.id)).toEqual(['image:stored']);
      expect(state.sent).toEqual([{ model: 'grok-imagine-image-2.0', prompt: expect.any(String), n: 1, aspect_ratio: '16:9', resolution: '1k', quality: 'medium', response_format: 'b64_json' }]);
      const job = await jobFor(topic.id);
      expect(job).toMatchObject({ status: 'stored', model: 'grok-imagine-image-2.0', aspectRatio: '16:9', resolution: '1k', quality: 'medium', servedModel: 'grok-imagine-image-2.0', providerRequestId: null, reportedCostMicros: 60_000 });
      expect(job.latencyMs).toBeGreaterThanOrEqual(0);
      expect(job.operation).toMatchObject({ costState: 'settled', reservedMicros: 80_000, settledMicros: 60_000 });
      expect(await processMediaAsset({ eventId: 'test', mediaId: job.mediaAssetId! }, { db: db(), storage: media.storage, randomKey: () => randomUUID().replace(/-/g, '') })).toBe('ready');
      const view = (await admin(agent().get(`${base}/topics/${topic.id}/images`)).expect(200)).body.data;
      expect(view).toMatchObject({ provider: 'xai', model: 'grok-imagine-image-2.0', aspectRatio: '16:9', resolution: '1k' });
      expect(view.jobs[0]).toMatchObject({ servedModel: 'grok-imagine-image-2.0', media: { status: 'ready' } });

      // A reported cost the approved price does not explain (for example a 2K image billed for a 1K request):
      // never settled as priced; counted at least at its reservation, and paid calls halt until reconciled.
      state.ticks = 800_000_000;
      expect((await generateImage(topic.id)).status).toBe(201);
      expect(await drain(topic.id)).toEqual(['image:stored']);
      expect((await jobFor(topic.id)).operation).toMatchObject({ costState: 'uncertain', reservedMicros: 80_000, settledMicros: 80_000 });
      expect((await admin(agent().get(`${base}/budget`)).expect(200)).body.data.paidHaltReason).toMatch(/provider reported cost 80000 micros, approved price xai-2.0-1k-medium expects 60000/);
      expect((await generateImage(topic.id)).body.error.code).toBe('PAID_CALLS_HALTED');
      await admin(agent().post(`${base}/budget/resume`)).send({ note: 'Cost discrepancy was a test fixture.' }).expect(200);
      // A reported cost above the reservation is never capped at it.
      state.ticks = 1_200_000_000;
      await generateImage(topic.id);
      expect(await drain(topic.id)).toEqual(['image:stored']);
      expect((await jobFor(topic.id)).operation).toMatchObject({ costState: 'uncertain', settledMicros: 120_000 });
      await admin(agent().post(`${base}/budget/resume`)).send({ note: 'Cost discrepancy was a test fixture.' }).expect(200);
      // Ticks round up, never down: 600,000,001 ticks is 60,001 micros, within the one-micro tolerance.
      state.ticks = 600_000_001;
      await generateImage(topic.id);
      expect(await drain(topic.id)).toEqual(['image:stored']);
      expect(await jobFor(topic.id)).toMatchObject({ reportedCostMicros: 60_001, operation: { costState: 'settled', settledMicros: 60_001 } });
      // No reported cost: the approved price for the configuration settles it.
      state.ticks = null;
      await generateImage(topic.id);
      expect(await drain(topic.id)).toEqual(['image:stored']);
      expect(await jobFor(topic.id)).toMatchObject({ reportedCostMicros: null, operation: { costState: 'settled', settledMicros: 60_000 } });

      // A retired model silently redirected (documented xAI lifecycle): uncertain, halted, never a candidate.
      state.ticks = 600_000_000;
      state.model = 'grok-imagine-image';
      expect((await generateImage(topic.id)).status).toBe(201);
      expect(await drain(topic.id)).toEqual(['image_unusable:model_substituted']);
      expect(await jobFor(topic.id)).toMatchObject({ status: 'failed', failureCode: 'model_substituted', servedModel: 'grok-imagine-image', mediaAssetId: null, operation: { costState: 'uncertain' } });
      expect((await admin(agent().get(`${base}/budget`)).expect(200)).body.data.paidHaltReason).toMatch(/provider reported model grok-imagine-image, approved grok-imagine-image-2.0/);
      expect((await generateImage(topic.id)).body.error.code).toBe('PAID_CALLS_HALTED');
      await admin(agent().post(`${base}/budget/resume`)).send({ note: 'Model substitution was a test fixture.' }).expect(200);
      expect((await saveSettings({ imageProvider: 'openai', imageModel: 'gpt-image-2.5-flare', imageAspectRatio: '3:2' })).status).toBe(200);
      xai = null;
    });

    it('settles a Gemini image at the per-image price plus billed prompt input and thinking/text, with the interaction id', async () => {
      const bytes = (await png(1600, 900)).toString('base64');
      const sent: Record<string, unknown>[] = [];
      gemini = new GeminiImageProvider('gm-fixture-key', async (_url, init) => {
        sent.push(JSON.parse(init.body!));
        const body = {
          id: 'v1_fixture_interaction',
          model: 'gemini-3.1-flash-image',
          status: 'completed',
          steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Done.' }, { type: 'image', data: bytes, mime_type: 'image/png' }] }],
          usage: { total_input_tokens: 60, total_output_tokens: 1140, total_thought_tokens: 300, input_tokens_by_modality: [{ modality: 'text', tokens: 60 }], output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }, { modality: 'text', tokens: 20 }] },
        };
        return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify(body) };
      });
      const topic = await draft('Marleston mochi kiosk');
      const proposal = { version: 'google-gemini-3.1-flash-image-t', provider: 'google', model: 'gemini-3.1-flash-image', currency: 'USD', inputMicrosPerMTok: 500_000, cachedInputMicrosPerMTok: 0, outputMicrosPerMTok: 0, longContextThresholdTokens: 32_000, imageResolution: '1k', imageQuality: 'auto', pricingUnit: 'image', perImageMicros: 67_000, sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing', effectiveFrom: '2026-09-19T00:00:00.000Z' };
      // Billed thinking needs its rate and a per-image bound before this price can exist.
      const unbounded = await admin(agent().post(`${base}/prices`)).send(proposal);
      expect(Object.keys(unbounded.body.error.fields).sort()).toEqual(['maxTextOutputTokens', 'textOutputMicrosPerMTok']);
      const price = (await admin(agent().post(`${base}/prices`)).send({ ...proposal, textOutputMicrosPerMTok: 3_000_000, maxTextOutputTokens: 4000 }).expect(201)).body.data;
      await admin(agent().post(`${base}/prices/${price.id}/approve`)).expect(200);
      // Gemini has no quality setting: "medium" is refused for this model.
      expect((await saveSettings({ imageProvider: 'google', imageModel: 'gemini-3.1-flash-image', imageAspectRatio: '16:9', imageResolution: '1k', imageQuality: 'medium' })).body.error.fields).toHaveProperty('imageQuality');
      expect((await saveSettings({ imageProvider: 'google', imageModel: 'gemini-3.1-flash-image', imageAspectRatio: '16:9', imageResolution: '1k', imageQuality: 'auto' })).status).toBe(200);

      expect((await generateImage(topic.id)).status).toBe(201);
      expect(await drain(topic.id)).toEqual(['image:stored']);
      expect(sent).toEqual([{ model: 'gemini-3.1-flash-image', input: expect.any(String), response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '16:9', image_size: '1K' }, store: false }]);
      const job = await jobFor(topic.id);
      expect(job).toMatchObject({ status: 'stored', model: 'gemini-3.1-flash-image', resolution: '1k', quality: 'auto', servedModel: 'gemini-3.1-flash-image', providerRequestId: 'v1_fixture_interaction' });
      // 60 input tokens at USD 0.50/M + one image at USD 0.067 + (20 text + 300 thinking) at USD 3/M.
      expect(job.operation).toMatchObject({ costState: 'settled', settledMicros: 30 + 67_000 + 960, outputTokens: 1440 });
      // The reservation bounded all of it: prompt input, the image and 4,000 text/thinking tokens.
      expect(job.operation.reservedMicros).toBeGreaterThanOrEqual(67_000 + 12_000);
      expect((await saveSettings({ imageProvider: 'openai', imageModel: 'gpt-image-2.5-flare', imageAspectRatio: '3:2', imageQuality: 'medium' })).status).toBe(200);
      gemini = null;
    });
  });

  describe('controlled provider comparison (provider amendment 01; follows the xAI and Gemini price tests above)', () => {
    it('quotes, reserves all or nothing, sends the same screened prompt to each provider, attaches nothing, and lets a person approve one', async () => {
      const bytes = (await png(1600, 900)).toString('base64');
      const xaiSent: Record<string, unknown>[] = [];
      const geminiSent: Record<string, unknown>[] = [];
      xai = {
        sent: xaiSent,
        model: 'grok-imagine-image-2.0',
        provider: new XaiImageProvider('xai-fixture-key', async (_url, init) => {
          xaiSent.push(JSON.parse(init.body!));
          return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ data: [{ b64_json: bytes }], model: 'grok-imagine-image-2.0', usage: { cost_in_usd_ticks: 600_000_000 } }) };
        }),
      };
      gemini = new GeminiImageProvider('gm-fixture-key', async (_url, init) => {
        geminiSent.push(JSON.parse(init.body!));
        return {
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify({ id: 'v1_cmp', model: 'gemini-3.1-flash-image', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'image', data: bytes, mime_type: 'image/png' }] }], usage: { total_input_tokens: 60, total_output_tokens: 1120, total_thought_tokens: 200, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] } }),
        };
      });
      const topic = await draft('Torrensville crepe window');
      // An existing featured candidate: a comparison never takes or replaces the featured slot.
      const featured = await storedImage(topic.id);
      const candidates = [
        { provider: 'openai', model: 'gpt-image-2.5-flare', resolution: '1k', quality: 'medium' },
        { provider: 'xai', model: 'grok-imagine-image-2.0', resolution: '1k', quality: 'medium' },
        { provider: 'google', model: 'gemini-3.1-flash-image', resolution: '1k', quality: 'auto' },
      ];
      const body = { aspectRatio: '16:9', candidates };
      // Needs generate and configure: a reviewer can neither quote nor run one.
      await admin(agent().post(`${base}/topics/${topic.id}/image-comparisons/quote`), viewerCookie).send(body).expect(403);
      const quote = (await admin(agent().post(`${base}/topics/${topic.id}/image-comparisons/quote`)).send(body).expect(200)).body.data;
      expect(quote.candidates.map((c: { provider: string }) => c.provider)).toEqual(['openai', 'xai', 'google']);
      // xAI is reserved at its highest approved configuration (2K medium), whatever this request's configuration.
      expect(quote.candidates[1]).toMatchObject({ maxMicros: 80_000, priceUnit: 'image', processingLocation: expect.stringMatching(/United States/) });
      expect(quote.totalMicros).toBe(quote.candidates.reduce((sum: number, c: { maxMicros: number }) => sum + c.maxMicros, 0));
      // A duplicate or a single setting is not a comparison.
      expect((await admin(agent().post(`${base}/topics/${topic.id}/image-comparisons/quote`)).send({ aspectRatio: '16:9', candidates: [candidates[0], candidates[0]] })).body.error.fields.candidates).toBeDefined();
      expect((await admin(agent().post(`${base}/topics/${topic.id}/image-comparisons/quote`)).send({ aspectRatio: '16:9', candidates: [candidates[0]] })).status).toBe(400);

      const start = async (key = randomUUID(), total = quote.totalMicros) =>
        admin(agent().post(`${base}/topics/${topic.id}/image-comparisons`)).set('Idempotency-Key', key).send({ ...body, expectedVersion: (await detail(topic.id)).version, expectedTotalMicros: total });
      expect((await start(randomUUID(), quote.totalMicros - 1)).body.error.code).toBe('COST_CHANGED');
      // All or nothing: a budget that covers only part of the comparison creates and reserves nothing.
      const day = (await bucket('image_day'))!;
      const opsBefore = await db().aIOperation.count({ where: { itemId: topic.id } });
      expect((await saveSettings({ imageDailyLimitMinor: Math.floor((day.reservedMicros + day.settledMicros + quote.totalMicros - 1) / 10_000) })).status).toBe(200);
      expect((await start()).body.error.code).toBe('BUDGET_EXCEEDED');
      expect(await db().aIOperation.count({ where: { itemId: topic.id } })).toBe(opsBefore);
      expect((await bucket('image_day'))!.reservedMicros).toBe(day.reservedMicros);
      expect((await saveSettings({ imageDailyLimitMinor: 100_000 })).status).toBe(200);

      const key = randomUUID();
      const started = await start(key);
      expect(started.status).toBe(201);
      const run = started.body.data;
      expect(run).toMatchObject({ created: true, totalMicros: quote.totalMicros });
      expect(run.operations).toHaveLength(3);
      // A repeated click is the same comparison, not a second one.
      const again = (await start(key)).body.data;
      expect(again).toMatchObject({ created: false, comparisonRunId: run.comparisonRunId });
      // Nothing else starts while it runs.
      expect((await generateImage(topic.id)).body.error.code).toBe('IMAGE_IN_PROGRESS');

      expect((await drain(topic.id)).sort()).toEqual(['image:stored', 'image:stored', 'image:stored']);
      const jobs = await db().aIImageJob.findMany({ where: { comparisonRunId: run.comparisonRunId }, include: { operation: true }, orderBy: { imageVersion: 'asc' } });
      expect(jobs.map((j) => [j.slot, j.provider, j.status, j.aspectRatio])).toEqual([
        ['comparison', 'openai', 'stored', '16:9'],
        ['comparison', 'xai', 'stored', '16:9'],
        ['comparison', 'google', 'stored', '16:9'],
      ]);
      // The same screened prompt, with the policy suffix, went to every provider.
      expect(new Set(jobs.map((j) => j.promptHash)).size).toBe(1);
      expect(images.state.calls.at(-1)!.prompt).toBe(jobs[0]!.prompt);
      expect(xaiSent.at(-1)!.prompt).toBe(jobs[0]!.prompt);
      expect(geminiSent.at(-1)!.input).toBe(jobs[0]!.prompt);
      expect((await db().aIImageJob.findUniqueOrThrow({ where: { id: featured.id } })).status).toBe('stored');
      // Each reserved and settled on its own; none is the featured image yet.
      expect(jobs.every((j) => j.operation.costState === 'settled' && j.operation.settledMicros! <= j.operation.reservedMicros)).toBe(true);
      expect((await db().post.findUniqueOrThrow({ where: { id: topic.postId } })).coverMediaId).toBeNull();
      for (const j of jobs) expect(await processMediaAsset({ eventId: 'test', mediaId: j.mediaAssetId! }, { db: db(), storage: media.storage, randomKey: () => randomUUID().replace(/-/g, '') })).toBe('ready');
      const view = (await admin(agent().get(`${base}/topics/${topic.id}/images`)).expect(200)).body.data;
      expect(view.jobs.filter((j: { comparisonRunId: string | null }) => j.comparisonRunId === run.comparisonRunId)).toHaveLength(3);

      // A person chooses one through the normal approval; the rest of the comparison is replaced.
      const chosen = jobs[1]!;
      expect((await approveImage(chosen.id, topic.postId, 'Illustration of a crepe stand with a folded crepe on a plate')).status).toBe(200);
      expect((await db().post.findUniqueOrThrow({ where: { id: topic.postId } })).coverMediaId).toBe(chosen.mediaAssetId);
      const after = await db().aIImageJob.findMany({ where: { comparisonRunId: run.comparisonRunId }, orderBy: { imageVersion: 'asc' } });
      expect(after.map((j) => j.status)).toEqual(['superseded', 'approved', 'superseded']);
      // The article's image gate treats it like any approved AI image.
      expect((await publishReasons(topic.postId)).filter((r) => /AI-generated featured image/.test(r))).toEqual([]);
      // …and exactly as strictly: an alt text changed after approval is no longer approved.
      await db().post.update({ where: { id: topic.postId }, data: { coverAlt: 'A different description' } });
      expect((await publishReasons(topic.postId)).some((r) => /AI-generated featured image/.test(r))).toBe(true);

      // Pilot evidence: recorded facts per result, no score.
      const evidence = (await admin(agent().get(`${base}/image-evidence`)).query({ itemId: topic.id, slot: 'comparison' }).expect(200)).body;
      expect(evidence.meta.total).toBe(3);
      const byProvider = Object.fromEntries(evidence.data.map((e: { provider: string }) => [e.provider, e]));
      expect(byProvider.google).toMatchObject({ model: 'gemini-3.1-flash-image', servedModel: 'gemini-3.1-flash-image', resolution: '1k', aspectRatio: '16:9', quality: 'auto', providerRequestId: 'v1_cmp', costState: 'settled', mediaStatus: 'ready', regeneration: false, policyVersion: expect.any(String) });
      expect(byProvider.xai).toMatchObject({ status: 'approved', reservedMicros: 80_000, settledMicros: 60_000, reportedCostMicros: 60_000, checksum: chosen.checksum, mediaAssetId: chosen.mediaAssetId });
      expect(byProvider.openai).toMatchObject({ reportedCostMicros: null });
      expect(evidence.data.every((e: { latencyMs: number | null }) => typeof e.latencyMs === 'number')).toBe(true);
      await admin(agent().get(`${base}/image-evidence`), viewerCookie).expect(403);
      expect((await admin(agent().get(`${base}/image-evidence`)).query({ pageSize: 51 })).status).toBe(400);
      xai = null;
      gemini = null;
    });

    it('keeps the pilot configuration entirely manual: with automation on, no scheduled task or entry point starts work', async () => {
      // The pilot configuration: the automation switch must be on for any paid call, everything else manual.
      expect((await saveSettings({ enabled: true, titleMode: 'manual', postingEnabled: false, publicationMode: 'review_required', imageMode: 'hybrid' })).status).toBe(200);
      const counts = async () => ({
        operations: await db().aIOperation.count(),
        pending: await db().aIOperation.count({ where: { state: { in: ['pending', 'running'] } } }),
        topics: await db().aIContentItem.count(),
        slots: await db().aIScheduleSlot.count(),
        published: await db().post.count({ where: { status: 'published' } }),
        scheduled: await db().post.count({ where: { status: 'scheduled' } }),
        buckets: (await db().aIBudgetBucket.findMany({ orderBy: { id: 'asc' } })).map((b) => [b.reservedMicros, b.settledMicros]),
      });
      const before = await counts();
      expect(before.pending).toBe(0);
      // Every AI scheduled task, run at 07:05 Adelaide time (after the default slot time), does nothing.
      const now = new Date('2026-09-20T21:35:00.000Z');
      expect(await TASK_IMPLEMENTATIONS['ai-content.plan-slots']!({ db: db(), now, queue: undefined as never })).toBe('Daily slot inactive (slot disabled)');
      expect(await planSlots(db(), now)).toMatchObject({ inactive: 'slot_disabled', filled: [], missed: [] });
      expect(await TASK_IMPLEMENTATIONS['ai-content.recover-operations']!({ db: db(), now, queue: undefined as never })).toBe('Nothing to recover');
      expect(await TASK_IMPLEMENTATIONS['ai-content.retention']!({ db: db(), now, queue: undefined as never })).toBe('Nothing expired');
      // Topic discovery only ever starts from a person's request, and manual topic mode refuses it.
      expect((await admin(agent().post(`${base}/discovery`)).set('Idempotency-Key', randomUUID()).send({})).body.error.code).toBe('MANUAL_TITLE_MODE');
      // Automatic images and auto-publishing cannot be switched on at all.
      expect((await saveSettings({ imageMode: 'automatic' })).status).toBe(400);
      expect((await saveSettings({ publicationMode: 'auto_publish' })).status).toBe(400);
      // Nothing was created, queued, reserved, spent, scheduled or published.
      expect(await counts()).toEqual(before);
      // The schedule screen agrees: the daily slot is not active.
      expect((await admin(agent().get(`${base}/schedule`)).expect(200)).body.data).toMatchObject({ active: false });
    });
  });
});
