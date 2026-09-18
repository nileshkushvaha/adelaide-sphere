import type { ImageRequest } from '@adelaide-sphere/database/automation';
import type { ImageUsage } from '@adelaide-sphere/domain';

/**
 * The provider-neutral image generation boundary (plan §F; SRS §20). Adapters
 * translate protocol only: prompts, budgets, approval and media handling stay
 * in the shared seam. Every outcome says what is known about the provider side.
 */
export type ImageOutcome =
  /** The provider produced a result (and charged for it). Bytes are null when none usable came back. */
  | { kind: 'generated'; bytes: Buffer | null; usage: ImageUsage | null; size: string | null; quality: string | null }
  /** The provider definitely did not process the request. */
  | { kind: 'rejected'; errorClass: string; retryable: boolean; retryAfterMs: number }
  /** The request may have been processed, but no result came back: never re-sent automatically. */
  | { kind: 'unknown'; errorClass: string };

export interface ImageProvider {
  readonly id: string;
  generate(request: ImageRequest): Promise<ImageOutcome>;
}
