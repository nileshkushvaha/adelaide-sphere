import { Badge } from '@adelaide-sphere/ui';
import { describeDay, formatExceptionDate, formatInterval, adelaideToday, statusLabel, WEEKDAYS, weekdayKeyOfDate, type PublicHours } from '@/lib/hours';

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Operating hours (SRS BUS 004): unknown stays unknown, today highlighted, upcoming exceptions listed, accuracy note and correction action. */
export function HoursTable({ hours, correctionEmail, businessName }: { hours: PublicHours; correctionEmail: string | null; businessName: string }) {
  const today = weekdayKeyOfDate(adelaideToday());
  const status = hours.status;
  // Null when no publicly routable address is configured: the accuracy note
  // still shows, but no dead mailto is offered (SRS CFG 002).
  const mailto = correctionEmail ? `mailto:${correctionEmail}?subject=${encodeURIComponent(`Opening hours correction: ${businessName}`)}` : null;
  return (
    <section aria-labelledby="hours-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="hours-heading" className="text-xl font-semibold">
          Opening hours
        </h2>
        <Badge variant={status.state === 'open' ? 'success' : status.state === 'closed' ? 'muted' : 'outline'}>{statusLabel(status)}</Badge>
      </div>
      {hours.mode === 'unknown' ? (
        <p className="text-text-muted">This business has not confirmed its opening hours yet.</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <caption className="sr-only">Weekly opening hours in Adelaide time</caption>
            <tbody>
              {WEEKDAYS.map((day) => (
                <tr key={day} className={day === today ? 'bg-sky-50 font-semibold' : ''}>
                  <th scope="row" className="w-32 py-1.5 pr-3 text-left font-medium">
                    {capitalise(day)}
                    {day === today && <span className="sr-only"> (today)</span>}
                  </th>
                  <td className="py-1.5">{describeDay(hours.weekly[day])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hours.exceptions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Upcoming changes</h3>
              <ul className="mt-1 text-sm">
                {hours.exceptions.map((e) => (
                  <li key={e.date}>
                    {formatExceptionDate(e.date)}: {e.kind === 'closed' ? 'Closed' : e.kind === 'open24' ? 'Open 24 hours' : (e.intervals ?? []).map(formatInterval).join(', ')}
                    {e.note ? ` (${e.note})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <p className="text-xs text-text-muted">
        Hours are supplied by the business and may change on public holidays.
        {mailto && (
          <>
            {' '}
            <a className="text-link underline underline-offset-2" href={mailto}>
              Report a correction
            </a>
            .
          </>
        )}
      </p>
    </section>
  );
}
