import { coverageViolations, htmlToPlainText, reviewFlags, type AiItemStatus, type CoverageViolation, type ReviewFlag } from '@adelaide-sphere/domain';
import type { Prisma } from '../generated/prisma/client.js';
import { invalidateApprovals, lockLinkedAiItem, moveAiItem } from '../editorial/ai-publication.js';
import { syncContentMedia } from '../editorial/content-media.js';
import { readPostMaterial } from '../editorial/material.js';
import { recordPostRevision } from '../editorial/revisions.js';
import { renderSanitisedBody, toPlainText } from '../editorial/sanitise.js';
import { artifactProblems, type ArticleArtifact } from './apply.js';
import { AI_CONTROL_ID } from './control.js';
import { GenerationCommandError, verifiedClaims } from './generation.js';
import { configuredLocation } from './novelty.js';
import { enqueueOperationDelivery } from './operations.js';
import { IMAGE_PROVIDER_CAPABILITIES } from './providers.js';

type Tx = Prisma.TransactionClient;

const audit = (tx: Tx, action: string, targetType: string, targetId: string, actorAdminId: string, metadata: Record<string, string | number | boolean | null>, requestId?: string | null) =>
  tx.auditLog.create({ data: { action, actorAdminId, targetType, targetId, requestId: requestId ?? null, metadata } });

/** The newest research packet, which must be verified and current to certify anything. */
async function currentPacket(tx: Tx, itemId: string, now: Date) {
  const packet = await tx.aIResearchPacket.findFirst({ where: { itemId }, orderBy: { version: 'desc' }, select: { id: true, status: true, freshUntil: true, contentHash: true } });
  if (!packet || packet.status !== 'verified' || !packet.contentHash) throw new GenerationCommandError('RESEARCH_NOT_VERIFIED', 'The research for this article is not verified.');
  if (!packet.freshUntil || packet.freshUntil.getTime() <= now.getTime()) throw new GenerationCommandError('RESEARCH_EXPIRED', 'The research evidence has expired; refresh it first.');
  return packet as { id: string; contentHash: string };
}

/**
 * Checks the article as it stands now, whoever wrote it, against the verified
 * packet: every factual value and name in title, summary, SEO fields and body
 * must be supported by verified evidence (a person's edit is held to the same
 * rule as the model's output; plan §G step 7).
 */
export async function postFactReview(tx: Tx, itemId: string, postId: string, packetId: string): Promise<{ violations: CoverageViolation[]; flags: ReviewFlag[] }> {
  const post = await tx.post.findUniqueOrThrow({ where: { id: postId }, include: { category: { select: { name: true } }, tags: { include: { tag: { select: { name: true } } } } } });
  const item = await tx.aIContentItem.findUniqueOrThrow({ where: { id: itemId }, select: { title: true } });
  const [claims, evidence, location, packet] = await Promise.all([
    verifiedClaims(tx, packetId),
    tx.aISourceEvidence.findMany({ where: { packetId, fetchStatus: 'ok' }, select: { title: true } }),
    configuredLocation(tx),
    tx.aIResearchPacket.findUniqueOrThrow({ where: { id: packetId }, select: { context: true } }),
  ]);
  const contextTitles = (Array.isArray(packet.context) ? (packet.context as { title?: string }[]) : []).map((c) => c.title ?? '');
  // Links the draft carries to published Sphere articles are site navigation, not external facts.
  const linkedSlugs = [...post.sanitizedBody.matchAll(/href="\/blog\/([a-z0-9-]+)"/g)].map((m) => m[1]!);
  const linked = linkedSlugs.length ? await tx.post.findMany({ where: { slug: { in: linkedSlugs }, status: 'published' }, select: { title: true } }) : [];
  const names = [item.title, location, post.category.name, ...post.tags.map((t) => t.tag.name), ...contextTitles, ...linked.map((l) => l.title), ...evidence.map((e) => e.title ?? '')].filter(Boolean);
  const blocks = post.sanitizedBody
    .split(/<\/(?:p|h[1-6]|li|blockquote|figcaption|td|th)>/i)
    .map((b) => htmlToPlainText(b))
    .filter(Boolean);
  const units = [
    { field: 'title', text: post.title },
    { field: 'excerpt', text: post.excerpt },
    ...(post.seoTitle ? [{ field: 'seoTitle', text: post.seoTitle }] : []),
    ...(post.seoDescription ? [{ field: 'seoDescription', text: post.seoDescription }] : []),
    ...(post.seoKeywords ?? '').split(',').map((k, i) => ({ field: `seoKeywords.${i}`, text: k.trim() })).filter((u) => u.text),
    ...(post.coverAlt ? [{ field: 'coverAlt', text: post.coverAlt }] : []),
    ...blocks.map((text, i) => ({ field: `body.${i}`, text })),
  ];
  return { violations: coverageViolations(units, { claims, names }), flags: reviewFlags(units, { claims, names }) };
}

