/**
 * The scheduled tasks this system runs (SRS 1.2 TASK 001).
 *
 * The registry is code, shared by the API (which shows and dispatches tasks)
 * and the worker (which owns the schedules and the implementations), so neither
 * can invent a task the other does not know. Nothing an administrator sends
 * ever becomes a schedule, a command or a payload: the only thing they can name
 * is a `code` that appears here.
 */
import { queueJobId } from './queue.js';

export const SCHEDULED_TASK_JOB = 'scheduled.task';

export type MissedRunPolicy = 'catch-up-once' | 'skip-to-next' | 'run-on-recovery';

export interface ScheduledTaskDefinition {
  /** Stable identifier; the only thing an admin request may name. */
  code: string;
  label: string;
  description: string;
  /** Human wording of the schedule, shown in the interface. */
  scheduleLabel: string;
  /** Cron expression owned by this file; never accepted from a request. */
  cron: string;
  timezone: string;
  /** What happens if the process was down when a run was due (TASK 004). */
  missedRunPolicy: MissedRunPolicy;
  timeoutMs: number;
  retries: number;
  /** Whether "Run now" is offered at all (TASK 005). */
  manualRunAllowed: boolean;
  /**
   * True when a run has effects beyond this system — publishing content, or
   * deleting records — so the interface asks for a second, explicit
   * confirmation (TASK 005).
   */
  highImpact: boolean;
  /**
   * Tasks the product's correctness depends on cannot be switched off from the
   * interface (TASK 006). Retention is a legal obligation and publication is a
   * promise to an editor; neither is an operational preference.
   */
  requiredForCorrectness: boolean;
  /** Only true where two simultaneous runs are provably harmless (TASK 004). */
  safeToOverlap: boolean;
}

export const SCHEDULED_TASKS: ScheduledTaskDefinition[] = [
  {
    code: 'content.publish-scheduled',
    label: 'Publish scheduled articles and pages',
    description: 'Publishes articles and information pages whose scheduled time has passed and refreshes the pages that show them. Anything that no longer meets the publication requirements goes back to draft with the reason.',
    scheduleLabel: 'Every minute',
    cron: '* * * * *',
    timezone: 'Australia/Adelaide',
    // A missed window must be caught up: an article scheduled while the worker
    // was down is late, not cancelled.
    missedRunPolicy: 'run-on-recovery',
    timeoutMs: 60_000,
    retries: 2,
    manualRunAllowed: true,
    highImpact: true,
    requiredForCorrectness: true,
    safeToOverlap: false,
  },
  {
    code: 'activity.retention',
    label: 'Apply activity log retention',
    description: 'Removes activity events older than the retention period (365 days).',
    scheduleLabel: 'Daily at 03:10 Adelaide time',
    cron: '10 3 * * *',
    timezone: 'Australia/Adelaide',
    // Yesterday's purge is not worth repeating on start-up; the next run
    // removes anything it would have.
    missedRunPolicy: 'skip-to-next',
    timeoutMs: 300_000,
    retries: 1,
    manualRunAllowed: true,
    highImpact: true,
    requiredForCorrectness: true,
    safeToOverlap: false,
  },
  {
    code: 'email.retention',
    label: 'Apply email log retention',
    description: 'Removes the recipient from delivery records after 90 days and deletes records 180 days after their last event.',
    scheduleLabel: 'Daily at 03:25 Adelaide time',
    cron: '25 3 * * *',
    timezone: 'Australia/Adelaide',
    missedRunPolicy: 'skip-to-next',
    timeoutMs: 300_000,
    retries: 1,
    manualRunAllowed: true,
    highImpact: true,
    requiredForCorrectness: true,
    safeToOverlap: false,
  },
  {
    code: 'media.retention',
    label: 'Apply media retention',
    description: 'Deletes uploads abandoned in quarantine, and processed images that have gone a month without being used anywhere.',
    scheduleLabel: 'Daily at 03:45 Adelaide time',
    cron: '45 3 * * *',
    timezone: 'Australia/Adelaide',
    missedRunPolicy: 'skip-to-next',
    timeoutMs: 300_000,
    retries: 1,
    manualRunAllowed: true,
    highImpact: true,
    requiredForCorrectness: true,
    safeToOverlap: false,
  },
  {
    code: 'queue.clean-metadata',
    label: 'Tidy finished job records',
    description: 'Removes the queue’s records of jobs that completed more than seven days ago. Failures are never removed by this task.',
    scheduleLabel: 'Daily at 04:05 Adelaide time',
    cron: '5 4 * * *',
    timezone: 'Australia/Adelaide',
    missedRunPolicy: 'skip-to-next',
    timeoutMs: 120_000,
    retries: 1,
    manualRunAllowed: true,
    highImpact: false,
    // Housekeeping only: switching it off costs Redis memory, not correctness,
    // so this is the one task an operator may turn off (TASK 006).
    requiredForCorrectness: false,
    safeToOverlap: true,
  },
  {
    code: 'ai-content.recover-operations',
    label: 'Recover AI content operations',
    description: 'Re-queues AI content work whose queue delivery was lost and returns work whose worker lease expired, from the database alone. It never repeats a finished operation or an external request.',
    scheduleLabel: 'Every 5 minutes',
    cron: '*/5 * * * *',
    timezone: 'Australia/Adelaide',
    missedRunPolicy: 'skip-to-next',
    timeoutMs: 60_000,
    retries: 1,
    manualRunAllowed: true,
    highImpact: false,
    // Without it, AI work whose delivery was lost would wait forever.
    requiredForCorrectness: true,
    // Every change it makes is conditional on the row it read, so two runs cannot double an effect.
    safeToOverlap: true,
  },
  {
    code: 'schedule.run-retention',
    label: 'Trim scheduled-run history',
    description: 'Removes execution history older than 30 days, which is the retention this history is kept for.',
    scheduleLabel: 'Daily at 04:20 Adelaide time',
    cron: '20 4 * * *',
    timezone: 'Australia/Adelaide',
    missedRunPolicy: 'skip-to-next',
    timeoutMs: 120_000,
    retries: 1,
    manualRunAllowed: true,
    highImpact: false,
    requiredForCorrectness: true,
    safeToOverlap: false,
  },
];

