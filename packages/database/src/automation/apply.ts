import { createHash } from 'node:crypto';
import { deriveExcerpt, isValidPostSlug, type AiItemStatus } from '@adelaide-sphere/domain';
import type { DatabaseClient } from '../client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { databaseCode, retryTransaction } from '../retry.js';
import { invalidateApprovals, moveAiItem } from '../editorial/ai-publication.js';
import { syncContentMedia } from '../editorial/content-media.js';
import { postMaterialHash, readPostMaterial } from '../editorial/material.js';
import { recordPostRevision } from '../editorial/revisions.js';
import { renderSanitisedBody, toPlainText } from '../editorial/sanitise.js';
import { readAutomationControl } from './control.js';
import { assertLease, finishOperation, releaseForRetry, StaleLeaseError, type OperationLease } from './operations.js';

type Tx = Prisma.TransactionClient;

/**
 * A generated article, mapped onto the existing Post fields only (AI plan §H).
 * Taxonomy and byline are existing record ids; nothing is invented.
 */
export interface ArticleArtifact {
  title: string;
  slug: string;
  excerpt?: string | null;
  bodyMarkdown: string;
  bodyFormat: 'markdown' | 'html';
  authorId: string;
  categoryId: string;
  tagIds: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
}

export const ARTIFACT_LIMITS = { title: 180, slug: 160, excerpt: 500, body: 200_000, seoTitle: 180, seoDescription: 300, seoKeywords: 255, tags: 20, id: 64 } as const;

const text = (value: unknown, max: number, required: boolean): value is string =>
  typeof value === 'string' ? value.length <= max && (!required || value.trim().length > 0) : false;
const optionalText = (value: unknown, max: number) => value === undefined || value === null || text(value, max, false);

/** Structural validation of an artifact against the Post schema; returns field problems. */
export function artifactProblems(value: unknown): string[] {
  const problems: string[] = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return ['artifact'];
  const a = value as Record<string, unknown>;
  if (!text(a.title, ARTIFACT_LIMITS.title, true)) problems.push('title');
  if (!text(a.slug, ARTIFACT_LIMITS.slug, true) || !isValidPostSlug(a.slug)) problems.push('slug');
  if (!optionalText(a.excerpt, ARTIFACT_LIMITS.excerpt)) problems.push('excerpt');
  if (!text(a.bodyMarkdown, ARTIFACT_LIMITS.body, true)) problems.push('bodyMarkdown');
  if (a.bodyFormat !== 'markdown' && a.bodyFormat !== 'html') problems.push('bodyFormat');
  if (!text(a.authorId, ARTIFACT_LIMITS.id, true)) problems.push('authorId');
  if (!text(a.categoryId, ARTIFACT_LIMITS.id, true)) problems.push('categoryId');
  if (!Array.isArray(a.tagIds) || a.tagIds.length > ARTIFACT_LIMITS.tags || !a.tagIds.every((id) => text(id, ARTIFACT_LIMITS.id, true))) problems.push('tagIds');
  if (!optionalText(a.seoTitle, ARTIFACT_LIMITS.seoTitle)) problems.push('seoTitle');
  if (!optionalText(a.seoDescription, ARTIFACT_LIMITS.seoDescription)) problems.push('seoDescription');
  if (!optionalText(a.seoKeywords, ARTIFACT_LIMITS.seoKeywords)) problems.push('seoKeywords');
  return problems;
}

export function artifactHash(artifact: ArticleArtifact): string {
  return createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
}

/** Outcome codes; `proposal:*` keeps the result without touching the article. */
export type ApplyResult =
  | 'applied:created'
  | 'applied:updated'
  | `proposal:${string}`
  | `failed:${string}`
  | `replay:${string}`
  | 'stale_lease'
  | 'retrying'
  | 'exhausted';

interface LockedItem {
  id: string;
  status: AiItemStatus;
  version: number;
  postId: string | null;
  humanModifiedAt: Date | null;
}

async function audit(tx: Tx, action: string, itemId: string, metadata: Record<string, string | number | boolean | null>): Promise<void> {
  await tx.auditLog.create({ data: { action, actorAdminId: null, targetType: 'ai_topic', targetId: itemId, metadata } });
}

