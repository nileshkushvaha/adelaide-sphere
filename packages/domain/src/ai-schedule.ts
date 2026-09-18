/**
 * Pure calendar rules for the daily AI slot (AI SRS §15; plan §E; owner 1F
 * decisions of 19 September 2026: one slot a day at a configured local time,
 * a monthly ceiling, missed slots held for review). Browser-safe, no I/O.
 * Local dates and times are in the configured IANA zone, never the server's.
 */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

function parts(at: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(at);
  const get = (type: string) => values.find((p) => p.type === type)!.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')), second: Number(get('second')), weekday: get('weekday').toLowerCase().slice(0, 3) as Weekday };
}

/** The local calendar date (YYYY-MM-DD) of an instant in the zone. */
export function localDate(at: Date, timeZone: string): string {
  return parts(at, timeZone).date;
}

export function localWeekday(date: string, timeZone: string): Weekday {
  // Noon UTC on that date lands on the same calendar day in every zone within ±12 h.
  return parts(new Date(`${date}T12:00:00Z`), timeZone).weekday;
}

/** Adds whole days to a calendar date (no time zone involved). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The zone's offset from UTC, in minutes, at an instant. */
function offsetMinutes(at: Date, timeZone: string): number {
  const p = parts(at, timeZone);
  const asUtc = Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)) - 1, Number(p.date.slice(8, 10)), p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The UTC instant of a local wall-clock time on a date. A time that occurs
 * twice (the hour repeated when daylight saving ends) resolves to its first
 * occurrence; a time that does not exist (skipped when it starts) resolves to
 * the same wall-clock distance after the gap, so a slot is never lost or doubled.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const naive = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m);
  // Try both offsets around the instant; the earliest candidate that reads back as the wall time wins.
  const offsets = [...new Set([offsetMinutes(new Date(naive - 14 * 3_600_000), timeZone), offsetMinutes(new Date(naive + 14 * 3_600_000), timeZone)])];
  const candidates = offsets.map((o) => new Date(naive - o * 60_000)).sort((a, b) => a.getTime() - b.getTime());
  for (const c of candidates) {
    const p = parts(c, timeZone);
    if (p.date === date && p.hour === h && p.minute === m) return c;
  }
  // Inside a daylight-saving gap the wall time never happens: the standard (smaller) offset lands the same distance after the gap.
  return new Date(naive - Math.min(...offsets) * 60_000);
}

export function parseSlotTime(value: unknown): string | null {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

export function parseWeekdays(value: unknown): Weekday[] {
  if (typeof value !== 'string') return [];
  const set = new Set(value.split(',').map((d) => d.trim().toLowerCase()));
  return WEEKDAYS.filter((d) => set.has(d));
}
