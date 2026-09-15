import { describe, expect, it } from 'vitest';
import { JOB_NAMES, MAX_JOB_ID_LENGTH, assertQueueJobId, jobIdProblem, queueJobId } from './queue.js';

/**
 * The queue's constraints, asserted here rather than discovered at start-up.
 * A custom job id containing `:` is refused by BullMQ with "Custom Id cannot
 * contain :", which took the worker down entirely in production (audit F-01).
 */
describe('queueJobId', () => {
  it('joins parts into an id the queue accepts', () => {
    expect(queueJobId('scheduled.task', 'manual', 'activity.retention', 'req-1')).toBe('scheduled.task-manual-activity.retention-req-1');
    expect(jobIdProblem(queueJobId('scheduled.task', 'manual', 'activity.retention', 'req-1'))).toBeNull();
  });

  it('removes every character the queue or its keys could choke on', () => {
    // A colon is the fatal one; the rest are the shapes real data arrives in —
    // a pasted path, a header with a space, a request id with a newline.
    for (const hostile of ['a:b', 'a/b', 'a b', 'a\nb', 'a\tb', 'a#b?c', 'a%2Fb', '«unicode»']) {
      const id = queueJobId('job', hostile);
      expect(id, hostile).not.toContain(':');
      expect(jobIdProblem(id), hostile).toBeNull();
    }
  });

  it('bounds the length, because a job id becomes part of a Redis key', () => {
    const id = queueJobId('job', 'x'.repeat(500));
    expect(id).toHaveLength(MAX_JOB_ID_LENGTH);
    expect(jobIdProblem(id)).toBeNull();
  });

  it('refuses to invent an id out of nothing, rather than letting the queue assign one', () => {
    // Falling back to a generated id would silently drop the de-duplication the
    // caller asked for, which is how a retry becomes a duplicate delivery.
    expect(() => queueJobId('', '   ')).toThrow(/usable characters/);
    expect(() => queueJobId(':::')).toThrow(/usable characters/);
  });

  it('is stable, so the same dispatch de-duplicates and a different one does not', () => {
    expect(queueJobId('a', 'b')).toBe(queueJobId('a', 'b'));
    expect(queueJobId('a', 'b')).not.toBe(queueJobId('a', 'c'));
  });
});

describe('jobIdProblem', () => {
  it('names the colon explicitly, because that is the failure that shipped', () => {
    expect(jobIdProblem('scheduled.task:manual:x')).toMatch(/must not contain ":"/);
  });

  it('accepts the ids the application actually produces', () => {
    // cuid2-shaped outbox event ids, which is what every API-side job uses.
    for (const id of ['cmts4od350002hbum41bj1wmq', 'scheduled.task-recovery-content.publish-scheduled-1788839430829']) {
      expect(jobIdProblem(id), id).toBeNull();
    }
  });

  it('rejects an empty id and one that is too long', () => {
    expect(jobIdProblem('')).toMatch(/must not be empty/);
    expect(jobIdProblem('x'.repeat(MAX_JOB_ID_LENGTH + 1))).toMatch(/at most/);
  });
});

describe('assertQueueJobId', () => {
  it('fails in a test with the caller and the value, not at start-up in production', () => {
    expect(() => assertQueueJobId('bad:id', 'enqueue enquiry.email')).toThrow(/enqueue enquiry.email: .*must not contain/);
    expect(() => assertQueueJobId('good-id', 'enqueue enquiry.email')).not.toThrow();
  });

  it('covers every job name the system dispatches', () => {
    expect([...JOB_NAMES]).toEqual(['enquiry.email', 'media.process', 'cache.invalidate', 'scheduled.task']);
    for (const name of JOB_NAMES) expect(jobIdProblem(queueJobId(name, 'x'))).toBeNull();
  });
});
