'use client';

import { useRef, useState } from 'react';
import { Button } from '@adelaide-sphere/ui';
import type { PublicReview } from '@/lib/api';
import { loadReviewPage } from '@/lib/lazy-actions';
import { ReviewList } from './review-list';

/**
 * Reviews after the first page. The business page renders the first ten on the
 * server; without this the rest were unreachable, although the heading counts
 * them all. Loading is on request only, so the enquiry form and footer stay
 * within reach.
 */
export function MoreReviews({ businessId, pageCount, shownIds }: { businessId: string; pageCount: number; shownIds: string[] }) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  if (pageCount <= 1) return null;

  const loadMore = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const next = await loadReviewPage({ businessId, page: page + 1 });
      // A review approved meanwhile shifts the pages by one; nothing is listed twice.
      setReviews((current) => {
        const seen = new Set([...shownIds, ...current.map((review) => review.id)]);
        return [...current, ...next.filter((review) => !seen.has(review.id))];
      });
      setPage((current) => current + 1);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {reviews.length > 0 && <ReviewList reviews={reviews} />}
      <p role="status" aria-live="polite" className="sr-only">
        {loading ? 'Loading more reviews' : reviews.length > 0 ? `Showing ${shownIds.length + reviews.length} reviews` : ''}
      </p>
      {page < pageCount && (
        <div className="flex flex-col items-center gap-2">
          {failed && <p className="text-sm text-text-muted">Those reviews didn’t load. Please try again.</p>}
          <Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loading}>
            {loading ? 'Loading…' : failed ? 'Try again' : 'Show more reviews'}
          </Button>
        </div>
      )}
    </div>
  );
}
