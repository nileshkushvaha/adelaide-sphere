import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import request from 'supertest';
import { createDatabaseClient, type DatabaseClient } from '@adelaide-sphere/database';
import { claimOperation, recoverOperations, type ProviderResult, type TextRequest } from '@adelaide-sphere/database/automation';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { SUPER_ADMIN_ROLE } from '../src/identity/permissions.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';
import { resolveTestDatabaseUrl } from './integration/test-database-url.js';

/**
 * AI Content Phase 1D: budgeted generation from verified research, fact
 * coverage, approval, proposals and recovery (plan §N T4–T8 with T2/T3/T5/T6),
 * on the isolated `*_test` MySQL database only. The text provider is a fake:
 * no request reaches any real provider and nothing is paid.
 */
type Transport = (req: { url: URL; address: string; family: 4 | 6; headers: Record<string, string>; timeoutMs: number }) => Promise<{ status: number; headers: Record<string, string | undefined>; body: Readable }>;
type SubmitOutcome = { kind: 'accepted'; responseId: string } | { kind: 'rejected'; errorClass: string; retryable: boolean; retryAfterMs: number } | { kind: 'unknown'; errorClass: string };
type RetrieveOutcome = { kind: 'pending' } | { kind: 'done'; result: ProviderResult } | { kind: 'unavailable'; errorClass: string; permanent: boolean };
interface FakeProvider { id: string; submit(r: TextRequest): Promise<SubmitOutcome>; retrieve(id: string): Promise<RetrieveOutcome> }
type Lease = { operationId: string; owner: string; fencingToken: number };
const workerModule = <T,>(file: string) => import(new URL(`../../worker/src/ai-content/${file}`, import.meta.url).href) as Promise<T>;
let runAiOperation: (db: DatabaseClient, data: { operationId: string }, owner: string, deps: Record<string, unknown>) => Promise<string>;

const PUBLIC = '93.184.216.34';
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const CAFE = `<html><head><title>Example Cafe</title>${ld({ '@type': 'CafeOrCoffeeShop', name: 'Example Cafe', telephone: '+61 8 8000 0000', openingHours: 'Mo-Fr 07:00-15:00', address: '1 Example St, Norwood SA 5067' })}</head><body><p>Example Cafe, open Mo-Fr 07:00-15:00.</p></body></html>`;

/** Builds a covered article from the request's own verified claims, as a well-behaved model would. */
function articleFrom(request: TextRequest, extra = ''): Record<string, unknown> {
  const input = JSON.parse(request.input) as { claims: { id: string; kind: string; value: string }[]; tags: { id: string }[]; relatedArticles: { id: string; title: string }[] };
  const claim = (kind: string) => input.claims.find((c) => c.kind === kind)!;
  const hours = claim('opening_hours');
  const address = claim('address');
  const phone = claim('phone');
  const related = input.relatedArticles[0];
  return {
    title: 'Example Cafe in Norwood',
    slug: 'example-cafe-norwood',
    excerpt: 'When Example Cafe opens and where to find it, from its own website.',
    seoTitle: 'Example Cafe opening hours',
    seoDescription: 'Opening hours and address for Example Cafe.',
    seoKeywords: ['norwood cafe'],
    tagIds: input.tags.slice(0, 1).map((t) => t.id).concat(['cmnotarealtag0000000000']),
    sections: [
      { id: 'hours', heading: 'When to go', paragraphs: [{ text: `At the time of writing, Example Cafe lists its hours as ${hours.value}. Check before you visit, and see our espresso guide.${extra}`, claimIds: [hours.id] }] },
      { id: 'where', heading: 'Finding it', paragraphs: [{ text: `Example Cafe is at ${address.value}. Phone ${phone.value}.`, claimIds: [address.id, phone.id] }] },
    ],
    faqs: [{ question: 'Do I need to book?', answer: 'The cafe does not say; ask when you call.', claimIds: [] }],
    internalLinks: related ? [{ postId: related.id, sectionId: 'hours', anchor: 'espresso guide', reason: 'Related coffee guide' }] : [],
    imageBriefs: [{ placement: 'featured', prompt: 'An illustrative scene of a cafe counter, not a real venue', aspectRatio: '16:9', altDraft: 'Illustration of a cafe counter', captionDraft: '' }],
  };
}

