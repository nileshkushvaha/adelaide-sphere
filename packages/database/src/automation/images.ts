import { createHash, randomUUID } from 'node:crypto';
import {
  altTextProblem,
  effectiveImageMode,
  imagePromptProblems,
  imageCallCostMicros,
  imagePromptWithPolicy,
  imageUsageTokens,
  IMAGE_POLICY_VERSION,
  maxImageCallCostMicros,
  type AiItemStatus,
  type ImageUsage,
} from '@adelaide-sphere/domain';
import type { DatabaseClient } from '../client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { altHash } from '../editorial/ai-image-gate.js';
import { invalidateApprovals, lockLinkedAiItem, moveAiItem } from '../editorial/ai-publication.js';
import { readPostMaterial } from '../editorial/material.js';
import { recordPostRevision } from '../editorial/revisions.js';
import { approvedPrice, BudgetRefusal, haltPaidCalls, imagePriceOf, paidCallsHalt, releaseReservation, reserveBudget, settleOperation } from './budget.js';
import { readAutomationControl } from './control.js';
import { GenerationCommandError } from './generation.js';
import { configuredLocation } from './novelty.js';
import { assertLease, enqueueOperationDelivery, finishOperation, MAX_OPERATION_ATTEMPTS, operationKey, releaseForRetry, type OperationLease } from './operations.js';
import { imageCapabilityProblem, imageModelCapability, nativeImageSize, type ImageModelCapability } from './providers.js';

type Tx = Prisma.TransactionClient;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * AI featured images (Phase 1E; AI SRS §12; plan §E, §H; owner decisions of
 * 19 September 2026):
 *
 * - hybrid mode, prompt-only by default: a paid image is made only when a
 *   person asks (Generate image). Automatic generation is not approved;
 * - one featured slot; a regeneration is the next explicit image version;
 * - a separate image budget, and the per-article cap covers images too;
 * - the bytes enter the existing media pipeline (quarantine, validation,
 *   re-encoded variants); a provider URL is never stored or published;
 * - nothing is attached automatically. A person approves the actual image
 *   with alt text written from it, which makes it the featured image under a
 *   version check; that is a material change, so the article's fact
 *   confirmation and approval must be given again;
 * - an unknown provider outcome is held for an operator, never re-sent.
 */
/**
 * The provider-neutral image request (provider amendment 01, P1): each
 * adapter maps aspect ratio, resolution tier and quality to its own API.
 * Results are always inline bytes (AI-IMAGE-PROVIDER-11).
 */
export interface ImageRequest {
  provider: string;
  model: string;
  prompt: string;
  aspectRatio: string;
  resolution: string;
  quality: string;
}

export interface ImageSettings {
  enabled: boolean;
  imageMode: unknown;
  provider: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  quality: string;
  disclosureText: string;
}

export async function readImageSettings(tx: Pick<Tx, 'setting'>): Promise<ImageSettings> {
  const setting = await tx.setting.findUnique({ where: { group_key: { group: 'ai_content', key: 'defaults' } }, select: { data: true } });
  const d = (setting?.data ?? {}) as Record<string, unknown>;
  return {
    enabled: d.enabled === true,
    imageMode: d.imageMode ?? 'hybrid',
    // Defaults reproduce the request 1E has always made (OpenAI, 1536x1024, medium).
    provider: typeof d.imageProvider === 'string' ? d.imageProvider : 'openai',
    model: typeof d.imageModel === 'string' ? d.imageModel : 'gpt-image-2.5-flare',
    aspectRatio: typeof d.imageAspectRatio === 'string' ? d.imageAspectRatio : '3:2',
    resolution: typeof d.imageResolution === 'string' ? d.imageResolution : '1k',
    quality: typeof d.imageQuality === 'string' ? d.imageQuality : 'medium',
    disclosureText: typeof d.imageDisclosureText === 'string' ? d.imageDisclosureText : 'Illustrative image created with AI.',
  };
}

const IMAGE_ITEM_STATES: readonly AiItemStatus[] = ['needs_fact_review', 'ready_for_review', 'approved'];

/** The price an operation was reserved against, as the domain cost rules take it. */
async function approvedPriceById(tx: Tx, id: string) {
  const r = await tx.aIPriceSchedule.findUnique({ where: { id } });
  if (!r) return null;
  return {
    version: r.version,
    unit: (r.pricingUnit === 'image' ? 'image' : 'token') as 'image' | 'token',
    inputMicrosPerMTok: r.inputMicrosPerMTok,
    outputMicrosPerMTok: r.outputMicrosPerMTok,
    textOutputMicrosPerMTok: r.textOutputMicrosPerMTok,
    perImageMicros: r.perImageMicros,
    maxOutputTokens: r.maxOutputTokens,
    maxTextOutputTokens: r.maxTextOutputTokens,
  };
}

const audit = (tx: Tx, action: string, itemId: string | null, actorAdminId: string | null, metadata: Record<string, string | number | boolean | null>, requestId?: string | null) =>
  tx.auditLog.create({ data: { action, actorAdminId, targetType: 'ai_topic', targetId: itemId, requestId: requestId ?? null, metadata } });

