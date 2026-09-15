const dateTime = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Adelaide' });

/** SRS NFR 012: Australia/Adelaide display dates from UTC instants. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTime.format(d);
}

const dateOnly = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeZone: 'Australia/Adelaide' });

/**
 * The day something happened, without the time, for facts where the hour is
 * noise — when an area's boundary was checked, not when the row was written.
 * Operational screens keep `formatDateTime`, where the minute matters.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateOnly.format(d);
}
