import sharp from 'sharp';
import { extensionForMime, objectKeyFor, VARIANT_KINDS, VARIANT_MIME, variantDimensions, type VariantKind } from '@adelaide-sphere/domain';
import type { DatabaseClient } from '@adelaide-sphere/database';

export interface MediaJobData {
  eventId: string;
  mediaId: string;
}

export interface StorageAdapter {
  getBytes(bucket: 'quarantine' | 'public', key: string): Promise<Buffer>;
  put(bucket: 'quarantine' | 'public', key: string, body: Buffer, contentType: string): Promise<void>;
  delete(bucket: 'quarantine' | 'public', key: string): Promise<void>;
}

export interface MediaProcessingDeps {
  db: DatabaseClient;
  storage: StorageAdapter;
  randomKey: () => string;
  now?: () => Date;
  /** Receives the underlying error for the operator's log; the stored reason never carries it. */
  onError?: (assetId: string, error: unknown) => void;
}

export type ProcessingOutcome = 'ready' | 'rejected' | 'skipped';

/**
 * Generates the published renditions (SRS MED 001–003). Every variant is
 * re-encoded to WebP, which drops EXIF (including location) with the original
 * container, and nothing is written to the public bucket until every variant
 * succeeds — a failure leaves the asset quarantined and rejected, never
 * half-published.
 */
export async function processMediaAsset(data: MediaJobData, deps: MediaProcessingDeps): Promise<ProcessingOutcome> {
  const now = deps.now ?? (() => new Date());
  const asset = await deps.db.mediaAsset.findUnique({ where: { id: data.mediaId }, include: { variants: true } });
  if (!asset) return 'skipped';
  // A PDF is checked and published by the API when its upload completes (change log 1.16); it has no renditions to make.
  if (asset.kind === 'document') return 'skipped';
  // Repeat delivery of the same event must not reprocess a finished asset (SRS EVT 002).
  if (asset.status !== 'quarantined') return 'skipped';

  let original: Buffer;
  try {
    original = await deps.storage.getBytes('quarantine', asset.objectKey);
  } catch {
    await reject(deps, asset.id, 'The uploaded file could not be read for processing');
    return 'rejected';
  }


  try {
    const image = sharp(original, { failOn: 'error' });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) throw new Error('The image could not be decoded');
    if ((metadata.pages ?? 1) > 1) throw new Error('Animated images are not accepted');

    const produced: { kind: VariantKind; key: string; width: number; height: number; bytes: number }[] = [];
    for (const kind of VARIANT_KINDS) {
      const size = variantDimensions(kind, metadata.width, metadata.height);
      const body = await sharp(original, { failOn: 'error' })
        .rotate() // applies EXIF orientation, then discards the metadata below
        .resize({ width: size.width, height: size.height, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const key = objectKeyFor('media', asset.id, extensionForMime(VARIANT_MIME), deps.randomKey());
      await deps.storage.put('public', key, body, VARIANT_MIME);
      produced.push({ kind, key, width: size.width, height: size.height, bytes: body.byteLength });
    }

    await deps.db.$transaction(async (tx) => {
      await tx.mediaVariant.deleteMany({ where: { assetId: asset.id } });
      await tx.mediaVariant.createMany({
        data: produced.map((variant) => ({ assetId: asset.id, kind: variant.kind, objectKey: variant.key, mimeType: VARIANT_MIME, width: variant.width, height: variant.height, bytes: variant.bytes })),
      });
      await tx.mediaAsset.update({ where: { id: asset.id }, data: { status: 'ready', readyAt: now(), width: metadata.width, height: metadata.height, rejectionReason: null, version: { increment: 1 } } });
    });
    return 'ready';
  } catch (error) {
    // The library or storage message can name buckets and keys; administrators
    // see a sentence they can act on, and the detail goes to the log.
    deps.onError?.(asset.id, error);
    await reject(deps, asset.id, 'The image could not be processed. Try uploading it again, or use a different JPEG, PNG or WebP file.');
    return 'rejected';
  }
}

async function reject(deps: MediaProcessingDeps, assetId: string, reason: string): Promise<void> {
  const variants = await deps.db.mediaVariant.findMany({ where: { assetId }, select: { objectKey: true } });
  for (const variant of variants) await deps.storage.delete('public', variant.objectKey).catch(() => undefined);
  await deps.db.mediaVariant.deleteMany({ where: { assetId } });
  await deps.db.mediaAsset.update({ where: { id: assetId }, data: { status: 'rejected', rejectionReason: reason, version: { increment: 1 } } });
}
