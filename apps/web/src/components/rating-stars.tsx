import { StarIcon } from 'lucide-react';

const SIZES = { sm: 14, md: 18, lg: 24 } as const;

/**
 * Star display for a rating (SRS NFR 011): decorative only. Every caller states
 * the rating in text beside it, so nothing here carries information by colour
 * or shape alone, and it is hidden from assistive technology.
 *
 * Drawn with the icon set the rest of the interface uses rather than the ★
 * character, whose shape and weight change with the reader's font. Partial
 * stars are drawn by clipping a filled row over an outlined row, so a 4.3
 * average looks like 4.3 rather than being rounded up to five.
 */
export function RatingStars({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));
  const px = SIZES[size];
  const row = (className: string, fill: boolean) => (
    <span className={`flex items-center gap-0.5 ${className}`}>
      {[0, 1, 2, 3, 4].map((index) => (
        <StarIcon key={index} size={px} strokeWidth={1.5} className={fill ? 'fill-current' : undefined} />
      ))}
    </span>
  );
  return (
    <span aria-hidden="true" className="relative inline-flex select-none leading-none">
      {row('text-border-strong', false)}
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${percent}%` }}>
        {row('text-warning', true)}
      </span>
    </span>
  );
}
