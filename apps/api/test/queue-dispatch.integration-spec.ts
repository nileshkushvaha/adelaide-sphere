import type { INestApplication } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import {
  CACHE_INVALIDATE_JOB,
  ENQUIRY_EMAIL_JOB,
  JOB_NAMES,
  MEDIA_PROCESS_JOB,
  QUEUE_NAME,
  SCHEDULED_TASKS,
  SCHEDULED_TASK_JOB,
  jobIdProblem,
  queueJobId,
  redisConnectionFromUrl,
  scheduledTaskJobId,
} from '@adelaide-sphere/domain';
import { QueuePort } from '../src/outbox/queue.port.js';
import { closeTestDatabase, createIntegrationApp } from './integration/harness.js';

/**
 * Dispatch against the real queue (SRS EVT 002, TASK 001–006).
 *
 * Every other suite that touches dispatch replaces `QueuePort` with a recorder,
 * which is the right trade for speed — and is exactly why a job id BullMQ
 * refuses reached production and stopped the worker on start-up (audit F-01).
 * This suite is the one place that uses the library for real, so an id the
 * queue will not accept fails here rather than in a deployment.
 */
describe('Queue dispatch against real BullMQ (integration)', () => {
  let app: INestApplication;
  let queue: Queue;
  let port: QueuePort;

  beforeAll(async () => {
    app = await createIntegrationApp();
    port = app.get(QueuePort);
    queue = new Queue(QUEUE_NAME, { connection: redisConnectionFromUrl(process.env.REDIS_URL ?? 'redis://127.0.0.1:6390/1') });
    await queue.obliterate({ force: true });
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
    await app.close();
    await closeTestDatabase();
  });

  const idsInQueue = async (): Promise<string[]> => (await queue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed'], 0, 200, false)).map((job) => String(job.id));

  it('dispatches every registered scheduled task, manually and on recovery', async () => {
    // The failure this replaces was a *start-up* failure: one bad id and no
    // task in the registry could ever run. So every task is dispatched, not one.
    for (const task of SCHEDULED_TASKS) {
      for (const kind of ['manual', 'recovery'] as const) {
        const id = scheduledTaskJobId(kind, task.code, kind === 'manual' ? 'req-0123456789' : String(Date.now()));
        expect(jobIdProblem(id), `${task.code} ${kind}`).toBeNull();
        await expect(queue.add(SCHEDULED_TASK_JOB, { taskCode: task.code, trigger: kind === 'manual' ? 'manual' : 'scheduled' }, { jobId: id })).resolves.toBeTruthy();
      }
    }
    const ids = await idsInQueue();
    expect(ids.length).toBeGreaterThanOrEqual(SCHEDULED_TASKS.length * 2);
    for (const id of ids) expect(id).not.toContain(':');
  });

  it('dispatches every job name the system produces, through the application boundary', async () => {
    // Not `queue.add` directly: through the port the API actually uses, so the
    // id gate is exercised where production exercises it.
    const dispatched = [
      { id: queueJobId('audit', ENQUIRY_EMAIL_JOB, 'e1'), name: ENQUIRY_EMAIL_JOB, data: { enquiryId: 'e1' } },
      { id: queueJobId('audit', MEDIA_PROCESS_JOB, 'm1'), name: MEDIA_PROCESS_JOB, data: { mediaId: 'm1' } },
      { id: queueJobId('audit', CACHE_INVALIDATE_JOB, 'c1'), name: CACHE_INVALIDATE_JOB, data: { tags: 'businesses' } },
      { id: queueJobId('audit', SCHEDULED_TASK_JOB, 's1'), name: SCHEDULED_TASK_JOB, data: { taskCode: 'activity.retention', trigger: 'manual' } },
    ];
    for (const job of dispatched) await port.enqueue(job);

    const names = (await queue.getJobs(['waiting', 'delayed', 'active'], 0, 200, false)).map((job) => job.name);
    for (const name of JOB_NAMES) expect(names, name).toContain(name);
  });

  it('refuses an id the queue would reject, at the call site and before the library', async () => {
    // The message names the caller and the value, so the failure is actionable
    // in a test rather than a stack trace at 3am.
    await expect(port.enqueue({ id: 'scheduled.task:manual:x', name: ENQUIRY_EMAIL_JOB, data: {} })).rejects.toThrow(/enqueue enquiry.email: .*must not contain ":"/);
    // And nothing was written: a refused dispatch leaves no partial job.
    expect(await queue.getJob('scheduled.task:manual:x')).toBeUndefined();
  });

  it('keeps a repeat dispatch idempotent: the same id is one job, not two', async () => {
    const id = queueJobId('audit', 'idempotency', 'same-outbox-event');
    await port.enqueue({ id, name: ENQUIRY_EMAIL_JOB, data: { enquiryId: 'e-idem', attempt: 1 } });
    await port.enqueue({ id, name: ENQUIRY_EMAIL_JOB, data: { enquiryId: 'e-idem', attempt: 2 } });

    const matching = (await queue.getJobs(['waiting', 'delayed', 'active'], 0, 200, false)).filter((job) => String(job.id) === id);
    expect(matching, 'a repeated dispatch must not create a second job').toHaveLength(1);
    // The first payload wins, which is what makes a retry safe: the queue keeps
    // the work it already accepted rather than replacing it mid-flight.
    expect((matching[0]!.data as { attempt: number }).attempt).toBe(1);
  });

  it('leaves a job persisted under an older id reachable', async () => {
    // Ids already in Redis from a previous deployment must keep working: the
    // gate is on what we *write*, and must not orphan what is already there.
    const legacyId = 'cmts4od350002hbum41bj1wmq';
    await queue.add(ENQUIRY_EMAIL_JOB, { enquiryId: 'legacy' }, { jobId: legacyId });
    const found = await queue.getJob(legacyId);
    expect(found, 'a job persisted before this change must still be reachable').toBeTruthy();
    expect(found!.name).toBe(ENQUIRY_EMAIL_JOB);
    expect(jobIdProblem(legacyId), 'and the gate must not reject the ids already in use').toBeNull();
  });

  it('retries a failed job under the same id and the same payload, so a retry is not a second delivery', async () => {
    // A real worker, because the property under test is what BullMQ does on a
    // failure — not what a stub says it does. The handler fails once and then
    // succeeds, which is the shape of a provider timeout followed by a retry.
    const id = queueJobId('audit', 'retry', 'r1');
    // The cases above left work in the queue; a real worker would drain it and
    // drown the signal, so this case starts from an empty queue.
    await queue.obliterate({ force: true });
    const seen: { id: string; attempt: number; enquiryId: string }[] = [];
    const worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        if (String(job.id) !== id) return 'ignored';
        seen.push({ id: String(job.id), attempt: job.attemptsMade, enquiryId: (job.data as { enquiryId: string }).enquiryId });
        if (seen.length === 1) throw new Error('provider timed out');
        return 'delivered';
      },
      { connection: redisConnectionFromUrl(process.env.REDIS_URL ?? 'redis://127.0.0.1:6390/1'), concurrency: 1 },
    );
    try {
      await queue.add(ENQUIRY_EMAIL_JOB, { enquiryId: 'e-retry' }, { jobId: id, attempts: 2, backoff: { type: 'fixed', delay: 50 } });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`the job never completed; attempts seen: ${seen.length}`)), 15_000);
        worker.on('completed', (job) => {
          if (String(job.id) === id) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
    } finally {
      await worker.close();
    }

    expect(seen, 'the job should have been attempted twice').toHaveLength(2);
    // Same job id and same payload on the retry: the queue re-ran the work it
    // already had rather than creating a second unit of work.
    expect(new Set(seen.map((entry) => entry.id))).toEqual(new Set([id]));
    expect(new Set(seen.map((entry) => entry.enquiryId))).toEqual(new Set(['e-retry']));
    expect(seen[0]!.attempt).toBe(0);
    expect(seen[1]!.attempt).toBe(1);
  });
});
