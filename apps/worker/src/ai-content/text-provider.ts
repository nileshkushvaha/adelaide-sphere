import type { ProviderResult, TextRequest } from '@adelaide-sphere/database/automation';

/**
 * The provider-neutral text generation boundary (plan §F). Adapters translate
 * protocol only: policy, budgets, fact checks and idempotency stay in the
 * shared seam. Every outcome says what is known about the provider side.
 */
export type SubmitOutcome =
  /** The provider accepted the request and returned an id it can be looked up by. */
  | { kind: 'accepted'; responseId: string }
  /** The provider definitely did not start work (it said so before accepting). */
  | { kind: 'rejected'; errorClass: string; retryable: boolean; retryAfterMs: number }
  /** The request may have been accepted, but no id came back: the outcome is unknown. */
  | { kind: 'unknown'; errorClass: string };

export type RetrieveOutcome =
  | { kind: 'pending' }
  | { kind: 'done'; result: ProviderResult }
  /** The result could not be read now (transient) or ever (permanent, e.g. expired). */
  | { kind: 'unavailable'; errorClass: string; permanent: boolean };

export interface TextProvider {
  readonly id: string;
  submit(request: TextRequest): Promise<SubmitOutcome>;
  retrieve(responseId: string): Promise<RetrieveOutcome>;
}
