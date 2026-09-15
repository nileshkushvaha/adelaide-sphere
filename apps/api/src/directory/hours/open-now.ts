import { Prisma } from '@adelaide-sphere/database';
import { addDays, localDateKey, toLocal, weekdayOf } from './adelaide-time.js';

/**
 * "Open now" filtering (SRS DIR 008).
 *
 * The requirement makes this **conditional**: it ships only when the hours data
 * is good enough and the daylight-saving tests pass, because a filter that
 * silently drops well-run businesses with no published hours is worse than no
 * filter. So there are two parts here: a predicate, and a coverage measure that
 * decides whether the filter is offered at all.
 *
 * The predicate answers the same question as `evaluateHours` — the display
 * authority — but in SQL, so paging and counts stay in the database. They must
 * not drift, which is why `open-now.integration-spec.ts` compares the two over
 * seeded listings covering every case (open, closed, all-day, overnight spill,
 * exception open, exception closed, unknown schedule).
 *
 * Adelaide's wall clock is computed here in TypeScript, with the same
 * Intl-based helpers the evaluator uses, and passed to SQL as plain numbers:
 * the database never has to know about the timezone or its DST transitions.
 */

/** A listing counts as covered when it publishes a schedule with at least one interval. */
export const HOURS_COVERAGE_SQL = Prisma.sql`
  b.hoursMode = 'scheduled' AND EXISTS (SELECT 1 FROM opening_intervals oi WHERE oi.businessId = b.id)`;

/**
 * Offer the filter only when the data supports it: at least this share of
 * published listings publishes hours, and at least this many do. Below either
 * threshold the filter is not advertised and a request for it is ignored rather
 * than returning a misleadingly short list (DIR 008, DIR 006).
 */
export const OPEN_NOW_MIN_COVERAGE = 0.6;
export const OPEN_NOW_MIN_LISTINGS = 5;

export interface OpenNowAvailability {
  available: boolean;
  /** Published listings that publish a schedule. */
  withHours: number;
  /** Published listings in total. */
  published: number;
}

export function openNowAvailable(withHours: number, published: number): boolean {
  if (published === 0 || withHours < OPEN_NOW_MIN_LISTINGS) return false;
  return withHours / published >= OPEN_NOW_MIN_COVERAGE;
}

/**
 * SQL for "this listing is open at `at`", to be used inside the search query's
 * WHERE clause against the alias `b`.
 *
 * Open means one of:
 *  - an exception for today says so (it replaces the weekly rule for that date);
 *  - today's weekly interval covers the current minute, and no exception
 *    replaces today;
 *  - an interval that began yesterday runs past midnight into now — again from
 *    yesterday's exception when one replaces that date, otherwise the weekly rule.
 *
 * A listing whose schedule is unknown, or which publishes no intervals, is never
 * "open": an absent schedule is not evidence of being open (SRS BUS 004).
 */
export function openNowSql(at: Date): Prisma.Sql {
  const local = toLocal(at);
  const minute = local.minuteOfDay;
  const today = { year: local.year, month: local.month, day: local.day };
  const yesterday = addDays(today, -1);
  const todayKey = localDateKey(today);
  const yesterdayKey = localDateKey(yesterday);
  const todayWeekday = local.weekday;
  const yesterdayWeekday = weekdayOf(yesterday);

  // Exceptions replace the weekly rule for their own date, so each day's
  // contribution is "the exception if there is one, otherwise the weekly rows".
  const exceptionCovers = (key: string, condition: Prisma.Sql) => Prisma.sql`
    EXISTS (
      SELECT 1 FROM hours_exceptions he
      WHERE he.businessId = b.id AND he.date = ${key} AND ${condition}
    )`;
  const hasException = (key: string) => Prisma.sql`
    EXISTS (SELECT 1 FROM hours_exceptions he2 WHERE he2.businessId = b.id AND he2.date = ${key})`;

  // Exception kinds as stored: `closed` (never open), `open24` (all day) and
  // `custom` (one row per interval, minutes from local midnight, with
  // `endNextDay` when the interval runs past midnight).
  // `endNextDay` is only meaningful when the closing time is earlier than the
  // opening time — the rule `validateIntervals` enforces. Requiring it here too
  // means a row that bypassed validation cannot be read as "open all night".
  const openToday = Prisma.sql`(he.kind = 'open24' OR (he.kind = 'custom' AND he.startMinute <= ${minute} AND ((he.endNextDay = 1 AND he.endMinute < he.startMinute) OR he.endMinute > ${minute})))`;
  const spillFromYesterday = Prisma.sql`(he.kind = 'custom' AND he.endNextDay = 1 AND he.endMinute < he.startMinute AND he.endMinute > ${minute})`;

  const weeklyToday = Prisma.sql`
    EXISTS (
      SELECT 1 FROM opening_intervals oi
      WHERE oi.businessId = b.id AND oi.weekday = ${todayWeekday}
        AND (oi.allDay = 1 OR (oi.startMinute <= ${minute} AND ((oi.endNextDay = 1 AND oi.endMinute < oi.startMinute) OR oi.endMinute > ${minute})))
    )`;
  const weeklySpill = Prisma.sql`
    EXISTS (
      SELECT 1 FROM opening_intervals oi
      WHERE oi.businessId = b.id AND oi.weekday = ${yesterdayWeekday} AND oi.endNextDay = 1 AND oi.endMinute < oi.startMinute AND oi.endMinute > ${minute}
    )`;

  return Prisma.sql`AND b.hoursMode = 'scheduled' AND (
      ${exceptionCovers(todayKey, openToday)}
      OR (NOT ${hasException(todayKey)} AND ${weeklyToday})
      OR ${exceptionCovers(yesterdayKey, spillFromYesterday)}
      OR (NOT ${hasException(yesterdayKey)} AND ${weeklySpill})
    )`;
}
