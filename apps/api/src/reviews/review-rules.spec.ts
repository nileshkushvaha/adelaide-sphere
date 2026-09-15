import { aggregateDelta, displayMean, isNoOpDecision } from './review-rules.js';

describe('review aggregate rules (SRS REV 003–005)', () => {
  it('counts only transitions into and out of approved', () => {
    expect(aggregateDelta('pending', 'approved', 4)).toEqual({ count: 1, sum: 4 });
    expect(aggregateDelta('approved', 'rejected', 4)).toEqual({ count: -1, sum: -4 });
    expect(aggregateDelta('approved', 'spam', 5)).toEqual({ count: -1, sum: -5 });
    expect(aggregateDelta('pending', 'rejected', 3)).toEqual({ count: 0, sum: 0 });
    expect(aggregateDelta('approved', 'approved', 3)).toEqual({ count: 0, sum: 0 }); // re-approval never double counts
    expect(aggregateDelta('rejected', 'approved', 2)).toEqual({ count: 1, sum: 2 });
  });

  it('rounds the mean for display only and returns null with no approved reviews', () => {
    expect(displayMean(0, 0)).toBeNull();
    expect(displayMean(13, 3)).toBe(4.3);
    expect(displayMean(9, 2)).toBe(4.5);
  });

  it('detects redundant decisions', () => {
    expect(isNoOpDecision('approved', 'approve')).toBe(true);
    expect(isNoOpDecision('pending', 'approve')).toBe(false);
    expect(isNoOpDecision('spam', 'spam')).toBe(true);
  });
});
