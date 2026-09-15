import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Queue } from 'bullmq';
import { ENQUIRY_EMAIL_JOB, QUEUE_NAME, redisConnectionFromUrl } from '@adelaide-sphere/domain';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/**
 * Queue monitor (SRS 1.2 QMON 001–005) against the real Redis.
 *
 * The important assertions are the negative ones: an operator who may look
 * cannot act, a payload reaches the screen with the visitor's own words
 * removed, a bulk action is bounded and reports per item, and there is no route
 * that creates a job.
 */
describe('Queue monitor (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  let viewerCookie: string;
  let queue: Queue;
  const agent = () => request(app.getHttpServer());
  const post = (path: string, as = cookie) => agent().post(path).set('Origin', ORIGIN).set('Cookie', as);
  const loginAs = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.120');

    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'queue_viewer', name: 'Queue viewer', description: 'test' } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: 'system.queues.view' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await seedSuperAdmin(app, { email: 'queue-viewer@example.com', password: 'viewer-password-12345', displayName: 'Viewer' });
    const viewer = await db.adminUser.findUniqueOrThrow({ where: { email: 'queue-viewer@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: viewer.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: viewer.id, roleId: role.id } });
    viewerCookie = await loginAs('queue-viewer@example.com', 'viewer-password-12345', '203.0.113.121');

    queue = new Queue(QUEUE_NAME, { connection: redisConnectionFromUrl(process.env.REDIS_URL ?? 'redis://127.0.0.1:6390/1') });
    await queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('reports the registered queue with its depths, and calls worker availability an estimate', async () => {
    await queue.add(ENQUIRY_EMAIL_JOB, { enquiryId: 'enq-1', businessId: 'biz-1' }, { jobId: 'waiting-1' });
    const res = await agent().get('/api/v1/admin/system/queues').set('Cookie', cookie).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const [summary] = res.body.data;
    expect(summary.name).toBe(QUEUE_NAME);
    expect(summary.available).toBe(true);
    expect(summary.counts.waiting).toBeGreaterThanOrEqual(1);
    expect(summary.oldestWaitingSeconds).toBeGreaterThanOrEqual(0);
    expect(summary.workers.estimated).toBe(true);
    expect(summary.pauseConsequence).toMatch(/enquir/i);
    expect(summary.jobs.map((job: { name: string }) => job.name)).toContain(ENQUIRY_EMAIL_JOB);
  });

  it('lists a job without the visitor’s name, address or message', async () => {
    await queue.add(
      ENQUIRY_EMAIL_JOB,
      { enquiryId: 'enq-2', businessId: 'biz-2', name: 'Jo Nguyen', email: 'jo@example.com', message: 'Do you open on Sundays?', resetToken: 'secret-token' },
      { jobId: 'waiting-2' },
    );
    const res = await agent().get(`/api/v1/admin/system/queues/${QUEUE_NAME}/jobs?state=waiting&pageSize=50`).set('Cookie', cookie).expect(200);
    const job = res.body.data.find((row: { id: string }) => row.id === 'waiting-2');
    expect(job.label).toBe('Enquiry delivery');
    expect(job.data.fields).toEqual([
      { label: 'Enquiry', value: 'enq-2' },
      { label: 'Listing', value: 'biz-2' },
    ]);
    const body = JSON.stringify(res.body);
    for (const secret of ['Jo Nguyen', 'jo@example.com', 'Sundays', 'secret-token']) expect(body).not.toContain(secret);
  });

  it('refuses every action to an operator who may only look', async () => {
    await agent().get('/api/v1/admin/system/queues').set('Cookie', viewerCookie).expect(200);
    await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/retry`, viewerCookie).send({ jobIds: ['waiting-1'] }).expect(403);
    await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/remove`, viewerCookie).send({ jobIds: ['waiting-1'] }).expect(403);
    await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/pause`, viewerCookie).send({ paused: true }).expect(403);
    await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/clean`, viewerCookie).send({ state: 'completed', olderThanHours: 48 }).expect(403);
  });

  it('reports a per-item outcome, so one item’s failure hides nothing', async () => {
    const res = await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/remove`).send({ jobIds: ['waiting-2', 'does-not-exist'] }).expect(200);
    expect(res.body.data).toMatchObject({ requested: 2, succeeded: ['waiting-2'] });
    expect(res.body.data.failed[0]).toMatchObject({ id: 'does-not-exist' });
    expect(await queue.getJob('waiting-2')).toBeUndefined();
  });

  it('refuses an unbounded or empty selection, and a queue it does not know', async () => {
    await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/remove`).send({ jobIds: [] }).expect(400);
    await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/remove`)
      .send({ jobIds: Array.from({ length: 26 }, (_, index) => `job-${index}`) })
      .expect(400);
    await agent().get('/api/v1/admin/system/queues/not-a-queue/jobs').set('Cookie', cookie).expect(404);
    await post('/api/v1/admin/system/queues/not-a-queue/retry').send({ jobIds: ['x'] }).expect(404);
  });

  it('will not retry a job that has not failed', async () => {
    const res = await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/retry`).send({ jobIds: ['waiting-1'] }).expect(200);
    expect(res.body.data.succeeded).toEqual([]);
    expect(res.body.data.failed[0].reason).toMatch(/waiting/i);
  });

  it('will not erase recent finished-job evidence', async () => {
    await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/clean`).send({ state: 'completed', olderThanHours: 1 }).expect(400);
    await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/clean`).send({ state: 'waiting', olderThanHours: 48 }).expect(400);
    await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/clean`).send({ state: 'completed', olderThanHours: 48 }).expect(200);
  });

  it('pauses and resumes, recording who did it', async () => {
    await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/pause`).send({ paused: true }).expect(200);
    expect(await queue.isPaused()).toBe(true);
    await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/pause`).send({ paused: false }).expect(200);
    expect(await queue.isPaused()).toBe(false);

    const db = testDatabase();
    const actions = (await db.auditLog.findMany({ where: { action: { startsWith: 'system.queue.' } }, select: { action: true } })).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(['system.queue.pause', 'system.queue.resume', 'system.queue.cancel', 'system.queue.retry']));
  });

  it('offers no way to create a job or edit a payload', async () => {
    await post(`/api/v1/admin/system/queues/${QUEUE_NAME}/jobs`).send({ name: ENQUIRY_EMAIL_JOB, data: {} }).expect(404);
    await agent().put(`/api/v1/admin/system/queues/${QUEUE_NAME}/jobs/waiting-1`).set('Origin', ORIGIN).set('Cookie', cookie).send({ data: {} }).expect(404);
    await agent().get('/api/v1/admin/system/queues').expect(401);
  });
});
