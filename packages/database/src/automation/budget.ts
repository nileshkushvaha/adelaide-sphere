import { billingPeriods, minorToMicros, usageCostMicros, type TokenRates, type TokenUsage } from '@adelaide-sphere/domain';
import type { Prisma } from '../generated/prisma/client.js';
import { AI_CONTROL_ID } from './control.js';

type Tx = Prisma.TransactionClient;

/**
 * Spending control (AI SRS §19; plan §I; owner budget of 18 September 2026).
 *
 * - Every paid call reserves its conservative maximum first, in one
 *   transaction that locks the day and month buckets in a fixed order and
 *   commits before the call is made. Concurrent reservations therefore can
 *   never together exceed a cap.
 * - Settlement happens once per operation (a conditional state change), from
 *   reported usage priced by the approved schedule. Anything that cannot be
 *   priced is counted in full as spent, never as zero.
 * - A mismatch between what was approved and what the provider reports halts
 *   every further paid call until an administrator reconciles and resumes.
 */
export class BudgetRefusal extends Error {
  constructor(
    readonly code: 'BUDGET_DISABLED' | 'BUDGET_EXCEEDED' | 'WORKFLOW_CAP_EXCEEDED' | 'PAID_CALLS_HALTED' | 'PRICE_UNKNOWN',
    message: string,
  ) {
    super(message);
    this.name = 'BudgetRefusal';
  }
}

export interface BudgetLimits {
  currency: string;
  timeZone: string;
  dailyMicros: number;
  monthlyMicros: number;
  workflowMicros: number;
  warningPercent: number;
  /** The separate image category (owner decision, Phase 1E). Zero allows no image generation. */
  imageDailyMicros: number;
  imageMonthlyMicros: number;
}

/** Which caps a paid call is reserved against. The per-article cap covers every category. */
export type BudgetCategory = 'text' | 'image';

const int = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : fallback);

/** Live limits from settings. A missing or disabled budget means no paid call is approved. */
export async function readBudgetLimits(tx: Pick<Tx, 'setting'>): Promise<BudgetLimits & { enabled: boolean }> {
  const setting = await tx.setting.findUnique({ where: { group_key: { group: 'ai_content', key: 'defaults' } }, select: { data: true } });
  const d = (setting?.data ?? {}) as Record<string, unknown>;
  return {
    enabled: d.budgetEnabled !== false,
    currency: typeof d.budgetCurrency === 'string' ? d.budgetCurrency : 'USD',
    timeZone: typeof d.timezone === 'string' ? d.timezone : 'Australia/Adelaide',
    dailyMicros: minorToMicros(int(d.hardDailyLimitMinor, 50)),
    monthlyMicros: minorToMicros(int(d.hardMonthlyLimitMinor, 1000)),
    workflowMicros: minorToMicros(int(d.maxWorkflowCostMinor, 25)),
    warningPercent: int(d.warningThreshold, 70),
    imageDailyMicros: minorToMicros(int(d.imageDailyLimitMinor, 0)),
    imageMonthlyMicros: minorToMicros(int(d.imageMonthlyLimitMinor, 0)),
  };
}

export interface ApprovedPrice extends TokenRates {
  id: string;
  version: string;
  provider: string;
  model: string;
  serviceTier: string;
  currency: string;
  /** Image prices only: the approved bound on output tokens for one image. */
  maxOutputTokens: number | null;
}

/**
 * The single administrator-approved price for a provider model, or null (fail
 * closed). An image price also names the size and quality it covers and the
 * approved bound on output tokens for one image.
 */
export async function approvedPrice(tx: Tx, provider: string, model: string, image?: { size: string; quality: string }): Promise<ApprovedPrice | null> {
  const rows = await tx.aIPriceSchedule.findMany({
    where: { provider, model, status: 'approved', ...(image ? { imageSize: image.size, imageQuality: image.quality } : { imageSize: null }) },
    orderBy: { approvedAt: 'desc' },
    take: 2,
  });
  if (rows.length !== 1) return null;
  const r = rows[0]!;
  return {
    id: r.id,
    version: r.version,
    provider: r.provider,
    model: r.model,
    serviceTier: r.serviceTier,
    currency: r.currency,
    inputMicrosPerMTok: r.inputMicrosPerMTok,
    cachedInputMicrosPerMTok: r.cachedInputMicrosPerMTok,
    outputMicrosPerMTok: r.outputMicrosPerMTok,
    longContextThresholdTokens: r.longContextThresholdTokens,
    maxOutputTokens: r.maxOutputTokens,
  };
}

