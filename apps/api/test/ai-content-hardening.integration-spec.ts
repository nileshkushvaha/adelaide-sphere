import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import request from 'supertest';
import type { DatabaseClient } from '@adelaide-sphere/database';
import { planSlots, purgeExpiredAiData, requestGeneration, requestImage, type ProviderResult, type TextRequest } from '@adelaide-sphere/database/automation';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { metricsRegistry } from '../src/observability/metrics.registry.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/**
 * AI Content Phase 1G: hardening (plan §O 1G, owner decisions of 19 September
 * 2026: hardening only, auto-publish stays off). The final publication checks,
 * the kill switch across every entry point, retry of a failed draft,
 * retention and the operator signals. Isolated `*_test` database, fake
 * providers, nothing paid or published outside the test.
 */
type Transport = (req: { url: URL; address: string; family: 4 | 6; headers: Record<string, string>; timeoutMs: number }) => Promise<{ status: number; headers: Record<string, string | undefined>; body: Readable }>;
const worker = <T,>(file: string) => import(new URL(`../../worker/src/${file}`, import.meta.url).href) as Promise<T>;
let runAiOperation: (db: DatabaseClient, data: { operationId: string }, owner: string, deps: Record<string, unknown>) => Promise<string>;

const PUBLIC = '93.184.216.34';
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const CAFE = `<html><head><title>Example Cafe</title>${ld({ '@type': 'CafeOrCoffeeShop', name: 'Example Cafe', telephone: '+61 8 8000 0000', openingHours: 'Mo-Fr 07:00-15:00', address: '1 Example St, Norwood SA 5067' })}</head><body><p>Example Cafe, open Mo-Fr 07:00-15:00.</p></body></html>`;

function textProvider() {
  const state = { invalid: false };
  const results = new Map<string, TextRequest>();
  const provider = {
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
      const output = state.invalid
        ? { not: 'an article' }
        : {
            title: 'Example Cafe in Norwood',
            slug: `example-cafe-${randomUUID().slice(0, 8)}`,
            excerpt: 'When Example Cafe opens, from its own website.',
            seoTitle: 'Example Cafe opening hours',
            seoDescription: 'Opening hours for Example Cafe.',
            seoKeywords: ['norwood cafe'],
            tagIds: [],
            sections: [
              { id: 'hours', heading: 'When to go', paragraphs: [{ text: `Example Cafe lists its hours as ${hours.value}.`, claimIds: [hours.id] }] },
              { id: 'tips', heading: 'Before you go', paragraphs: [{ text: 'Check the hours before you visit, because they can change without notice. Bring a keep cup, arrive early on weekends, and expect a short wait when the morning rush is on.', claimIds: [] }] },
            ],
            faqs: [],
            internalLinks: [],
            imageBriefs: [{ placement: 'featured', prompt: 'An illustrative scene of a cafe counter, not a real venue', aspectRatio: '16:9', altDraft: 'Illustration of a cafe counter', captionDraft: '' }],
          };
      return { kind: 'done', result: { status: 'completed', output, refusal: null, incompleteReason: null, usage: { inputTokens: 2000, cachedInputTokens: 0, outputTokens: 1500 }, reasoningTokens: 0, model: r.model, serviceTier: 'default', errorCode: null } };
    },
  };
  return { provider, state };
}

