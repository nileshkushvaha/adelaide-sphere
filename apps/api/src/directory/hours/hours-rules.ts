import { addDays, fromLocal, localDateKey, parseLocalDate, toLocal, weekdayOf, type LocalDate, type Weekday } from './adelaide-time.js';

/** Wall-clock interval; `end` may be "24:00" for the end of the day. `endNextDay` means the closing time is on the following day. */
export interface HoursInterval {
  start: string;
  end: string;
  endNextDay: boolean;
}

export type DayHours = { state: 'closed' } | { state: 'open24' } | { state: 'intervals'; intervals: HoursInterval[] };

export const WEEKDAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];
export type WeeklyHours = Record<WeekdayKey, DayHours>;

export interface HoursExceptionEntry {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  kind: 'closed' | 'open24' | 'custom';
  intervals?: HoursInterval[];
  note?: string | null;
}

export interface HoursSchedule {
  mode: 'unknown' | 'scheduled';
  weekly: WeeklyHours;
  exceptions: HoursExceptionEntry[];
}

export type FieldErrors = Record<string, string[]>;

export const MAX_INTERVALS_PER_DAY = 4;
export const MAX_EXCEPTIONS = 60;
export const MAX_EXCEPTION_NOTE = 120;

/** Minute-based interval on a given local date, `end` relative to that date's midnight (may exceed 1440). */
export interface MinuteInterval {
  start: number;
  end: number;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;

export function parseTime(value: string): number | null {
  if (!TIME.test(value)) return null;
  if (value === '24:00') return 1440;
  const [h, m] = value.split(':').map(Number);
  return h! * 60 + m!;
}

export function formatTime(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function weekdayKeyOf(weekday: Weekday): WeekdayKey {
  return WEEKDAY_KEYS[weekday - 1]!;
}

export function weekdayNumber(key: WeekdayKey): Weekday {
  return (WEEKDAY_KEYS.indexOf(key) + 1) as Weekday;
}

export const closedWeek = (): WeeklyHours => Object.fromEntries(WEEKDAY_KEYS.map((k) => [k, { state: 'closed' }])) as WeeklyHours;

/** Converts a validated interval to minutes; end is relative to the interval's start date. */
export function toMinutes(interval: HoursInterval): MinuteInterval {
  const start = parseTime(interval.start)!;
  const end = parseTime(interval.end)! + (interval.endNextDay ? 1440 : 0);
  return { start, end };
}

function push(errors: FieldErrors, path: string, message: string) {
  (errors[path] ??= []).push(message);
}

/** Validates one day's intervals: format, order, non-overlap, at most 24 h each; returns sorted minute intervals. */
export function validateIntervals(intervals: HoursInterval[], path: string, errors: FieldErrors): MinuteInterval[] {
  if (!Array.isArray(intervals) || intervals.length === 0) {
    push(errors, path, 'Add at least one interval or mark the day closed');
    return [];
  }
  if (intervals.length > MAX_INTERVALS_PER_DAY) {
    push(errors, path, `At most ${MAX_INTERVALS_PER_DAY} intervals per day`);
    return [];
  }
  const parsed: MinuteInterval[] = [];
  intervals.forEach((interval, index) => {
    const start = parseTime(interval.start ?? '');
    const end = parseTime(interval.end ?? '');
    if (start === null || start === 1440) push(errors, `${path}.${index}.start`, 'Enter a time as HH:MM');
    if (end === null) push(errors, `${path}.${index}.end`, 'Enter a time as HH:MM (24:00 for midnight)');
    if (start === null || start === 1440 || end === null) return;
    const total = end + (interval.endNextDay ? 1440 : 0);
    if (interval.endNextDay && end > start) push(errors, `${path}.${index}.endNextDay`, 'A closing time later than the opening time is on the same day; untick "closes next day"');
    else if (total <= start) push(errors, `${path}.${index}.end`, 'Closing time must be after the opening time (tick "closes next day" for overnight hours)');
    else if (total - start > 1440) push(errors, `${path}.${index}.end`, 'An interval cannot exceed 24 hours');
    else parsed.push({ start, end: total });
  });
  parsed.sort((a, b) => a.start - b.start);
  for (let i = 1; i < parsed.length; i += 1) {
    if (parsed[i]!.start < parsed[i - 1]!.end) {
      push(errors, `${path}.${i}.start`, 'Intervals must not overlap');
      break;
    }
  }
  return parsed;
}

/** Validates a day and returns its minute intervals (open24 → one full-day interval). */
function validateDay(day: DayHours | undefined, path: string, errors: FieldErrors): MinuteInterval[] {
  if (!day || typeof day !== 'object' || !('state' in day)) {
    push(errors, path, 'Choose closed, open 24 hours or intervals');
    return [];
  }
  if (day.state === 'closed') return [];
  if (day.state === 'open24') return [{ start: 0, end: 1440 }];
  if (day.state === 'intervals') return validateIntervals(day.intervals, `${path}.intervals`, errors);
  push(errors, path, 'Choose closed, open 24 hours or intervals');
  return [];
}

/**
 * Weekly schedule validation (SRS BUS 004, DAT 001 "validate nonoverlap"):
 * per-day rules plus overnight spill — an interval that closes after midnight
 * must not overlap the next weekday's first interval or a next-day "open 24 hours".
 */
export function validateWeeklyHours(weekly: WeeklyHours, errors: FieldErrors = {}): { errors: FieldErrors; minutes: Record<WeekdayKey, MinuteInterval[]> } {
  const minutes = {} as Record<WeekdayKey, MinuteInterval[]>;
  for (const key of WEEKDAY_KEYS) minutes[key] = validateDay(weekly?.[key], `weekly.${key}`, errors);
  for (let i = 0; i < 7; i += 1) {
    const key = WEEKDAY_KEYS[i]!;
    const next = WEEKDAY_KEYS[(i + 1) % 7]!;
    const last = minutes[key].at(-1);
    const spill = last ? last.end - 1440 : 0;
    const nextFirst = minutes[next][0];
    if (spill > 0 && nextFirst && nextFirst.start < spill) push(errors, `weekly.${key}.intervals.${minutes[key].length - 1}.end`, `Overnight hours overlap ${next}'s opening time`);
  }
  return { errors, minutes };
}

export function validateExceptions(exceptions: HoursExceptionEntry[], errors: FieldErrors = {}): { errors: FieldErrors; parsed: { date: LocalDate; key: string; kind: HoursExceptionEntry['kind']; minutes: MinuteInterval[]; note: string | null }[] } {
  const parsed: { date: LocalDate; key: string; kind: HoursExceptionEntry['kind']; minutes: MinuteInterval[]; note: string | null }[] = [];
  if (!Array.isArray(exceptions)) {
    push(errors, 'exceptions', 'Exceptions must be a list');
    return { errors, parsed };
  }
  if (exceptions.length > MAX_EXCEPTIONS) {
    push(errors, 'exceptions', `At most ${MAX_EXCEPTIONS} exceptions`);
    return { errors, parsed };
  }
  const seen = new Set<string>();
  exceptions.forEach((entry, index) => {
    const path = `exceptions.${index}`;
    const date = parseLocalDate(String(entry?.date ?? ''));
    if (!date) {
      push(errors, `${path}.date`, 'Enter a valid date (YYYY-MM-DD)');
      return;
    }
    const key = localDateKey(date);
    if (seen.has(key)) push(errors, `${path}.date`, 'Only one exception per date');
    seen.add(key);
    const note = typeof entry.note === 'string' && entry.note.trim() ? entry.note.trim() : null;
    if (note && note.length > MAX_EXCEPTION_NOTE) push(errors, `${path}.note`, `Note must be at most ${MAX_EXCEPTION_NOTE} characters`);
    let minutes: MinuteInterval[] = [];
    if (entry.kind === 'closed') minutes = [];
    else if (entry.kind === 'open24') minutes = [{ start: 0, end: 1440 }];
    else if (entry.kind === 'custom') minutes = validateIntervals(entry.intervals ?? [], `${path}.intervals`, errors);
    else push(errors, `${path}.kind`, 'Choose closed, open 24 hours or custom hours');
    parsed.push({ date, key, kind: entry.kind, minutes, note });
  });
  return { errors, parsed };
}

/** Full schedule validation; `unknown` mode ignores (and clears) weekly/exception content. */
export function validateSchedule(schedule: HoursSchedule): { errors: FieldErrors; weekly: Record<WeekdayKey, MinuteInterval[]>; exceptions: ReturnType<typeof validateExceptions>['parsed'] } {
  const errors: FieldErrors = {};
  if (schedule.mode !== 'unknown' && schedule.mode !== 'scheduled') push(errors, 'mode', 'Mode must be unknown or scheduled');
  if (schedule.mode === 'unknown') return { errors, weekly: Object.fromEntries(WEEKDAY_KEYS.map((k) => [k, [] as MinuteInterval[]])) as unknown as Record<WeekdayKey, MinuteInterval[]>, exceptions: [] };
  const weekly = validateWeeklyHours(schedule.weekly, errors);
  const exceptions = validateExceptions(schedule.exceptions ?? [], errors);
  return { errors, weekly: weekly.minutes, exceptions: exceptions.parsed };
}

export interface HoursStatus {
  state: 'unknown' | 'open' | 'closed';
  /** Next change of state, if one exists within the evaluation window (8 days). */
  until: string | null;
  /** Which rule produced the current state. */
  source: 'exception' | 'weekly' | null;
}

/**
 * Evaluates a schedule at an instant with Australia/Adelaide semantics. An
 * unknown schedule is neither open nor closed (SRS BUS 004). Exceptions replace
 * the weekly rule for their date; overnight intervals from the previous local
 * day are honoured.
 */
export function evaluateHours(schedule: HoursSchedule, at: Date): HoursStatus {
  if (schedule.mode !== 'scheduled') return { state: 'unknown', until: null, source: null };
  const { errors, weekly, exceptions } = validateSchedule(schedule);
  if (Object.keys(errors).length > 0) return { state: 'unknown', until: null, source: null };
  const byDate = new Map(exceptions.map((e) => [e.key, e]));
  const dayIntervals = (date: LocalDate): { intervals: { start: Date; end: Date }[]; source: 'exception' | 'weekly' } => {
    const exception = byDate.get(localDateKey(date));
    const minutes = exception ? exception.minutes : weekly[weekdayKeyOf(weekdayOf(date))];
    return { intervals: minutes.map((m) => ({ start: fromLocal(date, m.start), end: fromLocal(date, m.end) })), source: exception ? 'exception' : 'weekly' };
  };
  const today = toLocal(at);
  const now = at.getTime();
  const todaySource: 'exception' | 'weekly' = byDate.has(localDateKey(today)) ? 'exception' : 'weekly';
  // Open now? Look at yesterday (overnight spill) and today.
  for (const offset of [-1, 0]) {
    const day = dayIntervals(addDays(today, offset));
    for (const interval of day.intervals) {
      if (interval.start.getTime() <= now && now < interval.end.getTime()) return { state: 'open', until: interval.end.toISOString(), source: day.source };
    }
  }
  // Closed: find the next opening within 8 days.
  for (let offset = 0; offset <= 8; offset += 1) {
    const day = dayIntervals(addDays(today, offset));
    const next = day.intervals.filter((i) => i.start.getTime() > now).sort((a, b) => a.start.getTime() - b.start.getTime())[0];
    if (next) return { state: 'closed', until: next.start.toISOString(), source: todaySource };
  }
  return { state: 'closed', until: null, source: todaySource };
}
