import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createDatabaseClient, type DatabaseClient, type Prisma } from '@adelaide-sphere/database';
import {
  applyOperation,
  artifactHash,
  claimOperation,
  recordGenerationForApply,
  recoverOperations,
  type ArticleArtifact,
} from '@adelaide-sphere/database/automation';
import { DUE_SCHEDULED_POST_SELECT, publishDueScheduledPost, readPostMaterial } from '@adelaide-sphere/database/editorial';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';
import { resolveTestDatabaseUrl } from './integration/test-database-url.js';

/**
 * AI Content Phase 1B: canonical Post mapping, the shared publication guard,
 * human-edit protection, leases/fencing and recovery, against the isolated
 * `*_test` MySQL database only (plan §N T2, T3, T5, T6).
 *
 * Research (1C) and generation/approval commands (1D) do not exist yet, so
 * fixtures stand in for them explicitly: an item is moved to `generating` as
 * a research stage would, a generation artifact is recorded as a generator
 * would, and a human approval / passed fact check is written as the 1C/1D
 * commands would. Nothing here calls a provider.
 */
describe('AI Content Phase 1B editorial foundation (real MySQL/API)', () => {
  let app: INestApplication;
  let cookie: string;
  let adminId: string;
  let authorId: string;
  let categoryId: string;
  let tagId: string;
  /** A wider pool than the fixture client, so racing transactions really run concurrently. */
  let pool: DatabaseClient;
  let pool2: DatabaseClient;
  const db = () => testDatabase();
  const agent = () => request(app.getHttpServer());
  const admin = (req: request.Test) => req.set('Origin', ORIGIN).set('Cookie', cookie);
  const body = 'Adelaide Central Market has traded since 1869 and remains a busy food hub. '.repeat(6);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const login = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };

  const settingsPath = '/api/v1/admin/settings/ai-content';
  async function saveSettings(values: Record<string, unknown>): Promise<void> {
    const current = (await admin(agent().get(settingsPath)).expect(200)).body.data;
    await admin(agent().put(settingsPath)).send({ expectedVersion: current.version, values }).expect(200);
  }
  const epoch = async () => Number((await db().$queryRaw<{ epoch: number }[]>`SELECT epoch FROM ai_automation_controls WHERE id = 'default'`)[0]?.epoch ?? 0);

  /** A manual topic created through the 1A API, then advanced as the 1C/1D stages would. */
  async function generatingItem(title: string): Promise<string> {
    const created = await admin(agent().post('/api/v1/admin/ai-content/topics')).set('Idempotency-Key', randomUUID()).send({ title, priority: 0 }).expect(201);
    await db().aIContentItem.update({ where: { id: created.body.data.id }, data: { status: 'generating' } });
    return created.body.data.id;
  }

  const artifact = (slug: string, overrides: Partial<ArticleArtifact> = {}): ArticleArtifact => ({
    title: `Guide ${slug}`,
    slug,
    excerpt: 'A practical local guide to one part of Adelaide, checked against sources.',
    bodyMarkdown: `${body}\n\n<script>alert(1)</script>`,
    bodyFormat: 'markdown',
    authorId,
    categoryId,
    tagIds: [tagId],
    seoTitle: null,
    seoDescription: null,
    seoKeywords: null,
    ...overrides,
  });

  async function record(itemId: string, a: ArticleArtifact, expected: { version: number; hash: string } | null = null) {
    return db().$transaction((tx) =>
      recordGenerationForApply(tx, {
        itemId,
        artifact: a as unknown as Prisma.InputJsonObject,
        artifactHash: artifactHash(a),
        expectedPostVersion: expected?.version ?? null,
        expectedMaterialHash: expected?.hash ?? null,
      }),
    );
  }

  async function claimAndApply(operationId: string, owner = 'worker-a', client: DatabaseClient = db()) {
    const lease = await claimOperation(client, { operationId, owner });
    expect(lease).not.toBeNull();
    return applyOperation(client, lease!);
  }

  async function currentMaterial(postId: string) {
    return db().$transaction(async (tx) => (await readPostMaterial(tx, postId))!);
  }

  /** A verified, current research packet, as Phase 1C research produces; the gate now requires one. */
  async function verifiedPacket(itemId: string) {
    const latest = await db().aIResearchPacket.findFirst({ where: { itemId }, orderBy: { version: 'desc' }, select: { version: true } });
    return db().aIResearchPacket.create({ data: { itemId, version: (latest?.version ?? 0) + 1, status: 'verified', inventoryEpoch: 1, freshUntil: new Date(Date.now() + 12 * 3_600_000), contentHash: 'a'.repeat(64) } });
  }
  /** An approval as the 1D approve command records it: bound to the article and to the research it certified. */
  async function recordApproval(itemId: string, postId: string, material: { post: { version: number }; hash: string }) {
    const packet = await db().aIResearchPacket.findFirstOrThrow({ where: { itemId }, orderBy: { version: 'desc' } });
    const bound = { itemId, postId, postVersion: material.post.version, materialHash: material.hash, adminId, researchPacketId: packet.id, researchPacketHash: packet.contentHash };
    // A person confirmed the facts of this state, then approved it (1D: the screen never certifies alone).
    await db().aIApproval.create({ data: { ...bound, kind: 'facts' } });
    await db().aIApproval.create({ data: { ...bound, kind: 'content' } });
  }

  /** What the research verifier and the 1D approval command will write; fixtures only. */
  async function approveAndVerify(itemId: string, postId: string) {
    await verifiedPacket(itemId);
    const material = await currentMaterial(postId);
    await db().aIGenerationRun.updateMany({ where: { itemId, status: 'applied' }, data: { factCheck: 'passed' } });
    await recordApproval(itemId, postId, material);
    await db().aIContentItem.update({ where: { id: itemId }, data: { status: 'approved' } });
  }

  async function draftFor(title: string, slug: string): Promise<{ itemId: string; postId: string }> {
    const itemId = await generatingItem(title);
    const { operationId } = await record(itemId, artifact(slug));
    expect(await claimAndApply(operationId)).toBe('applied:created');
    const item = await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } });
    return { itemId, postId: item.postId! };
  }

  async function runScheduledPublisher(postId: string, client: DatabaseClient = db()) {
    const post = await client.post.findUniqueOrThrow({ where: { id: postId }, select: DUE_SCHEDULED_POST_SELECT });
    return publishDueScheduledPost(client, post, new Date());
  }

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.40');
    adminId = (await db().adminUser.findUniqueOrThrow({ where: { email: TEST_ADMIN.email } })).id;
    authorId = (await admin(agent().post('/api/v1/admin/authors')).send({ displayName: 'Sam Writer', bio: 'Writes about Adelaide.' }).expect(201)).body.data.id;
    categoryId = (await admin(agent().post('/api/v1/admin/blog-categories')).send({ name: 'Food guides' }).expect(201)).body.data.id;
    tagId = (await admin(agent().post('/api/v1/admin/blog-tags')).send({ name: 'Markets' }).expect(201)).body.data.id;
    pool = createDatabaseClient({ url: resolveTestDatabaseUrl(), connectionLimit: 6, allowPublicKeyRetrieval: true });
    pool2 = createDatabaseClient({ url: resolveTestDatabaseUrl(), connectionLimit: 6, allowPublicKeyRetrieval: true });
    await saveSettings({ enabled: true });
  });

  afterAll(async () => {
    await pool.$disconnect();
    await pool2.$disconnect();
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  describe('T2 transactions and constraints', () => {
    it('creates the first draft and its item mapping in one transaction, exactly once', async () => {
      const itemId = await generatingItem('Central Market guide');
      const a = artifact('central-market-guide');
      const first = await record(itemId, a);
      // Re-recording the same generation returns the same durable run and operation.
      expect(await record(itemId, a)).toEqual({ ...first, created: false });
      expect(await claimAndApply(first.operationId)).toBe('applied:created');

      const item = await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } });
      // No person has confirmed the facts of a fresh draft yet, so it waits in explicit fact review (1D review fix).
      expect(item).toMatchObject({ status: 'needs_fact_review', humanModifiedAt: null, failureStage: null });
      const post = await db().post.findUniqueOrThrow({ where: { id: item.postId! }, include: { tags: true } });
      expect(post).toMatchObject({ status: 'draft', slug: 'central-market-guide', authorId, categoryId, firstPublishedAt: null });
      expect(post.sanitizedBody).not.toContain('<script');
      expect(post.tags.map((t) => t.tagId)).toEqual([tagId]);
      const run = await db().aIGenerationRun.findUniqueOrThrow({ where: { id: first.runId } });
      expect(run).toMatchObject({ status: 'applied', appliedPostVersion: post.version, appliedMaterialHash: (await currentMaterial(post.id)).hash, factCheck: 'pending' });
      expect(await db().aIOperation.findUniqueOrThrow({ where: { id: first.operationId } })).toMatchObject({ state: 'succeeded', resultCode: 'applied:created', leaseOwner: null });
      expect(await db().auditLog.findFirst({ where: { action: 'ai_content.run.applied', targetId: itemId } })).toMatchObject({ actorAdminId: null });

      // A redelivered job (lost acknowledgement) finds nothing to claim; still one article.
      expect(await claimOperation(db(), { operationId: first.operationId, owner: 'worker-b' })).toBeNull();
      expect(await db().post.count({ where: { slug: 'central-market-guide' } })).toBe(1);
    });

    it('lets the database refuse a second item mapped to the same article', async () => {
      const { postId } = await draftFor('Rundle Mall guide', 'rundle-mall-guide');
      const other = await generatingItem('Another mall guide');
      await expect(db().aIContentItem.update({ where: { id: other }, data: { postId } })).rejects.toMatchObject({ code: 'P2002' });
    });

    it('rolls the article and its mapping back together when the apply transaction fails, then retries once', async () => {
      const itemId = await generatingItem('Glenelg jetty guide');
      const { operationId, runId } = await record(itemId, artifact('glenelg-jetty-guide'));
      // Fail after the Post insert, inside the same transaction: nothing may survive.
      const failing = failAfterPostWrite(db());
      const lease = await claimOperation(db(), { operationId, owner: 'worker-a' });
      expect(await applyOperation(failing, lease!)).toBe('retrying');
      expect(await db().post.count({ where: { slug: 'glenelg-jetty-guide' } })).toBe(0);
      expect(await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ postId: null, status: 'generating' });
      expect(await db().aIGenerationRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: 'pending' });
      const op = await db().aIOperation.findUniqueOrThrow({ where: { id: operationId } });
      expect(op).toMatchObject({ state: 'pending', attempts: 1, resultCode: 'apply_error', leaseOwner: null });
      expect(op.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      // The retry is delivered through the outbox, not by the queue's own retries.
      expect(await db().outboxEvent.count({ where: { type: 'ai.operation.ready', resourceId: operationId } })).toBe(2);

      await db().aIOperation.update({ where: { id: operationId }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      expect(await claimAndApply(operationId)).toBe('applied:created');
      expect(await db().post.count({ where: { slug: 'glenelg-jetty-guide' } })).toBe(1);
    });

    it('stops after the attempt cap instead of retrying forever, and says why', async () => {
      const itemId = await generatingItem('Hahndorf day trip');
      const { operationId } = await record(itemId, artifact('hahndorf-day-trip'));
      const failing = failAfterPostWrite(db());
      const outcomes: string[] = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await db().aIOperation.update({ where: { id: operationId }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
        const lease = await claimOperation(db(), { operationId, owner: `worker-${attempt}` });
        outcomes.push(await applyOperation(failing, lease!));
      }
      expect(outcomes).toEqual(['retrying', 'retrying', 'exhausted']);
      expect(await db().aIOperation.findUniqueOrThrow({ where: { id: operationId } })).toMatchObject({ state: 'failed', attempts: 3, resultCode: 'apply_error' });
      expect(await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ status: 'failed', failureStage: 'application', failureCode: 'attempts_exhausted', postId: null });
      expect(await claimOperation(db(), { operationId, owner: 'worker-late' })).toBeNull();
      expect(await db().post.count({ where: { slug: 'hahndorf-day-trip' } })).toBe(0);
    });

    it('fails permanently, without touching any article, when the slug belongs to another article', async () => {
      const ordinary = (await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Barossa wineries', excerpt: 'A human-written guide to the Barossa Valley.', bodyMarkdown: body, authorId, categoryId }).expect(201)).body.data;
      const itemId = await generatingItem('Barossa wine guide');
      const { operationId } = await record(itemId, artifact(ordinary.slug));
      expect(await claimAndApply(operationId)).toBe('failed:slug_conflict');
      expect(await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ status: 'failed', failureCode: 'slug_conflict', postId: null });
      expect(await db().aIOperation.findUniqueOrThrow({ where: { id: operationId } })).toMatchObject({ state: 'failed', attempts: 1 });
      expect(await db().post.findUniqueOrThrow({ where: { id: ordinary.id } })).toMatchObject({ title: 'Barossa wineries', version: ordinary.version });
      // A human article is never adopted by an AI item.
      expect(await db().aIContentItem.count({ where: { postId: ordinary.id } })).toBe(0);
    });
  });

  describe('T3 concurrency and idempotency', () => {
    it('gives one of two racing workers the lease, and the other nothing', async () => {
      const itemId = await generatingItem('Port Adelaide walk');
      const { operationId } = await record(itemId, artifact('port-adelaide-walk'));
      const leases = await Promise.all([claimOperation(pool, { operationId, owner: 'worker-a' }), claimOperation(pool2, { operationId, owner: 'worker-b' })]);
      expect(leases.filter(Boolean)).toHaveLength(1);
      const winner = leases.find(Boolean)!;
      expect(await applyOperation(pool, winner)).toBe('applied:created');
      expect(await db().post.count({ where: { slug: 'port-adelaide-walk' } })).toBe(1);
    });

    it('lets a replacement finish after a lease expires, and the stale owner commits nothing', async () => {
      const itemId = await generatingItem('Mount Lofty lookout');
      const { operationId } = await record(itemId, artifact('mount-lofty-lookout'));
      const stale = await claimOperation(db(), { operationId, owner: 'worker-slow', leaseMs: 300 });
      expect(stale).not.toBeNull();
      // While the lease is valid nobody else can take the work.
      expect(await claimOperation(db(), { operationId, owner: 'worker-eager' })).toBeNull();
      await sleep(450);
      expect(await recoverOperations(db())).toMatchObject({ reclaimed: 1 });
      const replacement = await claimOperation(db(), { operationId, owner: 'worker-new' });
      expect(replacement!.fencingToken).toBe(stale!.fencingToken + 1);
      expect(await applyOperation(db(), replacement!)).toBe('applied:created');
      // The slow worker returns late with its old token: fenced out.
      expect(await applyOperation(db(), stale!)).toBe('stale_lease');
      expect(await db().post.count({ where: { slug: 'mount-lofty-lookout' } })).toBe(1);
      expect(await db().aIOperation.findUniqueOrThrow({ where: { id: operationId } })).toMatchObject({ state: 'succeeded', resultCode: 'applied:created' });
    });

    it('refuses a worker whose lease lapsed even before anyone else takes the work', async () => {
      const itemId = await generatingItem('Kangaroo Island ferry');
      const { operationId } = await record(itemId, artifact('kangaroo-island-ferry'));
      const lapsed = await claimOperation(db(), { operationId, owner: 'worker-paused', leaseMs: 200 });
      await sleep(350);
      // A lapsed lease is not proof the work failed, and not permission to commit.
      expect(await applyOperation(db(), lapsed!)).toBe('stale_lease');
      expect(await db().post.count({ where: { slug: 'kangaroo-island-ferry' } })).toBe(0);
      expect(await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ status: 'generating', postId: null });
      expect(await recoverOperations(db())).toMatchObject({ reclaimed: 1 });
      expect(await claimAndApply(operationId, 'worker-next')).toBe('applied:created');
    });

    it('publishes an eligible AI article once when two editors press Publish together', async () => {
      const { itemId, postId } = await draftFor('West Terrace history walk', 'west-terrace-history-walk');
      await approveAndVerify(itemId, postId);
      const post = await db().post.findUniqueOrThrow({ where: { id: postId } });
      const results = await Promise.all([
        admin(agent().post(`/api/v1/admin/posts/${postId}/publish`)).send({ expectedVersion: post.version }),
        admin(agent().post(`/api/v1/admin/posts/${postId}/publish`)).send({ expectedVersion: post.version }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await db().outboxEvent.count({ where: { type: 'post.published', resourceId: postId } })).toBe(1);
      expect(await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ status: 'published' });
    });

    it('publishes a due AI article once when two scheduler replicas run together', async () => {
      const { itemId, postId } = await draftFor('Adelaide Fringe primer', 'adelaide-fringe-primer');
      await approveAndVerify(itemId, postId);
      const post = await db().post.findUniqueOrThrow({ where: { id: postId } });
      await admin(agent().post(`/api/v1/admin/posts/${postId}/schedule`)).send({ expectedVersion: post.version, scheduledAt: new Date(Date.now() + 3_600_000).toISOString() }).expect(200);
      await db().post.update({ where: { id: postId }, data: { scheduledAt: new Date(Date.now() - 60_000) } });
      const outcomes = await Promise.all([runScheduledPublisher(postId, pool), runScheduledPublisher(postId, pool2)]);
      expect(outcomes.sort()).toEqual(['published', 'skipped']);
      expect(await db().outboxEvent.count({ where: { type: 'post.published', resourceId: postId } })).toBe(1);
      expect(await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ status: 'published' });
    });
  });

  describe('T5 human protection and both publication paths', () => {
    it('keeps a human edit made during generation; the late result becomes a proposal, and the protection is sticky', async () => {
      const { itemId, postId } = await draftFor('Norwood Parade cafes', 'norwood-parade-cafes');
      const before = await currentMaterial(postId);
      // Regeneration starts from version A (as 1D's command would).
      await db().aIContentItem.update({ where: { id: itemId }, data: { status: 'generating' } });
      const { operationId, runId } = await record(itemId, artifact('norwood-parade-cafes', { title: 'Machine rewrite' }), { version: before.post.version, hash: before.hash });
      // A human saves version B before the worker applies A's result.
      await admin(agent().patch(`/api/v1/admin/posts/${postId}`)).send({ expectedVersion: before.post.version, title: 'Norwood Parade cafes, edited by hand' }).expect(200);
      expect(await claimAndApply(operationId)).toBe('proposal:human_modified');
      expect(await db().post.findUniqueOrThrow({ where: { id: postId } })).toMatchObject({ title: 'Norwood Parade cafes, edited by hand' });
      expect(await db().aIGenerationRun.findUniqueOrThrow({ where: { id: runId } })).toMatchObject({ status: 'proposal', proposalReason: 'human_modified' });
      const item = await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } });
      expect(item).toMatchObject({ status: 'ready_for_review', humanModifiedByAdminId: adminId });
      expect(item.humanModifiedAt).not.toBeNull();

      // Even a run produced from the current human version is never auto-applied.
      const now = await currentMaterial(postId);
      await db().aIContentItem.update({ where: { id: itemId }, data: { status: 'generating' } });
      const again = await record(itemId, artifact('norwood-parade-cafes', { title: 'Second machine rewrite' }), { version: now.post.version, hash: now.hash });
      expect(await claimAndApply(again.operationId)).toBe('proposal:human_modified');
      expect((await db().post.findUniqueOrThrow({ where: { id: postId } })).title).toBe('Norwood Parade cafes, edited by hand');
      expect((await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).humanModifiedAt).toEqual(item.humanModifiedAt);
    });

    it('regenerates an untouched draft in place under version and hash CAS, keeping a revision; a stale run is a proposal', async () => {
      const { itemId, postId } = await draftFor('Botanic Garden guide', 'botanic-garden-guide');
      const before = await currentMaterial(postId);
      await db().aIContentItem.update({ where: { id: itemId }, data: { status: 'generating' } });
      const stale = await record(itemId, artifact('botanic-garden-guide', { title: 'Stale expectation' }), { version: before.post.version - 1, hash: before.hash });
      expect(await claimAndApply(stale.operationId)).toBe('proposal:post_changed');
      await db().aIContentItem.update({ where: { id: itemId }, data: { status: 'generating' } });
      const fresh = await record(itemId, artifact('botanic-garden-guide', { title: 'Botanic Garden guide, refreshed' }), { version: before.post.version, hash: before.hash });
      expect(await claimAndApply(fresh.operationId)).toBe('applied:updated');
      const post = await db().post.findUniqueOrThrow({ where: { id: postId } });
      expect(post).toMatchObject({ title: 'Botanic Garden guide, refreshed', version: before.post.version + 1 });
      expect(await db().contentRevision.findFirst({ where: { resourceType: 'post', resourceId: postId, version: before.post.version } })).toMatchObject({ reason: 'AI generation 3 applied', actorAdminId: null, title: before.post.title });
      expect(await db().post.count({ where: { slug: 'botanic-garden-guide' } })).toBe(1);

      // Restoring an earlier revision is a human edit too (AI-210).
      const revision = await db().contentRevision.findFirstOrThrow({ where: { resourceType: 'post', resourceId: postId } });
      await admin(agent().post(`/api/v1/admin/posts/${postId}/revisions/${revision.id}/restore`)).send({ expectedVersion: post.version }).expect(200);
      expect((await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).humanModifiedAt).not.toBeNull();
    });

    it('applies the same AI gate on the publish and schedule commands and in the scheduled publisher', async () => {
      const { itemId, postId } = await draftFor('Victoria Square events', 'victoria-square-events');
      const publish = async () => {
        const post = await db().post.findUniqueOrThrow({ where: { id: postId } });
        return admin(agent().post(`/api/v1/admin/posts/${postId}/publish`)).send({ expectedVersion: post.version });
      };
      const schedule = async () => {
        const post = await db().post.findUniqueOrThrow({ where: { id: postId } });
        return admin(agent().post(`/api/v1/admin/posts/${postId}/schedule`)).send({ expectedVersion: post.version, scheduledAt: new Date(Date.now() + 3_600_000).toISOString() });
      };
      const dueNow = () => db().post.update({ where: { id: postId }, data: { scheduledAt: new Date(Date.now() - 60_000) } });

      // Not approved, facts not verified: both commands refuse, with reasons.
      const blocked = await publish();
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('PUBLICATION_BLOCKED');
      expect(blocked.body.error.fields.publication).toEqual(expect.arrayContaining([expect.stringMatching(/approve the current version/), expect.stringMatching(/facts .* have not been verified/)]));
      expect((await schedule()).status).toBe(409);

      // Approved, with verified research, but the run's fact gate is still closed: still refused.
      await verifiedPacket(itemId);
      const material = await currentMaterial(postId);
      await recordApproval(itemId, postId, material);
      await db().aIContentItem.update({ where: { id: itemId }, data: { status: 'approved' } });
      const factBlocked = await publish();
      expect(factBlocked.status).toBe(409);
      expect(factBlocked.body.error.fields.publication).toEqual([expect.stringMatching(/facts .* have not been verified/)]);

      // All gates pass: scheduling is allowed and mirrored on the item.
      await db().aIGenerationRun.updateMany({ where: { itemId, status: 'applied' }, data: { factCheck: 'passed' } });
      expect((await schedule()).status).toBe(200);
      expect(await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ status: 'scheduled' });

      // A human material edit invalidates the approval; the scheduler refuses at the scheduled time.
      const scheduled = await db().post.findUniqueOrThrow({ where: { id: postId } });
      await admin(agent().patch(`/api/v1/admin/posts/${postId}`)).send({ expectedVersion: scheduled.version, excerpt: 'A human rewrote this summary after approval, so it needs approving again.' }).expect(200);
      expect(await db().aIApproval.findFirstOrThrow({ where: { itemId } })).toMatchObject({ invalidationReason: 'material_edit' });
      await dueNow();
      expect(await runScheduledPublisher(postId)).toBe('returned');
      const returned = await db().post.findUniqueOrThrow({ where: { id: postId } });
      expect(returned).toMatchObject({ status: 'draft', scheduledAt: null });
      expect(returned.publishFailure).toMatch(/approve the current version/);
      expect(await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ status: 'ready_for_review' });
      expect(await db().auditLog.findFirst({ where: { action: 'blog.post.schedule_blocked', targetId: postId } })).toMatchObject({ metadata: expect.objectContaining({ aiItemId: itemId }) });

      // Re-approved and scheduled, but automation switched off: automated publication is held.
      const again = await currentMaterial(postId);
      await recordApproval(itemId, postId, again);
      await db().aIContentItem.update({ where: { id: itemId }, data: { status: 'approved' } });
      expect((await schedule()).status).toBe(200);
      await saveSettings({ enabled: false });
      await dueNow();
      expect(await runScheduledPublisher(postId)).toBe('returned');
      expect((await db().post.findUniqueOrThrow({ where: { id: postId } })).publishFailure).toMatch(/switched off/);
      // The approval still matches, so unscheduling returned it to approved, not to review.
      expect(await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ status: 'approved' });

      // Switched back on: the scheduler publishes, with the same event the admin command writes.
      await saveSettings({ enabled: true });
      expect((await schedule()).status).toBe(200);
      await dueNow();
      expect(await runScheduledPublisher(postId)).toBe('published');
      expect(await db().post.findUniqueOrThrow({ where: { id: postId } })).toMatchObject({ status: 'published' });
      expect(await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ status: 'published' });
      expect(await db().outboxEvent.findFirst({ where: { type: 'post.published', resourceId: postId } })).toMatchObject({ resourceType: 'post', payload: expect.objectContaining({ postId, action: 'publish' }) });
      expect(await db().auditLog.findFirst({ where: { action: 'ai_content.item.published', targetId: itemId } })).toMatchObject({ actorAdminId: null });
    });

    it('never lets the create workflow rewrite an article that has been published, even after it is unpublished', async () => {
      const { itemId, postId } = await draftFor('Brighton beach guide', 'brighton-beach-guide');
      await approveAndVerify(itemId, postId);
      let post = await db().post.findUniqueOrThrow({ where: { id: postId } });
      await admin(agent().post(`/api/v1/admin/posts/${postId}/publish`)).send({ expectedVersion: post.version }).expect(200);
      post = await db().post.findUniqueOrThrow({ where: { id: postId } });
      await admin(agent().post(`/api/v1/admin/posts/${postId}/unpublish`)).send({ expectedVersion: post.version }).expect(200);
      // Ever-published: the item stays published in the create workflow.
      expect(await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({ status: 'published' });
      const unpublished = await currentMaterial(postId);
      expect(unpublished.post).toMatchObject({ status: 'draft' });
      expect(unpublished.post.firstPublishedAt).not.toBeNull();
      // Even if an item were forced back into generation, applying is refused.
      await db().aIContentItem.update({ where: { id: itemId }, data: { status: 'generating' } });
      const { operationId } = await record(itemId, artifact('brighton-beach-guide', { title: 'Rewritten after publication' }), { version: unpublished.post.version, hash: unpublished.hash });
      expect(await claimAndApply(operationId)).toBe('proposal:post_not_draft');
      expect((await db().post.findUniqueOrThrow({ where: { id: postId } })).title).toBe(unpublished.post.title);
    });

    it('leaves ordinary articles on their existing path, with the same publication event from the scheduler', async () => {
      const ordinary = (await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Human guide to the Hills', excerpt: 'Written and published by a person, no automation involved.', bodyMarkdown: body, authorId, categoryId }).expect(201)).body.data;
      await admin(agent().post(`/api/v1/admin/posts/${ordinary.id}/schedule`)).send({ expectedVersion: ordinary.version, scheduledAt: new Date(Date.now() + 3_600_000).toISOString() }).expect(200);
      await db().post.update({ where: { id: ordinary.id }, data: { scheduledAt: new Date(Date.now() - 60_000) } });
      expect(await runScheduledPublisher(ordinary.id)).toBe('published');
      expect(await db().outboxEvent.count({ where: { type: 'post.published', resourceId: ordinary.id } })).toBe(1);
      expect(await db().outboxEvent.count({ where: { type: 'cache.invalidate', resourceId: ordinary.id } })).toBeGreaterThanOrEqual(1);
      expect(await db().aIContentItem.count({ where: { postId: ordinary.id } })).toBe(0);
      const published = await db().post.findUniqueOrThrow({ where: { id: ordinary.id } });
      await admin(agent().patch(`/api/v1/admin/posts/${ordinary.id}`)).send({ expectedVersion: published.version, title: 'Human guide to the Adelaide Hills' }).expect(200);
      expect(await db().auditLog.count({ where: { action: 'ai_content.item.human_edited', metadata: { path: '$.postId', equals: ordinary.id } } })).toBe(0);
    });
  });

  describe('T6 failure, fencing and recovery', () => {
    it('fences in-flight work when automation is switched off or a safety setting changes, but not for editorial context', async () => {
      const disabledItem = await generatingItem('Henley Beach sunset');
      const disabled = await record(disabledItem, artifact('henley-beach-sunset'));
      const e0 = await epoch();
      await saveSettings({ enabled: false });
      expect(await epoch()).toBe(e0 + 1);
      expect(await claimAndApply(disabled.operationId)).toBe('proposal:automation_disabled');
      expect(await db().aIContentItem.findUniqueOrThrow({ where: { id: disabledItem } })).toMatchObject({ status: 'failed', failureStage: 'application', failureCode: 'automation_disabled', postId: null });
      expect(await db().aIGenerationRun.findUniqueOrThrow({ where: { id: disabled.runId } })).toMatchObject({ status: 'proposal', proposalReason: 'automation_disabled' });
      await saveSettings({ enabled: true });

      const contextItem = await generatingItem('Semaphore foreshore');
      const context = await record(contextItem, artifact('semaphore-foreshore'));
      const e1 = await epoch();
      await saveSettings({ editorialStrategy: 'Useful local guides to Adelaide beaches and foreshores.' });
      expect(await epoch()).toBe(e1);
      expect(await claimAndApply(context.operationId)).toBe('applied:created');

      const safetyItem = await generatingItem('Victor Harbor day trip');
      const safety = await record(safetyItem, artifact('victor-harbor-day-trip'));
      await saveSettings({ targetPostsPerDay: 2 });
      expect(await epoch()).toBe(e1 + 1);
      expect(await claimAndApply(safety.operationId)).toBe('proposal:control_changed');
      expect(await db().post.count({ where: { slug: 'victor-harbor-day-trip' } })).toBe(0);
    });

    it('fences a running operation when its item is cancelled', async () => {
      const itemId = await generatingItem('Torrens riverbank walk');
      const { operationId } = await record(itemId, artifact('torrens-riverbank-walk'));
      const lease = await claimOperation(db(), { operationId, owner: 'worker-a' });
      const item = await db().aIContentItem.findUniqueOrThrow({ where: { id: itemId } });
      const cancelled = await admin(agent().post(`/api/v1/admin/ai-content/topics/${itemId}/actions`)).send({ expectedVersion: item.version, action: 'cancel', reason: 'Covered elsewhere' }).expect(201);
      expect(cancelled.body.data).toMatchObject({ status: 'cancelled' });
      expect(await db().aIOperation.findUniqueOrThrow({ where: { id: operationId } })).toMatchObject({ state: 'cancelled', leaseOwner: null });
      expect(await applyOperation(db(), lease!)).toBe('stale_lease');
      expect(await db().post.count({ where: { slug: 'torrens-riverbank-walk' } })).toBe(0);
      expect(await db().auditLog.findFirst({ where: { action: 'ai_content.topic.cancelled', targetId: itemId } })).toMatchObject({ metadata: expect.objectContaining({ operationsCancelled: 1 }) });
    });

    it('recovers work whose queue delivery was lost, from the database alone, and leaves finished work alone', async () => {
      const itemId = await generatingItem('Lobethal lights');
      const { operationId } = await record(itemId, artifact('lobethal-lights'));
      // The queue lost the job (Redis flushed, job trimmed): the event is gone from its view.
      await db().outboxEvent.updateMany({ where: { type: 'ai.operation.ready', resourceId: operationId }, data: { status: 'dispatched', dispatchedAt: new Date() } });
      await db().aIOperation.update({ where: { id: operationId }, data: { lastEnqueuedAt: new Date(Date.now() - 10 * 60_000) } });
      const finished = await db().aIOperation.count({ where: { state: 'succeeded' } });
      expect(await recoverOperations(db())).toMatchObject({ redelivered: 1, reclaimed: 0 });
      expect(await db().outboxEvent.count({ where: { type: 'ai.operation.ready', resourceId: operationId, status: 'pending' } })).toBe(1);
      // Recovering again straight away does not flood the queue.
      expect(await recoverOperations(db())).toMatchObject({ redelivered: 0 });
      expect(await claimAndApply(operationId)).toBe('applied:created');
      expect(await db().aIOperation.count({ where: { state: 'succeeded' } })).toBe(finished + 1);
    });
  });
});

/**
 * A client whose transactions fail right after the article is written, before
 * the transaction commits: the "database write failed mid-apply" case (F18,
 * AI-270). Only interactive transactions are wrapped.
 */
function failAfterPostWrite(client: DatabaseClient): DatabaseClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== '$transaction') {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (fn: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: unknown) =>
        (target.$transaction as (f: (tx: Prisma.TransactionClient) => Promise<unknown>, o?: unknown) => Promise<unknown>)(
          (tx) =>
            fn(
              new Proxy(tx, {
                get(t, p, r) {
                  if (p === 'aIGenerationRun') {
                    const runs = Reflect.get(t, p, r) as Prisma.TransactionClient['aIGenerationRun'];
                    return new Proxy(runs, {
                      get(rt, rp, rr) {
                        if (rp === 'update') return () => Promise.reject(new Error('injected failure before commit'));
                        const v = Reflect.get(rt, rp, rr);
                        return typeof v === 'function' ? v.bind(rt) : v;
                      },
                    });
                  }
                  const v = Reflect.get(t, p, r);
                  return typeof v === 'function' ? v.bind(t) : v;
                },
              }),
            ),
          options,
        );
    },
  }) as DatabaseClient;
}
