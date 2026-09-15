import { useRef, type KeyboardEvent } from 'react';
import { ACTIVITY_AREA_LABELS } from '@/shared/activity';
import { activityAreaIcon } from '@/shared/activityIcons';

interface Area {
  category: string;
  count: number;
}

/**
 * The areas of the log this administrator may read, as a single-choice chip
 * row with today's count on each (change log 1.14). It behaves as a radio
 * group: one tab stop, arrow keys move the choice (WAI-ARIA radio pattern).
 */
export function AreaChips({ areas, value, onChange }: { areas: Area[] | null; value: string | undefined; onChange: (category: string | undefined) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const options: Array<{ category: string | undefined; label: string; count: number | null }> = [
    { category: undefined, label: 'All areas', count: areas ? areas.reduce((sum, area) => sum + area.count, 0) : null },
    ...(areas ?? []).map((area) => ({ category: area.category, label: ACTIVITY_AREA_LABELS[area.category] ?? area.category, count: area.count })),
  ];
  const selectedIndex = Math.max(0, options.findIndex((option) => (option.category ?? '') === (value ?? '')));

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(options[next]?.category);
  };

  return (
    <div role="radiogroup" aria-label="Activity area" className="ms-activity-chips">
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={option.category ?? 'all'}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={`ms-activity-chip${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(option.category)}
            onKeyDown={(event) => move(event, index)}
          >
            <span className={`ms-activity-chip__icon ms-activity-icon--${option.category ?? 'all'}`}>{activityAreaIcon(option.category ?? 'all')}</span>
            {option.label}
            {option.count !== null && (
              <span className="ms-activity-chip__count">
                {option.count}
                <span className="sr-only"> today</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
