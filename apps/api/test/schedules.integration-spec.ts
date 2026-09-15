import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Queue } from 'bullmq';
import { QUEUE_NAME, SCHEDULED_TASKS, SCHEDULED_TASK_JOB, redisConnectionFromUrl } from '@adelaide-sphere/domain';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { QueuePort } from '../src/outbox/queue.port.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/**
 * Scheduled tasks (SRS 1.2 TASK 001–006).
 *
 * The point of these tests is what the interface refuses: an unregistered code,
 * anything resembling a command or a schedule, disabling a task the product
 * needs, and acting without the permission for that particular action. A manual
 * run must leave the request without having executed anything.
 */
describe('Scheduled tasks (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  let viewerCookie: string;
  const dispatched: { name: string; data: Record<string, unknown> }[] = [];
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
    cookie = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.140');

    const db = testDatabase();
    const role = await db.role.create({ data: { key: 'schedule_viewer', name: 'Schedule viewer', description: 'test' } });
    const permission = await db.permission.findUniqueOrThrow({ where: { key: 'system.schedules.view' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await seedSuperAdmin(app, { email: 'schedule-viewer@example.com', password: 'viewer-password-12345', displayName: 'Viewer' });
    const viewer = await db.adminUser.findUniqueOrThrow({ where: { email: 'schedule-viewer@example.com' } });
    const superRole = await db.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    await db.adminRole.delete({ where: { adminId_roleId: { adminId: viewer.id, roleId: superRole.id } } });
    await db.adminRole.create({ data: { adminId: viewer.id, roleId: role.id } });
    viewerCookie = await loginAs('schedule-viewer@example.com', 'viewer-password-12345', '203.0.113.141');

    // Record what the API asks the worker to do, without a worker running.
    const queue = app.get(QueuePort);
    const original = queue.enqueue.bind(queue);
    queue.enqueue = async (job) => {
      dispatched.push({ name: job.name, data: job.data });
      if (process.env.KEEP_QUEUE === 'true') await original(job);
    };
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('lists every registered task with its schedule and control flags', async () => {
    const res = await agent().get('/api/v1/admin/system/schedules').set('Cookie', cookie).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data.map((task: { code: string }) => task.code)).toEqual(SCHEDULED_TASKS.map((task) => task.code));
    // Every retention policy the SRS states has a task that applies it; a
    // policy nothing runs is the failure mode this list exists to prevent.
    for (const code of ['activity.retention', 'email.retention', 'media.retention', 'schedule.run-retention']) {
      expect(res.body.data.find((task: { code: string }) => task.code === code)?.requiredForCorrectness).toBe(true);
    }
    const retention = res.body.data.find((task: { code: string }) => task.code === 'activity.retention');
    expect(retention).toMatchObject({ requiredForCorrectness: true, manualRunAllowed: true, enabled: true, lastOutcome: null });
    expect(retention.scheduleLabel).toMatch(/daily/i);
  });

  it('dispatches a manual run to the worker instead of executing it in the request', async () => {
    dispatched.length = 0;
    const before = Date.now();
    const res = await post('/api/v1/admin/system/schedules/activity.retention/run').send({}).expect(202);
    expect(res.body.data).toEqual({ dispatched: true });
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.name).toBe(SCHEDULED_TASK_JOB);
    expect(dispatched[0]!.data).toMatchObject({ taskCode: 'activity.retention', trigger: 'manual' });
    // Nothing ran: the request returned immediately and no run was recorded.
    expect(await testDatabase().scheduledTaskRun.count()).toBe(0);
    expect(Date.now() - before).toBeLessThan(2_000);
  });

  it('refuses a code that is not in the registry, whatever it looks like', async () => {
    for (const code of ['not-a-task', 'rm%20-rf', '*%2F5%20*%20*%20*%20*', 'adelaide-sphere']) {
      await post(`/api/v1/admin/system/schedules/${code}/run`).send({}).expect(404);
      await agent().get(`/api/v1/admin/system/schedules/${code}/runs`).set('Cookie', cookie).expect(404);
    }
  });

  it('will not switch off a task the product’s correctness depends on', async () => {
    const res = await post('/api/v1/admin/system/schedules/activity.retention/enabled').send({ enabled: false }).expect(409);
    expect(res.body.error.code).toBe('TASK_REQUIRED');
    expect(await testDatabase().scheduledTaskState.findUnique({ where: { taskCode: 'activity.retention' } })).toBeNull();
  });

  it('switches an optional task off and on again, and refuses to run it while it is off', async () => {
    await post('/api/v1/admin/system/schedules/queue.clean-metadata/enabled').send({ enabled: false }).expect(200);
    const list = await agent().get('/api/v1/admin/system/schedules').set('Cookie', cookie).expect(200);
    expect(list.body.data.find((task: { code: string }) => task.code === 'queue.clean-metadata').enabled).toBe(false);

    const blocked = await post('/api/v1/admin/system/schedules/queue.clean-metadata/run').send({}).expect(409);
    expect(blocked.body.error.code).toBe('TASK_DISABLED');

    await post('/api/v1/admin/system/schedules/queue.clean-metadata/enabled').send({ enabled: true }).expect(200);
    await post('/api/v1/admin/system/schedules/queue.clean-metadata/run').send({}).expect(202);
  });

  it('separates looking from running and from enabling', async () => {
    await agent().get('/api/v1/admin/system/schedules').set('Cookie', viewerCookie).expect(200);
    await post('/api/v1/admin/system/schedules/activity.retention/run', viewerCookie).send({}).expect(403);
    await post('/api/v1/admin/system/schedules/queue.clean-metadata/enabled', viewerCookie).send({ enabled: false }).expect(403);
    await agent().get('/api/v1/admin/system/schedules').expect(401);
  });

  it('shows bounded execution history, outcomes and durations only', async () => {
    const db = testDatabase();
    await db.scheduledTaskRun.createMany({
      data: Array.from({ length: 3 }, (_, index) => ({
        taskCode: 'activity.retention',
        trigger: 'scheduled' as const,
        outcome: 'succeeded' as const,
        startedAt: new Date(Date.now() - index * 60_000),
        finishedAt: new Date(Date.now() - index * 60_000 + 900),
        durationMs: 900,
        detail: `Removed ${index} activity events`,
        runnerId: 'runner-1',
      })),
    });
    const res = await agent().get('/api/v1/admin/system/schedules/activity.retention/runs?pageSize=2').set('Cookie', cookie).expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(res.body.data[0]).toMatchObject({ outcome: 'succeeded', durationMs: 900, runnerId: 'runner-1' });

    const list = await agent().get('/api/v1/admin/system/schedules').set('Cookie', cookie).expect(200);
    expect(list.body.data.find((task: { code: string }) => task.code === 'activity.retention')).toMatchObject({ lastOutcome: 'succeeded', lastDurationMs: 900 });
  });

  it('records who ran or changed a task', async () => {
    const actions = (await testDatabase().auditLog.findMany({ where: { action: { startsWith: 'system.schedule.' } }, select: { action: true } })).map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(['system.schedule.run', 'system.schedule.disable', 'system.schedule.enable']));
  });

  it('offers no route that accepts a command, a schedule or a payload', async () => {
    await post('/api/v1/admin/system/schedules').send({ code: 'evil', cron: '* * * * *' }).expect(404);
    await agent().put('/api/v1/admin/system/schedules/activity.retention').set('Origin', ORIGIN).set('Cookie', cookie).send({ cron: '* * * * *' }).expect(404);
    await post('/api/v1/admin/system/schedules/activity.retention/run').send({ command: 'rm -rf /', cron: '* * * * *' }).expect(202);
    // The body was ignored entirely: the dispatched job carries only the code.
    expect(Object.keys(dispatched.at(-1)!.data)).toEqual(['taskCode', 'trigger', 'actorAdminId']);
  });

  /**
   * The stub above records what the API asks for, which is the right shape for
   * every other assertion here — and is exactly why a job id BullMQ refuses got
   * through review and took the worker down at start-up (audit F-01). This case
   * puts one real dispatch through the real queue.
   */
  it('dispatches through the real queue, so the job id is one BullMQ actually accepts', async () => {
    const queue = new Queue(QUEUE_NAME, { connection: redisConnectionFromUrl(process.env.REDIS_URL ?? 'redis://127.0.0.1:6390/1') });
    try {
      await queue.obliterate({ force: true });
      process.env.KEEP_QUEUE = 'true';
      await post('/api/v1/admin/system/schedules/activity.retention/run').send({}).expect(202);

      const waiting = await queue.getJobs(['waiting', 'delayed', 'active'], 0, 20, true);
      const dispatched = waiting.filter((job) => job.name === SCHEDULED_TASK_JOB);
      expect(dispatched, 'the manual run should be a real queue job').toHaveLength(1);
      expect(String(dispatched[0]!.id)).not.toContain(':');
      expect(dispatched[0]!.data).toMatchObject({ taskCode: 'activity.retention', trigger: 'manual' });
    } finally {
      process.env.KEEP_QUEUE = 'false';
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
