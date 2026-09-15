import type { BusinessCard } from '@/lib/api';
import { RatingStars } from './rating-stars';

/** Rating as text first (no colour-only or star-widget dependence, SRS NFR 011); zero reviews reads "No reviews yet" (DIR 001). */
export function RatingSummary({ rating, className = '' }: { rating: BusinessCard['rating']; className?: string }) {
  if (!rating) return <p className={`text-sm text-text-muted ${className}`}>No reviews yet</p>;
  return (
    <p className={`flex flex-wrap items-center gap-2 text-sm ${className}`}>
      <RatingStars value={rating.average} size="sm" />
      <span>
        <span className="font-semibold">{rating.average.toFixed(1)}</span>
        <span className="sr-only"> out of 5</span> · {rating.count} review{rating.count === 1 ? '' : 's'}
      </span>
    </p>
  );
}
