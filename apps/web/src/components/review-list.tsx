import type { PublicReview } from '@/lib/api';
import { RatingStars } from './rating-stars';

const dateFormatter = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Adelaide', day: 'numeric', month: 'long', year: 'numeric' });

/** Approved reviews only (SRS REV 003); ratings are stated in text, never colour alone (NFR 011). */
export function ReviewList({ reviews }: { reviews: PublicReview[] }) {
  if (reviews.length === 0) return <p className="text-text-muted">No reviews yet.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-card-lg border border-border bg-surface-raised p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-4">
            <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-sky-50 text-base font-semibold text-sky-700">
              {review.displayName.trim().slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-semibold">{review.displayName}</p>
                <time dateTime={review.createdAt} className="text-sm text-text-muted">
                  {dateFormatter.format(new Date(review.createdAt))}
                </time>
              </div>
              <p className="mt-1 flex items-center gap-2 text-sm">
                <RatingStars value={review.rating} size="sm" />
                <span className="font-medium">{review.rating} out of 5</span>
              </p>
              <p className="mt-3 whitespace-pre-line leading-relaxed">{review.text}</p>
              {review.redacted && <p className="mt-3 text-xs text-text-muted">This review was edited by our moderators.</p>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