export async function paidCallsHalt(tx: Tx): Promise<{ haltedAt: Date | null; reason: string | null }> {
  const rows = await tx.$queryRaw<{ paidCallsHaltedAt: Date | null; paidHaltReason: string | null }[]>`SELECT paidCallsHaltedAt, paidHaltReason FROM ai_automation_controls WHERE id = ${AI_CONTROL_ID} FOR SHARE`;
  return { haltedAt: rows[0]?.paidCallsHaltedAt ?? null, reason: rows[0]?.paidHaltReason ?? null };
}

export async function haltPaidCalls(tx: Tx, reason: string): Promise<void> {
  await tx.$executeRaw`UPDATE ai_automation_controls SET paidCallsHaltedAt = COALESCE(paidCallsHaltedAt, UTC_TIMESTAMP(3)), paidHaltReason = COALESCE(paidHaltReason, ${reason.slice(0, 300)}), updatedAt = UTC_TIMESTAMP(3) WHERE id = ${AI_CONTROL_ID}`;
  await tx.auditLog.create({ data: { action: 'ai_content.budget.halted', targetType: 'ai_control', targetId: AI_CONTROL_ID, metadata: { reason: reason.slice(0, 200) } } });
}

async function lockBucket(tx: Tx, scope: 'day' | 'month' | 'image_day' | 'image_month', period: string, currency: string) {
  await tx.$executeRaw`INSERT INTO ai_budget_buckets (id, scope, period, currency, reservedMicros, settledMicros, version, updatedAt)
    VALUES (${`b${scope.replace('_', '')}${period.replace(/-/g, '')}${currency}`.toLowerCase()}, ${scope}, ${period}, ${currency}, 0, 0, 1, UTC_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE id = id`;
  const rows = await tx.$queryRaw<{ id: string; reservedMicros: number; settledMicros: number }[]>`SELECT id, reservedMicros, settledMicros FROM ai_budget_buckets WHERE scope = ${scope} AND period = ${period} AND currency = ${currency} FOR UPDATE`;
  const row = rows[0]!;
  return { id: row.id, reserved: Number(row.reservedMicros), settled: Number(row.settledMicros) };
}

/** What the other paid calls for this operation's article hold (reserved) or spent (settled or uncertain). */
async function articleCommittedMicros(tx: Tx, operationId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ total: bigint | number | string | null }[]>`
    SELECT COALESCE(SUM(CASE WHEN o.costState = 'reserved' THEN o.reservedMicros ELSE o.settledMicros END), 0) AS total
      FROM ai_operations o
      JOIN ai_operations me ON me.id = ${operationId}
     WHERE o.itemId = me.itemId AND o.id <> me.id AND o.costState IN ('reserved', 'settled', 'uncertain')`;
  return Number(rows[0]?.total ?? 0);
}

/**
 * Reserves an operation's maximum cost against today's and this month's caps
 * and the per-workflow cap, in the caller's transaction (which must commit
 * before the call is made). Refuses with a BudgetRefusal; never over-commits.
 */
