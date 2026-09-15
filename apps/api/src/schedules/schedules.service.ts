import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { SCHEDULED_TASKS, SCHEDULED_TASK_JOB, scheduledTask, scheduledTaskJobId, type ScheduledTaskDefinition } from '@adelaide-sphere/domain';
import type { ScheduledTaskRun } from '@adelaide-sphere/database';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { QueuePort } from '../outbox/queue.port.js';

export interface ScheduledTaskView {
  code: string;
  label: string;
  description: string;
  scheduleLabel: string;
  timezone: string;
  missedRunPolicy: string;
  timeoutMs: number;
  retries: number;
  manualRunAllowed: boolean;
  highImpact: boolean;
  requiredForCorrectness: boolean;
  safeToOverlap: boolean;
  /** False only where an administrator has switched an optional task off. */
  enabled: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastOutcome: string | null;
  lastDurationMs: number | null;
  lastDetail: string | null;
  /** True while a run row is still open; the lock itself belongs to the worker. */
  running: boolean;
}

export interface ScheduledRunView {
  id: string;
  taskCode: string;
  trigger: string;
  outcome: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  detail: string | null;
  actorAdminId: string | null;
  runnerId: string | null;
}

/**
 * Scheduled tasks (SRS 1.2 TASK 001–006).
 *
 * The API shows what the registry declares and what the history records, and
 * can ask for one registered task to run. It never executes a task itself: a
 * manual run is a queue job the worker picks up under the same lock a scheduled
 * run uses, so "run now" during a scheduled run cannot produce two concurrent
 * executions. Nothing here accepts a command, a cron expression, a queue name
 * or a payload — only a code that appears in the registry (TASK 003).
 */
@Injectable()
export class SchedulesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly queue: QueuePort,
  ) {}

  private definitionOrThrow(code: string): ScheduledTaskDefinition {
    const task = scheduledTask(code);
    if (!task) throw new NotFoundException({ code: 'UNKNOWN_TASK', message: 'No such scheduled task' });
    return task;
  }

  async list(): Promise<ScheduledTaskView[]> {
    const db = await this.database.client();
    const codes = SCHEDULED_TASKS.map((task) => task.code);
    const [states, latest] = await Promise.all([
      db.scheduledTaskState.findMany({ where: { taskCode: { in: codes } } }),
      // One query for the most recent run of each task: the history is small
      // and bounded by retention, and this keeps the screen to two round trips.
      db.scheduledTaskRun.findMany({ where: { taskCode: { in: codes } }, orderBy: { startedAt: 'desc' }, take: codes.length * 5 }),
    ]);
    const stateByCode = new Map(states.map((state) => [state.taskCode, state]));
    const lastByCode = new Map<string, ScheduledTaskRun>();
    for (const run of latest) if (!lastByCode.has(run.taskCode)) lastByCode.set(run.taskCode, run);

    return SCHEDULED_TASKS.map((task) => {
      const last = lastByCode.get(task.code);
      return {
        code: task.code,
        label: task.label,
        description: task.description,
        scheduleLabel: task.scheduleLabel,
        timezone: task.timezone,
        missedRunPolicy: task.missedRunPolicy,
        timeoutMs: task.timeoutMs,
        retries: task.retries,
        manualRunAllowed: task.manualRunAllowed,
        highImpact: task.highImpact,
        requiredForCorrectness: task.requiredForCorrectness,
        safeToOverlap: task.safeToOverlap,
        // A required task is enabled whatever a stale row says.
        enabled: task.requiredForCorrectness ? true : (stateByCode.get(task.code)?.enabled ?? true),
        lastStartedAt: last?.startedAt.toISOString() ?? null,
        lastFinishedAt: last?.finishedAt?.toISOString() ?? null,
        lastOutcome: last?.outcome ?? null,
        lastDurationMs: last?.durationMs ?? null,
        lastDetail: last?.detail ?? null,
        running: last?.outcome === 'running',
      };
    });
  }

  /** Bounded execution history for one task (TASK 002). */
  async history(code: string, page: number, pageSize: number): Promise<{ rows: ScheduledRunView[]; total: number }> {
    this.definitionOrThrow(code);
    const db = await this.database.client();
    const [rows, total] = await Promise.all([
      db.scheduledTaskRun.findMany({ where: { taskCode: code }, orderBy: { startedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      db.scheduledTaskRun.count({ where: { taskCode: code } }),
    ]);
    return {
      rows: rows.map((run) => ({
        id: run.id,
        taskCode: run.taskCode,
        trigger: run.trigger,
        outcome: run.outcome,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        durationMs: run.durationMs,
        detail: run.detail,
        actorAdminId: run.actorAdminId,
        runnerId: run.runnerId,
      })),
      total,
    };
  }

  /**
   * Asks the worker to run one registered task now (TASK 003/005). The request
   * carries a code and nothing else; the job id makes a double-click one job
   * rather than two.
   */
  async runNow(code: string, actor: AdminPrincipal, ctx: RequestContext): Promise<{ dispatched: true }> {
    const task = this.definitionOrThrow(code);
    if (!task.manualRunAllowed) {
      throw new HttpException({ code: 'MANUAL_RUN_NOT_ALLOWED', message: 'This task cannot be run manually' }, HttpStatus.CONFLICT);
    }
    if (!(await this.isEnabled(task))) {
      throw new HttpException({ code: 'TASK_DISABLED', message: 'This task is switched off. Enable it before running it.' }, HttpStatus.CONFLICT);
    }

    await this.queue.enqueue({
      id: scheduledTaskJobId('manual', code, ctx.requestId),
      name: SCHEDULED_TASK_JOB,
      data: { taskCode: code, trigger: 'manual', actorAdminId: actor.id },
    });
    await this.audit.record({
      action: 'system.schedule.run',
      actorAdminId: actor.id,
      targetType: 'scheduled_task',
      targetId: code,
      metadata: { trigger: 'manual' },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return { dispatched: true };
  }

  private async isEnabled(task: ScheduledTaskDefinition): Promise<boolean> {
    if (task.requiredForCorrectness) return true;
    const db = await this.database.client();
    const state = await db.scheduledTaskState.findUnique({ where: { taskCode: task.code } });
    return state?.enabled ?? true;
  }

  /** Runtime enable/disable, refused for tasks the product's correctness needs (TASK 006). */
  async setEnabled(code: string, enabled: boolean, actor: AdminPrincipal, ctx: RequestContext): Promise<{ enabled: boolean }> {
    const task = this.definitionOrThrow(code);
    if (task.requiredForCorrectness && !enabled) {
      throw new HttpException(
        { code: 'TASK_REQUIRED', message: 'This task cannot be switched off: publication and retention are obligations, not preferences.' },
        HttpStatus.CONFLICT,
      );
    }
    const db = await this.database.client();
    await db.scheduledTaskState.upsert({
      where: { taskCode: code },
      create: { taskCode: code, enabled, updatedByAdminId: actor.id },
      update: { enabled, updatedByAdminId: actor.id },
    });
    await this.audit.record({
      action: enabled ? 'system.schedule.enable' : 'system.schedule.disable',
      actorAdminId: actor.id,
      targetType: 'scheduled_task',
      targetId: code,
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return { enabled };
  }
}
