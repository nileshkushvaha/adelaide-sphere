import { addDays, localDate, localWeekday, parseSlotTime, parseWeekdays, zonedTimeToUtc, type Weekday } from '@adelaide-sphere/domain';
import type { DatabaseClient } from '../client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { databaseCode } from '../retry.js';
import { readAutomationControl } from './control.js';
import { GenerationCommandError } from './generation.js';
import { startSlotResearch } from './research.js';

type Tx = Prisma.TransactionClient;

/**
 * The daily AI slot (Phase 1F; AI SRS §15; plan §E; owner decisions of
 * 19 September 2026):
 *
 * - one slot per configured weekday at a local time (default 07:00
 *   Australia/Adelaide), a monthly ceiling (default 30);
 * - a slot only takes the next topic a person approved for the schedule and
 *   starts its free research. It never generates, pays, schedules or publishes;
 * - a slot not started within the grace period, or with nothing to take, is
 *   recorded as missed with its reason and held for a person to review.
 *   Nothing is caught up automatically;
 * - the slot key (strategy, local date, ordinal) is unique, so duplicate
 *   ticks, two worker replicas or a settings change cannot make a second
 *   slot for the same day. The losing transaction rolls back entirely.
 */
export const SLOT_STRATEGY = 'default';
const CANDIDATES_PER_SLOT = 5;

export interface ScheduleSettings {
  enabled: boolean;
  postingEnabled: boolean;
  timeZone: string;
  slotTime: string | null;
  weekdays: Weekday[];
  maxPerMonth: number;
  graceMinutes: number;
  settingsVersion: number;
}

const int = (v: unknown, fallback: number, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback);

export async function readScheduleSettings(tx: Pick<Tx, 'setting'>): Promise<ScheduleSettings> {
  const row = await tx.setting.findUnique({ where: { group_key: { group: 'ai_content', key: 'defaults' } }, select: { data: true, version: true } });
  const d = (row?.data ?? {}) as Record<string, unknown>;
  return {
    enabled: d.enabled === true,
    postingEnabled: d.postingEnabled === true,
    timeZone: typeof d.timezone === 'string' ? d.timezone : 'Australia/Adelaide',
    slotTime: parseSlotTime(d.slotTime ?? '07:00'),
    weekdays: parseWeekdays(d.slotWeekdays ?? 'mon,tue,wed,thu,fri,sat,sun'),
    maxPerMonth: int(d.maxSlotsPerMonth, 30, 0, 31),
    graceMinutes: int(d.slotGraceMinutes, 60, 5, 360),
    settingsVersion: row?.version ?? 0,
  };
}

export interface PlanResult {
  /** Why the planner did nothing at all, if it did nothing. */
  inactive: string | null;
  filled: string[];
  missed: { date: string; reason: string }[];
}