describe('AI Content Phase 1G hardening (real MySQL/API)', () => {
  let app: INestApplication;
  let cookie: string;
  let authorId: string;
  let categoryId: string;
  let text: ReturnType<typeof textProvider>;
  const db = () => testDatabase();
  const agent = () => request(app.getHttpServer());
  const admin = (req: request.Test) => req.set('Origin', ORIGIN).set('Cookie', cookie);
  const base = '/api/v1/admin/ai-content';
  const transport: Transport = async (req) => {
    const body = req.url.toString() === 'https://cafe.example.org/' ? CAFE : '';
    return { status: body ? 200 : 404, headers: { 'content-type': 'text/html' }, body: Readable.from([Buffer.from(body)]) };
  };
  const deps = () => ({ fetchOptions: { transport, resolve: async () => [PUBLIC] }, textProviders: { openai: text.provider }, sleep: async () => undefined, pollIntervalMs: 0, maxWaitMs: 60_000 });
  async function saveSettings(values: Record<string, unknown>) {
    const current = (await admin(agent().get('/api/v1/admin/settings/ai-content')).expect(200)).body.data;
    return admin(agent().put('/api/v1/admin/settings/ai-content')).send({ expectedVersion: current.version, values });
  }
  const detail = async (id: string) => (await admin(agent().get(`${base}/topics/${id}`)).expect(200)).body.data;
  async function drain(itemId: string) {
    const due = await db().$queryRaw<{ id: string }[]>`SELECT id FROM ai_operations WHERE state = 'pending' AND nextAttemptAt <= UTC_TIMESTAMP(3) AND itemId = ${itemId} ORDER BY createdAt`;
    const out: string[] = [];
    for (const op of due) out.push(await runAiOperation(db(), { operationId: op.id }, 'test-worker', deps()));
    return out;
  }
  async function researched(title: string) {
    const item = (await admin(agent().post(`${base}/topics`)).set('Idempotency-Key', randomUUID()).send({ title, priority: 0 }).expect(201)).body.data;
    await admin(agent().put(`${base}/topics/${item.id}/sources`)).send({ expectedVersion: (await detail(item.id)).version, sources: [{ url: 'https://cafe.example.org/' }] }).expect(200);
    await admin(agent().post(`${base}/topics/${item.id}/research`)).send({ expectedVersion: (await detail(item.id)).version, action: 'approve' }).expect(200);
    expect(await drain(item.id)).toEqual(['packet:verified']);
    await admin(agent().put(`${base}/topics/${item.id}/article`)).send({ expectedVersion: (await detail(item.id)).version, categoryId }).expect(200);
    return detail(item.id);
  }
  const generate = async (id: string) => admin(agent().post(`${base}/topics/${id}/generate`)).set('Idempotency-Key', randomUUID()).send({ expectedVersion: (await detail(id)).version, scope: 'full' });
  async function uploadedCover(postId: string) {
    const asset = await db().mediaAsset.create({ data: { sourceName: 'photo.jpg', mimeType: 'image/jpeg', bytes: 1000, width: 1600, height: 900, checksum: 'c'.repeat(64), objectKey: `quarantine/${randomUUID()}.jpg`, status: 'ready', altText: 'A photograph of a laneway' } });
    const post = await db().post.findUniqueOrThrow({ where: { id: postId } });
    await admin(agent().patch(`/api/v1/admin/posts/${postId}`)).send({ expectedVersion: post.version, coverMediaId: asset.id, coverAlt: 'A photograph of a laneway' }).expect(200);
  }
  async function confirmAndApprove(topicId: string) {
    let topic = await detail(topicId);
    let post = await db().post.findUniqueOrThrow({ where: { id: topic.postId } });
    await admin(agent().post(`${base}/topics/${topicId}/confirm-facts`)).send({ expectedVersion: topic.version, postVersion: post.version, note: 'Checked every statement against the venue page' }).expect(200);
    topic = await detail(topicId);
    post = await db().post.findUniqueOrThrow({ where: { id: topic.postId } });
    await admin(agent().post(`${base}/topics/${topicId}/approve`)).send({ expectedVersion: topic.version, postVersion: post.version }).expect(200);
    return db().post.findUniqueOrThrow({ where: { id: topic.postId } });
  }
  /** A drafted, fact-confirmed, approved AI article with a ready featured image. */
  async function approvedArticle(title: string, bodyAddition?: string) {
    const item = await researched(title);
    expect((await generate(item.id)).status).toBe(201);
    expect([...(await drain(item.id)), ...(await drain(item.id))]).toEqual(['generated:covered', 'applied:created']);
    const topic = await detail(item.id);
    await uploadedCover(topic.postId);
    if (bodyAddition) {
      const post = await db().post.findUniqueOrThrow({ where: { id: topic.postId } });
      await admin(agent().patch(`/api/v1/admin/posts/${post.id}`)).send({ expectedVersion: post.version, bodyMarkdown: `${post.bodyMarkdown}\n\n${bodyAddition}`, bodyFormat: 'markdown' }).expect(200);
    }
    return { topic: await detail(item.id), post: await confirmAndApprove(item.id) };
  }
  const publish = async (postId: string) => {
    const post = await db().post.findUniqueOrThrow({ where: { id: postId } });
    return admin(agent().post(`/api/v1/admin/posts/${postId}/publish`)).send({ expectedVersion: post.version });
  };

  beforeAll(async () => {
    ({ runAiOperation } = await worker<{ runAiOperation: typeof runAiOperation }>('ai-content/operations.ts'));
    await truncateApplicationTables();
    await testDatabase().$executeRaw`UPDATE ai_automation_controls SET paidCallsHaltedAt = NULL, paidHaltReason = NULL`;
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '203.0.113.90').send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }).expect(200);
    cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
    authorId = (await admin(agent().post('/api/v1/admin/authors')).send({ displayName: 'Casey Editor', bio: 'Edits local guides.' }).expect(201)).body.data.id;
    categoryId = (await admin(agent().post('/api/v1/admin/blog-categories')).send({ name: 'Cafes' }).expect(201)).body.data.id;
    await admin(agent().post(`${base}/sources`)).send({ host: 'cafe.example.org', label: 'Example Cafe', tier: 'official_business' }).expect(201);
    for (const [model, input, output] of [['gpt-5.6-terra', 2_000_000, 12_000_000], ['gpt-5.6-luna', 200_000, 1_200_000]] as const) {
      const price = (await admin(agent().post(`${base}/prices`)).send({ version: `openai-${model}-g`, provider: 'openai', model, currency: 'USD', inputMicrosPerMTok: input, cachedInputMicrosPerMTok: input / 10, outputMicrosPerMTok: output, longContextThresholdTokens: 272_000, sourceUrl: 'https://developers.openai.com/api/docs/pricing', effectiveFrom: '2026-07-30T00:00:00.000Z' }).expect(201)).body.data;
      await admin(agent().post(`${base}/prices/${price.id}/approve`)).expect(200);
    }
    expect((await saveSettings({ enabled: true, titleMode: 'manual', articleAuthorId: authorId, hardDailyLimitMinor: 100_000, hardMonthlyLimitMinor: 100_000, maxWorkflowCostMinor: 100 })).status).toBe(200);
  });

  beforeEach(() => {
    text = textProvider();
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  describe('final publication checks (both paths share them)', () => {
    it('refuses to publish when a human article on the same topic appeared after admission', async () => {
      const { post } = await approvedArticle('Norwood flat white bar');
      const human = (await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Norwood flat white bar', excerpt: 'A human guide to the flat white bar in Norwood.', bodyMarkdown: 'Flat whites in Norwood. '.repeat(20), authorId, categoryId }).expect(201)).body.data;
      await admin(agent().post(`/api/v1/admin/posts/${human.id}/publish`)).send({ expectedVersion: human.version }).expect(200);
      const blocked = await publish(post.id);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.fields.publication).toEqual([expect.stringMatching(/Another article now covers this topic/)]);
      // The ordinary human article was unaffected by the AI gate.
      expect((await db().post.findUniqueOrThrow({ where: { id: human.id } })).status).toBe('published');
    });

    it('refuses to publish while an internal link leads to an article that is no longer published', async () => {
      const guide = (await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Kent Town walking guide', excerpt: 'Walking routes around Kent Town and its lanes.', bodyMarkdown: 'Walk around Kent Town. '.repeat(20), authorId, categoryId }).expect(201)).body.data;
      await admin(agent().post(`/api/v1/admin/posts/${guide.id}/publish`)).send({ expectedVersion: guide.version }).expect(200);
      const { post } = await approvedArticle('Stepney breakfast counter', `See our [walking guide](/blog/${guide.slug}).`);
      const g = await db().post.findUniqueOrThrow({ where: { id: guide.id } });
      await admin(agent().post(`/api/v1/admin/posts/${guide.id}/unpublish`)).send({ expectedVersion: g.version }).expect(200);
      const blocked = await publish(post.id);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.fields.publication).toEqual([expect.stringContaining(`/blog/${guide.slug}`)]);
      // Republishing the target clears it: the article publishes.
      const g2 = await db().post.findUniqueOrThrow({ where: { id: guide.id } });
      await admin(agent().post(`/api/v1/admin/posts/${guide.id}/publish`)).send({ expectedVersion: g2.version }).expect(200);
      expect((await publish(post.id)).status).toBe(200);
    });
  });

  describe('kill switch and recovery', () => {
    it('stops every automated entry point at once when automation is switched off', async () => {
      const queued = (await admin(agent().post(`${base}/topics`)).set('Idempotency-Key', randomUUID()).send({ title: 'Marden bakery row', priority: 0 }).expect(201)).body.data;
      await admin(agent().put(`${base}/topics/${queued.id}/sources`)).send({ expectedVersion: queued.version, sources: [{ url: 'https://cafe.example.org/' }] }).expect(200);
      await saveSettings({ postingEnabled: true });
      await saveSettings({ enabled: false });
      const admin1 = await db().adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.email } });
      const refused = async (work: () => Promise<unknown>) => {
        try {
          await work();
          return 'accepted';
        } catch (error) {
          return (error as { code?: string }).code;
        }
      };
      expect((await admin(agent().post(`${base}/topics/${queued.id}/research`)).send({ expectedVersion: (await detail(queued.id)).version, action: 'approve' })).body.error.code).toBe('AUTOMATION_DISABLED');
      expect(await refused(() => db().$transaction((tx) => requestGeneration(tx, { itemId: queued.id, expectedVersion: 1, scope: 'full', adminId: admin1.id, requestKey: randomUUID() })))).toBe('AUTOMATION_DISABLED');
      expect(await refused(() => db().$transaction((tx) => requestImage(tx, { itemId: queued.id, expectedVersion: 1, adminId: admin1.id, requestKey: randomUUID() })))).toBe('AUTOMATION_DISABLED');
      expect(await planSlots(db())).toMatchObject({ inactive: 'automation_disabled' });
      expect(await db().aIOperation.count({ where: { itemId: queued.id } })).toBe(0);
      await saveSettings({ enabled: true, postingEnabled: false });
    });

    it('retries a failed first draft as a new, separately budgeted request', async () => {
      const item = await researched('Glynde espresso cart');
      text.state.invalid = true;
      expect((await generate(item.id)).status).toBe(201);
      await drain(item.id);
      expect(await drain(item.id)).toEqual([]);
      expect(await detail(item.id)).toMatchObject({ status: 'failed', failureStage: 'generation', postId: null });
      text.state.invalid = false;
      expect((await generate(item.id)).status).toBe(201);
      expect([...(await drain(item.id)), ...(await drain(item.id))]).toEqual(['generated:covered', 'applied:created']);
      expect((await detail(item.id)).status).toBe('needs_fact_review');
      expect(await db().aIOperation.count({ where: { itemId: item.id, kind: 'generate' } })).toBe(2);
    });
  });

  describe('retention and operator signals', () => {
    it('removes private working data of finished topics after the retention period, keeps what explains them, and never touches work in progress', async () => {
      const { topic, post } = await approvedArticle('Payneham noodle stall');
      expect((await publish(post.id)).status).toBe(200);
      const inProgress = await researched('Hackney crepe window');
      // Published 200 days ago; the other topic is still in research.
      const old = new Date(Date.now() - 200 * 86_400_000);
      await db().post.update({ where: { id: post.id }, data: { firstPublishedAt: old } });
      await db().$executeRaw`UPDATE ai_content_items SET updatedAt = ${old} WHERE id IN (${topic.id}, ${inProgress.id})`;
      expect(await purgeExpiredAiData(db())).toEqual({ purged: 1 });
      const packets = await db().aIResearchPacket.findMany({ where: { itemId: topic.id }, select: { id: true } });
      expect(await db().aIOperation.count({ where: { itemId: topic.id, NOT: { requestPayload: { equals: null as never } } } })).toBe(0);
      expect(await db().aISourceEvidence.count({ where: { packetId: { in: packets.map((p) => p.id) }, NOT: { text: null } } })).toBe(0);
      expect((await db().aIGenerationRun.findFirstOrThrow({ where: { itemId: topic.id } })).artifact).toEqual({ purged: true });
      // Kept: costs, approvals and fact confirmations, claims with excerpts, the published article and the audit trail.
      expect(await db().aIOperation.findFirstOrThrow({ where: { itemId: topic.id, kind: 'generate' } })).toMatchObject({ costState: 'settled', requestHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
      expect(await db().aIApproval.count({ where: { itemId: topic.id, kind: { in: ['content', 'facts'] } } })).toBeGreaterThanOrEqual(2);
      expect(await db().aIFactClaim.count({ where: { packetId: { in: packets.map((p) => p.id) } } })).toBeGreaterThan(0);
      expect((await db().post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe('published');
      expect(await db().auditLog.count({ where: { action: 'ai_content.retention.purged', targetId: topic.id } })).toBe(1);
      // In progress: untouched. A second pass does nothing.
      expect(await db().aISourceEvidence.count({ where: { packet: { itemId: inProgress.id }, text: { not: null } } })).toBeGreaterThan(0);
      expect(await purgeExpiredAiData(db())).toEqual({ purged: 0 });
    });

    it('reports what needs an operator to the dashboard and the metrics the alert rules read', async () => {
      const item = await researched('Firle dumpling bar');
      await db().aIContentItem.update({ where: { id: item.id }, data: { status: 'needs_fact_review' } });
      await db().$executeRaw`UPDATE ai_automation_controls SET paidCallsHaltedAt = UTC_TIMESTAMP(3), paidHaltReason = 'test discrepancy'`;
      const overview = (await admin(agent().get(`${base}/overview`)).expect(200)).body.data;
      expect(overview.attention).toMatchObject({ paidCallsHalted: true, paidHaltReason: 'test discrepancy', factReviewItems: expect.any(Number) });
      expect(overview.attention.factReviewItems).toBeGreaterThanOrEqual(1);
      await new Promise((r) => setTimeout(r, 5_100)); // the collector refreshes at most every 5 s
      const metrics = await metricsRegistry.metrics();
      expect(metrics).toMatch(/as_ai_paid_calls_halted\{service="api"\} 1/);
      expect(metrics).toMatch(/as_ai_fact_review_items\{service="api"\} [1-9]/);
      expect(metrics).toMatch(/as_ai_budget_used_ratio\{category="image",period="month",service="api"\}/);
      // Bounded labels only: no titles, ids or URLs in any AI series.
      for (const line of metrics.split('\n').filter((l) => l.startsWith('as_ai_'))) expect(line).not.toMatch(/Firle|cafe\.example|cm[a-z0-9]{20}/);
      await db().$executeRaw`UPDATE ai_automation_controls SET paidCallsHaltedAt = NULL, paidHaltReason = NULL`;
    });
  });
});