/** The featured-image brief the article's latest applied run proposed (prompt and pre-generation alt draft). */
export async function featuredBrief(tx: Pick<Tx, 'aIGenerationRun'>, itemId: string): Promise<{ prompt: string; altDraft: string } | null> {
  const run = await tx.aIGenerationRun.findFirst({ where: { itemId, status: 'applied' }, orderBy: { generationVersion: 'desc' }, select: { imageBriefs: true } });
  const briefs = Array.isArray(run?.imageBriefs) ? (run!.imageBriefs as { placement?: string; prompt?: string; altDraft?: string }[]) : [];
  const brief = briefs.find((b) => b.placement === 'featured') ?? briefs[0];
  return brief?.prompt ? { prompt: brief.prompt, altDraft: brief.altDraft ?? '' } : null;
}

async function lockItem(tx: Tx, itemId: string) {
  const rows = await tx.$queryRaw<{ id: string; status: AiItemStatus; version: number; postId: string | null; imageMode: string | null }[]>`
    SELECT id, status, version, postId, imageMode FROM ai_content_items WHERE id = ${itemId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new GenerationCommandError('NOT_FOUND', 'This topic does not exist.', 404);
  return { ...row, version: Number(row.version) };
}

/**
 * The capability and approved-price checks every paid image call passes before
 * anything is created (P1): a listed model that supports the request, an
 * approved price for its resolution and quality in the unit the provider bills,
 * and a finite worst-case cost to reserve.
 */
async function pricedImageCall(tx: Tx, request: ImageRequest) {
  const capability = imageCapabilityProblem(request.provider, request.model, request.aspectRatio, request.resolution, request.quality, request.prompt.length);
  if (capability) throw new GenerationCommandError('MODEL_NOT_CAPABLE', `The image model cannot serve this request (${capability.replace(/_/g, ' ')}).`, 400);
  const cap = imageModelCapability(request.provider, request.model)!;
  const price = await approvedPrice(tx, request.provider, request.model, { resolution: request.resolution, quality: request.quality });
  if (!price) throw new GenerationCommandError('PRICE_UNKNOWN', `No approved price covers ${request.model} at ${request.resolution}, ${request.quality} quality; approve one on the Pricing page first.`);
  // The approved price must be in the unit the provider bills, and bound any text/thinking it always bills.
  if (price.pricingUnit !== cap.priceUnit || (cap.billsTextOutput && price.textOutputMicrosPerMTok === null)) {
    throw new GenerationCommandError('PRICE_UNKNOWN', `The approved price for ${request.model} does not match how the provider bills, so the cost cannot be limited.`);
  }
  // A per-image provider bills at the configuration it actually serves (xAI: resolution and quality). The
  // reservation takes the most expensive approved configuration of the model, so a result served in another
  // approved configuration still fits; its cost then disagrees with this configuration's price and halts.
  let bound = imagePriceOf(price);
  if (price.pricingUnit === 'image') {
    const top = await tx.aIPriceSchedule.aggregate({ where: { provider: request.provider, model: request.model, status: 'approved', pricingUnit: 'image', currency: price.currency }, _max: { perImageMicros: true } });
    bound = { ...bound, perImageMicros: Math.max(price.perImageMicros ?? 0, top._max.perImageMicros ?? 0) || null };
  }
  const maxMicros = maxImageCallCostMicros(bound, Buffer.byteLength(request.prompt));
  if (maxMicros === null) throw new GenerationCommandError('PRICE_UNKNOWN', 'The approved image price cannot bound this call, so the cost cannot be limited.');
  return { cap, price, maxMicros };
}

/** One image operation and its job, the next explicit version in its slot (a featured regeneration or a comparison result). */
async function createImageOperation(
  tx: Tx,
  input: { key: string; itemId: string; controlEpoch: number; slot: 'featured' | 'comparison'; comparisonRunId: string | null; request: ImageRequest; cap: ImageModelCapability; disclosureText: string; adminId: string },
) {
  const { request } = input;
  const latest = await tx.aIImageJob.findFirst({ where: { itemId: input.itemId, slot: input.slot }, orderBy: { imageVersion: 'desc' }, select: { imageVersion: true } });
  const imageVersion = (latest?.imageVersion ?? 0) + 1;
  const op = await tx.aIOperation.create({
    data: {
      operationKey: input.key,
      kind: 'image',
      itemId: input.itemId,
      controlEpoch: input.controlEpoch,
      scope: input.slot,
      provider: request.provider,
      model: request.model,
      providerPhase: 'prepared',
      requestHash: sha256(JSON.stringify(request)),
      requestPayload: { request } as unknown as Prisma.InputJsonObject,
      requestedByAdminId: input.adminId,
    },
    select: { id: true },
  });
  const job = await tx.aIImageJob.create({
    data: {
      itemId: input.itemId,
      slot: input.slot,
      comparisonRunId: input.comparisonRunId,
      imageVersion,
      operationId: op.id,
      prompt: request.prompt.slice(0, 1500),
      promptHash: sha256(request.prompt),
      policyVersion: IMAGE_POLICY_VERSION,
      provider: request.provider,
      model: request.model,
      size: nativeImageSize(input.cap, request.aspectRatio, request.resolution)!,
      quality: request.quality,
      aspectRatio: request.aspectRatio,
      resolution: request.resolution,
      disclosureText: input.disclosureText.slice(0, 255),
      disclosureHash: sha256(input.disclosureText.slice(0, 255)),
      requestedByAdminId: input.adminId,
    },
    select: { id: true },
  });
  return { op, job, imageVersion };
}

/**
 * The checks every person-requested paid image passes, whatever the provider
 * (hybrid mode, article in review as an unpublished draft, nothing in flight,
 * disclosure set, a screened generic prompt). Locks the topic row.
 */
async function imageRequestGate(tx: Tx, input: { itemId: string; expectedVersion?: number | null; prompt?: string | null }) {
  const control = await readAutomationControl(tx);
  const settings = await readImageSettings(tx);
  if (!control.enabled || !settings.enabled) throw new GenerationCommandError('AUTOMATION_DISABLED', 'AI automation is switched off, so no image can be generated.');
  const item = await lockItem(tx, input.itemId);
  if (input.expectedVersion != null && item.version !== input.expectedVersion) throw new GenerationCommandError('STALE_VERSION', 'This topic changed. Reload it before trying again.');
  if (effectiveImageMode(settings.imageMode, item.imageMode) !== 'hybrid') {
    throw new GenerationCommandError('IMAGE_MODE_MANUAL', 'Images for this article are manual: use the prompt to create or choose one, then upload it.');
  }
  if (!IMAGE_ITEM_STATES.includes(item.status) || !item.postId) throw new GenerationCommandError('INVALID_TRANSITION', 'A featured image can be generated for an article in review.');
  const post = await tx.post.findUniqueOrThrow({ where: { id: item.postId }, select: { status: true, firstPublishedAt: true } });
  if (post.status !== 'draft' || post.firstPublishedAt) throw new GenerationCommandError('POST_NOT_DRAFT', 'Images are generated only for an unpublished draft.');
  const inFlight = await tx.aIOperation.count({ where: { itemId: item.id, kind: 'image', state: { in: ['pending', 'running', 'outcome_unknown'] } } });
  if (inFlight > 0) throw new GenerationCommandError('IMAGE_IN_PROGRESS', 'An image for this article is still being made or needs resolving.');
  if (!settings.disclosureText.trim()) throw new GenerationCommandError('DISCLOSURE_MISSING', 'Set the AI image disclosure in AI Settings first.');

  const prompt = (input.prompt ?? (await featuredBrief(tx, item.id))?.prompt ?? '').trim();
  const problem = imagePromptProblems(prompt, [await configuredLocation(tx)]);
  if (problem) {
    const message =
      problem.problem === 'names_a_place_or_business'
        ? `Describe a generic scene without naming places, businesses or events (found: ${problem.names.join(', ')}). An AI image must never look like a real place.`
        : problem.problem === 'empty'
          ? 'Enter a prompt describing the image.'
          : 'Keep the prompt to 1,000 characters.';
    throw new GenerationCommandError('VALIDATION_ERROR', 'Some fields are invalid', 400, { fields: { prompt: [message] } });
  }
  return { control, settings, item, prompt };
}

/**
 * A person asks for a featured image (hybrid mode only). Validated, prompt
 * screened and the worst-case cost reserved against the image budget and the
 * article's cap before the transaction commits; the worker calls the
 * provider later. Idempotent on the request key: a repeated click is the same
 * operation, the same image version and the same reservation.
 */
export async function requestImage(
  tx: Tx,
  input: { itemId: string; expectedVersion: number; prompt?: string | null; adminId: string; requestKey: string; requestId?: string | null; now?: Date },
): Promise<{ operationId: string; jobId: string; created: boolean }> {
  const now = input.now ?? new Date();
  const key = operationKey('image', JSON.stringify([input.adminId, input.requestKey]));
  const existing = await tx.aIOperation.findUnique({ where: { operationKey: key }, select: { id: true, itemId: true, imageJob: { select: { id: true } } } });
  if (existing) {
    if (existing.itemId !== input.itemId || !existing.imageJob) throw new GenerationCommandError('IDEMPOTENCY_MISMATCH', 'This request key was already used for a different request.');
    return { operationId: existing.id, jobId: existing.imageJob.id, created: false };
  }
  const { control, settings, item, prompt } = await imageRequestGate(tx, input);
  const request: ImageRequest = {
    provider: settings.provider,
    model: settings.model,
    prompt: imagePromptWithPolicy(prompt),
    aspectRatio: settings.aspectRatio,
    resolution: settings.resolution,
    quality: settings.quality,
  };
  const { cap, price, maxMicros } = await pricedImageCall(tx, request);
  const { op, job, imageVersion } = await createImageOperation(tx, { key, itemId: item.id, controlEpoch: control.epoch, slot: 'featured', comparisonRunId: null, request, cap, disclosureText: settings.disclosureText, adminId: input.adminId });
  try {
    await reserveBudget(tx, { operationId: op.id, maxMicros, price, now, category: 'image' });
  } catch (error) {
    if (error instanceof BudgetRefusal) throw new GenerationCommandError(error.code, error.message);
    throw error;
  }
  await enqueueOperationDelivery(tx, op.id);
  await audit(tx, 'ai_content.image.requested', item.id, input.adminId, { operationId: op.id, jobId: job.id, imageVersion, provider: request.provider, model: request.model, aspectRatio: request.aspectRatio, resolution: request.resolution, quality: request.quality, reservedMicros: maxMicros, priceVersion: price.version }, input.requestId);
  return { operationId: op.id, jobId: job.id, created: true };
}

/** One provider/model setting in a controlled comparison (the aspect ratio is shared). */
export interface ComparisonCandidate {
  provider: string;
  model: string;
  resolution: string;
  quality: string;
}

export const MAX_COMPARISON_CANDIDATES = 4;

/** The same screened prompt for every candidate, each priced and bounded exactly as a featured request would be. */
async function comparisonPlan(tx: Tx, prompt: string, aspectRatio: string, candidates: readonly ComparisonCandidate[]) {
  if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > MAX_COMPARISON_CANDIDATES) {
    throw new GenerationCommandError('VALIDATION_ERROR', 'Some fields are invalid', 400, { fields: { candidates: [`Choose 2 to ${MAX_COMPARISON_CANDIDATES} provider settings to compare`] } });
  }
  const seen = new Set(candidates.map((c) => [c.provider, c.model, c.resolution, c.quality].join('|')));
  if (seen.size !== candidates.length) throw new GenerationCommandError('VALIDATION_ERROR', 'Some fields are invalid', 400, { fields: { candidates: ['Each setting may be chosen once'] } });
  const items = [];
  for (const c of candidates) {
    const request: ImageRequest = { provider: c.provider, model: c.model, prompt: imagePromptWithPolicy(prompt), aspectRatio, resolution: c.resolution, quality: c.quality };
    items.push({ request, ...(await pricedImageCall(tx, request)) });
  }
  return { items, totalMicros: items.reduce((sum, i) => sum + i.maxMicros, 0) };
}

/**
 * What a comparison would reserve, before anyone confirms it: each provider's
 * maximum and the total, from approved prices only. Creates nothing.
 */
export async function quoteImageComparison(tx: Tx, input: { itemId: string; prompt?: string | null; aspectRatio: string; candidates: readonly ComparisonCandidate[] }) {
  const { prompt } = await imageRequestGate(tx, { itemId: input.itemId, prompt: input.prompt });
  const plan = await comparisonPlan(tx, prompt, input.aspectRatio, input.candidates);
  return {
    prompt: imagePromptWithPolicy(prompt),
    aspectRatio: input.aspectRatio,
    currency: plan.items[0]!.price.currency,
    totalMicros: plan.totalMicros,
    candidates: plan.items.map((i) => ({
      provider: i.request.provider,
      model: i.request.model,
      resolution: i.request.resolution,
      quality: i.request.quality,
      maxMicros: i.maxMicros,
      priceVersion: i.price.version,
      priceUnit: i.cap.priceUnit,
      processingLocation: i.cap.processingLocation,
      retention: i.cap.retention,
    })),
  };
}

/**
 * A controlled provider comparison (provider amendment 01): the same screened
 * prompt sent once to each chosen provider setting. Never automatic; the
 * person confirmed the total shown by the quote, which must still hold.
 *
 * - each provider call is its own operation, reserved and settled
 *   independently against the image budget and the per-article cap; the
 *   comparison is created whole or not at all, so it is never unfair by
 *   missing a provider;
 * - results use the "comparison" slot: they go through the same quarantine
 *   and media processing, never replace a featured version, and nothing is
 *   attached until a person approves one through the normal image approval,
 *   which replaces the rest of the comparison;
 * - an unknown outcome holds that provider's result only; nothing is re-sent
 *   or sent to another provider instead.
 */
export async function requestImageComparison(
  tx: Tx,
  input: { itemId: string; expectedVersion: number; prompt?: string | null; aspectRatio: string; candidates: readonly ComparisonCandidate[]; expectedTotalMicros: number; adminId: string; requestKey: string; requestId?: string | null; now?: Date },
): Promise<{ comparisonRunId: string; totalMicros: number; operations: { operationId: string; jobId: string; provider: string; model: string }[]; created: boolean }> {
  const now = input.now ?? new Date();
  const keyFor = (i: number) => operationKey('image', JSON.stringify([input.adminId, input.requestKey, 'comparison', i]));
  const existing = await tx.aIOperation.findUnique({ where: { operationKey: keyFor(0) }, select: { itemId: true, imageJob: { select: { comparisonRunId: true } } } });
  if (existing) {
    const runId = existing.imageJob?.comparisonRunId;
    if (existing.itemId !== input.itemId || !runId) throw new GenerationCommandError('IDEMPOTENCY_MISMATCH', 'This request key was already used for a different request.');
    const jobs = await tx.aIImageJob.findMany({ where: { comparisonRunId: runId }, orderBy: { imageVersion: 'asc' }, select: { id: true, operationId: true, provider: true, model: true, operation: { select: { reservedMicros: true } } } });
    return { comparisonRunId: runId, totalMicros: jobs.reduce((sum, j) => sum + j.operation.reservedMicros, 0), operations: jobs.map((j) => ({ operationId: j.operationId, jobId: j.id, provider: j.provider, model: j.model })), created: false };
  }
  const { control, settings, item, prompt } = await imageRequestGate(tx, input);
  const plan = await comparisonPlan(tx, prompt, input.aspectRatio, input.candidates);
  if (plan.totalMicros !== input.expectedTotalMicros) throw new GenerationCommandError('COST_CHANGED', 'The maximum cost changed since it was shown. Review the new total before confirming.');
  const comparisonRunId = randomUUID();
  const operations = [];
  for (const [i, planned] of plan.items.entries()) {
    const { op, job } = await createImageOperation(tx, { key: keyFor(i), itemId: item.id, controlEpoch: control.epoch, slot: 'comparison', comparisonRunId, request: planned.request, cap: planned.cap, disclosureText: settings.disclosureText, adminId: input.adminId });
    try {
      // Any refusal rolls the whole comparison back: nothing is reserved or sent.
      await reserveBudget(tx, { operationId: op.id, maxMicros: planned.maxMicros, price: planned.price, now, category: 'image' });
    } catch (error) {
      if (error instanceof BudgetRefusal) throw new GenerationCommandError(error.code, `${planned.request.provider} ${planned.request.model}: ${error.message}`);
      throw error;
    }
    await enqueueOperationDelivery(tx, op.id);
    operations.push({ operationId: op.id, jobId: job.id, provider: planned.request.provider, model: planned.request.model });
  }
  await audit(
    tx,
    'ai_content.image.comparison_requested',
    item.id,
    input.adminId,
    { comparisonRunId, candidates: plan.items.map((i) => `${i.request.provider}:${i.request.model}:${i.request.resolution}:${i.request.quality}`).join(',').slice(0, 500), aspectRatio: input.aspectRatio, reservedMicros: plan.totalMicros },
    input.requestId,
  );
  return { comparisonRunId, totalMicros: plan.totalMicros, operations, created: true };
}

export async function loadImageRequest(db: DatabaseClient, operationId: string): Promise<{ request: ImageRequest; phase: string | null; jobId: string }> {
  const op = await db.aIOperation.findUniqueOrThrow({ where: { id: operationId }, select: { requestPayload: true, providerPhase: true, imageJob: { select: { id: true } } } });
  return { request: (op.requestPayload as unknown as { request: ImageRequest }).request, phase: op.providerPhase, jobId: op.imageJob!.id };
}

async function failJob(tx: Tx, operationId: string, code: string) {
  await tx.aIImageJob.updateMany({ where: { operationId, status: { in: ['requested', 'outcome_unknown'] } }, data: { status: 'failed', failureCode: code.slice(0, 64), version: { increment: 1 } } });
}

/**
 * Last check before the paid call, under the lease: live controls win, and
 * the article must still be an unpublished draft in review. Marks the
 * operation "sending" and commits, so a crash from here on is an unknown
 * outcome, never a silent second request.
 */
export async function beginImageSend(db: DatabaseClient, lease: OperationLease): Promise<{ send: true; request: ImageRequest } | { send: false; code: string }> {
  return db.$transaction(async (tx) => {
    const op = await tx.aIOperation.findUniqueOrThrow({ where: { id: lease.operationId }, select: { itemId: true, providerPhase: true, controlEpoch: true, requestPayload: true } });
    const item = await lockItem(tx, op.itemId!);
    await assertLease(tx, lease);
    if (op.providerPhase !== 'prepared') throw new Error(`Operation ${lease.operationId} is ${op.providerPhase}, not ready to send`);
    const control = await readAutomationControl(tx);
    const halt = await paidCallsHalt(tx);
    const post = item.postId ? await tx.post.findUnique({ where: { id: item.postId }, select: { status: true, firstPublishedAt: true } }) : null;
    const refusal = !control.enabled
      ? 'automation_disabled'
      : control.epoch !== op.controlEpoch
        ? 'control_changed'
        : halt.haltedAt
          ? 'paid_calls_halted'
          : !IMAGE_ITEM_STATES.includes(item.status) || !post || post.status !== 'draft' || post.firstPublishedAt
            ? 'article_state_changed'
            : null;
    if (refusal) {
      await releaseReservation(tx, lease.operationId);
      await finishOperation(tx, lease, 'failed', `not_sent:${refusal}`);
      await failJob(tx, lease.operationId, `not_sent:${refusal}`);
      await audit(tx, 'ai_content.image.not_sent', item.id, null, { operationId: lease.operationId, reason: refusal });
      return { send: false as const, code: refusal };
    }
    await tx.aIOperation.update({ where: { id: lease.operationId }, data: { providerPhase: 'sending', sentAt: new Date() } });
    return { send: true as const, request: (op.requestPayload as unknown as { request: ImageRequest }).request };
  });
}

/**
 * The provider definitely did not process the request. Retryable refusals
 * keep the reservation and retry within the cap, never before the provider's
 * requested wait; permanent ones release it and fail the image (the article
 * itself is untouched: images are subordinate to the draft).
 */
export async function recordImageRejected(db: DatabaseClient, lease: OperationLease, input: { errorClass: string; retryable: boolean; retryAfterMs: number }): Promise<'retrying' | 'failed' | 'stale'> {
  const op = await db.aIOperation.findUniqueOrThrow({ where: { id: lease.operationId }, select: { attempts: true, itemId: true } });
  if (input.retryable && op.attempts < MAX_OPERATION_ATTEMPTS) {
    await db.$transaction(async (tx) => {
      await assertLease(tx, lease);
      await tx.aIOperation.update({ where: { id: lease.operationId }, data: { providerPhase: 'prepared', errorClass: input.errorClass.slice(0, 64) } });
    });
    // Exhausted retries fail the image (not the article) inside releaseForRetry, with the reservation kept counted.
    const released = await releaseForRetry(db, lease, input.errorClass, input.retryAfterMs);
    return released === 'stale' ? 'stale' : released === 'retrying' ? 'retrying' : 'failed';
  }
  return db.$transaction(async (tx) => {
    await assertLease(tx, lease);
    await tx.aIOperation.update({ where: { id: lease.operationId }, data: { providerPhase: 'prepared', errorClass: input.errorClass.slice(0, 64) } });
    await releaseReservation(tx, lease.operationId);
    await finishOperation(tx, lease, 'failed', `rejected:${input.errorClass}`);
    await failJob(tx, lease.operationId, input.errorClass);
    await audit(tx, 'ai_content.image.failed', op.itemId, null, { operationId: lease.operationId, errorClass: input.errorClass.slice(0, 64), charged: false });
    return 'failed' as const;
  });
}

/** The request may have been processed but no result can be established: held for an operator, never re-sent. */
export async function recordImageUnknown(db: DatabaseClient, lease: OperationLease, errorClass: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const op = await tx.aIOperation.findUniqueOrThrow({ where: { id: lease.operationId }, select: { itemId: true } });
    await assertLease(tx, lease);
    await tx.aIOperation.updateMany({
      where: { id: lease.operationId, fencingToken: lease.fencingToken },
      data: { state: 'outcome_unknown', leaseOwner: null, leaseUntil: null, errorClass: errorClass.slice(0, 64), resultCode: 'outcome_unknown' },
    });
    await tx.aIImageJob.updateMany({ where: { operationId: lease.operationId, status: 'requested' }, data: { status: 'outcome_unknown', version: { increment: 1 } } });
    await audit(tx, 'ai_content.image.outcome_unknown', op.itemId, null, { operationId: lease.operationId, errorClass: errorClass.slice(0, 64) });
  });
}

/** Reported costs are rounded up from sub-micro units (xAI ticks): at most one micro-unit apart is agreement. */
export const REPORTED_COST_TOLERANCE_MICROS = 1;

/** What every provider result carries, whatever its outcome (provider-neutral; filled by the adapter). */
export interface ImageResultCommon {
  /** Reported usage; null when the provider reports none (per-image billing needs none). */
  usage: ImageUsage | null;
  /** Images the provider returned (and billed, for per-image prices). */
  images: number;
  /** What the provider says it billed (micro-units), where it reports it; checked against the approved price. */
  reportedCostMicros?: number | null;
  /** The model the provider says served the request, where it says. */
  servedModel: string | null;
  providerRequestId: string | null;
  /** A setting the provider reports differently from the request (size, quality...), or null. */
  mismatch: string | null;
  latencyMs: number | null;
}

export type ImageResult =
  | (ImageResultCommon & {
      kind: 'stored';
      objectKey: string;
      mimeType: string;
      bytes: number;
      width: number;
      height: number;
      checksum: string;
    })
  | (ImageResultCommon & { kind: 'unusable'; code: string });

/** True when the provider reports a different model than the approved one (a snapshot of it is the same model). */
export function modelSubstituted(approved: string, served: string | null): boolean {
  return served !== null && served !== approved && !served.startsWith(`${approved}-`);
}

/**
 * Records a paid result under the lease, in one transaction: settles the cost
 * once, then either stores the image as a quarantined MediaAsset (bytes
 * already in the private quarantine bucket under a server key) and queues the
 * existing media processing, or records why the result could not be used.
 * Older images for the slot are superseded, so their approval no longer
 * counts. Nothing is attached to the article: a person decides.
 */
export async function completeImage(db: DatabaseClient, lease: OperationLease, input: ImageResult): Promise<string> {
  let result = input;
  return db.$transaction(async (tx) => {
    const op = await tx.aIOperation.findUniqueOrThrow({ where: { id: lease.operationId }, select: { itemId: true, priceScheduleId: true, imageJob: { select: { id: true, itemId: true, slot: true, imageVersion: true, model: true } } } });
    const job = op.imageJob!;
    await assertLease(tx, lease);
    const priceRow = op.priceScheduleId ? await approvedPriceById(tx, op.priceScheduleId) : null;
    // A result in another size or quality than requested cannot be trusted to match the approved price.
    if (result.mismatch) await haltPaidCalls(tx, `image provider returned ${result.mismatch.slice(0, 120)}`);
    // A different model than approved (for example a retired model silently redirected) is a pricing
    // discrepancy: settlement halts paid calls, and the image is not used (AI-PROVIDER-13).
    const substituted = modelSubstituted(job.model, result.servedModel);
    // What the approved price for the requested configuration says this result costs.
    const expected = result.mismatch || !priceRow ? null : imageCallCostMicros(priceRow, result.usage, result.images);
    // Where the provider states what it billed (xAI), that is the actual cost. It must agree with the approved
    // price (rounding of ticks aside): otherwise the price version is wrong or another configuration was served,
    // so the call settles as uncertain (never below its reservation) and paid calls halt until reconciled.
    const reportedCost = result.reportedCostMicros ?? null;
    const costDiscrepancy =
      reportedCost !== null && priceRow && !result.mismatch && (expected === null || Math.abs(reportedCost - expected) > REPORTED_COST_TOLERANCE_MICROS)
        ? `provider reported cost ${reportedCost} micros, approved price ${priceRow.version} expects ${expected ?? 'unknown'}`
        : null;
    const priced = result.mismatch || !priceRow ? null : (reportedCost ?? expected);
    const cost = await settleOperation(tx, lease.operationId, { usage: imageUsageTokens(result.usage), reportedModel: result.servedModel, reportedServiceTier: null, pricedMicros: priced, discrepancy: costDiscrepancy });
    await tx.aIOperation.update({ where: { id: lease.operationId }, data: { providerPhase: 'done' } });
    await tx.aIImageJob.update({
      where: { id: job.id },
      data: { providerRequestId: result.providerRequestId?.slice(0, 128) ?? null, servedModel: result.servedModel?.slice(0, 64) ?? null, latencyMs: result.latencyMs, reportedCostMicros: reportedCost, version: { increment: 1 } },
    });
    if (substituted && result.kind === 'stored') result = { ...result, kind: 'unusable', code: 'model_substituted' } as ImageResult;

    if (result.kind === 'unusable') {
      await finishOperation(tx, lease, 'failed', `image_unusable:${result.code}`.slice(0, 64));
      await failJob(tx, lease.operationId, result.code);
      await audit(tx, 'ai_content.image.failed', op.itemId, null, { operationId: lease.operationId, jobId: job.id, errorClass: result.code.slice(0, 64), charged: true, costState: cost.state, micros: cost.micros });
      return `image_unusable:${result.code}`;
    }

    const asset = await tx.mediaAsset.create({
      data: {
        sourceName: `ai-image-${job.id}-v${job.imageVersion}.png`,
        mimeType: result.mimeType,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
        checksum: result.checksum,
        objectKey: result.objectKey,
        kind: 'image',
        status: 'quarantined',
      },
      select: { id: true, version: true },
    });
    // The existing media pipeline (same event the upload flow writes) validates and publishes renditions.
    await tx.outboxEvent.create({ data: { type: 'media.uploaded', resourceType: 'media_asset', resourceId: asset.id, resourceVersion: asset.version, payload: { mediaId: asset.id } } });
    // A new featured version replaces earlier featured candidates. A comparison result replaces nothing:
    // it never takes the featured slot, and becomes the image only when a person approves it.
    const superseded =
      job.slot === 'featured'
        ? await tx.aIImageJob.updateMany({
            where: { itemId: job.itemId, slot: 'featured', imageVersion: { lt: job.imageVersion }, status: { in: ['stored', 'approved'] } },
            data: { status: 'superseded', supersededAt: new Date(), version: { increment: 1 } },
          })
        : { count: 0 };
    await tx.aIImageJob.update({ where: { id: job.id }, data: { status: 'stored', mediaAssetId: asset.id, checksum: result.checksum, width: result.width, height: result.height, version: { increment: 1 } } });
    await finishOperation(tx, lease, 'succeeded', 'image:stored');
    await audit(tx, 'ai_content.image.stored', op.itemId, null, { operationId: lease.operationId, jobId: job.id, imageVersion: job.imageVersion, mediaId: asset.id, superseded: superseded.count, costState: cost.state, micros: cost.micros });
    return 'image:stored';
  });
}

async function lockJobArticle(tx: Tx, jobId: string) {
  const job = await tx.aIImageJob.findUnique({ where: { id: jobId }, include: { item: { select: { postId: true } } } });
  if (!job) throw new GenerationCommandError('NOT_FOUND', 'This image does not exist.', 404);
  if (!job.item.postId) throw new GenerationCommandError('NO_ARTICLE', 'This topic has no article.');
  const item = await lockLinkedAiItem(tx, job.item.postId);
  if (!item) throw new GenerationCommandError('NO_ARTICLE', 'This topic has no article.');
  // Re-read under the locks: the job may have been superseded meanwhile.
  const fresh = await tx.aIImageJob.findUniqueOrThrow({ where: { id: jobId } });
  return { job: fresh, item, postId: job.item.postId };
}

/**
 * A person approves the actual generated image, with alt text written from it,
 * and makes it the article's featured image (compare-and-set on the article
 * version they looked at). Bound to the image's checksum, the alt text and the
 * disclosure wording; a newer image supersedes it and any change needs
 * approving again. The article changed materially, so its fact confirmation
 * and approval must be given again before it can publish.
 */
export async function approveImage(tx: Tx, input: { jobId: string; expectedPostVersion: number; altText: string; adminId: string; note?: string | null; requestId?: string | null }) {
  const { job, item, postId } = await lockJobArticle(tx, input.jobId);
  if (job.status !== 'stored' && job.status !== 'approved') throw new GenerationCommandError('INVALID_TRANSITION', job.status === 'superseded' ? 'A newer image replaced this one.' : 'Only a stored image can be approved.');
  if (!IMAGE_ITEM_STATES.includes(item.status)) throw new GenerationCommandError('INVALID_TRANSITION', 'Images can be approved while the article is in review.');
  const asset = job.mediaAssetId ? await tx.mediaAsset.findUnique({ where: { id: job.mediaAssetId }, select: { status: true, kind: true, checksum: true } }) : null;
  if (!asset || asset.kind !== 'image' || asset.status !== 'ready' || asset.checksum !== job.checksum) {
    throw new GenerationCommandError('IMAGE_NOT_READY', asset?.status === 'rejected' ? 'The media pipeline rejected this image.' : 'The image is still being processed.');
  }
  const current = await readPostMaterial(tx, postId);
  if (!current || current.post.version !== input.expectedPostVersion) throw new GenerationCommandError('STALE_VERSION', 'The article changed. Review the latest version first.');
  if (current.post.status !== 'draft' || current.post.firstPublishedAt) throw new GenerationCommandError('POST_NOT_DRAFT', 'A published article is never changed from here.');
  const alt = input.altText.trim();
  const altProblem = altTextProblem(alt, (await featuredBrief(tx, item.id))?.altDraft ?? null);
  if (altProblem) throw new GenerationCommandError('VALIDATION_ERROR', 'Some fields are invalid', 400, { fields: { altText: [altProblem] } });

  const updated = await tx.post.updateMany({
    where: { id: postId, version: input.expectedPostVersion, status: 'draft', firstPublishedAt: null },
    data: { coverMediaId: job.mediaAssetId, coverAlt: alt, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new GenerationCommandError('STALE_VERSION', 'The article changed. Review the latest version first.');
  await recordPostRevision(tx, current.post, `AI image ${job.imageVersion} approved as the featured image`, input.adminId);
  await tx.mediaAsset.update({ where: { id: job.mediaAssetId! }, data: { altText: alt, version: { increment: 1 } } });
  // Exactly one AI image is the approved one: it replaces an image approved earlier, and choosing one
  // comparison result replaces the rest of that comparison (one featured image at most).
  await tx.aIImageJob.updateMany({
    where: {
      itemId: job.itemId,
      id: { not: job.id },
      OR: [{ status: 'approved' }, ...(job.comparisonRunId ? [{ comparisonRunId: job.comparisonRunId, status: 'stored' as const }] : [])],
    },
    data: { status: 'superseded', supersededAt: new Date(), version: { increment: 1 } },
  });
  await tx.aIImageJob.update({
    where: { id: job.id },
    data: {
      status: 'approved',
      approvedByAdminId: input.adminId,
      approvedAt: new Date(),
      approvedChecksum: asset.checksum,
      approvedAltHash: altHash(alt),
      approvedDisclosureHash: job.disclosureHash,
      approvedPostVersion: input.expectedPostVersion + 1,
      reviewNote: input.note?.trim().slice(0, 500) || null,
      version: { increment: 1 },
    },
  });
  // A material change: approvals and fact confirmations of the previous state no longer count.
  const invalidated = await invalidateApprovals(tx, item.id, 'image_approved');
  // Choosing the image is a person's editorial decision about this article (sticky human ownership).
  await tx.aIContentItem.updateMany({ where: { id: item.id, humanModifiedAt: null }, data: { humanModifiedAt: new Date(), humanModifiedByAdminId: input.adminId, version: { increment: 1 } } });
  const fresh = await tx.aIContentItem.findUniqueOrThrow({ where: { id: item.id }, select: { id: true, status: true, version: true } });
  if (fresh.status === 'approved') await moveAiItem(tx, fresh, 'ready_for_review');
  await audit(tx, 'ai_content.image.approved', item.id, input.adminId, { jobId: job.id, imageVersion: job.imageVersion, mediaId: job.mediaAssetId, postId, approvalsInvalidated: invalidated }, input.requestId);
  return { postId, postVersion: input.expectedPostVersion + 1 };
}

/** A person rejects a stored image; it is kept for audit and never used. */
export async function rejectImage(tx: Tx, input: { jobId: string; note: string; adminId: string; requestId?: string | null }) {
  const note = input.note.trim();
  if (note.length < 5) throw new GenerationCommandError('VALIDATION_ERROR', 'Say why the image is rejected.', 400, { fields: { note: ['A note is required'] } });
  const { job, item } = await lockJobArticle(tx, input.jobId);
  if (job.status !== 'stored') throw new GenerationCommandError('INVALID_TRANSITION', 'Only an image awaiting review can be rejected.');
  await tx.aIImageJob.update({ where: { id: job.id }, data: { status: 'rejected', reviewNote: note.slice(0, 500), version: { increment: 1 } } });
  await audit(tx, 'ai_content.image.rejected', item.id, input.adminId, { jobId: job.id, imageVersion: job.imageVersion }, input.requestId);
}