export function scheduledTask(code: string): ScheduledTaskDefinition | undefined {
  return SCHEDULED_TASKS.find((task) => task.code === code);
}

/**
 * Job id for a scheduled-task dispatch.
 *
 * BullMQ refuses a custom job id containing `:` — it is the separator in its own
 * Redis keys, so an id carrying one is rejected at `add()` time with "Custom Id
 * cannot contain :". Every part is therefore joined with `-`, and the code is
 * included so a duplicate dispatch of the same task is de-duplicated by the
 * queue rather than run twice.
 */
export function scheduledTaskJobId(kind: 'manual' | 'recovery', code: string, discriminator: string): string {
  return queueJobId(SCHEDULED_TASK_JOB, kind, code, discriminator);
}

/** Redis key for a task's execution lock; one namespace, one task per key (TASK 004). */
export function scheduledTaskLockKey(code: string): string {
  return `schedule:lock:${code}`;
}

/** Media retention windows (SRS MED 004), shared by the task and its tests. */
export const QUARANTINE_MAX_AGE_HOURS = 24;
export const UNUSED_READY_MAX_AGE_DAYS = 30;

/** Execution history retention (TASK 002). */
export const SCHEDULED_RUN_RETENTION_DAYS = 30;

/**
 * How often the task is expected to run, in minutes, read from the cron
 * expressions this file owns (every N minutes, or a fixed daily time — the only
 * two shapes used). Monitoring needs a number, and the alternative — a cron
 * parser in the API purely to answer "is the scheduler stopped?" — would be a
 * dependency carrying more than the question needs.
 */
export function scheduledTaskIntervalMinutes(task: ScheduledTaskDefinition): number {
  const [minuteField = '*', ...rest] = task.cron.split(' ');
  const hourly = rest.every((field) => field === '*');
  // `* * * * *` runs every minute; reading it as daily let a stopped publisher go unnoticed for two days.
  if (minuteField === '*' && hourly) return 1;
  const everyN = /^\*\/(\d+)$/.exec(minuteField);
  if (everyN && hourly) return Number(everyN[1]);
  return 24 * 60;
}

/**
 * The silence after which a task is considered not running. Two missed windows
 * plus a grace margin: one late run is a slow job or a restart, two in a row
 * with nothing since is a stopped scheduler (audit F-01 was exactly this,
 * unnoticed).
 */
export function scheduledTaskStaleAfterMinutes(task: ScheduledTaskDefinition): number {
  return scheduledTaskIntervalMinutes(task) * 2 + 15;
}
