import type { Queue } from 'bullmq';
import type { DatabaseClient } from '@adelaide-sphere/database';
import { recoverOperations } from '@adelaide-sphere/database/automation';
import { DUE_SCHEDULED_POST_SELECT, publishDueScheduledPost } from '@adelaide-sphere/database/editorial';
import {
  CACHE_TAGS,
  MEDIA_SETTING_REFERENCES,
  QUARANTINE_MAX_AGE_HOURS,
  SCHEDULED_RUN_RETENTION_DAYS,
  UNUSED_READY_MAX_AGE_DAYS,
  pagePublicationBlockers,
  scheduledTask,
  scheduledTaskLockKey,
  unusedMediaRelations,
  htmlToPlainText,
  validatePageSections,
  type ScheduledTaskDefinition,
} from '@adelaide-sphere/domain';

/**
 * The text of stored article HTML, for the length requirement — the same
 * conversion the API uses (`htmlToPlainText`), so both apply the publication
 * rules to the same text.
 */
export function plainTextOf(html: string): string {
  // The same conversion the API uses, so both apply the publication rules to the same text.
  return htmlToPlainText(html);
}

export interface ScheduledTaskJobData {
  taskCode?: string;
  trigger?: 'scheduled' | 'manual';
  actorAdminId?: string | null;
}

export interface TaskContext {
  db: DatabaseClient;
  now: Date;
  /** The queue itself, for the housekeeping task that tidies its own records. */
  queue: Queue;
  /**
   * Object storage, for the one task that deletes stored bytes. Optional so a
   * deployment without storage still runs every other task; the media task
   * reports that it could not run rather than failing the schedule.
   */
  storage?: { delete(bucket: 'quarantine' | 'public', key: string): Promise<void> };
}

/** One line describing what a run did; counts only, never rows or addresses. */
export type TaskResult = string;

/** Days after which a delivery record's protected recipient is removed (SRS 1.2 MAIL 010). */
export const EMAIL_RECIPIENT_ANONYMISE_DAYS = 90;
/** Days after which the delivery record itself is deleted (MAIL 010). */
export const EMAIL_RECORD_RETENTION_DAYS = 180;
/** Activity events are kept a year (ACT 006); mirrored from the API's catalogue. */
export const ACTIVITY_RETENTION_DAYS = 365;

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

/**
 * What each registered task actually does (SRS 1.2 TASK 001–004).
 *
 * Every implementation is idempotent: it works from "everything older than X"
 * rather than from a cursor, so a repeat after a crash, a manual run during a
 * scheduled one, or a retry after a timeout all converge on the same state.
 * Each returns one line for the run record — a count of what changed, never
 * what was in it.
 */
