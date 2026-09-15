/** Aggregate and moderation rules for reviews (SRS REV 003–005). */

export const REVIEW_STATES = ['pending', 'approved', 'rejected', 'spam'] as const;
export type ReviewStatus = (typeof REVIEW_STATES)[number];

export const MODERATION_ACTIONS = { approve: 'approved', reject: 'rejected', spam: 'spam' } as const;
export type ModerationAction = keyof typeof MODERATION_ACTIONS;

/** Repeat submissions from the same email for the same business inside this window are flagged (SRS REV 005). */
export const REPEAT_WINDOW_DAYS = 30;

/**
 * Aggregate delta for one moderation decision. Only approved reviews count, and
 * a decision that does not change approval leaves the totals untouched, so a
 * repeated request can never double count (SRS REV 004).
 */
export function aggregateDelta(from: ReviewStatus, to: ReviewStatus, rating: number): { count: number; sum: number } {
  const wasApproved = from === 'approved';
  const willBeApproved = to === 'approved';
  if (wasApproved === willBeApproved) return { count: 0, sum: 0 };
  return willBeApproved ? { count: 1, sum: rating } : { count: -1, sum: -rating };
}

/** Display mean: one decimal, null when there are no approved reviews (SRS REV 004). */
export function displayMean(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round((sum / count) * 10) / 10;
}

/** A decision is redundant when the review already has that status. */
export function isNoOpDecision(current: ReviewStatus, action: ModerationAction): boolean {
  return MODERATION_ACTIONS[action] === current;
}