export async function reserveBudget(tx: Tx, input: { operationId: string; maxMicros: number; price: ApprovedPrice; now?: Date; category?: BudgetCategory }): Promise<{ dayBucketId: string; monthBucketId: string; warning: boolean }> {
  const limits = await readBudgetLimits(tx);
  if (!limits.enabled) throw new BudgetRefusal('BUDGET_DISABLED', 'Budget controls are off, so no paid call is approved.');
  if (input.price.currency !== limits.currency) throw new BudgetRefusal('PRICE_UNKNOWN', `The approved price is in ${input.price.currency}, but the budget is in ${limits.currency}.`);
  const halt = await paidCallsHalt(tx);
  if (halt.haltedAt) throw new BudgetRefusal('PAID_CALLS_HALTED', `Paid calls are halted: ${halt.reason ?? 'reconciliation required'}.`);
  if (!Number.isInteger(input.maxMicros) || input.maxMicros <= 0) throw new BudgetRefusal('PRICE_UNKNOWN', 'The maximum cost of this call is unknown.');
  if (input.maxMicros > limits.workflowMicros) throw new BudgetRefusal('WORKFLOW_CAP_EXCEEDED', 'This generation could cost more than the per-article cap.');
  const periods = billingPeriods(input.now ?? new Date(), limits.timeZone);
  const image = input.category === 'image';
  const dailyMicros = image ? limits.imageDailyMicros : limits.dailyMicros;
  const monthlyMicros = image ? limits.imageMonthlyMicros : limits.monthlyMicros;
  const what = image ? 'image budget' : 'AI budget';
  // Fixed order so concurrent reservations cannot deadlock: every paid call, text or image, takes
  // today's text bucket first (which also serialises the per-article sum below), then its own buckets.
  const day = await lockBucket(tx, 'day', periods.day, limits.currency);
  const imageDay = image ? await lockBucket(tx, 'image_day', periods.day, limits.currency) : null;
  const imageMonth = image ? await lockBucket(tx, 'image_month', periods.month, limits.currency) : null;
  const month = image ? null : await lockBucket(tx, 'month', periods.month, limits.currency);
  const chargedDay = imageDay ?? day;
  const chargedMonth = imageMonth ?? month!;
  if (chargedDay.reserved + chargedDay.settled + input.maxMicros > dailyMicros) throw new BudgetRefusal('BUDGET_EXCEEDED', `Today's ${what} cannot cover this request.`);
  if (chargedMonth.reserved + chargedMonth.settled + input.maxMicros > monthlyMicros) throw new BudgetRefusal('BUDGET_EXCEEDED', `This month's ${what} cannot cover this request.`);
  // The per-article cap is cumulative: every paid call for the same article (generation,
  // regeneration, metadata suggestions, images) counts what it holds or spent. Read under the
  // text day bucket lock, which every reservation takes; a concurrent settlement or release only
  // lowers the sum, so a stale read is conservative.
  const spentOnArticle = await articleCommittedMicros(tx, input.operationId);
  if (spentOnArticle + input.maxMicros > limits.workflowMicros) {
    throw new BudgetRefusal('WORKFLOW_CAP_EXCEEDED', 'This article has used its AI budget; another generation could take it over the per-article cap.');
  }
  await tx.$executeRaw`UPDATE ai_budget_buckets SET reservedMicros = reservedMicros + ${input.maxMicros}, version = version + 1, updatedAt = UTC_TIMESTAMP(3) WHERE id IN (${chargedDay.id}, ${chargedMonth.id})`;
  const updated = await tx.aIOperation.updateMany({
    where: { id: input.operationId, costState: 'none' },
    data: { costState: 'reserved', reservedMicros: input.maxMicros, estimatedMaxMicros: input.maxMicros, dayBucketId: chargedDay.id, monthBucketId: chargedMonth.id, priceScheduleId: input.price.id },
  });
  if (updated.count !== 1) throw new Error(`Operation ${input.operationId} already holds a reservation`);
  const threshold = (limit: number) => (limit * limits.warningPercent) / 100;
  const crossed = (before: number, limit: number) => before < threshold(limit) && before + input.maxMicros >= threshold(limit);
  const warning = crossed(chargedDay.reserved + chargedDay.settled, dailyMicros) || crossed(chargedMonth.reserved + chargedMonth.settled, monthlyMicros);
  if (warning) await tx.auditLog.create({ data: { action: 'ai_content.budget.warning', targetType: 'ai_budget', targetId: periods.day, metadata: { day: periods.day, month: periods.month, warningPercent: limits.warningPercent, category: image ? 'image' : 'text' } } });
  return { dayBucketId: chargedDay.id, monthBucketId: chargedMonth.id, warning };
}

/** Returns an unspent reservation: only when the call was definitely never accepted. */
export async function releaseReservation(tx: Tx, operationId: string): Promise<boolean> {
  const op = await tx.aIOperation.findUnique({ where: { id: operationId }, select: { costState: true, reservedMicros: true, dayBucketId: true, monthBucketId: true } });
  if (!op || op.costState !== 'reserved') return false;
  const done = await tx.aIOperation.updateMany({ where: { id: operationId, costState: 'reserved' }, data: { costState: 'released', settledMicros: 0 } });
  if (done.count !== 1) return false;
  await tx.$executeRaw`UPDATE ai_budget_buckets SET reservedMicros = reservedMicros - ${op.reservedMicros}, version = version + 1, updatedAt = UTC_TIMESTAMP(3) WHERE id IN (${op.dayBucketId}, ${op.monthBucketId})`;
  return true;
}

export interface SettlementInput {
  usage: TokenUsage | null;
  reportedModel: string | null;
  reportedServiceTier: string | null;
  reasoningTokens?: number | null;
}

/**
 * Settles an operation exactly once. Priced usage within the reservation
 * settles as priced; usage that cannot be priced counts the whole reservation
 * as spent ("uncertain"); a different model or service tier than approved, or
 * a charge above the reservation, also halts all further paid calls.
 */
