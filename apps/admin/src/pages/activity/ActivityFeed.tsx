import { dayHeading, adelaideDayKey, type ActivityItem } from '@/shared/activity';
import { ActivityRow } from './ActivityRow';

/**
 * The activity timeline: events under a heading per Adelaide day, newest
 * first, as the server ordered them. The dashboard uses it without day
 * headings, for its short list.
 */
export function ActivityFeed({ entries, variant = 'full', byDay = true, onShowRequest }: { entries: ActivityItem[]; variant?: 'full' | 'compact'; byDay?: boolean; onShowRequest?: (requestId: string) => void }) {
  if (!byDay) {
    return (
      <ol className="as-activity-list">
        {entries.map((entry) => (
          <ActivityRow key={entry.id} entry={entry} variant={variant} onShowRequest={onShowRequest} />
        ))}
      </ol>
    );
  }

  const days: Array<{ key: string; items: ActivityItem[] }> = [];
  for (const entry of entries) {
    const key = adelaideDayKey(entry.lastAt ?? entry.createdAt);
    const current = days[days.length - 1];
    if (current && current.key === key) current.items.push(entry);
    else days.push({ key, items: [entry] });
  }

  return (
    <div className="as-activity-feed">
      {days.map((day, index) => (
        // The same day can reappear after a gap when the list is sorted oldest first; the index keeps keys unique.
        <section key={`${day.key}-${index}`} aria-labelledby={`activity-day-${day.key}-${index}`}>
          <h2 id={`activity-day-${day.key}-${index}`} className="as-activity-day">
            {dayHeading(day.key)}
          </h2>
          <ol className="as-activity-list">
            {day.items.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} variant={variant} onShowRequest={onShowRequest} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
