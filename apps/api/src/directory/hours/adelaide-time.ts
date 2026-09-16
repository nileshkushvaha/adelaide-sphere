/**
 * Australia/Adelaide wall-clock ↔ instant conversion built on Intl (Node 24 has
 * full ICU; Temporal is not yet available). Operating hours are stored as local
 * wall-clock minutes (SRS BUS 004, API 001) and must be evaluated with the DST
 * rules of the zone, never with a fixed offset.
 */
export const ADELAIDE_TZ = 'Australia/Adelaide';

const DAY_MS = 86_400_000;
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ADELAIDE_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export interface LocalDate {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
}

export interface LocalDateTime extends LocalDate {
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: Weekday;
  minuteOfDay: number;
}

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Weekday of a local calendar date (ISO numbering). */
export function weekdayOf(date: LocalDate): Weekday {
  const day = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

/** Local date shifted by whole days. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function localDateKey(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

/** Parses `YYYY-MM-DD` into a real calendar date; null for malformed or impossible dates. */
export function parseLocalDate(value: string): LocalDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (date.month < 1 || date.month > 12 || date.day < 1) return null;
  return localDateKey(addDays(date, 0)) === value ? date : null;
}

/** Adelaide wall-clock fields for an instant. */
export function toLocal(instant: Date): LocalDateTime {
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) if (part.type !== 'literal') parts[part.type] = Number(part.value);
  const date = { year: parts.year!, month: parts.month!, day: parts.day! };
  return { ...date, hour: parts.hour!, minute: parts.minute!, second: parts.second!, weekday: weekdayOf(date), minuteOfDay: parts.hour! * 60 + parts.minute! };
}

/** UTC offset (minutes east) in force at an instant. */
export function offsetMinutesAt(instant: Date): number {
  const local = toLocal(instant);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * Instant for an Adelaide wall-clock time. `minuteOfDay` may exceed 1440 to
 * express "the next day" (overnight closing). DST policy, applied explicitly:
 * a time inside the spring-forward gap (e.g. 02:30 on 2026-10-04) is moved
 * forward by the gap; a time repeated at the autumn overlap (02:30 on
 * 2026-04-05) resolves to its first occurrence (still on daylight time).
 */
export function fromLocal(date: LocalDate, minuteOfDay: number): Date {
  const wall = Date.UTC(date.year, date.month - 1, date.day) + minuteOfDay * 60_000;
  const candidates: number[] = [];
  for (const probe of [wall - DAY_MS, wall + DAY_MS]) {
    const offset = offsetMinutesAt(new Date(probe));
    const instant = wall - offset * 60_000;
    if (offsetMinutesAt(new Date(instant)) === offset && !candidates.includes(instant)) candidates.push(instant);
  }
  if (candidates.length === 0) {
    const before = offsetMinutesAt(new Date(wall - DAY_MS));
    return new Date(wall - before * 60_000);
  }
  return new Date(Math.min(...candidates));
}

/**
 * The Adelaide wall-clock minute an instant falls in, as `YYYY-MM-DDTHH:MM`.
 * Used as a cache discriminator for answers that depend on the current time.
 */
export function adelaideMinuteKey(instant: Date): string {
  const local = toLocal(instant);
  return `${localDateKey(local)}T${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
}
