import { canTransitionAiItem, type AiItemStatus } from '@adelaide-sphere/domain';
import type { Prisma } from '../generated/prisma/client.js';
import { readAutomationControl } from '../automation/control.js';
import { researchFreshnessBlocker } from '../automation/research.js';
import { readPostMaterial } from './material.js';

type Tx = Prisma.TransactionClient;

/**
 * The AI side of every canonical article command (AI plan §B, §D, §H).
 *
 * An article is AI content only through its `ai_content_items.postId` link,
 * which is written in the transaction that creates the article and never
 * afterwards: a human article is never adopted. So an unlocked lookup that
 * finds no link is final, and ordinary articles pay one indexed read.
 *
 * Lock order, everywhere: the Post row, then its AI item, then runs,
 * operations and approvals. Every function here runs inside the caller's
 * transaction and performs no network call.
 */
export interface LinkedAiItem {
  id: string;
  status: AiItemStatus;
  version: number;
  humanModifiedAt: Date | null;
}

export async function lockLinkedAiItem(tx: Tx, postId: string): Promise<LinkedAiItem | null> {
  const link = await tx.aIContentItem.findUnique({ where: { postId }, select: { id: true } });
  if (!link) return null;
  await tx.$queryRaw`SELECT id FROM posts WHERE id = ${postId} FOR UPDATE`;
  const rows = await tx.$queryRaw<{ id: string; status: AiItemStatus; version: number; humanModifiedAt: Date | null }[]>`SELECT id, status, version, humanModifiedAt FROM ai_content_items WHERE id = ${link.id} FOR UPDATE`;
  const row = rows[0];
  return row ? { id: row.id, status: row.status, version: Number(row.version), humanModifiedAt: row.humanModifiedAt } : null;
}

export type PublicationPath = 'manual' | 'scheduled';

export type AiPublicationDecision =
  | { linked: false }
  | { linked: true; item: LinkedAiItem; eligible: boolean; reasons: string[] };

const PUBLISHABLE_FROM: Record<'publish' | 'schedule', readonly AiItemStatus[]> = {
  publish: ['approved', 'scheduled', 'published'],
  schedule: ['approved', 'scheduled'],
};

/**
 * The one AI eligibility policy, applied by the admin publish/schedule
 * commands and by the scheduled publisher, inside the transaction that would
 * change the article (AI-054, AI-094, AI-124, AI-170, AI-172). Fail-closed:
 *
 * - the item must be approved (or already scheduled/published by approval);
 * - a human approval must exist for exactly the article's current material
 *   state; a system decision never counts as human approval (1G adds policy);
 * - the run that produced the content must have passed the fact gate, which
 *   only the research verifier can set;
 * - byline and category must still be active at commit time (F52);
 * - automated (scheduled) publication additionally needs automation enabled:
 *   disabling AI stops automated publication, not a human's own action (F37).
 *
 * Unlinked (ordinary) articles are untouched.
 */
export async function aiPublicationDecision(tx: Tx, input: { postId: string; action: 'publish' | 'schedule'; path: PublicationPath }): Promise<AiPublicationDecision> {
  const item = await lockLinkedAiItem(tx, input.postId);
  if (!item) return { linked: false };
  const reasons: string[] = [];
  if (!PUBLISHABLE_FROM[input.action].includes(item.status)) reasons.push('This AI article has not been approved for publication.');
  const material = await readPostMaterial(tx, input.postId);
  if (!material) return { linked: true, item, eligible: false, reasons: ['The article no longer exists.'] };
  const approval = await currentContentApproval(tx, item.id, input.postId);
  if (!approval || approval.materialHash !== material.hash || approval.adminId === null) {
    reasons.push('An administrator must approve the current version of this AI article.');
  }
  const run = await tx.aIGenerationRun.findFirst({ where: { itemId: item.id, status: 'applied' }, orderBy: { generationVersion: 'desc' }, select: { factCheck: true } });
  if (run?.factCheck !== 'passed') reasons.push('The facts in this AI article have not been verified.');
  // Evidence ages: volatile facts must have been retrieved recently and events must still be upcoming (1C).
  const stale = await researchFreshnessBlocker(tx, item.id, new Date());
  if (stale) reasons.push(stale);
  if (!material.post.author.active) reasons.push('Choose an active author.');
  if (!material.post.category.active) reasons.push('Choose an active category.');
  if (input.path === 'scheduled' && !(await readAutomationControl(tx)).enabled) {
    reasons.push('AI automation is switched off, so scheduled AI articles are held.');
  }
  return { linked: true, item, eligible: reasons.length === 0, reasons };
}

/** The newest content approval that has not been invalidated. */
export function currentContentApproval(tx: Tx, itemId: string, postId: string) {
  return tx.aIApproval.findFirst({
    where: { itemId, postId, kind: 'content', invalidatedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, materialHash: true, adminId: true },
  });
}

