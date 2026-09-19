import { createHash, randomBytes } from 'node:crypto';
import sharp from 'sharp';
import type { DatabaseClient } from '@adelaide-sphere/database';
import { beginImageSend, completeImage, extendLease, loadImageRequest, recordImageRejected, recordImageUnknown, type OperationLease } from '@adelaide-sphere/database/automation';
import { extensionForMime, imageRejectionReason, objectKeyFor } from '@adelaide-sphere/domain';
import type { StorageAdapter } from '../media-processing.js';
import type { ImageProvider } from './image-provider.js';

export interface ImageDeps {
  /** Configured image providers by id; one without a server-side credential is simply absent. */
  imageProviders?: Record<string, ImageProvider>;
  /** The media storage boundary (private quarantine bucket). */
  storage?: StorageAdapter;
  randomKey?: () => string;
  /** How often the lease is extended while the provider works. */
  heartbeatMs?: number;
}

const FORMAT_MIME: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

/** Reads what the bytes really are, with the same limits as an upload (SRS MED 001). */
async function inspect(bytes: Buffer): Promise<{ mime: string; width: number; height: number } | { problem: string }> {
  try {
    const meta = await sharp(bytes, { failOn: 'error' }).metadata();
    const mime = meta.format ? (FORMAT_MIME[meta.format] ?? null) : null;
    const reason = imageRejectionReason({ detectedMime: mime, width: meta.width ?? null, height: meta.height ?? null, animated: (meta.pages ?? 1) > 1, bytes: bytes.byteLength }, mime ?? 'image/png');
    if (reason || !mime || !meta.width || !meta.height) return { problem: 'invalid_image' };
    return { mime, width: meta.width, height: meta.height };
  } catch {
    return { problem: 'invalid_image' };
  }
}

/**
 * One paid image request under a held lease (Phase 1E; plan §E, §H):
 *
 * - "prepared": live controls re-checked and the operation marked "sending"
 *   (committed) before the one request is made;
 * - refused before processing: retried within the cap (never before the
 *   provider's requested wait) or failed with the reservation released;
 * - anything uncertain: outcome unknown, held for an operator, never re-sent;
 * - a result: validated like an upload, written to the private quarantine
 *   bucket under a server-generated key, then recorded (cost settled once) as
 *   a quarantined MediaAsset for the existing processing. Nothing is attached
 *   to the article and no provider URL is kept.
 */
export async function runImage(db: DatabaseClient, lease: OperationLease, deps: ImageDeps = {}): Promise<string> {
  const { request, phase } = await loadImageRequest(db, lease.operationId);
  if (phase !== 'prepared') {
    // "sending" from an earlier attempt: the provider may have made (and charged for) the image.
    await recordImageUnknown(db, lease, 'send_state_unknown');
    return 'outcome_unknown:send_state_unknown';
  }
  const provider = deps.imageProviders?.[request.provider];
  if (!provider) return `rejected:credential_missing:${await recordImageRejected(db, lease, { errorClass: 'credential_missing', retryable: false, retryAfterMs: 0 })}`;
  if (!deps.storage) return `rejected:storage_missing:${await recordImageRejected(db, lease, { errorClass: 'storage_missing', retryable: false, retryAfterMs: 0 })}`;
  const begun = await beginImageSend(db, lease);
  if (!begun.send) return `not_sent:${begun.code}`;

  // The call can outlast one lease; keep it while waiting so recovery does not mistake a slow call for a lost worker.
  const heartbeat = setInterval(() => void extendLease(db, lease).catch(() => undefined), deps.heartbeatMs ?? 20_000);
  const started = Date.now();
  let outcome;
  try {
    outcome = await provider.generate(begun.request);
  } finally {
    clearInterval(heartbeat);
  }
  const latencyMs = Date.now() - started;
  if (outcome.kind === 'rejected') return `rejected:${outcome.errorClass}:${await recordImageRejected(db, lease, outcome)}`;
  if (outcome.kind === 'unknown') {
    await recordImageUnknown(db, lease, outcome.errorClass);
    return `outcome_unknown:${outcome.errorClass}`;
  }
  const reported = { usage: outcome.usage, images: outcome.images, servedModel: outcome.servedModel, providerRequestId: outcome.providerRequestId, mismatch: outcome.mismatch, reportedCostMicros: outcome.reportedCostMicros, latencyMs };
  if (!outcome.bytes) return completeImage(db, lease, { kind: 'unusable', code: 'no_image_returned', ...reported });
  const facts = await inspect(outcome.bytes);
  if ('problem' in facts) return completeImage(db, lease, { kind: 'unusable', code: facts.problem, ...reported });
  const objectKey = objectKeyFor('quarantine', lease.operationId, extensionForMime(facts.mime), (deps.randomKey ?? (() => randomBytes(12).toString('hex')))());
  try {
    await deps.storage.put('quarantine', objectKey, outcome.bytes, facts.mime);
  } catch {
    // Paid for but not stored: recorded as such (cost counted), never requested again automatically.
    return completeImage(db, lease, { kind: 'unusable', code: 'storage_failed', ...reported });
  }
  return completeImage(db, lease, {
    kind: 'stored',
    ...reported,
    objectKey,
    mimeType: facts.mime,
    bytes: outcome.bytes.byteLength,
    width: facts.width,
    height: facts.height,
    checksum: createHash('sha256').update(outcome.bytes).digest('hex'),
  });
}
