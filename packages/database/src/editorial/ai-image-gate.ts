import { createHash } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

export const altHash = (alt: string) => createHash('sha256').update(alt.trim()).digest('hex');

/** Whether AI articles need a featured image to publish (owner decision: yes, by default). */
export async function featuredImageRequired(tx: Pick<Tx, 'setting'>): Promise<boolean> {
  const setting = await tx.setting.findUnique({ where: { group_key: { group: 'ai_content', key: 'defaults' } }, select: { data: true } });
  return (setting?.data as Record<string, unknown> | null)?.featuredImageRequired !== false;
}

/**
 * The image part of the AI publication policy (Phase 1E), evaluated inside
 * the committing transaction by both publication paths:
 *
 * - when required, the article has a featured image; any featured or share
 *   image is a ready image in the media pipeline, never a pending upload or a
 *   provider URL, and the featured image has alt text;
 * - an AI-generated image counts only with a person's approval bound to the
 *   exact bytes (checksum), the alt text now on the article and the recorded
 *   disclosure. A regeneration supersedes it; any change to the image or its
 *   alt text needs approving again. An uploaded or library image needs no AI
 *   approval: the existing media and rights rules apply to it.
 */
export async function imagePublicationReasons(
  tx: Tx,
  post: { coverMediaId: string | null; coverAlt: string | null; ogImageMediaId: string | null },
): Promise<string[]> {
  const reasons: string[] = [];
  if (!post.coverMediaId) {
    if (await featuredImageRequired(tx)) reasons.push('Add a featured image. It can be uploaded, chosen from the library, or generated and approved.');
    return reasons;
  }
  const check = async (mediaId: string, alt: string | null, role: 'featured' | 'share') => {
    const asset = await tx.mediaAsset.findUnique({ where: { id: mediaId }, select: { kind: true, status: true, checksum: true, altText: true } });
    if (!asset || asset.kind !== 'image' || asset.status !== 'ready') {
      reasons.push(`The ${role} image is not ready. Wait for processing or choose another image.`);
      return;
    }
    const effectiveAlt = (alt ?? asset.altText ?? '').trim();
    if (role === 'featured' && !effectiveAlt) reasons.push('Add alt text to the featured image.');
    const job = await tx.aIImageJob.findUnique({ where: { mediaAssetId: mediaId }, select: { status: true, approvedChecksum: true, approvedAltHash: true, approvedDisclosureHash: true, disclosureHash: true } });
    if (!job) return;
    const approved =
      job.status === 'approved' &&
      job.approvedChecksum !== null &&
      job.approvedChecksum === asset.checksum &&
      job.approvedDisclosureHash === job.disclosureHash &&
      (role === 'share' || job.approvedAltHash === altHash(effectiveAlt));
    if (!approved) reasons.push(`A person must approve the AI-generated ${role} image${role === 'featured' ? ' and its alt text' : ''} before it is published.`);
  };
  await check(post.coverMediaId, post.coverAlt, 'featured');
  if (post.ogImageMediaId && post.ogImageMediaId !== post.coverMediaId) await check(post.ogImageMediaId, null, 'share');
  return reasons;
}

/** The disclosure shown under an approved AI featured image, or null for any other image. */
export async function coverImageDisclosure(tx: Pick<Tx, 'aIImageJob'>, coverMediaId: string | null): Promise<string | null> {
  if (!coverMediaId) return null;
  const job = await tx.aIImageJob.findUnique({ where: { mediaAssetId: coverMediaId }, select: { status: true, disclosureText: true } });
  return job?.status === 'approved' ? job.disclosureText : null;
}