function fakeProvider() {
  const state = {
    submits: [] as TextRequest[],
    retrieves: 0,
    submitMode: 'accept' as 'accept' | 'unknown' | 'rate_limited' | 'invalid',
    extra: '',
    /** Null echoes the requested model, as the provider does; a string simulates a different one. */
    model: null as string | null,
    serviceTier: 'default',
    usage: { input_tokens: 5000, output_tokens: 3000, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 1000 } } as Record<string, unknown> | null,
    pendingPolls: 0,
    results: new Map<string, TextRequest>(),
  };
  const provider: FakeProvider = {
    id: 'openai',
    async submit(r) {
      state.submits.push(r);
      if (state.submitMode === 'unknown') return { kind: 'unknown', errorClass: 'submit_timeout' };
      if (state.submitMode === 'rate_limited') return { kind: 'rejected', errorClass: 'rate_limited', retryable: true, retryAfterMs: 90_000 };
      if (state.submitMode === 'invalid') return { kind: 'rejected', errorClass: 'invalid_request', retryable: false, retryAfterMs: 0 };
      const id = `resp_${randomUUID().replace(/-/g, '')}`;
      state.results.set(id, r);
      return { kind: 'accepted', responseId: id };
    },
    async retrieve(id) {
      state.retrieves += 1;
      if (state.pendingPolls > 0) {
        state.pendingPolls -= 1;
        return { kind: 'pending' };
      }
      const r = state.results.get(id);
      if (!r) return { kind: 'unavailable', errorClass: 'result_expired', permanent: true };
      const output = r.schemaName === 'article_metadata'
        ? { title: 'Example Cafe: Norwood hours', excerpt: 'Hours and address for Example Cafe, from its own website.', seoTitle: 'Example Cafe Norwood', seoDescription: 'Example Cafe opening hours.', seoKeywords: ['example cafe'] }
        : articleFrom(r, state.extra);
      const u = state.usage as { input_tokens: number; output_tokens: number; input_tokens_details: { cached_tokens: number }; output_tokens_details: { reasoning_tokens: number } } | null;
      return {
        kind: 'done',
        result: {
          status: 'completed',
          output,
          refusal: null,
          incompleteReason: null,
          // Realistic usage never exceeds the request's own caps (a provider cannot bill past max_output_tokens).
          usage: u ? { inputTokens: Math.min(u.input_tokens, Buffer.byteLength(r.input)), cachedInputTokens: u.input_tokens_details.cached_tokens, outputTokens: Math.min(u.output_tokens, r.maxOutputTokens) } : null,
          reasoningTokens: u?.output_tokens_details.reasoning_tokens ?? null,
          model: state.model ?? r.model,
          serviceTier: state.serviceTier,
          errorCode: null,
        },
      };
    },
  };
  return { provider, state };
}