export async function settleOperation(tx: Tx, operationId: string, input: SettlementInput): Promise<{ state: 'settled' | 'uncertain'; micros: number; halted: boolean }> {
  const op = await tx.aIOperation.findUniqueOrThrow({ where: { id: operationId }, select: { costState: true, reservedMicros: true, dayBucketId: true, monthBucketId: true, priceScheduleId: true, model: true } });
  if (op.costState !== 'reserved') throw new Error(`Operation ${operationId} is not awaiting settlement (${op.costState})`);
  const price = op.priceScheduleId ? await tx.aIPriceSchedule.findUnique({ where: { id: op.priceScheduleId } }) : null;
  let discrepancy: string | null = null;
  if (!price) discrepancy = 'no approved price was recorded for this call';
  else if (input.reportedModel !== null && input.reportedModel !== price.model && !input.reportedModel.startsWith(`${price.model}-`)) discrepancy = `provider reported model ${input.reportedModel.slice(0, 64)}, approved ${price.model}`;
  else if (input.reportedServiceTier !== null && input.reportedServiceTier !== price.serviceTier) discrepancy = `provider reported service tier ${input.reportedServiceTier.slice(0, 32)}, approved ${price.serviceTier}`;
  const priced = price && input.usage ? usageCostMicros(price, input.usage) : null;
  if (!discrepancy && priced === null) discrepancy = 'the provider did not report priceable usage';
  if (!discrepancy && priced !== null && priced > op.reservedMicros) discrepancy = 'the reported usage cost more than the reserved maximum';
  const uncertain = priced === null || Boolean(discrepancy);
  // Never zero for the unknown: an unpriceable call counts its whole reservation (or more, if usage says so).
  const micros = uncertain ? Math.max(op.reservedMicros, priced ?? 0) : priced!;
  const done = await tx.aIOperation.updateMany({
    where: { id: operationId, costState: 'reserved' },
    data: {
      costState: uncertain ? 'uncertain' : 'settled',
      settledMicros: micros,
      inputTokens: input.usage?.inputTokens ?? null,
      cachedInputTokens: input.usage?.cachedInputTokens ?? null,
      outputTokens: input.usage?.outputTokens ?? null,
      reasoningTokens: input.reasoningTokens ?? null,
    },
  });
  if (done.count !== 1) throw new Error(`Operation ${operationId} was settled concurrently`);
  await tx.$executeRaw`UPDATE ai_budget_buckets SET reservedMicros = reservedMicros - ${op.reservedMicros}, settledMicros = settledMicros + ${micros}, version = version + 1, updatedAt = UTC_TIMESTAMP(3) WHERE id IN (${op.dayBucketId}, ${op.monthBucketId})`;
  if (discrepancy) await haltPaidCalls(tx, discrepancy);
  return { state: uncertain ? 'uncertain' : 'settled', micros, halted: Boolean(discrepancy) };
}

/** Current usage for display: settled, reserved and limits for today and this month. */
export async function budgetStatus(tx: Tx, now = new Date()) {
  const limits = await readBudgetLimits(tx);
  const periods = billingPeriods(now, limits.timeZone);
  const bucket = (scope: 'day' | 'month' | 'image_day' | 'image_month', period: string) => tx.aIBudgetBucket.findUnique({ where: { scope_period_currency: { scope, period, currency: limits.currency } } });
  const [day, month, imageDay, imageMonth] = await Promise.all([bucket('day', periods.day), bucket('month', periods.month), bucket('image_day', periods.day), bucket('image_month', periods.month)]);
  const halt = await tx.$queryRaw<{ paidCallsHaltedAt: Date | null; paidHaltReason: string | null }[]>`SELECT paidCallsHaltedAt, paidHaltReason FROM ai_automation_controls WHERE id = ${AI_CONTROL_ID}`;
  const uncertain = await tx.aIOperation.aggregate({ where: { costState: 'uncertain' }, _sum: { settledMicros: true }, _count: true });
  const unknown = await tx.aIOperation.count({ where: { state: 'outcome_unknown' } });
  const view = (b: typeof day, limit: number) => {
    const reserved = b?.reservedMicros ?? 0;
    const settled = b?.settledMicros ?? 0;
    return { reservedMicros: reserved, settledMicros: settled, limitMicros: limit, warning: reserved + settled >= (limit * limits.warningPercent) / 100 };
  };
  return {
    enabled: limits.enabled,
    currency: limits.currency,
    warningPercent: limits.warningPercent,
    workflowLimitMicros: limits.workflowMicros,
    day: { period: periods.day, ...view(day, limits.dailyMicros) },
    month: { period: periods.month, ...view(month, limits.monthlyMicros) },
    imageDay: { period: periods.day, ...view(imageDay, limits.imageDailyMicros) },
    imageMonth: { period: periods.month, ...view(imageMonth, limits.imageMonthlyMicros) },
    uncertainOperations: uncertain._count,
    uncertainMicros: uncertain._sum.settledMicros ?? 0,
    outcomeUnknownOperations: unknown,
    paidCallsHaltedAt: halt[0]?.paidCallsHaltedAt ?? null,
    paidHaltReason: halt[0]?.paidHaltReason ?? null,
  };
}
