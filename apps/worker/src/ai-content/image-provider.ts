import type { ImageRequest } from '@adelaide-sphere/database/automation';
import type { ImageUsage } from '@adelaide-sphere/domain';

/**
 * The provider-neutral image generation boundary (plan §F; SRS §20). Adapters
 * translate protocol only: prompts, budgets, approval and media handling stay
 * in the shared seam. Every outcome says what is known about the provider side.
 */
export type ImageOutcome =
  /**
   * The provider produced a result (and charged for it). Bytes are the inline
   * image, or null when no usable inline image came back (a provider-hosted URL
   * is never followed or kept: AI-IMAGE-PROVIDER-11).
   */
  | {
      kind: 'generated';
      bytes: Buffer | null;
      usage: ImageUsage | null;
      /** Images returned (billed per image where the price is per image). */
      images: number;
      /** The model the provider says served the request, when it says (AI-PROVIDER-13). */
      servedModel: string | null;
      providerRequestId: string | null;
      /** A setting the provider reports differently from the request (for example size or quality), or null. */
      mismatch: string | null;
      /** What the provider says it billed, in micro-units of USD (rounded up), where it says; null otherwise. */
      reportedCostMicros: number | null;
    }
  /** The provider definitely did not process the request. */
  | { kind: 'rejected'; errorClass: string; retryable: boolean; retryAfterMs: number }
  /** The request may have been processed, but no result came back: never re-sent automatically. */
  | { kind: 'unknown'; errorClass: string };

export interface ImageProvider {
  readonly id: string;
  generate(request: ImageRequest): Promise<ImageOutcome>;
}
