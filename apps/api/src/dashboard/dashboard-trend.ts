/**
 * Daily buckets for the dashboard trend (SRS ADM 003), in Adelaide calendar
 * days. Counting by UTC day would move a review submitted at 9 am Adelaide
 * time into the previous day for nine and a half or ten and a half hours of every day, and a
 * 24-hour step would repeat or skip a day across a daylight-saving change, so
 * the labels are calendar dates and the bucketing uses the Adelaide clock.
 */

export const TREND_DAYS = 30;
const DAY_MS = 86_400_000;

const ADELAIDE_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Adelaide', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The Adelaide calendar day (`YYYY-MM-DD`) an instant falls on. */
export function adelaideDay(instant: Date): string {
  return ADELAIDE_DAY.format(instant);
}

/** The last `days` Adelaide calendar days ending today, oldest first. */
export function trailingDays(now: Date, days: number = TREND_DAYS): string[] {
  const [year, month, day] = adelaideDay(now).split('-').map(Number) as [number, number, number];
  // Calendar arithmetic on a date with no time zone: every label is distinct and
  // consecutive whatever the offset did in between.
  return Array.from({ length: days }, (_, index) => new Date(Date.UTC(year, month - 1, day - (days - 1 - index))).toISOString().slice(0, 10));
}

/** Counts instants per day in `days`; anything outside the window is ignored. */
export function bucketByDay(instants: readonly Date[], days: readonly string[]): number[] {
  const position = new Map(days.map((day, index) => [day, index]));
  const counts = days.map(() => 0);
  for (const instant of instants) {
    const index = position.get(adelaideDay(instant));
    if (index !== undefined) counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
}

/**
 * The instant to query from: a day earlier than the first bucket could start,
 * whatever the offset, so no row that belongs in the window is left out.
 * `bucketByDay` discards the extra.
 */
export function windowStart(now: Date, days: number = TREND_DAYS): Date {
  return new Date(now.getTime() - (days + 1) * DAY_MS);
}

/** The current and previous periods as rolling instants, for the change figures. */
export function periods(now: Date, days: number = TREND_DAYS): { currentStart: Date; previousStart: Date } {
  return { currentStart: new Date(now.getTime() - days * DAY_MS), previousStart: new Date(now.getTime() - 2 * days * DAY_MS) };
}
