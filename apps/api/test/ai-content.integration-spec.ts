import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { AuditService } from '../src/audit/audit.service.js';
import { SUPER_ADMIN_ROLE } from '../src/identity/permissions.js';
import {
  ORIGIN,
  TEST_ADMIN,
  clearThrottleKeys,
  seedSuperAdmin,
} from './integration/auth-fixtures.js';
import {
  closeTestDatabase,
  createIntegrationApp,
  testDatabase,
  truncateApplicationTables,
} from './integration/harness.js';

describe('AI Content Phase 1A (real MySQL/API)', () => {
  let app: INestApplication;
  let cookie: string;
  let limited: string;
  const base = '/api/v1/admin/ai-content';
  const agent = () => request(app.getHttpServer());
  const write = (
    path: string,
    body: object,
    method: 'post' | 'put' = 'post',
    auth = cookie,
  ) =>
    agent()[method](path).set('Origin', ORIGIN).set('Cookie', auth).send(body);
  const create = (
    title: string,
    key = randomUUID(),
    auth = cookie,
    brief?: string,
  ) =>
    agent()
      .post(`${base}/topics`)
      .set('Origin', ORIGIN)
      .set('Cookie', auth)
      .set('Idempotency-Key', key)
      .send({ title, priority: 0, ...(brief === undefined ? {} : { brief }) });
  const login = async (email: string, password: string, ip: string) => {
    const res = await agent()
      .post('/api/v1/admin/auth/login')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', ip)
      .send({ email, password })
      .expect(200);
    return ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!
      .split(';')[0]!;
  };
  beforeAll(async () => {
    // The existing harness resolves only the isolated project *_test database.
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.30');
    await seedSuperAdmin(app, {
      email: 'ai-limited@example.com',
      password: 'limited-ai-password-12345',
      displayName: 'Limited AI',
    });
    const db = testDatabase();
    const user = await db.adminUser.findUniqueOrThrow({
      where: { email: 'ai-limited@example.com' },
    });
    const role = await db.role.findUniqueOrThrow({
      where: { key: SUPER_ADMIN_ROLE.key },
    });
    await db.adminRole.delete({
      where: { adminId_roleId: { adminId: user.id, roleId: role.id } },
    });
    limited = await login(
      user.email,
      'limited-ai-password-12345',
      '203.0.113.31',
    );
  });
  afterAll(async () => {
    if (app) {
      await clearThrottleKeys(app);
      await app.close();
    }
    await closeTestDatabase();
  });
  it('starts disabled with inactive execution and keeps settings in the shared store', async () => {
    const settings = await agent()
      .get('/api/v1/admin/settings/ai-content')
      .set('Cookie', cookie)
      .expect(200);
    expect(settings.body.data.values).toMatchObject({
      enabled: false,
      postingEnabled: false,
      hardMonthlyLimitMinor: 1000,
    });
    const overview = await agent()
      .get(`${base}/overview`)
      .set('Cookie', cookie)
      .expect(200);
    expect(overview.body.data).toMatchObject({
      enabled: false,
      executionActive: false,
      counts: { queued: 0, paused: 0, cancelled: 0, rejected: 0 },
    });
    expect(await testDatabase().post.count()).toBe(0);
  });
  it('replays two identical concurrent creates, including a response-lost replay, without a second topic/audit', async () => {
    const key = randomUUID();
    const title = 'Concurrent same request';
    const results = await Promise.all([create(title, key), create(title, key)]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0]!.body.data.id).toBe(results[1]!.body.data.id);
    const replay = await create(title, key).expect(201);
    expect(replay.body.data.id).toBe(results[0]!.body.data.id);
    expect(replay.body.data).not.toHaveProperty('requestKey');
    expect(replay.body.data).not.toHaveProperty('activeTitleHash');
    expect(
      await testDatabase().auditLog.count({
        where: {
          targetId: replay.body.data.id,
          action: 'ai_content.topic.created',
        },
      }),
    ).toBe(1);
    const mismatch = await create(
      title,
      key,
      cookie,
      'changed private brief',
    ).expect(409);
    expect(mismatch.body.error.code).toBe('IDEMPOTENCY_MISMATCH');
  });
  it('arbitrates concurrent normalized duplicates from two different administrators', async () => {
    // Grant only actual topic capabilities to the second administrator.
    const db = testDatabase();
    const admin = await db.adminUser.findUniqueOrThrow({
      where: { email: 'ai-limited@example.com' },
    });
    for (const key of ['ai_content.view', 'ai_content.manage_topics']) {
      const p = await db.permission.findUniqueOrThrow({ where: { key } });
      await db.adminPermission.create({
        data: { adminId: admin.id, permissionId: p.id },
      });
    }
    await db.adminUser.update({
      where: { id: admin.id },
      data: { authzVersion: { increment: 1 } },
    });
    limited = await login(
      admin.email,
      'limited-ai-password-12345',
      '203.0.113.32',
    );
    const results = await Promise.all([
      create('  Local CAFES!  '),
      create('local cafes', randomUUID(), limited),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe(
      'DUPLICATE_ACTIVE_TOPIC',
    );
  });
  it('preserves paused reservations, terminal reasons/history, and allows a later intentional same title', async () => {
    const created = await create('Lifecycle topic').expect(201);
    let topic = created.body.data;
    const paused = await write(`${base}/topics/${topic.id}/actions`, {
      action: 'pause',
      expectedVersion: topic.version,
    }).expect(201);
    topic = paused.body.data;
    await create('LIFECYCLE TOPIC').expect(409);
    const resumed = await write(`${base}/topics/${topic.id}/actions`, {
      action: 'resume',
      expectedVersion: topic.version,
    }).expect(201);
    topic = resumed.body.data;
    await write(`${base}/topics/${topic.id}/actions`, {
      action: 'cancel',
      expectedVersion: topic.version,
      reason: ' ',
    }).expect(400);
    const cancelled = await write(`${base}/topics/${topic.id}/actions`, {
      action: 'cancel',
      expectedVersion: topic.version,
      reason: 'Editorial decision',
    }).expect(201);
    expect(cancelled.body.data.status).toBe('cancelled');
    await write(`${base}/topics/${topic.id}/actions`, {
      action: 'resume',
      expectedVersion: cancelled.body.data.version,
    }).expect(409);
    const again = await create('Lifecycle topic').expect(201);
    expect(again.body.data.id).not.toBe(topic.id);
    await write(`${base}/topics/${again.body.data.id}/actions`, {
      action: 'reject',
      expectedVersion: 1,
      reason: 'Not useful',
    }).expect(201);
    const detail = await agent()
      .get(`${base}/topics/${topic.id}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(detail.body.data.reason).toBe('Editorial decision');
    const logs = await testDatabase().auditLog.findMany({
      where: { targetId: topic.id },
    });
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining([
        'ai_content.topic.created',
        'ai_content.topic.paused',
        'ai_content.topic.resumed',
        'ai_content.topic.cancelled',
      ]),
    );
    expect(JSON.stringify(logs)).not.toContain('Editorial decision');
  });
  it('one of cancel versus reprioritize wins; stale update cannot destroy the other change', async () => {
    const topic = (await create('Race action topic').expect(201)).body.data;
    const results = await Promise.all([
      write(`${base}/topics/${topic.id}/actions`, {
        action: 'cancel',
        expectedVersion: 1,
        reason: 'Stopped',
      }),
      write(
        `${base}/topics/${topic.id}/priority`,
        { priority: 10, expectedVersion: 1 },
        'put',
      ),
    ]);
    expect(results.filter((r) => r.status === 409)).toHaveLength(1);
    const current = (
      await agent()
        .get(`${base}/topics/${topic.id}`)
        .set('Cookie', cookie)
        .expect(200)
    ).body.data;
    expect(current.version).toBe(2);
  });
  it('batch reorders atomically; duplicate/stale replay is harmless and unknown IDs cannot partially commit', async () => {
    const a = (await create('Reorder first').expect(201)).body.data;
    const b = (await create('Reorder second').expect(201)).body.data;
    const items = [
      { id: a.id, priority: 25, expectedVersion: 1 },
      { id: b.id, priority: 20, expectedVersion: 1 },
    ];
    await write(`${base}/topics/reorder`, { items }, 'put').expect(200);
    const stable = await testDatabase().aIContentItem.findUniqueOrThrow({ where: { id: a.id } });
    await write(`${base}/topics/${a.id}/priority`, { priority: 25, expectedVersion: 2 }, 'put').expect(200);
    const noop = await testDatabase().aIContentItem.findUniqueOrThrow({ where: { id: a.id } });
    expect(noop.version).toBe(stable.version);
    expect(noop.updatedAt).toEqual(stable.updatedAt);
    await write(`${base}/topics/reorder`, { items }, 'put').expect(409);
    await write(
      `${base}/topics/reorder`,
      {
        items: [
          { id: a.id, priority: 99, expectedVersion: 2 },
          { id: b.id, priority: 50, expectedVersion: 1 },
        ],
      },
      'put',
    ).expect(409);
    expect(
      (
        await testDatabase().aIContentItem.findUniqueOrThrow({
          where: { id: a.id },
        })
      ).priority,
    ).toBe(25);
    await write(
      `${base}/topics/reorder`,
      { items: [items[0], items[0]] },
      'put',
    ).expect(400);
  });
  it('validates envelopes, pagination/status/query and unknown actions', async () => {
    const invalid = await create('!').expect(400);
    expect(invalid.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(invalid.body.error.fields).toBeDefined();
    await create('x'.repeat(181)).expect(400);
    await create('   ').expect(400);
    // Only SRS lifecycle states filter; `generating` became one in Phase 1B.
    await agent()
      .get(`${base}/topics?status=processing`)
      .set('Cookie', cookie)
      .expect(400);
    await agent()
      .get(`${base}/topics?status=generating`)
      .set('Cookie', cookie)
      .expect(200);
    await agent()
      .get(`${base}/topics?pageSize=51`)
      .set('Cookie', cookie)
      .expect(400);
    const list = await agent()
      .get(`${base}/topics?status=queued&pageSize=1&page=1&q=Reorder`)
      .set('Cookie', cookie)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta).toMatchObject({ pageSize: 1, total: 2 });
    expect(list.body.data[0].title).toBe('Reorder first');
    await write(`${base}/topics/${list.body.data[0].id}/actions`, {
      action: 'generate',
      expectedVersion: 2,
    }).expect(400);
    await write(`${base}/topics`, {
      title: 'missing request key',
      priority: 0,
    }).expect(400);
  });
  it('settings CAS protects both first insert and updates, audits toggle atomically and never executes', async () => {
    const path = '/api/v1/admin/settings/ai-content';
    const first = await Promise.all([
      write(path, { expectedVersion: 0, values: { enabled: true } }, 'put'),
      write(
        path,
        { expectedVersion: 0, values: { maxSlotsPerMonth: 20 } },
        'put',
      ),
    ]);
    expect(first.map((r) => r.status).sort()).toEqual([200, 409]);
    const version = (await agent().get(path).set('Cookie', cookie)).body.data
      .version;
    const next = await Promise.all([
      write(
        path,
        { expectedVersion: version, values: { location: 'Adelaide city' } },
        'put',
      ),
      write(
        path,
        {
          expectedVersion: version,
          values: { editorialStrategy: 'Local city guides' },
        },
        'put',
      ),
    ]);
    expect(next.map((r) => r.status).sort()).toEqual([200, 409]);
    let current = (await agent().get(path).set('Cookie', cookie)).body.data;
    if (!current.values.enabled)
      current = (
        await write(
          path,
          { expectedVersion: current.version, values: { enabled: true } },
          'put',
        )
      ).body.data;
    await write(
      path,
      { expectedVersion: current.version, values: { enabled: false } },
      'put',
    ).expect(200);
    expect(await testDatabase().aIContentItem.count()).toBeGreaterThan(0);
    const logs = await testDatabase().auditLog.findMany({
      where: { action: { startsWith: 'settings.ai_content.' } },
    });
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining([
        'settings.ai_content.enabled',
        'settings.ai_content.disabled',
      ]),
    );
    expect(JSON.stringify(logs)).not.toContain('Local city guides');
    expect(
      (await agent().get(`${base}/overview`).set('Cookie', cookie)).body.data
        .executionActive,
    ).toBe(false);
    expect(await testDatabase().post.count()).toBe(0);
  });
  it('rolls back topic and settings changes if their consequential audit cannot commit', async () => {
    const audit = app.get(AuditService);
    const before = await testDatabase().aIContentItem.count();
    const spy = vi.spyOn(audit, 'recordWith').mockRejectedValueOnce(new Error('test audit failure'));
    try {
      await create('Must roll back with audit').expect(500);
      expect(await testDatabase().aIContentItem.count()).toBe(before);
      const path = '/api/v1/admin/settings/ai-content';
      const prior = (await agent().get(path).set('Cookie', cookie)).body.data;
      spy.mockRejectedValueOnce(new Error('test audit failure'));
      await write(path, { expectedVersion: prior.version, values: { maxSlotsPerMonth: 7 } }, 'put').expect(500);
      const after = (await agent().get(path).set('Cookie', cookie)).body.data;
      expect(after).toEqual(prior);
    } finally { spy.mockRestore(); }
  });
  it('denies unauthenticated/direct access and configure without configure permission', async () => {
    await agent().get(`${base}/overview`).expect(401);
    await agent().get(`${base}/topics`).expect(401);
    await agent()
      .post(`${base}/topics`)
      .set('Origin', ORIGIN)
      .send({ title: 'no auth' })
      .expect(401);
    await agent()
      .get('/api/v1/admin/settings/ai-content')
      .set('Cookie', limited)
      .expect(403);
    await write(
      '/api/v1/admin/settings/ai-content',
      { expectedVersion: 0, values: {} },
      'put',
      limited,
    ).expect(403);
    const db = testDatabase();
    const admin = await db.adminUser.findUniqueOrThrow({
      where: { email: 'ai-limited@example.com' },
    });
    await db.adminPermission.deleteMany({ where: { adminId: admin.id } });
    await db.adminUser.update({
      where: { id: admin.id },
      data: { authzVersion: { increment: 1 } },
    });
    await agent().get(`${base}/topics`).set('Cookie', limited).expect(403);
    await create('not allowed', randomUUID(), limited).expect(403);
    const row = await testDatabase().aIContentItem.findFirstOrThrow();
    await agent().get(`${base}/overview`).set('Cookie', limited).expect(403);
    await agent().get(`${base}/topics/${row.id}`).set('Cookie', limited).expect(403);
    await write(`${base}/topics/${row.id}/priority`, { expectedVersion: row.version, priority: 10 }, 'put', limited).expect(403);
    await write(`${base}/topics/${row.id}/actions`, { expectedVersion: row.version, action: 'pause' }, 'post', limited).expect(403);
    await write(`${base}/topics/reorder`, { items: [{ id: row.id, expectedVersion: row.version, priority: 10 }] }, 'put', limited).expect(403);
  });
});
