import type { BusinessDetail } from '@/lib/api';
import { RatingStars } from './rating-stars';

interface Props {
  rating: BusinessDetail['rating'];
  breakdown: BusinessDetail['ratingBreakdown'];
  /** Anchor of the review form, so the panel can invite a review. */
  writeHref?: string;
}

/**
 * Rating summary for a listing (SRS REV 004, DIR 001): the average, the number
 * of approved reviews and the distribution the API computed over *all* approved
 * reviews — never inferred from the page of reviews on screen. A listing with
 * no approved reviews says so plainly instead of showing an empty five-star
 * row, which would read as a zero rating.
 */
export function RatingPanel({ rating, breakdown, writeHref = '#write-review' }: Props) {
  if (!rating || breakdown.length === 0) {
    return (
      <div className="rounded-card-lg border border-border bg-surface-raised p-6 shadow-sm">
        <p className="font-semibold">No reviews yet</p>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">Ratings appear once our moderators have approved the first review. Nothing is published automatically.</p>
        <a href={writeHref} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-link underline-offset-4 ms-text-link">
          Be the first to review
        </a>
      </div>
    );
  }

  const total = breakdown.reduce((sum, bucket) => sum + bucket.count, 0);
  return (
    <div className="grid gap-8 rounded-card-lg border border-border bg-surface-raised p-6 shadow-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:p-8">
      <div className="sm:border-r sm:border-border sm:pr-8">
        <p className="font-display text-6xl leading-none tracking-tight">{rating.average.toFixed(1)}</p>
        <RatingStars value={rating.average} />
        <p className="mt-2 text-sm text-text-muted">
          <span className="sr-only">{rating.average.toFixed(1)} out of 5 from </span>
          {rating.count} approved review{rating.count === 1 ? '' : 's'}
        </p>
      </div>
      <div>
        <h3 className="text-sm font-semibold">How locals rated it</h3>
        <ul className="mt-3 flex flex-col gap-2">
          {breakdown.map((bucket) => {
            const share = total === 0 ? 0 : Math.round((bucket.count / total) * 100);
            return (
              <li key={bucket.stars} className="flex items-center gap-3 text-sm">
                <span className="w-14 shrink-0 tabular-nums text-text-muted">
                  {bucket.stars} star{bucket.stars === 1 ? '' : 's'}
                </span>
                <span aria-hidden="true" className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <span className="block h-full rounded-full bg-sky-600" style={{ width: `${share}%` }} />
                </span>
                {/* The count is the value; the bar is only its picture. */}
                <span className="w-20 shrink-0 text-right tabular-nums text-text-muted">
                  {bucket.count} ({share}%)
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