describe('AI Content Phase 1D generation (real MySQL/API, fake provider)', () => {
  let app: INestApplication;
  let cookie: string;
  let viewerCookie: string;
  let authorId: string;
  let categoryId: string;
  let pool: DatabaseClient;
  let pool2: DatabaseClient;
  let fake: ReturnType<typeof fakeProvider>;
  let providers: Record<string, FakeProvider>;
  const db = () => testDatabase();
  const agent = () => request(app.getHttpServer());
  const admin = (req: request.Test, c = cookie) => req.set('Origin', ORIGIN).set('Cookie', c);
  const base = '/api/v1/admin/ai-content';

  const transport: Transport = async (req) => {
    const key = req.url.toString();
    const body = key === 'https://cafe.example.org/' ? CAFE : '';
    return { status: body ? 200 : 404, headers: { 'content-type': 'text/html' }, body: Readable.from([Buffer.from(body)]) };
  };
  const deps = () => ({ fetchOptions: { transport, resolve: async () => [PUBLIC] }, textProviders: providers, sleep: async () => undefined, pollIntervalMs: 0, maxWaitMs: 60_000 });

  const login = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };
  async function saveSettings(values: Record<string, unknown>) {
    const current = (await admin(agent().get('/api/v1/admin/settings/ai-content')).expect(200)).body.data;
    await admin(agent().put('/api/v1/admin/settings/ai-content')).send({ expectedVersion: current.version, values }).expect(200);
  }
  const detail = async (id: string) => (await admin(agent().get(`${base}/topics/${id}`)).expect(200)).body.data;
  async function drain(itemId?: string) {
    const due = await db().$queryRaw<{ id: string; itemId: string | null }[]>`SELECT id, itemId FROM ai_operations WHERE state = 'pending' AND nextAttemptAt <= UTC_TIMESTAMP(3) ORDER BY createdAt`;
    const results: string[] = [];
    for (const op of itemId ? due.filter((o) => o.itemId === itemId) : due) results.push(await runAiOperation(db(), { operationId: op.id }, 'test-worker', deps()));
    return results;
  }
  /** A topic with verified research and a chosen category: ready to generate. */
  async function researched(title: string, withCategory = true) {
    const item = (await admin(agent().post(`${base}/topics`)).set('Idempotency-Key', randomUUID()).send({ title, priority: 0 }).expect(201)).body.data;
    await admin(agent().put(`${base}/topics/${item.id}/sources`)).send({ expectedVersion: (await detail(item.id)).version, sources: [{ url: 'https://cafe.example.org/' }] }).expect(200);
    await admin(agent().post(`${base}/topics/${item.id}/research`)).send({ expectedVersion: (await detail(item.id)).version, action: 'approve' }).expect(200);
    expect(await drain(item.id)).toEqual(['packet:verified']);
    if (withCategory) await admin(agent().put(`${base}/topics/${item.id}/article`)).send({ expectedVersion: (await detail(item.id)).version, categoryId }).expect(200);
    return detail(item.id);
  }
  const generate = async (id: string, scope: 'full' | 'metadata' = 'full', key = randomUUID()) =>
    admin(agent().post(`${base}/topics/${id}/generate`)).set('Idempotency-Key', key).send({ expectedVersion: (await detail(id)).version, scope });
  const opFor = (itemId: string, kind: 'generate' | 'apply' = 'generate') => db().aIOperation.findFirstOrThrow({ where: { itemId, kind }, orderBy: { createdAt: 'desc' } });
  const buckets = () => db().aIBudgetBucket.findMany({ orderBy: { scope: 'asc' } });
  async function approvePrices() {
    for (const [model, input, cached, output] of [['gpt-5.6-terra', 2_000_000, 200_000, 12_000_000], ['gpt-5.6-luna', 200_000, 20_000, 1_200_000]] as const) {
      const price = (await admin(agent().post(`${base}/prices`)).send({ version: `openai-${model}-2026-07-30`, provider: 'openai', model, currency: 'USD', inputMicrosPerMTok: input, cachedInputMicrosPerMTok: cached, outputMicrosPerMTok: output, longContextThresholdTokens: 272_000, sourceUrl: `https://developers.openai.com/api/docs/models/${model}`, effectiveFrom: '2026-07-30T00:00:00.000Z' }).expect(201)).body.data;
      await admin(agent().post(`${base}/prices/${price.id}/approve`)).expect(200);
    }
  }
  async function fullDraft(title: string) {
    const item = await researched(title);
    const started = await generate(item.id);
    expect(started.body.error ?? null).toBeNull();
    await drain(item.id);
    await drain(item.id);
    return detail(item.id);
  }

  beforeAll(async () => {
    ({ runAiOperation } = await workerModule<{ runAiOperation: typeof runAiOperation }>('operations.ts'));
    await truncateApplicationTables();
    // The control row is deployment state and survives truncation; a halt left by an earlier run is cleared here.
    await testDatabase().$executeRaw`UPDATE ai_automation_controls SET paidCallsHaltedAt = NULL, paidHaltReason = NULL`;
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.60');
    await seedSuperAdmin(app, { email: 'ai-viewer-1d@example.com', password: 'viewer-1d-password-12345', displayName: 'Viewer 1D' });
    const viewer = await db().adminUser.findUniqueOrThrow({ where: { email: 'ai-viewer-1d@example.com' } });
    const superRole = await db().role.findUniqueOrThrow({ where: { key: SUPER_ADMIN_ROLE.key } });
    await db().adminRole.delete({ where: { adminId_roleId: { adminId: viewer.id, roleId: superRole.id } } });
    const role = await db().role.create({ data: { key: 'ai_viewer_1d', name: 'AI viewer', description: 'test' } });
    const perms = await db().permission.findMany({ where: { key: { in: ['ai_content.view', 'ai_content.review', 'posts.view', 'posts.update'] } } });
    await db().rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
    await db().adminRole.create({ data: { adminId: viewer.id, roleId: role.id } });
    viewerCookie = await login('ai-viewer-1d@example.com', 'viewer-1d-password-12345', '203.0.113.61');
    authorId = (await admin(agent().post('/api/v1/admin/authors')).send({ displayName: 'Casey Editor', bio: 'Edits local guides.' }).expect(201)).body.data.id;
    categoryId = (await admin(agent().post('/api/v1/admin/blog-categories')).send({ name: 'Cafes' }).expect(201)).body.data.id;
    await admin(agent().post('/api/v1/admin/blog-tags')).send({ name: 'Coffee' }).expect(201);
    // A published article research can offer as related context, and a private draft that must never be sent.
    const guide = (await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Norwood espresso guide', excerpt: 'Where to drink espresso around Norwood and Kent Town.', bodyMarkdown: 'Espresso in Norwood cafe culture. '.repeat(10), authorId, categoryId }).expect(201)).body.data;
    await admin(agent().post(`/api/v1/admin/posts/${guide.id}/publish`)).send({ expectedVersion: guide.version }).expect(200);
    await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Secret draft about Norwood cafe landlords', excerpt: 'Private notes that must never leave the database.', authorId, categoryId }).expect(201);
    pool = createDatabaseClient({ url: resolveTestDatabaseUrl(), connectionLimit: 6, allowPublicKeyRetrieval: true });
    pool2 = createDatabaseClient({ url: resolveTestDatabaseUrl(), connectionLimit: 6, allowPublicKeyRetrieval: true });
    // Generous test caps: individual tests set tight caps where they test them.
    await saveSettings({ enabled: true, titleMode: 'manual', hardDailyLimitMinor: 100_000, hardMonthlyLimitMinor: 100_000 });
    await admin(agent().post(`${base}/sources`)).send({ host: 'cafe.example.org', label: 'Example Cafe', tier: 'official_business' }).expect(201);
  });

  beforeEach(() => {
    fake = fakeProvider();
    providers = { openai: fake.provider };
  });

  afterAll(async () => {
    await pool.$disconnect();
    await pool2.$disconnect();
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  describe('fail-closed prerequisites (T8, owner rules)', () => {
    it('refuses without a byline, a category, an approved price, or automation, and makes no reservation', async () => {
      const item = await researched('Norwood coffee roaster tour', false);
      expect((await generate(item.id)).body.error.code).toBe('AUTHOR_NOT_SELECTED');
      await admin(agent().put('/api/v1/admin/settings/ai-content')).send({ expectedVersion: (await admin(agent().get('/api/v1/admin/settings/ai-content'))).body.data.version, values: { articleAuthorId: 'cmnotanauthor000000000000' } }).expect(400);
      await saveSettings({ articleAuthorId: authorId });
      expect((await generate(item.id)).body.error.code).toBe('CATEGORY_REQUIRED');
      await admin(agent().put(`${base}/topics/${item.id}/article`)).send({ expectedVersion: (await detail(item.id)).version, categoryId }).expect(200);
      expect((await generate(item.id)).body.error.code).toBe('PRICE_UNKNOWN');
      await approvePrices();
      await saveSettings({ enabled: false });
      expect((await generate(item.id)).body.error.code).toBe('AUTOMATION_DISABLED');
      await saveSettings({ enabled: true });
      expect(await db().aIOperation.count({ where: { kind: 'generate' } })).toBe(0);
      expect(await buckets()).toEqual([]);
      expect((await detail(item.id)).status).toBe('researching');
    });

    it('fails before any request when no server-side credential is configured, releasing the reservation', async () => {
      const item = await researched('Kent Town bakery breakfast');
      providers = {};
      expect((await generate(item.id)).status).toBe(201);
      expect((await opFor(item.id)).costState).toBe('reserved');
      expect(await drain(item.id)).toEqual(['rejected:credential_missing:failed']);
      expect(fake.state.submits).toHaveLength(0);
      expect(await opFor(item.id)).toMatchObject({ state: 'failed', costState: 'released' });
      expect((await buckets()).every((b) => b.reservedMicros === 0 && b.settledMicros === 0)).toBe(true);
      expect(await detail(item.id)).toMatchObject({ status: 'failed', failureStage: 'generation', failureCode: 'credential_missing' });
    });
  });

  describe('generation, settlement, provenance and one canonical Post (T2/T4/T6/T7)', () => {
    it('reserves, sends once, settles from usage, records provenance and creates exactly one draft', async () => {
      const item = await researched('Magill espresso lunch spot');
      const key = randomUUID();
      const first = await generate(item.id, 'full', key);
      expect(first.status).toBe(201);
      // The same click again is the same operation and the same reservation.
      const again = await generate(item.id, 'full', key);
      expect(again.body.data.operationId).toBe(first.body.data.operationId);
      const op = await opFor(item.id);
      expect(op).toMatchObject({ costState: 'reserved', provider: 'openai', model: 'gpt-5.6-terra', providerPhase: 'prepared' });
      expect(op.reservedMicros).toBeGreaterThan(96_000);
      expect(op.reservedMicros).toBeLessThanOrEqual(250_000);
      // Only provider-safe data: verified public claims, public sources, published context and strategy.
      const sent = (op.requestPayload as unknown as { request: TextRequest }).request;
      expect(Object.keys(JSON.parse(sent.input)).sort()).toEqual(['category', 'claims', 'editorialStrategy', 'location', 'maxInternalLinks', 'relatedArticles', 'sources', 'tags', 'topic']);
      expect(sent.input).not.toContain('Secret draft');
      expect(sent.input).not.toContain('landlords');

      expect(await drain(item.id)).toEqual(['generated:covered']);
      expect(fake.state.submits).toHaveLength(1);
      const settled = await db().aIOperation.findUniqueOrThrow({ where: { id: op.id } });
      expect(settled).toMatchObject({ state: 'succeeded', costState: 'settled', outputTokens: 3000, reasoningTokens: 1000, providerPhase: 'done' });
      // Priced exactly from reported usage with the approved schedule: USD 2 in / 12 out per million tokens.
      const cost = settled.inputTokens! * 2 + settled.outputTokens! * 12;
      expect(settled.settledMicros).toBe(cost);
      expect(cost).toBeLessThan(settled.reservedMicros);
      const [day, month] = await buckets();
      // Earlier tests settled nothing (their calls were refused or released), so the buckets hold exactly this call.
      expect(day).toMatchObject({ scope: 'day', reservedMicros: 0, settledMicros: cost });
      expect(month).toMatchObject({ scope: 'month', reservedMicros: 0, settledMicros: cost });

      expect(await drain(item.id)).toEqual(['applied:created']);
      const topic = await detail(item.id);
      expect(topic.status).toBe('ready_for_review');
      const post = await db().post.findUniqueOrThrow({ where: { id: topic.postId }, include: { tags: true } });
      expect(post).toMatchObject({ status: 'draft', authorId, categoryId, slug: 'example-cafe-norwood', title: 'Example Cafe in Norwood' });
      expect(post.sanitizedBody).toContain('Mo-Fr 07:00-15:00');
      expect(post.sanitizedBody).toMatch(/<a href="\/blog\/norwood-espresso-guide"[^>]*>espresso guide<\/a>/);
      expect(post.tags).toHaveLength(1); // the invented tag id was dropped, never created
      const run = await db().aIGenerationRun.findFirstOrThrow({ where: { itemId: item.id } });
      expect(run).toMatchObject({ status: 'applied', factCheck: 'passed', provider: 'openai', model: 'gpt-5.6-terra', promptVersion: 'article-prompt.v1', schemaVersion: 'article.v1', disclosureText: expect.stringMatching(/^AI-assisted content/), generationOperationId: op.id });
      expect(run.promptHash).toMatch(/^[0-9a-f]{64}$/);
      expect(run.researchPacketHash).toMatch(/^[0-9a-f]{64}$/);
      expect(run.imageBriefs).toEqual([expect.objectContaining({ placement: 'featured' })]);
      // A redelivered job does nothing: no second request, no second Post.
      expect(await runAiOperation(db(), { operationId: op.id }, 'late', deps())).toBe('not claimable');
      expect(fake.state.submits).toHaveLength(1);
      expect(await db().post.count({ where: { slug: { startsWith: 'example-cafe-norwood' } } })).toBe(1);
    });

    it('holds a draft with an unsupported fact in fact review, refuses approval, and releases it once a person fixes it', async () => {
      const item = await researched('Stepney dumpling bar');
      fake.state.extra = ' Locals rate it 4.8 stars.';
      await generate(item.id);
      expect(await drain(item.id)).toEqual(['generated:fact_review']);
      await drain(item.id);
      const topic = await detail(item.id);
      expect(topic.status).toBe('needs_fact_review');
      const run = await db().aIGenerationRun.findFirstOrThrow({ where: { itemId: item.id } });
      expect(run.factCheck).toBe('failed');
      expect(run.coverage).toEqual(expect.arrayContaining([expect.objectContaining({ token: '4.8', reason: 'unsupported_value' })]));
      const post = await db().post.findUniqueOrThrow({ where: { id: topic.postId } });
      const refused = await admin(agent().post(`${base}/topics/${item.id}/approve`)).send({ expectedVersion: topic.version, postVersion: post.version });
      expect(refused.status).toBe(409);
      // A person removes the claim; re-checking against evidence releases it to review.
      await admin(agent().patch(`/api/v1/admin/posts/${post.id}`)).send({ expectedVersion: post.version, bodyMarkdown: post.bodyMarkdown.replace(' Locals rate it 4.8 stars.', ''), bodyFormat: 'markdown' }).expect(200);
      const rechecked = await admin(agent().post(`${base}/topics/${item.id}/recheck-facts`)).send({ expectedVersion: (await detail(item.id)).version }).expect(200);
      expect(rechecked.body.data.status).toBe('ready_for_review');
    });

    it('binds approval to the exact article and research, and the publication gate enforces both', async () => {
      const drafted = await fullDraft('Payneham gelato shop');
      let post = await db().post.findUniqueOrThrow({ where: { id: drafted.postId } });
      // A person adds a fact the research does not support: approval checks the article as it stands, and refuses.
      await admin(agent().patch(`/api/v1/admin/posts/${post.id}`)).send({ expectedVersion: post.version, bodyMarkdown: `${post.bodyMarkdown}\n\nOpen since 1999 with 40 seats.`, bodyFormat: 'markdown' }).expect(200);
      post = await db().post.findUniqueOrThrow({ where: { id: post.id } });
      const unsupported = await admin(agent().post(`${base}/topics/${drafted.id}/approve`)).send({ expectedVersion: (await detail(drafted.id)).version, postVersion: post.version }).expect(409);
      expect(unsupported.body.error.code).toBe('UNSUPPORTED_FACTS');
      expect(unsupported.body.error.fields.facts).toEqual(expect.arrayContaining([expect.stringMatching(/1999/), expect.stringMatching(/"40"/)]));
      await admin(agent().patch(`/api/v1/admin/posts/${post.id}`)).send({ expectedVersion: post.version, bodyMarkdown: post.bodyMarkdown.replace('\n\nOpen since 1999 with 40 seats.', ''), bodyFormat: 'markdown' }).expect(200);
      post = await db().post.findUniqueOrThrow({ where: { id: post.id } });
      const topic = await detail(drafted.id);
      // The reviewer must have read the current version.
      await admin(agent().post(`${base}/topics/${topic.id}/approve`)).send({ expectedVersion: topic.version, postVersion: post.version + 1 }).expect(409);
      await admin(agent().post(`${base}/topics/${topic.id}/approve`), viewerCookie).send({ expectedVersion: topic.version, postVersion: post.version }).expect(403);
      await admin(agent().post(`${base}/topics/${topic.id}/approve`)).send({ expectedVersion: topic.version, postVersion: post.version, note: 'Checked against the venue site' }).expect(200);
      const approval = await db().aIApproval.findFirstOrThrow({ where: { itemId: topic.id } });
      const packet = await db().aIResearchPacket.findFirstOrThrow({ where: { itemId: topic.id }, orderBy: { version: 'desc' } });
      expect(approval).toMatchObject({ researchPacketId: packet.id, researchPacketHash: packet.contentHash, postVersion: post.version });
      // Approval never publishes by itself; publishing is the ordinary, separately permitted action.
      expect((await db().post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('draft');
      await admin(agent().post(`/api/v1/admin/posts/${post.id}/publish`)).send({ expectedVersion: post.version }).expect(200);
      post = await db().post.findUniqueOrThrow({ where: { id: post.id } });
      // Readers see the disclosure recorded with the draft.
      const pub = await agent().get(`/api/v1/posts/${post.slug}`).expect(200);
      expect(pub.body.data.aiDisclosure).toMatch(/^AI-assisted content: This article was prepared with AI assistance/);
    });

    it('refuses publication when the research changed after approval', async () => {
      const topic = await fullDraft('Marden pho kitchen');
      const post = await db().post.findUniqueOrThrow({ where: { id: topic.postId } });
      await admin(agent().post(`${base}/topics/${topic.id}/approve`)).send({ expectedVersion: topic.version, postVersion: post.version }).expect(200);
      // Simulate newer research: a newer verified packet with a different content hash.
      const latest = await db().aIResearchPacket.findFirstOrThrow({ where: { itemId: topic.id }, orderBy: { version: 'desc' } });
      await db().aIResearchPacket.create({ data: { itemId: topic.id, version: latest.version + 1, status: 'verified', inventoryEpoch: 1, freshUntil: new Date(Date.now() + 3_600_000), contentHash: 'f'.repeat(64) } });
      const blocked = await admin(agent().post(`/api/v1/admin/posts/${post.id}/publish`)).send({ expectedVersion: post.version }).expect(409);
      expect(blocked.body.error.fields.publication).toEqual(expect.arrayContaining([expect.stringMatching(/research changed after approval/)]));
    });
  });

  describe('budget, pricing discrepancies and races (T3/T7)', () => {
    it('never reserves beyond the daily cap when two generations race', async () => {
      const a = await researched('Felixstow pizza oven');
      const b = await researched('Hackney ramen house');
      const perCall = (await db().aIOperation.findFirstOrThrow({ where: { kind: 'generate', scope: 'full', costState: 'settled' } })).reservedMicros;
      const before = (await buckets()).find((x) => x.scope === 'day')!;
      // Room for exactly one more reservation of this size, never two.
      const limitMinor = Math.floor((before.reservedMicros + before.settledMicros + perCall * 1.5) / 10_000);
      await saveSettings({ hardDailyLimitMinor: limitMinor });
      const [va, vb] = [(await detail(a.id)).version, (await detail(b.id)).version];
      const results = await Promise.all([
        admin(agent().post(`${base}/topics/${a.id}/generate`)).set('Idempotency-Key', randomUUID()).send({ expectedVersion: va, scope: 'full' }),
        admin(agent().post(`${base}/topics/${b.id}/generate`)).set('Idempotency-Key', randomUUID()).send({ expectedVersion: vb, scope: 'full' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe('BUDGET_EXCEEDED');
      const day = (await buckets()).find((x) => x.scope === 'day')!;
      expect(day.reservedMicros + day.settledMicros).toBeLessThanOrEqual(limitMinor * 10_000);
      expect(day.reservedMicros).toBeGreaterThan(0);
      await drain();
      await drain();
      await saveSettings({ hardDailyLimitMinor: 100_000 });
    });

    it('refuses a generation whose worst case exceeds the per-article cap', async () => {
      const item = await researched('Joslin tapas corner');
      await saveSettings({ maxWorkflowCostMinor: 5 });
      expect((await generate(item.id)).body.error.code).toBe('WORKFLOW_CAP_EXCEEDED');
      await saveSettings({ maxWorkflowCostMinor: 25 });
    });

    it('halts all paid calls when the provider reports a different model or unpriceable usage, until reconciled', async () => {
      const item = await researched('Evandale waffle cart');
      fake.state.model = 'gpt-5.6-sol';
      await generate(item.id);
      expect(await drain(item.id)).toEqual(['generated:covered']);
      const op = await opFor(item.id);
      expect(op.costState).toBe('uncertain');
      expect(op.settledMicros).toBe(op.reservedMicros); // never zero, never less than reserved
      const status = (await admin(agent().get(`${base}/budget`)).expect(200)).body.data;
      expect(status.paidHaltReason).toMatch(/gpt-5.6-sol/);
      const next = await researched('Firle noodle stall');
      expect((await generate(next.id)).body.error.code).toBe('PAID_CALLS_HALTED');
      await admin(agent().post(`${base}/budget/resume`)).send({ note: 'x' }).expect(400);
      await admin(agent().post(`${base}/budget/resume`)).send({ note: 'Checked the provider invoice; model mismatch was a test fixture.' }).expect(200);
      fake.state.model = null;
      fake.state.usage = null;
      expect((await generate(next.id)).status).toBe(201);
      await drain(next.id);
      expect(await opFor(next.id)).toMatchObject({ costState: 'uncertain' });
      expect((await admin(agent().get(`${base}/budget`))).body.data.paidHaltReason).toMatch(/priceable usage/);
      await admin(agent().post(`${base}/budget/resume`)).send({ note: 'Usage reconciled manually against the provider dashboard.' }).expect(200);
      await drain();
    });
  });

  describe('unknown outcomes, rejections and recovery (T6)', () => {
    it('holds an unknown submission for an operator: no re-send, the reservation stays counted, abandonment records the cost', async () => {
      const item = await researched('Trinity crepe window');
      const dayBefore = (await buckets()).find((b) => b.scope === 'day')!;
      fake.state.submitMode = 'unknown';
      await generate(item.id);
      expect(await drain(item.id)).toEqual(['outcome_unknown:submit_timeout']);
      const op = await opFor(item.id);
      expect(op).toMatchObject({ state: 'outcome_unknown', costState: 'reserved', providerPhase: 'sending' });
      expect(await claimOperation(db(), { operationId: op.id, owner: 'retry' })).toBeNull();
      expect(await recoverOperations(db())).toMatchObject({ reclaimed: 0 });
      expect(fake.state.submits).toHaveLength(1);
      // Another generation for the topic is refused until this is resolved.
      expect((await generate(item.id)).body.error.code).toBe('INVALID_TRANSITION');
      await admin(agent().post(`${base}/operations/${op.id}/resolve`)).send({ action: 'reconcile', note: 'Try looking it up' }).expect(409);
      await admin(agent().post(`${base}/operations/${op.id}/resolve`)).send({ action: 'abandon', note: 'No response id; provider dashboard checked; counting the charge.' }).expect(200);
      expect(await db().aIOperation.findUniqueOrThrow({ where: { id: op.id } })).toMatchObject({ state: 'failed', costState: 'uncertain', settledMicros: op.reservedMicros });
      const dayAfter = (await buckets()).find((b) => b.scope === 'day')!;
      expect(dayAfter.reservedMicros).toBe(dayBefore.reservedMicros);
      expect(dayAfter.settledMicros - dayBefore.settledMicros).toBe(op.reservedMicros);
      expect(await detail(item.id)).toMatchObject({ status: 'failed', failureCode: 'outcome_abandoned' });
    });

    it('treats a worker lost mid-send as unknown, and a worker lost after acceptance as a look-up only', async () => {
      const lost = await researched('Glynde curry lane');
      await generate(lost.id);
      const op = await opFor(lost.id);
      const lease = await claimOperation(db(), { operationId: op.id, owner: 'crashing', leaseMs: 200 });
      expect(lease).not.toBeNull();
      await db().aIOperation.update({ where: { id: op.id }, data: { providerPhase: 'sending' } });
      await new Promise((r) => setTimeout(r, 350));
      await recoverOperations(db());
      expect(await db().aIOperation.findUniqueOrThrow({ where: { id: op.id } })).toMatchObject({ state: 'outcome_unknown', errorClass: 'worker_lost_during_send' });
      expect(fake.state.submits).toHaveLength(0);

      const accepted = await researched('Klemzig kebab grill');
      fake.state.pendingPolls = 1_000;
      await generate(accepted.id);
      const op2 = await opFor(accepted.id);
      const results = await runAiOperation(db(), { operationId: op2.id }, 'slow', { ...deps(), maxWaitMs: 0 });
      expect(results).toMatch(/^awaiting_result/);
      expect(fake.state.submits).toHaveLength(1);
      fake.state.pendingPolls = 0;
      await db().aIOperation.update({ where: { id: op2.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      expect(await drain(accepted.id)).toEqual(['generated:covered']);
      expect(fake.state.submits).toHaveLength(1); // retrieved by id, never sent again
    });

    it('retries a rate-limited submission no sooner than Retry-After, and fails a permanent refusal with the reservation released', async () => {
      const item = await researched('Vale bagel counter');
      fake.state.submitMode = 'rate_limited';
      await generate(item.id);
      expect(await drain(item.id)).toEqual(['rejected:rate_limited:retrying']);
      const op = await opFor(item.id);
      expect(op).toMatchObject({ state: 'pending', costState: 'reserved', providerPhase: 'prepared' });
      expect(op.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(Date.now() + 80_000);
      const refused = await researched('Heights taco truck');
      fake.state.submitMode = 'invalid';
      await generate(refused.id);
      expect(await drain(refused.id)).toEqual(['rejected:invalid_request:failed']);
      expect(await opFor(refused.id)).toMatchObject({ state: 'failed', costState: 'released' });
    });
  });

  describe('human protection, proposals and light-model suggestions (T5)', () => {
    it('keeps a regeneration of a human-edited draft as a proposal, and applies it only on the version a person compared', async () => {
      const topic = await fullDraft('Royston donut stand');
      const post = await db().post.findUniqueOrThrow({ where: { id: topic.postId } });
      await admin(agent().patch(`/api/v1/admin/posts/${post.id}`)).send({ expectedVersion: post.version, title: 'Example Cafe in Norwood, edited by hand' }).expect(200);
      await generate(topic.id);
      await drain(topic.id);
      expect(await drain(topic.id)).toEqual(['proposal:human_modified']);
      const proposal = await db().aIGenerationRun.findFirstOrThrow({ where: { itemId: topic.id, status: 'proposal' } });
      const current = await db().post.findUniqueOrThrow({ where: { id: post.id } });
      expect(current.title).toBe('Example Cafe in Norwood, edited by hand');
      await admin(agent().post(`${base}/runs/${proposal.id}/apply`)).send({ expectedPostVersion: current.version - 1 }).expect(409);
      await admin(agent().post(`${base}/runs/${proposal.id}/apply`), viewerCookie).send({ expectedPostVersion: current.version }).expect(403);
      const applied = await admin(agent().post(`${base}/runs/${proposal.id}/apply`)).send({ expectedPostVersion: current.version }).expect(200);
      expect(applied.body.data.status).toBe('ready_for_review');
      expect((await db().post.findUniqueOrThrow({ where: { id: post.id } })).title).toBe('Example Cafe in Norwood');
      expect(await db().contentRevision.findFirst({ where: { resourceId: post.id, reason: { startsWith: 'AI proposal' } } })).not.toBeNull();
    });

    it('uses the light model for title and SEO suggestions, as a proposal only', async () => {
      const topic = await fullDraft('Maylands sushi train');
      await generate(topic.id, 'metadata');
      expect((await opFor(topic.id)).model).toBe('gpt-5.6-luna');
      expect(await drain(topic.id)).toEqual(['proposal:metadata']);
      const run = await db().aIGenerationRun.findFirstOrThrow({ where: { itemId: topic.id, scope: 'metadata' } });
      expect(run).toMatchObject({ status: 'proposal', model: 'gpt-5.6-luna', factCheck: 'passed' });
      expect((await detail(topic.id)).status).toBe('ready_for_review');
      const history = (await admin(agent().get(`${base}/topics/${topic.id}/generation`)).expect(200)).body.data;
      expect(history.runs[0]).toMatchObject({ scope: 'metadata', status: 'proposal' });
      expect(history.operations[0]).toMatchObject({ kind: 'generate', costState: 'settled' });
    });

    it('never regenerates an article that has been published', async () => {
      const topic = await fullDraft('Beulah laksa bowl');
      const post = await db().post.findUniqueOrThrow({ where: { id: topic.postId } });
      await admin(agent().post(`${base}/topics/${topic.id}/approve`)).send({ expectedVersion: topic.version, postVersion: post.version }).expect(200);
      await admin(agent().post(`/api/v1/admin/posts/${post.id}/publish`)).send({ expectedVersion: post.version }).expect(200);
      expect((await generate(topic.id)).body.error.code).toBe('INVALID_TRANSITION');
      expect((await generate(topic.id, 'metadata')).body.error.code).toBe('INVALID_TRANSITION');
    });

    it('denies generation, pricing and resolution to administrators without those permissions', async () => {
      const topic = await detail((await db().aIContentItem.findFirstOrThrow({ where: { status: 'researching' } })).id);
      await admin(agent().post(`${base}/topics/${topic.id}/generate`), viewerCookie).set('Idempotency-Key', randomUUID()).send({ expectedVersion: topic.version, scope: 'full' }).expect(403);
      await admin(agent().get(`${base}/prices`), viewerCookie).expect(403);
      await admin(agent().post(`${base}/budget/resume`), viewerCookie).send({ note: 'not allowed here' }).expect(403);
      await admin(agent().post(`${base}/operations/cmnotanoperation00000000/resolve`), viewerCookie).send({ action: 'abandon', note: 'not allowed here' }).expect(403);
      await admin(agent().get(`${base}/budget`), viewerCookie).expect(200);
      await admin(agent().post(`${base}/topics/${topic.id}/generate`)).send({ expectedVersion: topic.version, scope: 'full' }).expect(400);
    });
  });
});
