import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service.js';
import { CACHE_TAGS } from '@adelaide-sphere/domain';
import type { HoursException, OpeningInterval } from '@adelaide-sphere/database';
import { AuditService } from '../../audit/audit.service.js';
import type { RequestContext } from '../../auth/auth.service.js';
import { DatabaseService } from '../../database/database.service.js';
import type { AdminPrincipal } from '../../identity/identity.service.js';
import type { HoursDto, PutHoursDto } from '../dto/hours.dto.js';
import { closedWeek, evaluateHours, formatTime, validateSchedule, weekdayKeyOf, weekdayNumber, WEEKDAY_KEYS, type HoursExceptionEntry, type HoursSchedule, type WeeklyHours } from './hours-rules.js';
import { localDateKey, type Weekday } from './adelaide-time.js';

const stale = () => new ConflictException({ code: 'STALE_VERSION', message: 'This listing was changed by someone else. Reload and try again.' });

const intervalOf = (row: { startMinute: number | null; endMinute: number | null; endNextDay: boolean }) => ({
  start: formatTime(row.startMinute ?? 0),
  end: row.endMinute === 1440 ? '24:00' : formatTime(row.endMinute ?? 0),
  endNextDay: row.endNextDay,
});

/** Rebuilds the API schedule shape from stored rows. */
export function scheduleFromRows(mode: 'unknown' | 'scheduled', intervals: OpeningInterval[], exceptions: HoursException[]): HoursSchedule {
  const weekly: WeeklyHours = closedWeek();
  for (const weekday of [1, 2, 3, 4, 5, 6, 7] as Weekday[]) {
    const rows = intervals.filter((i) => i.weekday === weekday).sort((a, b) => (a.startMinute ?? 0) - (b.startMinute ?? 0));
    if (rows.length === 0) continue;
    weekly[weekdayKeyOf(weekday)] = rows.some((r) => r.allDay) ? { state: 'open24' } : { state: 'intervals', intervals: rows.map(intervalOf) };
  }
  const byDate = new Map<string, HoursExceptionEntry>();
  for (const row of [...exceptions].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.startMinute ?? 0) - (b.startMinute ?? 0))) {
    const key = localDateKey({ year: row.date.getUTCFullYear(), month: row.date.getUTCMonth() + 1, day: row.date.getUTCDate() });
    const existing = byDate.get(key);
    if (row.kind === 'custom') {
      if (existing?.kind === 'custom') existing.intervals!.push(intervalOf(row));
      else byDate.set(key, { date: key, kind: 'custom', intervals: [intervalOf(row)], note: row.note });
    } else if (!existing) byDate.set(key, { date: key, kind: row.kind, note: row.note });
  }
  return { mode, weekly, exceptions: [...byDate.values()] };
}

/**
 * Operating hours per listing (SRS BUS 004). Replaces the whole schedule
 * atomically under the business version so concurrent edits conflict instead
 * of interleaving; every change is audited.
 */