/** The screen alone: violations block, but passing it never certifies the facts. */
export async function postCoverage(tx: Tx, itemId: string, postId: string, packetId: string): Promise<CoverageViolation[]> {
  return (await postFactReview(tx, itemId, postId, packetId)).violations;
}

/** The live fact confirmation for exactly this article state and research packet, if a person gave one. */
export async function currentFactConfirmation(tx: Tx, itemId: string, postId: string, materialHash: string, packet: { id: string; contentHash: string }) {
  return tx.aIApproval.findFirst({
    where: { itemId, postId, kind: 'facts', invalidatedAt: null, adminId: { not: null }, materialHash, researchPacketId: packet.id, researchPacketHash: packet.contentHash },
    orderBy: { createdAt: 'desc' },
    select: { id: true, adminId: true, createdAt: true },
  });
}

/**
 * Explicit fact review (review finding P1): a person confirms that every
 * factual statement in the article as it stands says what its verified
 * evidence says, relationships included (which business opens when, which
 * price belongs to what). The automatic coverage check only screens: it must
 * be clean, and any possible names it could not judge are shown to the person,
 * but it never certifies facts on its own. The confirmation is bound to the
 * article version, its material hash and the research packet; any change to
 * either needs a new confirmation.
 */
export async function confirmFacts(tx: Tx, input: { itemId: string; expectedVersion: number; postVersion: number; note: string; adminId: string; requestId?: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const note = input.note.trim();
  if (note.length < 5) throw new GenerationCommandError('VALIDATION_ERROR', 'Record what you checked against the evidence.', 400, { fields: { note: ['A note is required'] } });
  const { item, postId } = await lockPostAndItem(tx, input.itemId);
  if (item.version !== input.expectedVersion) throw new GenerationCommandError('STALE_VERSION', 'This topic changed. Reload it before trying again.');
  if (item.status !== 'needs_fact_review' && item.status !== 'ready_for_review') throw new GenerationCommandError('INVALID_TRANSITION', 'Facts can be confirmed for an article in review.');
  const material = await readPostMaterial(tx, postId);
  if (!material || material.post.version !== input.postVersion) throw new GenerationCommandError('STALE_VERSION', 'The article changed. Check the latest version before confirming.');
  if (material.post.status !== 'draft') throw new GenerationCommandError('INVALID_TRANSITION', 'Only a draft can be fact-checked here.');
  const packet = await currentPacket(tx, item.id, now);
  const review = await postFactReview(tx, item.id, postId, packet.id);
  if (review.violations.length > 0) {
    throw new GenerationCommandError('UNSUPPORTED_FACTS', 'Some facts in the article are not supported by verified evidence. Fix them first.', 409, { violations: review.violations });
  }
  const run = await tx.aIGenerationRun.findFirst({ where: { itemId: item.id, status: 'applied' }, orderBy: { generationVersion: 'desc' }, select: { id: true } });
  await tx.aIApproval.create({
    data: { itemId: item.id, runId: run?.id ?? null, kind: 'facts', postId, postVersion: material.post.version, materialHash: material.hash, adminId: input.adminId, reason: note.slice(0, 500), researchPacketId: packet.id, researchPacketHash: packet.contentHash },
  });
  if (run) await tx.aIGenerationRun.update({ where: { id: run.id }, data: { factCheck: 'passed', coverage: [] } });
  if (item.status === 'needs_fact_review') await moveAiItem(tx, item, 'ready_for_review');
  await audit(tx, 'ai_content.item.facts_confirmed', 'ai_topic', item.id, input.adminId, { postId, postVersion: material.post.version, packetId: packet.id, flags: review.flags.length }, input.requestId);
  return { status: 'ready_for_review' as AiItemStatus, flags: review.flags };
}

async function lockPostAndItem(tx: Tx, itemId: string) {
  const link = await tx.aIContentItem.findUnique({ where: { id: itemId }, select: { postId: true } });
  if (!link) throw new GenerationCommandError('NOT_FOUND', 'This topic does not exist.', 404);
  if (!link.postId) throw new GenerationCommandError('NO_ARTICLE', 'This topic has no article yet.');
  const item = await lockLinkedAiItem(tx, link.postId);
  if (!item) throw new GenerationCommandError('NO_ARTICLE', 'This topic has no article yet.');
  return { item, postId: link.postId };
}

/**
 * Human approval (AI-171/172): attributable, and bound to the exact article
 * version and material, the exact research packet and its content hash, and
 * a fact check of the article as it now stands. Approval does not publish:
 * publishing stays a separate, separately permitted action.
 */
export async function approveContent(tx: Tx, input: { itemId: string; expectedVersion: number; postVersion: number; adminId: string; note?: string | null; requestId?: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const { item, postId } = await lockPostAndItem(tx, input.itemId);
  if (item.version !== input.expectedVersion) throw new GenerationCommandError('STALE_VERSION', 'This topic changed. Reload it before trying again.');
  if (item.status !== 'ready_for_review') throw new GenerationCommandError('INVALID_TRANSITION', 'Only an article that is ready for review can be approved.');
  const material = await readPostMaterial(tx, postId);
  if (!material || material.post.version !== input.postVersion) throw new GenerationCommandError('STALE_VERSION', 'The article changed. Review the latest version before approving.');
  if (material.post.status !== 'draft') throw new GenerationCommandError('INVALID_TRANSITION', 'Only a draft can be approved.');
  if (!material.post.author.active || !material.post.category.active) throw new GenerationCommandError('INACTIVE_REFERENCE', 'The article needs an active author and category.');
  const packet = await currentPacket(tx, item.id, now);
  const violations = await postCoverage(tx, item.id, postId, packet.id);
  if (violations.length > 0) {
    throw new GenerationCommandError('UNSUPPORTED_FACTS', 'Some facts in the article are not supported by verified evidence.', 409, { violations });
  }
  if (!(await currentFactConfirmation(tx, item.id, postId, material.hash, packet))) {
    throw new GenerationCommandError('FACTS_NOT_CONFIRMED', 'A person must confirm the facts of this exact version against the evidence before it can be approved.');
  }
  const run = await tx.aIGenerationRun.findFirst({ where: { itemId: item.id, status: 'applied' }, orderBy: { generationVersion: 'desc' }, select: { id: true } });
  await tx.aIApproval.create({
    data: { itemId: item.id, runId: run?.id ?? null, kind: 'content', postId, postVersion: material.post.version, materialHash: material.hash, adminId: input.adminId, reason: input.note?.slice(0, 500) ?? null, researchPacketId: packet.id, researchPacketHash: packet.contentHash },
  });
  await moveAiItem(tx, item, 'approved');
  await audit(tx, 'ai_content.item.approved', 'ai_topic', item.id, input.adminId, { postId, postVersion: material.post.version, packetId: packet.id }, input.requestId);
  return { postId, postVersion: material.post.version };
}

/**
 * Re-runs the automatic screen on the article as it stands (after a person
 * fixed something). It reports violations and possible names; it never moves
 * an article to ready for review — only a person's fact confirmation does.
 */
export async function recheckFacts(tx: Tx, input: { itemId: string; expectedVersion: number; adminId: string; requestId?: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const { item, postId } = await lockPostAndItem(tx, input.itemId);
  if (item.version !== input.expectedVersion) throw new GenerationCommandError('STALE_VERSION', 'This topic changed. Reload it before trying again.');
  if (item.status !== 'needs_fact_review' && item.status !== 'ready_for_review') throw new GenerationCommandError('INVALID_TRANSITION', 'Facts can be re-checked for an article in review.');
  const packet = await currentPacket(tx, item.id, now);
  const { violations, flags } = await postFactReview(tx, item.id, postId, packet.id);
  const material = await readPostMaterial(tx, postId);
  const confirmed = violations.length === 0 && material ? Boolean(await currentFactConfirmation(tx, item.id, postId, material.hash, packet)) : false;
  const run = await tx.aIGenerationRun.findFirst({ where: { itemId: item.id, status: 'applied' }, orderBy: { generationVersion: 'desc' }, select: { id: true } });
  if (run) await tx.aIGenerationRun.update({ where: { id: run.id }, data: { factCheck: violations.length > 0 ? 'failed' : confirmed ? 'passed' : 'pending', coverage: violations as unknown as Prisma.InputJsonArray } });
  await audit(tx, 'ai_content.item.facts_rechecked', 'ai_topic', item.id, input.adminId, { violations: violations.length, flags: flags.length, confirmed }, input.requestId);
  return { status: item.status, violations, flags, confirmed };
}

/**
 * A person applies a kept proposal (a stale regeneration or title/SEO
 * suggestions) to the article they are looking at: compare-and-set on the
 * article version, a revision of what is replaced, approvals invalidated, and
 * a fresh fact check deciding review versus fact review (AI-211, AI-214).
 */
export async function applyProposal(tx: Tx, input: { runId: string; expectedPostVersion: number; adminId: string; requestId?: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const run = await tx.aIGenerationRun.findUnique({ where: { id: input.runId }, select: { id: true, itemId: true, status: true, scope: true, artifact: true, generationVersion: true } });
  if (!run) throw new GenerationCommandError('NOT_FOUND', 'This proposal does not exist.', 404);
  const { item, postId } = await lockPostAndItem(tx, run.itemId);
  if (run.status !== 'proposal') throw new GenerationCommandError('INVALID_TRANSITION', 'Only a kept proposal can be applied.');
  if (item.status !== 'ready_for_review' && item.status !== 'needs_fact_review') throw new GenerationCommandError('INVALID_TRANSITION', 'Proposals can be applied while the article is in review.');
  const current = await readPostMaterial(tx, postId);
  if (!current || current.post.version !== input.expectedPostVersion) throw new GenerationCommandError('STALE_VERSION', 'The article changed. Compare the proposal with the latest version first.');
  if (current.post.firstPublishedAt || current.post.status !== 'draft') throw new GenerationCommandError('POST_NOT_DRAFT', 'A published article is never rewritten from a proposal.');
  const a = run.artifact as Record<string, unknown>;
  const data: Prisma.PostUncheckedUpdateManyInput = { version: { increment: 1 } };
  if (run.scope === 'metadata') {
    Object.assign(data, { title: String(a.title).slice(0, 180), excerpt: String(a.excerpt).slice(0, 500), seoTitle: String(a.seoTitle).slice(0, 180), seoDescription: String(a.seoDescription).slice(0, 300), seoKeywords: (Array.isArray(a.seoKeywords) ? (a.seoKeywords as string[]).join(', ') : '').slice(0, 255) || null });
  } else {
    const artifact = a as unknown as ArticleArtifact;
    if (artifactProblems(artifact).length > 0) throw new GenerationCommandError('INVALID_PROPOSAL', 'This proposal cannot be applied to an article.');
    const sanitizedBody = renderSanitisedBody(artifact.bodyMarkdown, artifact.bodyFormat);
    Object.assign(data, { title: artifact.title, excerpt: artifact.excerpt ?? current.post.excerpt, bodyMarkdown: artifact.bodyMarkdown, bodyFormat: artifact.bodyFormat, sanitizedBody, searchText: toPlainText(sanitizedBody), seoTitle: artifact.seoTitle ?? null, seoDescription: artifact.seoDescription ?? null, seoKeywords: artifact.seoKeywords ?? null });
  }
  const updated = await tx.post.updateMany({ where: { id: postId, version: input.expectedPostVersion, status: 'draft', firstPublishedAt: null }, data });
  if (updated.count !== 1) throw new GenerationCommandError('STALE_VERSION', 'The article changed. Compare the proposal with the latest version first.');
  await recordPostRevision(tx, current.post, `AI proposal ${run.generationVersion} applied`, input.adminId);
  if (typeof data.sanitizedBody === 'string') await syncContentMedia(tx, 'post', postId, data.sanitizedBody);
  const after = await readPostMaterial(tx, postId);
  await tx.aIGenerationRun.update({ where: { id: run.id }, data: { status: 'applied', appliedPostVersion: after!.post.version, appliedMaterialHash: after!.hash } });
  const invalidated = await invalidateApprovals(tx, item.id, 'proposal_applied');
  const packet = await currentPacket(tx, item.id, now).catch(() => null);
  const violations = packet ? await postCoverage(tx, item.id, postId, packet.id) : [{ field: 'research', token: 'packet', reason: 'unsupported_value' as const }];
  // The applied text has not been confirmed by anyone yet (the previous confirmation was just
  // invalidated), so it is never "passed"; the item stays in review until a person confirms.
  await tx.aIGenerationRun.update({ where: { id: run.id }, data: { factCheck: violations.length === 0 ? 'pending' : 'failed', coverage: violations as unknown as Prisma.InputJsonArray } });
  const fresh = await lockLinkedAiItem(tx, postId);
  const to: AiItemStatus = fresh?.status ?? item.status;
  await audit(tx, 'ai_content.run.proposal_applied', 'ai_topic', item.id, input.adminId, { runId: run.id, scope: run.scope, approvalsInvalidated: invalidated, violations: violations.length }, input.requestId);
  return { status: to, violations };
}

/**
 * Operator resolution of a generation whose outcome is unknown (plan §E, F21).
 * "reconcile" asks the worker to look the result up again (only possible when
 * the provider gave a response id); "abandon" records the whole reservation as
 * spent (the provider may have charged) and releases the topic. Neither
 * re-sends the request; a new generation is a new, separately budgeted request.
 */
export async function resolveUnknownOperation(tx: Tx, input: { operationId: string; action: 'reconcile' | 'abandon'; note: string; adminId: string; requestId?: string | null }) {
  const note = input.note.trim();
  if (note.length < 5) throw new GenerationCommandError('VALIDATION_ERROR', 'Record what you checked and why.', 400, { fields: { note: ['A note is required'] } });
  // Lock the operation row first: two operators (or a reconcile and an abandon)
  // resolving at once serialise here, and the second sees the first's outcome.
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ai_operations WHERE id = ${input.operationId} FOR UPDATE`;
  if (locked.length === 0) throw new GenerationCommandError('NOT_FOUND', 'This operation does not exist.', 404);
  const op = await tx.aIOperation.findUniqueOrThrow({ where: { id: input.operationId }, select: { id: true, kind: true, state: true, itemId: true, providerResponseId: true, costState: true, reservedMicros: true, dayBucketId: true, monthBucketId: true } });
  if (op.kind !== 'generate' && op.kind !== 'image') throw new GenerationCommandError('NOT_FOUND', 'This operation does not exist.', 404);
  if (op.state !== 'outcome_unknown') throw new GenerationCommandError('INVALID_TRANSITION', 'Only an operation with an unknown outcome needs resolving.');
  const leaveUnknown = async (data: Prisma.AIOperationUpdateManyMutationInput) => {
    // State-conditional as well as locked: exactly one resolution ever leaves outcome_unknown.
    const moved = await tx.aIOperation.updateMany({ where: { id: op.id, state: 'outcome_unknown' }, data });
    if (moved.count !== 1) throw new GenerationCommandError('INVALID_TRANSITION', 'This operation was resolved by someone else.');
  };
  if (input.action === 'reconcile') {
    if (!op.providerResponseId) throw new GenerationCommandError('NOT_RECONCILABLE', 'The provider never returned an id for this request, so it cannot be looked up. Abandon it with a note.');
    // Back to pending in the "sent" phase: the worker retrieves by id and never sends again.
    // The reservation stays counted; the worker settles it once when the result is read.
    await leaveUnknown({ state: 'pending', providerPhase: 'sent', attempts: 0, nextAttemptAt: new Date(), resolutionNote: note.slice(0, 500) });
    await enqueueOperationDelivery(tx, op.id);
  } else {
    await leaveUnknown({ state: 'failed', resultCode: 'abandoned', providerPhase: 'done', resolutionNote: note.slice(0, 500) });
    // Settle once: only a reservation still held moves to spent, conditionally on its cost state.
    const settled = await tx.aIOperation.updateMany({ where: { id: op.id, costState: 'reserved' }, data: { costState: 'uncertain', settledMicros: op.reservedMicros } });
    if (settled.count === 1) {
      await tx.$executeRaw`UPDATE ai_budget_buckets SET reservedMicros = reservedMicros - ${op.reservedMicros}, settledMicros = settledMicros + ${op.reservedMicros}, version = version + 1, updatedAt = UTC_TIMESTAMP(3) WHERE id IN (${op.dayBucketId}, ${op.monthBucketId})`;
    }
    // An abandoned image fails that image only; the article is untouched.
    if (op.kind === 'image') await tx.aIImageJob.updateMany({ where: { operationId: op.id, status: { in: ['requested', 'outcome_unknown'] } }, data: { status: 'failed', failureCode: 'outcome_abandoned', version: { increment: 1 } } });
    const item = op.itemId && op.kind === 'generate' ? await tx.$queryRaw<{ id: string; status: AiItemStatus; version: number; postId: string | null }[]>`SELECT id, status, version, postId FROM ai_content_items WHERE id = ${op.itemId} FOR UPDATE` : [];
    const it = item[0];
    if (it && it.status === 'generating') {
      const current = { id: it.id, status: it.status, version: Number(it.version) };
      if (it.postId) await moveAiItem(tx, current, 'ready_for_review');
      else await moveAiItem(tx, current, 'failed', { failureStage: 'generation', failureCode: 'outcome_abandoned' });
    }
  }
  await audit(tx, `ai_content.generation.${input.action === 'reconcile' ? 'reconcile_requested' : 'abandoned'}`, 'ai_operation', op.id, input.adminId, { itemId: op.itemId, hadResponseId: Boolean(op.providerResponseId) }, input.requestId);
}

/** An administrator reconciled a pricing or usage discrepancy and allows paid calls again. */
export async function resumePaidCalls(tx: Tx, input: { adminId: string; note: string; requestId?: string | null }) {
  const note = input.note.trim();
  if (note.length < 5) throw new GenerationCommandError('VALIDATION_ERROR', 'Record how the discrepancy was reconciled.', 400, { fields: { note: ['A note is required'] } });
  const rows = await tx.$queryRaw<{ paidCallsHaltedAt: Date | null; paidHaltReason: string | null }[]>`SELECT paidCallsHaltedAt, paidHaltReason FROM ai_automation_controls WHERE id = ${AI_CONTROL_ID} FOR UPDATE`;
  if (!rows[0]?.paidCallsHaltedAt) throw new GenerationCommandError('INVALID_TRANSITION', 'Paid calls are not halted.');
  await tx.$executeRaw`UPDATE ai_automation_controls SET paidCallsHaltedAt = NULL, paidHaltReason = NULL, updatedAt = UTC_TIMESTAMP(3) WHERE id = ${AI_CONTROL_ID}`;
  await audit(tx, 'ai_content.budget.resumed', 'ai_control', AI_CONTROL_ID, input.adminId, { previousReason: (rows[0].paidHaltReason ?? '').slice(0, 200) }, input.requestId);
}

export interface PriceInput {
  version: string;
  provider: string;
  model: string;
  currency: string;
  inputMicrosPerMTok: number;
  cachedInputMicrosPerMTok: number;
  outputMicrosPerMTok: number;
  longContextThresholdTokens: number;
  /** Image models only: the size and quality covered and the approved per-image output-token bound. */
  imageSize?: string | null;
  imageQuality?: string | null;
  maxOutputTokens?: number | null;
  sourceUrl: string;
  effectiveFrom: Date;
}

/** A proposed price version; it prices nothing until approved. */
export async function proposePrice(tx: Tx, input: PriceInput & { adminId: string; requestId?: string | null }) {
  // An image price must say exactly what it covers and bound one image's output; a text price must not.
  const image = IMAGE_PROVIDER_CAPABILITIES[input.provider]?.[input.model];
  const fields: Record<string, string[]> = {};
  if (image) {
    if (!input.imageSize || !image.sizes.includes(input.imageSize)) fields.imageSize = [`Choose one of ${image.sizes.join(', ')}`];
    if (!input.imageQuality || !image.qualities.includes(input.imageQuality)) fields.imageQuality = [`Choose one of ${image.qualities.join(', ')}`];
    if (!Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens! < 1 || input.maxOutputTokens! > 100_000) fields.maxOutputTokens = ['Enter the most output tokens one image at this size and quality can use (1–100,000)'];
  } else if (input.imageSize || input.imageQuality || input.maxOutputTokens) {
    fields.imageSize = ['Image fields apply only to image models'];
  }
  if (Object.keys(fields).length > 0) throw new GenerationCommandError('VALIDATION_ERROR', 'Some fields are invalid', 400, { fields });
  const row = await tx.aIPriceSchedule.create({
    data: {
      version: input.version,
      provider: input.provider,
      model: input.model,
      currency: input.currency,
      inputMicrosPerMTok: input.inputMicrosPerMTok,
      cachedInputMicrosPerMTok: input.cachedInputMicrosPerMTok,
      outputMicrosPerMTok: input.outputMicrosPerMTok,
      longContextThresholdTokens: input.longContextThresholdTokens,
      imageSize: image ? input.imageSize! : null,
      imageQuality: image ? input.imageQuality! : null,
      maxOutputTokens: image ? input.maxOutputTokens! : null,
      sourceUrl: input.sourceUrl,
      effectiveFrom: input.effectiveFrom,
      createdByAdminId: input.adminId,
    },
  });
  await audit(tx, 'ai_content.price.proposed', 'ai_price', row.id, input.adminId, { version: row.version, model: row.model }, input.requestId);
  return row;
}

/**
 * Approves a price version for its provider model; any previously approved
 * version for that model is retired in the same transaction, so exactly one
 * price is ever approved per model. Approved versions are never edited.
 */
export async function approvePrice(tx: Tx, input: { priceId: string; adminId: string; requestId?: string | null }) {
  const row = await tx.aIPriceSchedule.findUnique({ where: { id: input.priceId } });
  if (!row) throw new GenerationCommandError('NOT_FOUND', 'This price does not exist.', 404);
  if (row.status !== 'proposed') throw new GenerationCommandError('INVALID_TRANSITION', 'Only a proposed price can be approved.');
  await tx.$queryRaw`SELECT id FROM ai_price_schedules WHERE provider = ${row.provider} AND model = ${row.model} FOR UPDATE`;
  // Retires the previous approved version for the same model (and, for images, the same size and quality).
  await tx.aIPriceSchedule.updateMany({ where: { provider: row.provider, model: row.model, imageSize: row.imageSize, imageQuality: row.imageQuality, status: 'approved' }, data: { status: 'retired' } });
  await tx.aIPriceSchedule.update({ where: { id: row.id }, data: { status: 'approved', approvedByAdminId: input.adminId, approvedAt: new Date() } });
  await audit(tx, 'ai_content.price.approved', 'ai_price', row.id, input.adminId, { version: row.version, model: row.model, currency: row.currency, inputMicrosPerMTok: row.inputMicrosPerMTok, outputMicrosPerMTok: row.outputMicrosPerMTok, imageSize: row.imageSize, imageQuality: row.imageQuality, maxOutputTokens: row.maxOutputTokens }, input.requestId);
  return tx.aIPriceSchedule.findUniqueOrThrow({ where: { id: row.id } });
}
