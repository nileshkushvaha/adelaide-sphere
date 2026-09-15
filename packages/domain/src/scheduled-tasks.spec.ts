import { describe, expect, it } from 'vitest';
import { SCHEDULED_TASKS, scheduledTask, scheduledTaskIntervalMinutes, scheduledTaskJobId, scheduledTaskLockKey, scheduledTaskStaleAfterMinutes } from './scheduled-tasks.js';

/**
 * The queue's own constraints, asserted here rather than discovered at start-up.
 * A job id containing `:` is rejected by BullMQ with "Custom Id cannot contain
 * :", which took the worker down entirely before this was fixed (audit F-01).
 */
describe('scheduledTaskJobId', () => {
  it('never produces an id BullMQ refuses, for any registered task', () => {
    for (const task of SCHEDULED_TASKS) {
      for (const id of [scheduledTaskJobId('manual', task.code, 'a-request-id'), scheduledTaskJobId('recovery', task.code, '1757300000000')]) {
        expect(id, task.code).not.toContain(':');
        expect(id).toMatch(/^[A-Za-z0-9._-]+$/);
      }
    }
  });

  it('strips a colon out of a discriminator it is handed', () => {
    // Request ids are opaque; the id builder must not depend on their shape.
    expect(scheduledTaskJobId('manual', 'activity.retention', 'req:with:colons')).not.toContain(':');
  });

  it('is stable for the same dispatch, so a repeat is de-duplicated by the queue', () => {
    expect(scheduledTaskJobId('manual', 'activity.retention', 'r1')).toBe(scheduledTaskJobId('manual', 'activity.retention', 'r1'));
    expect(scheduledTaskJobId('manual', 'activity.retention', 'r1')).not.toBe(scheduledTaskJobId('manual', 'email.retention', 'r1'));
  });
});

describe('the task registry', () => {
  it('gives every task a lock key of its own', () => {
    const keys = SCHEDULED_TASKS.map((task) => scheduledTaskLockKey(task.code));
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith('schedule:lock:')).toBe(true);
  });

  it('declares a cron expression and a timezone for every task', () => {
    for (const task of SCHEDULED_TASKS) {
      expect(task.cron, task.code).toMatch(/^[\d*/, -]+$/);
      expect(task.timezone).toBe('Australia/Adelaide');
      expect(scheduledTask(task.code)).toBe(task);
    }
  });
});

describe('expected cadence, for detecting a stopped scheduler', () => {
  it('reads the interval from the cron expressions this file owns', () => {
    expect(scheduledTaskIntervalMinutes(scheduledTask('content.publish-scheduled')!)).toBe(1);
    expect(scheduledTaskIntervalMinutes({ ...scheduledTask('content.publish-scheduled')!, cron: '*/5 * * * *' })).toBe(5);
    expect(scheduledTaskIntervalMinutes(scheduledTask('activity.retention')!)).toBe(24 * 60);
  });

  it('allows two missed windows plus a margin before calling a task stale', () => {
    expect(scheduledTaskStaleAfterMinutes(scheduledTask('content.publish-scheduled')!)).toBe(17);
    expect(scheduledTaskStaleAfterMinutes(scheduledTask('activity.retention')!)).toBe(2 * 24 * 60 + 15);
  });

  it('gives every registered task a finite, positive staleness bound', () => {
    for (const task of SCHEDULED_TASKS) {
      const minutes = scheduledTaskStaleAfterMinutes(task);
      expect(Number.isFinite(minutes)).toBe(true);
      expect(minutes).toBeGreaterThan(0);
    }
  });
});
