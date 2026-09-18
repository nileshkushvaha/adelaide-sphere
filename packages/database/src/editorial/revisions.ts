import type { Prisma } from '../generated/prisma/client.js';

/** Revisions kept per article (SRS BLOG 003). */
export const MAX_POST_REVISIONS = 50;

export interface RevisionSource {
  id: string;
  version: number;
  sanitizedBody: string;
  bodyMarkdown: string;
  bodyFormat: 'markdown' | 'html';
  excerpt: string;
  title: string;
}

/**
 * Snapshots the article as it stands before a change, and keeps the newest
 * MAX_POST_REVISIONS. A null actor is a system change (an applied AI run),
 * never a fabricated administrator.
 */
export async function recordPostRevision(tx: Prisma.TransactionClient, current: RevisionSource, reason: string | null, actorAdminId: string | null): Promise<void> {
  await tx.contentRevision.create({
    data: {
      resourceType: 'post',
      resourceId: current.id,
      version: current.version,
      sanitizedSnapshot: current.sanitizedBody,
      bodySource: current.bodyMarkdown,
      bodyFormat: current.bodyFormat,
      excerpt: current.excerpt,
      title: current.title,
      reason,
      actorAdminId,
    },
  });
  const surplus = await tx.contentRevision.findMany({ where: { resourceType: 'post', resourceId: current.id }, orderBy: { version: 'desc' }, skip: MAX_POST_REVISIONS, select: { id: true } });
  if (surplus.length > 0) await tx.contentRevision.deleteMany({ where: { id: { in: surplus.map((row) => row.id) } } });
}