/** Fills or records one day's slot, entirely in one transaction. Null when the slot already exists. */
async function planDay(db: DatabaseClient, settings: ScheduleSettings, date: string, dueAt: Date, now: Date): Promise<{ state: 'filled' | 'missed'; reason: string | null; itemId: string | null } | null> {
  try {
    return await db.$transaction(async (tx) => {
      // Claim the day first: a concurrent tick blocks on this unique row and then fails, rolling back everything it did.
      const slot = await tx.aIScheduleSlot.create({
        data: { strategyKey: SLOT_STRATEGY, localDate: date, ordinal: 1, timeZone: settings.timeZone, dueAt, settingsVersion: settings.settingsVersion, state: 'missed', reason: 'in_progress' },
        select: { id: true },
      });
      const finish = async (state: 'filled' | 'missed', reason: string | null, itemId: string | null) => {
        await tx.aIScheduleSlot.update({ where: { id: slot.id }, data: { state, reason, itemId } });
        await tx.auditLog.create({ data: { action: `ai_content.slot.${state}`, targetType: 'ai_slot', targetId: slot.id, metadata: { date, reason, itemId } } });
        return { state, reason, itemId };
      };
      if (now.getTime() - dueAt.getTime() > settings.graceMinutes * 60_000) return finish('missed', 'not_started_in_time', null);
      const month = date.slice(0, 7);
      const used = await tx.aIScheduleSlot.count({ where: { strategyKey: SLOT_STRATEGY, state: 'filled', localDate: { startsWith: month } } });
      if (used >= settings.maxPerMonth) return finish('missed', 'monthly_cap', null);
      // Only topics a person approved for the schedule, highest priority first, oldest approval first.
      const candidates = await tx.aIContentItem.findMany({
        where: { status: 'queued', awaitingSlotSince: { not: null } },
        orderBy: [{ priority: 'desc' }, { awaitingSlotSince: 'asc' }, { id: 'asc' }],
        take: CANDIDATES_PER_SLOT,
        select: { id: true },
      });
      let lastReason = 'queue_empty';
      for (const candidate of candidates) {
        const outcome = await startSlotResearch(tx, candidate.id);
        if (outcome.started) return finish('filled', null, candidate.id);
        lastReason = `no_eligible_topic:${outcome.reason}`.slice(0, 64);
      }
      return finish('missed', lastReason, null);
    });
  } catch (error) {
    // Another tick or replica holds (or already made) this day's slot; a deadlock victim simply tries again next tick.
    const code = databaseCode(error);
    if (code === 'P2002' || code === 'P2034') return null;
    throw error;
  }
}

/**
 * One planning tick (registered task, every few minutes). Considers today and
 * yesterday in the configured timezone, only once each slot's time has
 * passed. Yesterday's missing slot is recorded as missed only when the
 * schedule was running (a slot exists in the week before), so switching the
 * schedule on does not report days it was off.
 */
export async function planSlots(db: DatabaseClient, now = new Date()): Promise<PlanResult> {
  const result: PlanResult = { inactive: null, filled: [], missed: [] };
  const settings = await db.$transaction((tx) => readScheduleSettings(tx));
  const control = await db.$transaction((tx) => readAutomationControl(tx));
  if (!settings.enabled || !control.enabled) return { ...result, inactive: 'automation_disabled' };
  if (!settings.postingEnabled) return { ...result, inactive: 'slot_disabled' };
  if (!settings.slotTime || settings.weekdays.length === 0) return { ...result, inactive: 'no_schedule' };
  const today = localDate(now, settings.timeZone);
  for (const date of [addDays(today, -1), today]) {
    if (!settings.weekdays.includes(localWeekday(date, settings.timeZone))) continue;
    const dueAt = zonedTimeToUtc(date, settings.slotTime, settings.timeZone);
    if (dueAt.getTime() > now.getTime()) continue;
    const existing = await db.aIScheduleSlot.findUnique({ where: { strategyKey_localDate_ordinal: { strategyKey: SLOT_STRATEGY, localDate: date, ordinal: 1 } }, select: { id: true } });
    if (existing) continue;
    if (date !== today) {
      const running = await db.aIScheduleSlot.count({ where: { strategyKey: SLOT_STRATEGY, localDate: { gte: addDays(date, -7), lt: date } } });
      if (running === 0) continue;
    }
    const outcome = await planDay(db, settings, date, dueAt, now);
    if (!outcome) continue;
    if (outcome.state === 'filled') result.filled.push(outcome.itemId!);
    else result.missed.push({ date, reason: outcome.reason ?? 'unknown' });
  }
  return result;
}