async function referenceProblems(tx: Tx, a: ArticleArtifact): Promise<string[]> {
  const tagIds = [...new Set(a.tagIds)];
  const [author, category, tags] = await Promise.all([
    tx.author.findUnique({ where: { id: a.authorId }, select: { active: true } }),
    tx.blogCategory.findUnique({ where: { id: a.categoryId }, select: { active: true } }),
    tagIds.length > 0 ? tx.blogTag.findMany({ where: { id: { in: tagIds } }, select: { id: true, active: true } }) : Promise.resolve([]),
  ]);
  const problems: string[] = [];
  if (!author?.active) problems.push('authorId');
  if (!category?.active) problems.push('categoryId');
  const active = new Set(tags.filter((t) => t.active).map((t) => t.id));
  if (tagIds.some((id) => !active.has(id))) problems.push('tagIds');
  return problems;
}

/**
 * Applies a generation run to its item's one canonical article, under a held
 * lease (AI-055, AI-204, AI-206, AI-207, AI-210, AI-212, AI-287; F02, F18,
 * F19, F22, F24, F25, F37, F39, F42).
 *
 * One transaction, no network call. Lock order: the linked Post, the item,
 * then the operation (lease assertion). Outcomes:
 * - first result: create the Post and link it to the item together; the
 *   unique `postId` makes a second Post for the item impossible;
 * - later result: update the draft only if it is still exactly the version
 *   and material state the run was produced from, never human-modified, never
 *   scheduled or ever published — otherwise the artifact is kept as a
 *   proposal and the article is untouched;
 * - disabled automation or a changed control epoch: proposal, never applied;
 * - a replayed delivery of a finished operation returns its recorded result.
 */
export async function applyOperation(db: DatabaseClient, lease: OperationLease): Promise<ApplyResult> {
  try {
    return await retryTransaction(() => db.$transaction((tx) => applyWithin(tx, lease)));
  } catch (error) {
    if (error instanceof StaleLeaseError) return 'stale_lease';
    // A slug or mapping race rolled the attempt back; retry within the cap.
    const code = databaseCode(error) === 'P2002' ? 'unique_conflict' : 'apply_error';
    const released = await releaseForRetry(db, lease, code);
    return released === 'stale' ? 'stale_lease' : released;
  }
}

