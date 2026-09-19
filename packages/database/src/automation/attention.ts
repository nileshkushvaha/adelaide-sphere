import type { Prisma } from '../generated/prisma/client.js';
import { budgetStatus } from './budget.js';

type Tx = Prisma.TransactionClient;

/**
 * What needs an operator (Phase 1G; plan §J alerts: unknown outcome, budget
 * hard stop, growing fact-review queue, expired or stuck work, missed slots).
 * One read, used both by the metrics collector (alert rules in
 * docs/operations/alert-response.md) and the AI Content dashboard, so the two
 * never disagree. Counts and ages only: no titles, URLs or ids.
 */
export interface AiAttention {
  outcomeUnknownOperations: number;
  paidCallsHalted: boolean;
  paidHaltReason: string | null;
  /** Share of each cap used (reserved + settled), 0 when the cap is zero. */
  budgetUsed: { textDay: number; textMonth: number; imageDay: number; imageMonth: number };
  budgetWarningPercent: number;
  factReviewItems: number;
  factReviewOldestSeconds: number;
  failedItems: number;
  missedSlotsUnreviewed: number;
  /** Age of the oldest operation that is due or running; a stuck pipeline shows here. */
  oldestOpenOperationSeconds: number;
}

const ratio = (b: { reservedMicros: number; settledMicros: number; limitMicros: number }) => (b.limitMicros > 0 ? (b.reservedMicros + b.settledMicros) / b.limitMicros : 0);

export async function aiAttention(tx: Tx, now = new Date()): Promise<AiAttention> {
  const [budget, unknown, factReview, oldestFact, failed, missed, oldestOpen] = await Promise.all([
    budgetStatus(tx, now),
    tx.aIOperation.count({ where: { state: 'outcome_unknown' } }),
    tx.aIContentItem.count({ where: { status: 'needs_fact_review' } }),
    tx.aIContentItem.findFirst({ where: { status: 'needs_fact_review' }, orderBy: { updatedAt: 'asc' }, select: { updatedAt: true } }),
    tx.aIContentItem.count({ where: { status: 'failed' } }),
    tx.aIScheduleSlot.count({ where: { state: 'missed' } }),
    tx.aIOperation.findFirst({ where: { state: { in: ['pending', 'running'] }, nextAttemptAt: { lte: now } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);
  const age = (at: Date | null | undefined) => (at ? Math.max(0, Math.floor((now.getTime() - at.getTime()) / 1000)) : 0);
  return {
    outcomeUnknownOperations: unknown,
    paidCallsHalted: budget.paidCallsHaltedAt !== null,
    paidHaltReason: budget.paidHaltReason,
    budgetUsed: { textDay: ratio(budget.day), textMonth: ratio(budget.month), imageDay: ratio(budget.imageDay), imageMonth: ratio(budget.imageMonth) },
    budgetWarningPercent: budget.warningPercent,
    factReviewItems: factReview,
    factReviewOldestSeconds: age(oldestFact?.updatedAt),
    failedItems: failed,
    missedSlotsUnreviewed: missed,
    oldestOpenOperationSeconds: age(oldestOpen?.createdAt),
  };
}