/** A person reviews a missed slot (owner policy: missed slots require review; nothing is caught up). */
export async function reviewMissedSlot(tx: Tx, input: { slotId: string; expectedVersion: number; note: string; adminId: string; requestId?: string | null }) {
  const note = input.note.trim();
  if (note.length < 5) throw new GenerationCommandError('VALIDATION_ERROR', 'Record what you checked or decided.', 400, { fields: { note: ['A note is required'] } });
  const slot = await tx.aIScheduleSlot.findUnique({ where: { id: input.slotId }, select: { state: true, version: true, localDate: true } });
  if (!slot) throw new GenerationCommandError('NOT_FOUND', 'This slot does not exist.', 404);
  if (slot.state !== 'missed') throw new GenerationCommandError('INVALID_TRANSITION', 'Only a missed slot needs review.');
  const updated = await tx.aIScheduleSlot.updateMany({
    where: { id: input.slotId, version: input.expectedVersion, state: 'missed' },
    data: { state: 'reviewed', resolvedByAdminId: input.adminId, resolvedAt: new Date(), resolutionNote: note.slice(0, 500), version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new GenerationCommandError('STALE_VERSION', 'This slot changed. Reload it before trying again.');
  await tx.auditLog.create({ data: { action: 'ai_content.slot.reviewed', actorAdminId: input.adminId, targetType: 'ai_slot', targetId: input.slotId, requestId: input.requestId ?? null, metadata: { date: slot.localDate } } });
}

/** What the schedule screen shows: settings, the next slot, this month's use, the waiting queue and recent slots. */
export async function scheduleStatus(tx: Tx, now = new Date()) {
  const settings = await readScheduleSettings(tx);
  const control = await readAutomationControl(tx);
  const today = localDate(now, settings.timeZone);
  let next: { date: string; dueAt: string } | null = null;
  if (settings.slotTime && settings.weekdays.length > 0) {
    for (let i = 0; i < 8 && !next; i += 1) {
      const date = addDays(today, i);
      if (!settings.weekdays.includes(localWeekday(date, settings.timeZone))) continue;
      const dueAt = zonedTimeToUtc(date, settings.slotTime, settings.timeZone);
      const taken = await tx.aIScheduleSlot.findUnique({ where: { strategyKey_localDate_ordinal: { strategyKey: SLOT_STRATEGY, localDate: date, ordinal: 1 } }, select: { id: true } });
      if (!taken && dueAt.getTime() > now.getTime() - settings.graceMinutes * 60_000) next = { date, dueAt: dueAt.toISOString() };
    }
  }
  const [usedThisMonth, waiting, slots, missedAwaitingReview] = await Promise.all([
    tx.aIScheduleSlot.count({ where: { strategyKey: SLOT_STRATEGY, state: 'filled', localDate: { startsWith: today.slice(0, 7) } } }),
    tx.aIContentItem.findMany({ where: { status: 'queued', awaitingSlotSince: { not: null } }, orderBy: [{ priority: 'desc' }, { awaitingSlotSince: 'asc' }, { id: 'asc' }], take: 20, select: { id: true, title: true, priority: true, awaitingSlotSince: true } }),
    tx.aIScheduleSlot.findMany({ where: { strategyKey: SLOT_STRATEGY }, orderBy: { localDate: 'desc' }, take: 30, include: { item: { select: { id: true, title: true, status: true } } } }),
    tx.aIScheduleSlot.count({ where: { strategyKey: SLOT_STRATEGY, state: 'missed' } }),
  ]);
  return {
    active: settings.enabled && control.enabled && settings.postingEnabled && Boolean(settings.slotTime) && settings.weekdays.length > 0,
    timeZone: settings.timeZone,
    slotTime: settings.slotTime,
    weekdays: settings.weekdays,
    graceMinutes: settings.graceMinutes,
    maxPerMonth: settings.maxPerMonth,
    usedThisMonth,
    next,
    missedAwaitingReview,
    waiting,
    slots: slots.map((s) => ({ id: s.id, localDate: s.localDate, dueAt: s.dueAt.toISOString(), state: s.state, reason: s.reason, version: s.version, item: s.item, resolutionNote: s.resolutionNote, resolvedAt: s.resolvedAt?.toISOString() ?? null })),
  };
}
