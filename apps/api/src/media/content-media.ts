import type { Prisma } from '@adelaide-sphere/database';
import { extractMediaIds, type ContentMediaResource } from '@adelaide-sphere/domain';

/**
 * Keeps `content_media_references` in step with a rich text field (SRS MED 004,
 * DAT 003). Called inside the transaction that saves the field, so a body and
 * the record of the images it shows can never disagree.
 *
 * Only images that still exist are recorded. An id in the markup with no asset
 * behind it is an image that was already lost; it is reported by the backfill
 * command rather than silently written as a dangling reference.
 */
export async function syncContentMedia(tx: Prisma.TransactionClient, resourceType: ContentMediaResource, resourceId: string, ...htmls: readonly (string | null | undefined)[]): Promise<{ referenced: string[]; missing: string[] }> {
  const ids = extractMediaIds(...htmls);
  const existing = ids.length > 0 ? new Set((await tx.mediaAsset.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((row) => row.id)) : new Set<string>();
  await tx.contentMediaReference.deleteMany({ where: { resourceType, resourceId } });
  const referenced = ids.filter((id) => existing.has(id));
  if (referenced.length > 0) {
    await tx.contentMediaReference.createMany({ data: referenced.map((mediaId) => ({ resourceType, resourceId, mediaId })), skipDuplicates: true });
  }
  return { referenced, missing: ids.filter((id) => !existing.has(id)) };
}

/** Removes the references of a record that is being deleted. */
export async function clearContentMedia(tx: Prisma.TransactionClient, resourceType: ContentMediaResource, resourceId: string): Promise<void> {
  await tx.contentMediaReference.deleteMany({ where: { resourceType, resourceId } });
}
