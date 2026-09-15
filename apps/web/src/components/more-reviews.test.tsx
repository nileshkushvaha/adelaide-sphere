// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicReview } from '@/lib/api';
import { MoreReviews } from './more-reviews';

const loadReviewPage = vi.fn<(input: { businessId: string; page: number }) => Promise<PublicReview[]>>();
vi.mock('@/lib/lazy-actions', () => ({
  loadReviewPage: (input: { businessId: string; page: number }) => loadReviewPage(input),
  loadBusinessPage: vi.fn(),
  loadPostPage: vi.fn(),
}));

const review = (n: number): PublicReview => ({
  id: `r${n}`,
  displayName: `Reviewer ${n}`,
  rating: 4,
  text: `Review text ${n}`,
  redacted: false,
  createdAt: '2026-09-01T02:00:00.000Z',
});

const BUSINESS = 'ckbusiness0000000000001';
const firstPageIds = ['r1', 'r2'];

/**
 * Reviews after the first page, on request (the server renders page one). The
 * button asks the server action for the next page and appends it.
 */
describe('More reviews', () => {
  beforeEach(() => {
    loadReviewPage.mockReset();
  });

  it('offers nothing when every review is already on the page', () => {
    const { container } = render(<MoreReviews businessId={BUSINESS} pageCount={1} shownIds={firstPageIds} />);
    expect(container).toBeEmptyDOMElement();
    expect(loadReviewPage).not.toHaveBeenCalled();
  });

  it('appends the next page, announces the count and stops at the last page', async () => {
    loadReviewPage.mockResolvedValueOnce([review(3), review(4)]).mockResolvedValueOnce([review(5)]);
    render(<MoreReviews businessId={BUSINESS} pageCount={3} shownIds={firstPageIds} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show more reviews' }));
    expect(await screen.findByText('Review text 3')).toBeInTheDocument();
    expect(screen.getByText('Review text 4')).toBeInTheDocument();
    expect(loadReviewPage).toHaveBeenLastCalledWith({ businessId: BUSINESS, page: 2 });
    expect(screen.getByRole('status')).toHaveTextContent('Showing 4 reviews');

    fireEvent.click(screen.getByRole('button', { name: 'Show more reviews' }));
    expect(await screen.findByText('Review text 5')).toBeInTheDocument();
    expect(loadReviewPage).toHaveBeenLastCalledWith({ businessId: BUSINESS, page: 3 });
    expect(screen.queryByRole('button', { name: /show more reviews/i })).not.toBeInTheDocument();
  });

  it('never lists a review twice when the pages shift under it', async () => {
    // A review approved meanwhile pushes r2 from page one onto page two.
    loadReviewPage.mockResolvedValue([review(2), review(3)]);
    render(<MoreReviews businessId={BUSINESS} pageCount={3} shownIds={firstPageIds} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show more reviews' }));
    expect(await screen.findByText('Review text 3')).toBeInTheDocument();
    expect(screen.queryByText('Review text 2')).not.toBeInTheDocument();
  });

  it('sends one request for a double press', async () => {
    let resolve!: (value: PublicReview[]) => void;
    loadReviewPage.mockReturnValue(new Promise((done) => (resolve = done)));
    render(<MoreReviews businessId={BUSINESS} pageCount={3} shownIds={firstPageIds} />);

    const button = screen.getByRole('button', { name: 'Show more reviews' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(loadReviewPage).toHaveBeenCalledTimes(1);
    resolve([review(3)]);
    expect(await screen.findByText('Review text 3')).toBeInTheDocument();
  });

  it('keeps the page usable when a load fails, and lets it be retried', async () => {
    loadReviewPage.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([review(3)]);
    render(<MoreReviews businessId={BUSINESS} pageCount={3} shownIds={firstPageIds} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show more reviews' }));
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByText('Those reviews didn’t load. Please try again.')).toBeInTheDocument();

    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByText('Review text 3')).toBeInTheDocument());
    // The retry asks for the same page again, not the one after it.
    expect(loadReviewPage).toHaveBeenLastCalledWith({ businessId: BUSINESS, page: 2 });
    expect(screen.queryByText('Those reviews didn’t load. Please try again.')).not.toBeInTheDocument();
  });
});