async function applyWithin(tx: Tx, lease: OperationLease): Promise<ApplyResult> {
  const op = await tx.aIOperation.findUnique({ where: { id: lease.operationId }, select: { kind: true, itemId: true, runId: true, controlEpoch: true } });
  if (!op || op.kind !== 'apply' || !op.runId || !op.itemId) throw new StaleLeaseError(lease.operationId);
  const peek = await tx.aIContentItem.findUniqueOrThrow({ where: { id: op.itemId }, select: { postId: true } });
  if (peek.postId) await tx.$queryRaw`SELECT id FROM posts WHERE id = ${peek.postId} FOR UPDATE`;
  const rows = await tx.$queryRaw<LockedItem[]>`SELECT id, status, version, postId, humanModifiedAt FROM ai_content_items WHERE id = ${op.itemId} FOR UPDATE`;
  const item = rows[0] ? { ...rows[0], version: Number(rows[0].version) } : undefined;
  // The link is set once; if it appeared since the peek, retry with the right locks.
  if (!item || item.postId !== peek.postId) throw Object.assign(new Error('AI item mapping changed'), { code: 'P2034' });
  await assertLease(tx, lease);

  const run = await tx.aIGenerationRun.findUniqueOrThrow({ where: { id: op.runId } });
  const meta = { runId: run.id, operationId: lease.operationId, generationVersion: run.generationVersion };
  if (run.status !== 'pending') {
    await finishOperation(tx, lease, 'succeeded', `replay:${run.status}`);
    return `replay:${run.status}`;
  }

  const control = await readAutomationControl(tx);
  const current = item.postId ? await readPostMaterial(tx, item.postId) : null;
  let proposal: string | null = null;
  if (!control.enabled) proposal = 'automation_disabled';
  else if (control.epoch !== op.controlEpoch || control.epoch !== run.controlEpoch) proposal = 'control_changed';
  else if (item.status !== 'generating') proposal = 'item_state_changed';
  else if (item.postId) {
    if (!current) proposal = 'post_missing';
    else if (current.post.firstPublishedAt || current.post.status !== 'draft') proposal = 'post_not_draft';
    else if (item.humanModifiedAt) proposal = 'human_modified';
    else if (run.expectedPostVersion !== current.post.version || run.expectedMaterialHash !== current.hash) proposal = 'post_changed';
  } else if (run.expectedPostVersion !== null) proposal = 'post_missing';

  if (proposal) {
    await tx.aIGenerationRun.update({ where: { id: run.id }, data: { status: 'proposal', proposalReason: proposal } });
    // The result is kept; the article (if any) stays as the human left it.
    if (item.status === 'generating') {
      if (item.postId) await moveAiItem(tx, item, 'ready_for_review');
      else await moveAiItem(tx, item, 'failed', { failureStage: 'application', failureCode: proposal });
    }
    await finishOperation(tx, lease, 'succeeded', `proposal:${proposal}`);
    await audit(tx, 'ai_content.run.proposal', item.id, { ...meta, reason: proposal });
    return `proposal:${proposal}`;
  }

  const artifact = run.artifact as unknown as ArticleArtifact;
  const problems = artifactProblems(artifact);
  if (problems.length === 0) problems.push(...(await referenceProblems(tx, artifact)));
  const slugOwner = problems.length === 0 ? await tx.post.findUnique({ where: { slug: artifact.slug }, select: { id: true } }) : null;
  if (slugOwner && slugOwner.id !== item.postId) problems.push('slug_taken');
  if (problems.length > 0) {
    // A permanent validation failure is not retried (AI-276); nothing is written to the article.
    const code = problems.includes('slug_taken') ? 'slug_conflict' : problems.some((p) => ['authorId', 'categoryId', 'tagIds'].includes(p)) ? 'invalid_reference' : 'invalid_artifact';
    await tx.aIGenerationRun.update({ where: { id: run.id }, data: { status: 'failed', proposalReason: code } });
    await moveAiItem(tx, item, 'failed', { failureStage: 'application', failureCode: code });
    await finishOperation(tx, lease, 'failed', `failed:${code}`);
    await audit(tx, 'ai_content.run.failed', item.id, { ...meta, failureCode: code, fields: problems.join(',').slice(0, 200) });
    return `failed:${code}`;
  }

  const sanitizedBody = renderSanitisedBody(artifact.bodyMarkdown, artifact.bodyFormat);
  const plain = toPlainText(sanitizedBody);
  const excerpt = artifact.excerpt?.trim() ? artifact.excerpt : deriveExcerpt(plain);
  const tagIds = [...new Set(artifact.tagIds)];
  const fields = {
    title: artifact.title,
    slug: artifact.slug,
    excerpt,
    bodyMarkdown: artifact.bodyMarkdown,
    bodyFormat: artifact.bodyFormat,
    sanitizedBody,
    searchText: plain,
    authorId: artifact.authorId,
    categoryId: artifact.categoryId,
    seoTitle: artifact.seoTitle ?? null,
    seoDescription: artifact.seoDescription ?? null,
    seoKeywords: artifact.seoKeywords ?? null,
  };

  let postId: string;
  let postVersion: number;
  let created: boolean;
  if (!current) {
    const post = await tx.post.create({ data: { ...fields, tags: { create: tagIds.map((tagId) => ({ tagId })) } }, select: { id: true, version: true } });
    postId = post.id;
    postVersion = post.version;
    created = true;
  } else {
    postId = current.post.id;
    const updated = await tx.post.updateMany({ where: { id: postId, version: current.post.version, status: 'draft', firstPublishedAt: null }, data: { ...fields, version: { increment: 1 } } });
    if (updated.count !== 1) throw Object.assign(new Error('Article changed under lock'), { code: 'P2034' });
    await recordPostRevision(tx, current.post, `AI generation ${run.generationVersion} applied`, null);
    await tx.postTag.deleteMany({ where: { postId } });
    if (tagIds.length > 0) await tx.postTag.createMany({ data: tagIds.map((tagId) => ({ postId, tagId })) });
    postVersion = current.post.version + 1;
    created = false;
  }
  await syncContentMedia(tx, 'post', postId, sanitizedBody);
  const after = await tx.post.findUniqueOrThrow({ where: { id: postId }, include: { tags: { select: { tagId: true } } } });
  const appliedHash = postMaterialHash(after, after.tags.map((t) => t.tagId));
  await tx.aIGenerationRun.update({ where: { id: run.id }, data: { status: 'applied', appliedPostVersion: postVersion, appliedMaterialHash: appliedHash } });
  const invalidated = await invalidateApprovals(tx, item.id, 'regenerated');
  // Only facts a person has confirmed reach review; everything else (screen failures and
  // screened-but-unconfirmed drafts alike) is held in explicit fact review.
  await moveAiItem(tx, item, run.factCheck === 'passed' ? 'ready_for_review' : 'needs_fact_review', { ...(created ? { postId } : {}), failureStage: null, failureCode: null });
  await finishOperation(tx, lease, 'succeeded', created ? 'applied:created' : 'applied:updated');
  await audit(tx, 'ai_content.run.applied', item.id, { ...meta, postId, postVersion, created, approvalsInvalidated: invalidated });
  return created ? 'applied:created' : 'applied:updated';
}
