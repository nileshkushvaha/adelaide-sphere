// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { RatingPanel } from './rating-panel';

const runAxe = async (container: HTMLElement) => {
  const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n');
};

describe('RatingPanel', () => {
  const breakdown = [
    { stars: 5, count: 6 },
    { stars: 4, count: 2 },
    { stars: 3, count: 1 },
    { stars: 2, count: 0 },
    { stars: 1, count: 1 },
  ];

  it('states the average and every bucket as text, so nothing depends on the bar alone', async () => {
    const { container } = render(<RatingPanel rating={{ average: 4.2, count: 10 }} breakdown={breakdown} />);
    expect(screen.getByText('4.2')).toBeInTheDocument();
    expect(screen.getByText(/10 approved reviews/)).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    // Six of ten five-star reviews is 60%: the count and the share are both written out.
    expect(within(items[0]!).getByText('6 (60%)')).toBeInTheDocument();
    expect(within(items[3]!).getByText('0 (0%)')).toBeInTheDocument();
    expect(await runAxe(container)).toBe('');
  });

  it('says there are no reviews rather than drawing an empty five-star row', async () => {
    // An unrated listing must never look like a zero rating (SRS DIR 001).
    const { container } = render(<RatingPanel rating={null} breakdown={[]} />);
    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /be the first to review/i })).toHaveAttribute('href', '#write-review');
    expect(await runAxe(container)).toBe('');
  });

  it('falls back to the empty state when a rating exists but the breakdown did not load', () => {
    render(<RatingPanel rating={{ average: 4.2, count: 10 }} breakdown={[]} />);
    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
  });
});
