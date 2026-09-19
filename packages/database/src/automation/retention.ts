import type { DatabaseClient } from '../client.js';
import { Prisma } from '../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

/**
 * Retention of private AI working data (Phase 1G; plan §C "Retention"; owner
 * decision of 19 September 2026: 180 days).
 *
 * Once a topic is finished (published, rejected or cancelled) and the
 * retention period has passed, the bulky private text is removed:
 * provider request payloads, retrieved page text and structured data, the
 * model's draft output, and image prompts. What explains a published fact and
 * what happened is kept permanently: identities and hashes, costs, approvals
 * and fact confirmations, claims with their short evidence excerpts and
 * source links, and the audit trail. Items still in progress are never touched.
 */
export const DEFAULT_RETENTION_DAYS = 180;
const BATCH = 20;
export const PURGED_MARKER = { purged: true } as const;

export async function readRetentionDays(tx: Pick<Tx, 'setting'>): Promise<number> {
  const row = await tx.setting.findUnique({ where: { group_key: { group: 'ai_content', key: 'defaults' } }, select: { data: true } });
  const v = (row?.data as Record<string, unknown> | null)?.aiRetentionDays;
  return typeof v === 'number' && Number.isInteger(v) && v >= 30 && v <= 3650 ? v : DEFAULT_RETENTION_DAYS;
}

/** When a finished item's retention period started, or null while it is still in progress. */
function finishedAt(item: { status: string; updatedAt: Date; post: { firstPublishedAt: Date | null } | null }): Date | null {
  if (item.status === 'published') return item.post?.firstPublishedAt ?? item.updatedAt;
  if (item.status === 'rejected' || item.status === 'cancelled') return item.updatedAt;
  return null;
}

export interface RetentionResult {
  purged: number;
}

/** One retention pass (registered daily task). Bounded, idempotent per item, one transaction per item. */
export async function purgeExpiredAiData(db: DatabaseClient, now = new Date()): Promise<RetentionResult> {
  const days = await db.$transaction((tx) => readRetentionDays(tx));
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const candidates = await db.aIContentItem.findMany({
    where: { privateDataPurgedAt: null, status: { in: ['published', 'rejected', 'cancelled'] }, updatedAt: { lt: cutoff } },
    orderBy: { updatedAt: 'asc' },
    take: BATCH,
    select: { id: true, status: true, updatedAt: true, post: { select: { firstPublishedAt: true } } },
  });
  let purged = 0;
  for (const candidate of candidates) {
    const since = finishedAt(candidate);
    if (!since || since.getTime() >= cutoff.getTime()) continue;
    const done = await db.$transaction(async (tx) => {
      // Re-read under the row lock: the item must still be finished and not yet purged.
      const rows = await tx.$queryRaw<{ status: string; privateDataPurgedAt: Date | null }[]>`SELECT status, privateDataPurgedAt FROM ai_content_items WHERE id = ${candidate.id} FOR UPDATE`;
      const row = rows[0];
      if (!row || row.privateDataPurgedAt || !['published', 'rejected', 'cancelled'].includes(row.status)) return false;
      const packets = await tx.aIResearchPacket.findMany({ where: { itemId: candidate.id }, select: { id: true } });
      const packetIds = packets.map((p) => p.id);
      const [ops, evidence, runs, images] = await Promise.all([
        tx.aIOperation.updateMany({ where: { itemId: candidate.id, NOT: { requestPayload: { equals: Prisma.DbNull } } }, data: { requestPayload: Prisma.DbNull } }),
        packetIds.length ? tx.aISourceEvidence.updateMany({ where: { packetId: { in: packetIds } }, data: { text: null, structuredData: Prisma.DbNull } }) : Promise.resolve({ count: 0 }),
        tx.aIGenerationRun.updateMany({ where: { itemId: candidate.id }, data: { artifact: PURGED_MARKER as unknown as Prisma.InputJsonObject } }),
        tx.aIImageJob.updateMany({ where: { itemId: candidate.id }, data: { prompt: '' } }),
      ]);
      await tx.aIContentItem.update({ where: { id: candidate.id }, data: { privateDataPurgedAt: now } });
      await tx.auditLog.create({
        data: { action: 'ai_content.retention.purged', targetType: 'ai_topic', targetId: candidate.id, metadata: { retentionDays: days, operations: ops.count, evidence: evidence.count, runs: runs.count, images: images.count } },
      });
      return true;
    });
    if (done) purged += 1;
  }
  return { purged };
}
