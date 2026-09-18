import type { DatabaseClient } from '@adelaide-sphere/database';
import {
  MAX_OPERATION_ATTEMPTS,
  beginSend,
  completeGeneration,
  extendLease,
  loadGenerationRequest,
  recordAccepted,
  recordRejected,
  recordUnknown,
  releaseForRetry,
  type OperationLease,
} from '@adelaide-sphere/database/automation';
import type { TextProvider } from './text-provider.js';

export interface GenerationDeps {
  /** Configured providers by id; a provider without a server-side credential is simply absent. */
  textProviders?: Record<string, TextProvider>;
  pollIntervalMs?: number;
  /** How long one delivery waits for a background response before handing back for a later look-up. */
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One paid generation under a held lease (plan §E, §I; owner rules):
 *
 * - "prepared": live controls are re-checked and the operation marked
 *   "sending" (committed) before the one request is made;
 * - accepted: the response id is committed before anything else, so every
 *   later step is a look-up, never a new request;
 * - refused before acceptance: retried within the cap (never before
 *   Retry-After) or failed with the reservation released;
 * - anything uncertain (timeout, lost connection, server error, an id that
 *   can no longer be read): outcome unknown, held for an operator.
 */
export async function runGeneration(db: DatabaseClient, lease: OperationLease, deps: GenerationDeps = {}): Promise<string> {
  const sleep = deps.sleep ?? defaultSleep;
  const { request, phase, responseId: storedId } = await loadGenerationRequest(db, lease.operationId);
  const provider = deps.textProviders?.[request.provider];
  let responseId = storedId;

  if (phase === 'prepared') {
    if (!provider) {
      const outcome = await recordRejected(db, lease, { errorClass: 'credential_missing', retryable: false, retryAfterMs: 0 });
      return `rejected:credential_missing:${outcome}`;
    }
    const begun = await beginSend(db, lease);
    if (!begun.send) return `not_sent:${begun.code}`;
    const submitted = await provider.submit(begun.request);
    if (submitted.kind === 'rejected') return `rejected:${submitted.errorClass}:${await recordRejected(db, lease, submitted)}`;
    if (submitted.kind === 'unknown') {
      await recordUnknown(db, lease, submitted.errorClass);
      return `outcome_unknown:${submitted.errorClass}`;
    }
    await recordAccepted(db, lease, submitted.responseId);
    responseId = submitted.responseId;
  } else if (phase !== 'sent' || !responseId) {
    // "sending" without an id: a previous attempt may have reached the provider.
    await recordUnknown(db, lease, 'send_state_unknown');
    return 'outcome_unknown:send_state_unknown';
  }

  if (!provider) {
    await recordUnknown(db, lease, 'credential_missing_after_send');
    return 'outcome_unknown:credential_missing_after_send';
  }
  const deadline = Date.now() + (deps.maxWaitMs ?? 5 * 60_000);
  for (;;) {
    if (!(await extendLease(db, lease))) return 'stale_lease';
    const outcome = await provider.retrieve(responseId);
    if (outcome.kind === 'done') return completeGeneration(db, lease, outcome.result);
    if (outcome.kind === 'unavailable' && outcome.permanent) {
      await recordUnknown(db, lease, outcome.errorClass);
      return `outcome_unknown:${outcome.errorClass}`;
    }
    if (Date.now() >= deadline) {
      // Still running: hand back for a later look-up by id (never a new request), within the attempt cap.
      const op = await db.aIOperation.findUniqueOrThrow({ where: { id: lease.operationId }, select: { attempts: true } });
      if (op.attempts >= MAX_OPERATION_ATTEMPTS) {
        await recordUnknown(db, lease, 'result_not_ready');
        return 'outcome_unknown:result_not_ready';
      }
      const released = await releaseForRetry(db, lease, 'awaiting_result', 60_000);
      return `awaiting_result:${released}`;
    }
    await sleep(deps.pollIntervalMs ?? 5_000);
  }
}