@Injectable()
export class HoursService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  async get(businessId: string, now = new Date()): Promise<HoursDto> {
    const db = await this.database.client();
    const business = await db.business.findUnique({ where: { id: businessId }, select: { id: true, version: true, hoursMode: true, openingHours: true, hoursExceptions: true } });
    if (!business) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Listing not found' });
    return this.toDto(business.hoursMode, business.openingHours, business.hoursExceptions, business.version, now);
  }

  async put(businessId: string, input: PutHoursDto, actor: AdminPrincipal, ctx: RequestContext): Promise<HoursDto> {
    const db = await this.database.client();
    const current = await db.business.findUnique({ where: { id: businessId }, select: { id: true, version: true, status: true, slug: true } });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Listing not found' });
    if (current.version !== input.expectedVersion) throw stale();
    if (current.status === 'archived') throw new ConflictException({ code: 'INVALID_STATE', message: 'Restore the listing before editing its hours' });
    const schedule: HoursSchedule = { mode: input.mode, weekly: (input.weekly as WeeklyHours | undefined) ?? closedWeek(), exceptions: (input.exceptions ?? []) as HoursExceptionEntry[] };
    if (input.mode === 'scheduled' && !input.weekly) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Weekly hours are required for a scheduled listing', fields: { weekly: ['Weekly hours are required'] } }, HttpStatus.BAD_REQUEST);
    const { errors, weekly, exceptions } = validateSchedule(schedule);
    if (Object.keys(errors).length > 0) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Hours are invalid', fields: errors }, HttpStatus.BAD_REQUEST);

    type IntervalRow = { businessId: string; weekday: number; allDay: boolean; startMinute: number | null; endMinute: number | null; endNextDay: boolean };
    type ExceptionRow = { businessId: string; date: Date; kind: 'closed' | 'open24' | 'custom'; startMinute: number | null; endMinute: number | null; endNextDay: boolean; note: string | null };
    const intervalRows: IntervalRow[] = WEEKDAY_KEYS.flatMap((key): IntervalRow[] => {
      const day = schedule.weekly[key];
      if (day.state === 'open24') return [{ businessId, weekday: weekdayNumber(key), allDay: true, startMinute: null, endMinute: null, endNextDay: false }];
      return weekly[key].map((m) => ({ businessId, weekday: weekdayNumber(key), allDay: false, startMinute: m.start, endMinute: m.end > 1440 ? m.end - 1440 : m.end, endNextDay: m.end > 1440 }));
    });
    const exceptionRows: ExceptionRow[] = exceptions.flatMap((e): ExceptionRow[] => {
      const date = new Date(Date.UTC(e.date.year, e.date.month - 1, e.date.day));
      if (e.kind !== 'custom') return [{ businessId, date, kind: e.kind, startMinute: null, endMinute: null, endNextDay: false, note: e.note }];
      return e.minutes.map((m) => ({ businessId, date, kind: 'custom', startMinute: m.start, endMinute: m.end > 1440 ? m.end - 1440 : m.end, endNextDay: m.end > 1440, note: e.note }));
    });

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.business.updateMany({ where: { id: businessId, version: input.expectedVersion }, data: { hoursMode: input.mode, version: { increment: 1 } } });
      if (updated.count !== 1) throw stale();
      await tx.openingInterval.deleteMany({ where: { businessId } });
      await tx.hoursException.deleteMany({ where: { businessId } });
      if (intervalRows.length > 0) await tx.openingInterval.createMany({ data: intervalRows });
      if (exceptionRows.length > 0) await tx.hoursException.createMany({ data: exceptionRows });
      // The listing page and the "open now" filter read these hours.
      if (current.status === 'published') {
        await this.cache.recordInvalidation(tx, { resourceType: 'business', resourceId: businessId, correlationId: ctx.requestId, tags: [CACHE_TAGS.businesses, CACHE_TAGS.business(current.slug)] });
      }
      return tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { version: true, hoursMode: true, openingHours: true, hoursExceptions: true } });
    });
    if (current.status === 'published') await this.cache.bumpNamespace();
    await this.audit.record({ action: 'listing.hours.update', actorAdminId: actor.id, targetType: 'business', targetId: businessId, metadata: { mode: input.mode, intervals: intervalRows.length, exceptions: exceptions.length }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(result.hoursMode, result.openingHours, result.hoursExceptions, result.version);
  }

  private toDto(mode: 'unknown' | 'scheduled', intervals: OpeningInterval[], exceptions: HoursException[], version: number, now = new Date()): HoursDto {
    const schedule = scheduleFromRows(mode, intervals, exceptions);
    return { mode: schedule.mode, weekly: schedule.weekly as HoursDto['weekly'], exceptions: schedule.exceptions as HoursDto['exceptions'], status: evaluateHours(schedule, now), evaluatedAt: now.toISOString(), version };
  }
}