/** Stamps every live approval of an item as superseded; decisions themselves are never rewritten. */
export async function invalidateApprovals(tx: Tx, itemId: string, reason: string, keepMaterialHash?: string): Promise<number> {
  const result = await tx.aIApproval.updateMany({
    where: { itemId, invalidatedAt: null, ...(keepMaterialHash ? { materialHash: { not: keepMaterialHash } } : {}) },
    data: { invalidatedAt: new Date(), invalidationReason: reason.slice(0, 64) },
  });
  return result.count;
}

/** Moves an item under its lock with a version increment; refuses anything the SRS table forbids. */
export async function moveAiItem(
  tx: Tx,
  item: { id: string; status: AiItemStatus; version: number },
  to: AiItemStatus,
  extra: Prisma.AIContentItemUncheckedUpdateManyInput = {},
): Promise<boolean> {
  if (item.status === to) return false;
  if (!canTransitionAiItem(item.status, to)) throw new Error(`AI item ${item.id} cannot move from ${item.status} to ${to}`);
  const updated = await tx.aIContentItem.updateMany({
    where: { id: item.id, version: item.version, status: item.status },
    data: { ...extra, status: to, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new Error(`AI item ${item.id} changed during the transaction`);
  return true;
}

export interface TransitionAudit {
  actorAdminId: string | null;
  requestId?: string | null;
}

async function auditItem(tx: Tx, action: string, itemId: string, who: TransitionAudit, metadata: Record<string, string | number | boolean | null>): Promise<void> {
  await tx.auditLog.create({
    data: { action, actorAdminId: who.actorAdminId, targetType: 'ai_topic', targetId: itemId, requestId: who.requestId ?? null, metadata },
  });
}

/**
 * Keeps the item's orchestration status in step with a canonical article
 * transition, in the same transaction (AI-166/167). The item never holds a
 * state its article contradicts.
 */
export async function syncAiItemWithPost(
  tx: Tx,
  item: LinkedAiItem,
  input: { postId: string; action: 'publish' | 'schedule' | 'unpublish' | 'archive' | 'restore' | 'return_to_draft'; fromPostStatus: string; path: PublicationPath },
  who: TransitionAudit,
): Promise<AiItemStatus> {
  let to: AiItemStatus = item.status;
  if (input.action === 'publish') to = 'published';
  else if (input.action === 'schedule') to = 'scheduled';
  else if ((input.action === 'unpublish' || input.action === 'return_to_draft') && input.fromPostStatus === 'scheduled' && item.status === 'scheduled') {
    const material = await readPostMaterial(tx, input.postId);
    const approval = await currentContentApproval(tx, item.id, input.postId);
    to = approval && material && approval.materialHash === material.hash ? 'approved' : 'ready_for_review';
  }
  // A published article stays `published` in the create workflow even after an
  // unpublish or archive: it is ever-published and never rewritten (AI-212).
  if (to === item.status) return item.status;
  await moveAiItem(tx, item, to);
  await auditItem(tx, `ai_content.item.${to}`, item.id, who, { beforeStatus: item.status, status: to, postId: input.postId, path: input.path });
  return to;
}

export interface HumanEditHandle {
  item: LinkedAiItem;
  beforeHash: string;
}

/**
 * Opened before a human saves an AI-linked article: takes the Post and item
 * locks in the standard order and records the material state being replaced.
 * Returns null for ordinary articles.
 */
export async function openAiHumanEdit(tx: Tx, postId: string): Promise<HumanEditHandle | null> {
  const item = await lockLinkedAiItem(tx, postId);
  if (!item) return null;
  const material = await readPostMaterial(tx, postId);
  return material ? { item, beforeHash: material.hash } : null;
}

/**
 * Closed after the save, in the same transaction. A material change marks the
 * item human-modified (sticky: set once, never cleared), invalidates any
 * approval of a different material state, and returns an approved item to
 * review (AI-172, AI-210, AI-214). A save that changed nothing material
 * leaves the item as it was.
 */
export async function closeAiHumanEdit(tx: Tx, handle: HumanEditHandle, postId: string, who: TransitionAudit & { actorAdminId: string }): Promise<void> {
  const material = await readPostMaterial(tx, postId);
  if (!material || material.hash === handle.beforeHash) return;
  const invalidated = await invalidateApprovals(tx, handle.item.id, 'material_edit', material.hash);
  const firstEdit = handle.item.humanModifiedAt === null;
  const to: AiItemStatus = handle.item.status === 'approved' && invalidated > 0 ? 'ready_for_review' : handle.item.status;
  const updated = await tx.aIContentItem.updateMany({
    where: { id: handle.item.id, version: handle.item.version },
    data: {
      ...(firstEdit ? { humanModifiedAt: new Date(), humanModifiedByAdminId: who.actorAdminId } : {}),
      ...(to !== handle.item.status ? { status: to } : {}),
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) throw new Error(`AI item ${handle.item.id} changed during the transaction`);
  await auditItem(tx, 'ai_content.item.human_edited', handle.item.id, who, {
    postId,
    firstEdit,
    approvalsInvalidated: invalidated,
    beforeStatus: handle.item.status,
    status: to,
  });
}
