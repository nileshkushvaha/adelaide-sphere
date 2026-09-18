/**
 * AI Content lifecycle (AI Content Automation SRS, state table AI-160–169 and
 * transition table AI-194–200). Pure: shared by the API, the worker and the
 * admin, so every side refuses the same impossible moves.
 *
 * The item's status is the orchestration state, separate from the Post's own
 * draft/scheduled/published/archived status. `scheduled` and `published` are
 * written only in the same transaction as the Post change they mirror.
 */
export const AI_ITEM_STATUSES = [
  'queued',
  'paused',
  'researching',
  'generating',
  'needs_fact_review',
  'ready_for_review',
  'approved',
  'scheduled',
  'published',
  'failed',
  'cancelled',
  'rejected',
] as const;
export type AiItemStatus = (typeof AI_ITEM_STATUSES)[number];

/**
 * Every allowed move. Anything not listed is refused, including the SRS's
 * explicit prohibitions: nothing reaches `published` except from `approved`
 * or `scheduled`; fact review never auto-approves; a scheduled item is never
 * regenerated in place; published, cancelled and rejected items never move.
 * `generating → approved` exists only for the future full-auto policy (1G) and
 * is not taken by any current command.
 */
export const AI_ITEM_TRANSITIONS: Readonly<Record<AiItemStatus, readonly AiItemStatus[]>> = {
  queued: ['paused', 'researching', 'cancelled', 'rejected'],
  paused: ['queued', 'cancelled', 'rejected'],
  researching: ['generating', 'needs_fact_review', 'failed', 'cancelled'],
  generating: ['ready_for_review', 'needs_fact_review', 'approved', 'failed', 'cancelled'],
  needs_fact_review: ['researching', 'ready_for_review', 'rejected'],
  ready_for_review: ['approved', 'rejected', 'generating'],
  approved: ['scheduled', 'published', 'ready_for_review'],
  scheduled: ['published', 'approved', 'ready_for_review', 'failed', 'cancelled'],
  published: [],
  failed: ['researching', 'generating', 'ready_for_review', 'cancelled'],
  cancelled: [],
  rejected: [],
};

export function canTransitionAiItem(from: AiItemStatus, to: AiItemStatus): boolean {
  return AI_ITEM_TRANSITIONS[from].includes(to);
}

/** Cancelled and rejected items release their title; everything else, published included, keeps it. */
export function aiItemReservesTitle(status: AiItemStatus): boolean {
  return status !== 'cancelled' && status !== 'rejected';
}

/** Queued or paused: nothing has started, so priority and pause still apply. */
export function aiItemPreProcessing(status: AiItemStatus): boolean {
  return status === 'queued' || status === 'paused';
}

/** Stages recorded with a `failed` status (plan §D: one `failed` state plus its stage). */
export const AI_FAILURE_STAGES = ['research', 'generation', 'image', 'application', 'publication'] as const;
export type AiFailureStage = (typeof AI_FAILURE_STAGES)[number];

/** Outbox event that asks the worker to process one durable AI operation. */
export const AI_OPERATION_EVENT = 'ai.operation.ready';
