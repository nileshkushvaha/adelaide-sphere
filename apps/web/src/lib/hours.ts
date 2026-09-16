import type { components } from '@adelaide-sphere/contracts';

export type PublicHours = components['schemas']['PublicHoursDto'];
export type DayHours = components['schemas']['DayHoursDto'];
type Interval = components['schemas']['HoursIntervalDto'];

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type WeekdayKey = (typeof WEEKDAYS)[number];

/** Formats "HH:MM" wall-clock time in en-AU style (e.g. "9:00 am", "midnight"). */
export function formatTime(value: string): string {
  if (value === '24:00' || value === '00:00') return 'midnight';
  const [h, m] = value.split(':').map(Number);
  const hour12 = h! % 12 === 0 ? 12 : h! % 12;
  const suffix = h! < 12 ? 'am' : 'pm';
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatInterval(interval: Interval): string {
  return `${formatTime(interval.start)} – ${formatTime(interval.end)}${interval.endNextDay && interval.end !== '00:00' ? ' (next day)' : ''}`;
}

/** Human summary of one weekday (SRS BUS 004 distinct states). */
export function describeDay(day: DayHours | undefined): string {
  if (!day || day.state === 'closed') return 'Closed';
  if (day.state === 'open24') return 'Open 24 hours';
  return (day.intervals ?? []).map(formatInterval).join(', ') || 'Closed';
}

/** Weekday key of a local Adelaide date, from an ISO date string (YYYY-MM-DD). */
export function weekdayKeyOfDate(isoDate: string): WeekdayKey {
  const [y, m, d] = isoDate.split('-').map(Number);
  const day = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return WEEKDAYS[(day + 6) % 7]!;
}

/** Today's local calendar date in Australia/Adelaide as YYYY-MM-DD. */
export function adelaideToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Adelaide', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts;
}

export function statusLabel(status: PublicHours['status']): string {
  if (status.state === 'unknown') return 'Hours not confirmed';
  return status.state === 'open' ? 'Open now' : 'Closed now';
}

const dateFormatter = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Adelaide', weekday: 'short', day: 'numeric', month: 'short' });

export function formatExceptionDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return dateFormatter.format(new Date(Date.UTC(y!, m! - 1, d!, 12)));
}

/** The calendar year in Adelaide right now (SRS NFR 012). */
export function adelaideYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Adelaide', year: 'numeric' }).format(now));
}