export const TASK_IMPLEMENTATIONS: Record<string, (ctx: TaskContext) => Promise<TaskResult>> = {
  /**
   * Publishes articles (SRS BLOG 002) and information pages (change log 1.17) whose scheduled time has passed. This is
   * the only scheduled publisher: the API no longer runs its own timer, so the
   * two can never disagree about what publishing records.
   *
   * Late is not cancelled: a run picks up everything due, however long the
   * worker was down. The publication requirements are checked again at the
   * scheduled time, because an author or category can be retired after an
   * article is scheduled; an article that no longer qualifies goes back to
   * draft with the reason recorded, rather than going live broken.
   *
   * Each article changes in its own transaction guarded by its version — the
   * same guard an editor's save uses — with its audit entry and the cache
   * invalidation that makes it visible, so a failure part-way leaves published
   * articles visible rather than published-but-hidden, and an editor with the
   * article open gets a conflict instead of silently overwriting it.
   */
  'content.publish-scheduled': async ({ db, now }) => {
    const due = await db.post.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: now } },
      select: DUE_SCHEDULED_POST_SELECT,
      orderBy: { scheduledAt: 'asc' },
      take: 200,
    });
    let published = 0;
    let returned = 0;
    // The per-article transaction, with the AI eligibility policy the admin
    // publish command also applies, is the shared editorial seam's.
    for (const post of due) {
      const outcome = await publishDueScheduledPost(db, post, now);
      if (outcome === 'published') published += 1;
      if (outcome === 'returned') returned += 1;
    }

    // Information pages scheduled from the page editor (change log 1.17), under
    // the same rules the API applies when someone presses Publish.
    const duePages = await db.staticPage.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: now } },
      select: { id: true, slug: true, version: true, title: true, sanitizedBody: true, sections: true },
      orderBy: { scheduledAt: 'asc' },
      take: 200,
    });
    let pagesPublished = 0;
    let pagesReturned = 0;
    for (const page of duePages) {
      const blockers = pagePublicationBlockers({ title: page.title, plainBody: plainTextOf(page.sanitizedBody), sections: Array.isArray(page.sections) ? validatePageSections(page.sections).sections : null });
      await db.$transaction(async (tx) => {
        if (blockers.length > 0) {
          const updated = await tx.staticPage.updateMany({
            where: { id: page.id, status: 'scheduled', version: page.version },
            data: { status: 'draft', scheduledAt: null, publishFailure: blockers.join(' ').slice(0, 300), version: { increment: 1 } },
          });
          if (updated.count === 0) return;
          await tx.auditLog.create({ data: { action: 'settings.page.schedule_blocked', targetType: 'static_page', targetId: page.id, metadata: { slug: page.slug, blockers } } });
          pagesReturned += 1;
          return;
        }
        const updated = await tx.staticPage.updateMany({
          where: { id: page.id, status: 'scheduled', version: page.version },
          data: { status: 'published', publishedAt: now, scheduledAt: null, publishFailure: null, version: { increment: 1 } },
        });
        // Another replica, or an editor's change, got there first.
        if (updated.count === 0) return;
        await tx.outboxEvent.create({
          data: { type: 'cache.invalidate', resourceType: 'static_page', resourceId: page.id, payload: { tags: [CACHE_TAGS.pages, CACHE_TAGS.page(page.slug), CACHE_TAGS.sitemap, CACHE_TAGS.menus].join(',') } },
        });
        await tx.auditLog.create({ data: { action: 'settings.page.publish', targetType: 'static_page', targetId: page.id, metadata: { slug: page.slug, from: 'scheduled', to: 'published', scheduled: true } } });
        pagesPublished += 1;
      });
    }

    const parts = [
      published > 0 ? `Published ${published} article${published === 1 ? '' : 's'}` : null,
      returned > 0 ? `returned ${returned} to draft because ${returned === 1 ? 'it no longer meets' : 'they no longer meet'} the publication requirements` : null,
      pagesPublished > 0 ? `published ${pagesPublished} page${pagesPublished === 1 ? '' : 's'}` : null,
      pagesReturned > 0 ? `returned ${pagesReturned} page${pagesReturned === 1 ? '' : 's'} to draft because ${pagesReturned === 1 ? 'it no longer meets' : 'they no longer meet'} the publication requirements` : null,
    ].filter((part): part is string => part !== null);
    if (parts.length === 0) return 'Nothing was due';
    const summary = parts.join('; ');
    // The article wording is unchanged; a summary that starts with pages gets its capital.
    return published === 0 && returned === 0 ? summary.charAt(0).toUpperCase() + summary.slice(1) : summary;
  },

  /** Activity retention (ACT 006, PRIV 001). */
  'activity.retention': async ({ db, now }) => {
    const { count } = await db.auditLog.deleteMany({ where: { createdAt: { lt: daysAgo(now, ACTIVITY_RETENTION_DAYS) } } });
    return `Removed ${count} activity event${count === 1 ? '' : 's'}`;
  },

  /**
   * Email log retention (MAIL 010). Two stages, deliberately separate: the
   * address is removed from a record long before the record itself goes, so an
   * operator keeps the delivery evidence without keeping the personal data.
   */
  'email.retention': async ({ db, now }) => {
    const anonymised = await db.emailDelivery.updateMany({
      where: { updatedAt: { lt: daysAgo(now, EMAIL_RECIPIENT_ANONYMISE_DAYS) }, NOT: { recipientEncrypted: '' } },
      data: { recipientEncrypted: '', recipientMasked: 'removed' },
    });
    const { count: deleted } = await db.emailDelivery.deleteMany({ where: { updatedAt: { lt: daysAgo(now, EMAIL_RECORD_RETENTION_DAYS) } } });
    return `Removed the address from ${anonymised.count} record${anonymised.count === 1 ? '' : 's'}; deleted ${deleted}`;
  },

  /**
   * Media retention (SRS MED 004). Two windows: an upload abandoned in
   * quarantine goes after a day, and a processed image nothing has used goes
   * after a month. Bytes are deleted before the row, and a storage failure is
   * tolerated per object — an orphaned object costs money, an orphaned row
   * costs a broken page.
   */
  'media.retention': async ({ db, now, storage }) => {
    if (!storage) return 'Object storage is not configured; nothing was removed';
    // An upload that was never completed has no checksum: the browser asked for
    // a ticket and then failed, or the person changed their mind. Those are the
    // abandoned ones, and they are what this task exists to clear.
    //
    // A *completed* upload is quarantined only because the worker has not
    // reached it yet. Deleting those destroyed real uploads whenever processing
    // was behind for a day — while the library told the administrator their
    // images were safe and nothing needed uploading twice. They are kept, and
    // the library says plainly that they are waiting.
    const abandoned = await db.mediaAsset.findMany({
      where: {
        createdAt: { lt: new Date(now.getTime() - QUARANTINE_MAX_AGE_HOURS * 3_600_000) },
        OR: [{ status: 'rejected' }, { status: 'quarantined', checksum: null }],
      },
      select: { id: true, objectKey: true },
      // Oldest first, so the backlog is worked through in order.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    let abandonedRemoved = 0;
    let failed = 0;
    for (const asset of abandoned) {
      await storage.delete('quarantine', asset.objectKey).catch(() => undefined);
      const removed = await db.mediaAsset.delete({ where: { id: asset.id } }).then(() => true, () => false);
      if (removed) abandonedRemoved += 1;
      else failed += 1;
    }
    // "Unused" is the shared definition the media library also refuses deletion
    // by: every relation that shows an image, plus the settings documents that
    // name one by id (site logo, icon, sharing image, home hero). Deciding it
    // here from a shorter list is how a partner's logo was once eligible for
    // deletion a month after it was uploaded.
    const referenced = await db.setting.findMany({
      where: { OR: MEDIA_SETTING_REFERENCES.map((ref) => ({ group: ref.group, key: ref.key })) },
      select: { group: true, key: true, data: true },
    });
    const namedBySettings = referenced.flatMap((row) => MEDIA_SETTING_REFERENCES.find((ref) => ref.group === row.group && ref.key === row.key)?.mediaIds(row.data) ?? []);
    const unused = await db.mediaAsset.findMany({
      where: {
        status: 'ready',
        readyAt: { lt: new Date(now.getTime() - UNUSED_READY_MAX_AGE_DAYS * 86_400_000) },
        ...unusedMediaRelations(),
        ...(namedBySettings.length > 0 ? { id: { notIn: [...new Set(namedBySettings)] } } : {}),
      },
      select: { id: true, objectKey: true, publicObjectKey: true, variants: { select: { objectKey: true } } },
      orderBy: [{ readyAt: 'asc' }, { id: 'asc' }],
      take: 100,
    });
    let unusedRemoved = 0;
    for (const asset of unused) {
      for (const variant of asset.variants) await storage.delete('public', variant.objectKey).catch(() => undefined);
      // A document's published copy (change log 1.16).
      if (asset.publicObjectKey) await storage.delete('public', asset.publicObjectKey).catch(() => undefined);
      await storage.delete('quarantine', asset.objectKey).catch(() => undefined);
      const removed = await db.mediaAsset.delete({ where: { id: asset.id } }).then(() => true, () => false);
      if (removed) unusedRemoved += 1;
      else failed += 1;
    }
    // Counts what was actually removed; a record that could not be deleted is reported, not hidden.
    return `Removed ${abandonedRemoved} abandoned upload${abandonedRemoved === 1 ? '' : 's'} and ${unusedRemoved} unused file${unusedRemoved === 1 ? '' : 's'}${failed > 0 ? `; ${failed} could not be removed and will be retried` : ''}`;
  },

  /** Queue housekeeping (QMON 003 bounds: completed only, never recent). */
  'queue.clean-metadata': async ({ queue }) => {
    const removed = await queue.clean(7 * 86_400_000, 1_000, 'completed');
    return `Removed ${removed.length} completed job record${removed.length === 1 ? '' : 's'}`;
  },

  /** The history of these runs is itself retained for 30 days (TASK 002). */
  'schedule.run-retention': async ({ db, now }) => {
    const { count } = await db.scheduledTaskRun.deleteMany({ where: { startedAt: { lt: daysAgo(now, SCHEDULED_RUN_RETENTION_DAYS) } } });
    return `Removed ${count} run record${count === 1 ? '' : 's'}`;
  },

  /**
   * Durable AI work recovery (AI plan §E, AI-264, F19/F51): from the
   * operations table alone, so it holds when a queue job was lost or trimmed.
   * With AI automation switched off there are no operations and this is a no-op.
   */
  'ai-content.recover-operations': async ({ db }) => {
    const { reclaimed, redelivered, exhausted } = await recoverOperations(db);
    if (reclaimed + redelivered + exhausted === 0) return 'Nothing to recover';
    return `Re-queued ${redelivered}, reclaimed ${reclaimed} expired lease${reclaimed === 1 ? '' : 's'}, stopped ${exhausted} out of attempts`;
  },
};

export interface RunDeps extends TaskContext {
  /** Redis lock primitives, so this module never talks to Redis directly. */
  acquireLock: (key: string, ttlMs: number) => Promise<boolean>;
  releaseLock: (key: string) => Promise<void>;
  runnerId: string;
  log?: (line: string) => void;
}

export type RunOutcome = 'succeeded' | 'failed' | 'skipped' | 'timedOut';

/**
 * Runs one registered task with a lock, a timeout and a recorded outcome
 * (TASK 002–004).
 *
 * Nothing here trusts the job's payload beyond the code: an unregistered code
 * is refused, and the implementation comes from this module rather than from
 * the message. A task already running elsewhere is *skipped*, not queued behind
 * the first: these are periodic jobs, and the next occurrence will do the work
 * anyway.
 */
export async function runScheduledTask(data: ScheduledTaskJobData, deps: RunDeps): Promise<{ outcome: RunOutcome; detail: string }> {
  const code = String(data.taskCode ?? '');
  const definition: ScheduledTaskDefinition | undefined = scheduledTask(code);
  const implementation = TASK_IMPLEMENTATIONS[code];
  if (!definition || !implementation) {
    // A job naming a task this build does not have is a deployment mismatch,
    // not a task failure; it is recorded and dropped rather than retried.
    deps.log?.(`[schedule] refusing unknown task ${JSON.stringify(code).slice(0, 80)}`);
    return { outcome: 'skipped', detail: 'Unknown task code' };
  }

  const trigger = data.trigger === 'manual' ? 'manual' : 'scheduled';
  const lockKey = scheduledTaskLockKey(code);
  const holdsLock = definition.safeToOverlap || (await deps.acquireLock(lockKey, definition.timeoutMs + 30_000));
  if (!holdsLock) {
    await deps.db.scheduledTaskRun.create({
      data: { taskCode: code, trigger, outcome: 'skipped', finishedAt: deps.now, durationMs: 0, detail: 'Already running elsewhere', actorAdminId: data.actorAdminId ?? null, runnerId: deps.runnerId },
    });
    return { outcome: 'skipped', detail: 'Already running elsewhere' };
  }

  const run = await deps.db.scheduledTaskRun.create({
    data: { taskCode: code, trigger, outcome: 'running', startedAt: deps.now, actorAdminId: data.actorAdminId ?? null, runnerId: deps.runnerId },
  });
  const started = Date.now();
  let outcome: RunOutcome = 'succeeded';
  let detail = '';
  try {
    detail = await withTimeout(implementation(deps), definition.timeoutMs);
  } catch (error) {
    outcome = (error as Error).message === TIMEOUT ? 'timedOut' : 'failed';
    detail = outcome === 'timedOut' ? `Stopped after ${Math.round(definition.timeoutMs / 1000)}s` : (error as Error).message.split('\n')[0]!.slice(0, 300);
  } finally {
    const finishedAt = new Date();
    await deps.db.scheduledTaskRun.update({
      where: { id: run.id },
      data: { outcome, finishedAt, durationMs: Date.now() - started, detail: detail.slice(0, 300) },
    });
    if (!definition.safeToOverlap) await deps.releaseLock(lockKey);
  }
  return { outcome, detail };
}

const TIMEOUT = 'scheduled-task-timeout';

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(TIMEOUT)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
