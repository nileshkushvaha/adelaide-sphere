import { createHash } from 'node:crypto';
import { AI_OPERATION_EVENT } from '@adelaide-sphere/domain';
import type { DatabaseClient } from '../client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { readAutomationControl } from './control.js';

type Tx = Prisma.TransactionClient;

/**
 * Durable AI operations (AI plan §E "Idempotency, fencing and transaction
 * boundaries"). The `ai_operations` row is the authority; BullMQ only carries
 * its id, so a lost, duplicated or expired job cannot create or repeat work.
 *
 * - Identity: a unique operation key, derived from the durable thing it acts
 *   on (for `apply`: the generation run), so re-requesting returns the same row.
 * - Ownership: a claim sets owner, a lease measured on the database clock, and
 *   a fencing token that increases on every claim. Every write a worker makes
 *   is conditional on (state running, owner, token, unexpired lease); an
 *   owner whose lease has lapsed, or who was replaced, commits nothing.
 * - Recovery: a periodic scan re-queues work whose delivery was lost and
 *   reclaims expired leases. Only DB-local kinds are reclaimed by retry: an
 *   `apply` either committed (its state is then `succeeded`, in the same
 *   transaction) or rolled back. Kinds with external effects must be
 *   reconciled instead; a lapsed lease never proves an external call failed.
 */
export const MAX_OPERATION_ATTEMPTS = 3;
export const DEFAULT_LEASE_MS = 60_000;
/** Pending work not re-delivered within this window is re-queued by recovery. */
export const REDELIVERY_AFTER_MS = 5 * 60_000;
const RECOVERY_BATCH = 50;
/**
 * Kinds a lapsed lease may retry: `apply` is database-only, and research and
 * discovery only read public pages (GET, no side effect, no cost). A future
 * kind with an external effect or a charge must be reconciled, not retried.
 */
const RETRY_SAFE_KINDS = new Set(['apply', 'research', 'discovery']);

export function operationKey(kind: string, subjectId: string): string {
  return createHash('sha256').update(JSON.stringify([kind, subjectId])).digest('hex');
}

export interface OperationLease {
  operationId: string;
  owner: string;
  fencingToken: number;
}

export class StaleLeaseError extends Error {
  constructor(operationId: string) {
    super(`The lease on AI operation ${operationId} is no longer held`);
    this.name = 'StaleLeaseError';
  }
}

/** Queues delivery of an operation through the transactional outbox, in the caller's transaction. */
export async function enqueueOperationDelivery(tx: Tx, operationId: string, availableAt?: Date): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      type: AI_OPERATION_EVENT,
      resourceType: 'ai_operation',
      resourceId: operationId,
      payload: { operationId },
      ...(availableAt ? { availableAt } : {}),
    },
  });
  // Due times are database-clock values, like the claim that compares them: an operation created with
  // this process's clock a few ms ahead of the database would otherwise look "not yet due" to its first delivery.
  if (availableAt) await tx.$executeRaw`UPDATE ai_operations SET lastEnqueuedAt = UTC_TIMESTAMP(3) WHERE id = ${operationId}`;
  else await tx.$executeRaw`UPDATE ai_operations SET lastEnqueuedAt = UTC_TIMESTAMP(3), nextAttemptAt = LEAST(nextAttemptAt, UTC_TIMESTAMP(3)) WHERE id = ${operationId}`;
}

/**
 * Records a generation result as a durable run and its apply operation, with
 * the operation's delivery, in one transaction. The item must be generating.
 * Idempotent on the run: a second request for the same artifact returns the
 * existing run and operation. The caller supplies an already-bounded artifact;
 * `applyOperation` validates it again before any Post write.
 */
export async function recordGenerationForApply(
  tx: Tx,
  input: { itemId: string; artifact: Prisma.InputJsonObject; artifactHash: string; expectedPostVersion: number | null; expectedMaterialHash: string | null },
): Promise<{ runId: string; operationId: string; created: boolean }> {
  const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM ai_content_items WHERE id = ${input.itemId} FOR UPDATE`;
  if (!rows[0]) throw new Error(`AI item ${input.itemId} does not exist`);
  const existingRun = await tx.aIGenerationRun.findFirst({ where: { itemId: input.itemId, artifactHash: input.artifactHash }, select: { id: true } });
  if (existingRun) {
    const op = await tx.aIOperation.findUniqueOrThrow({ where: { operationKey: operationKey('apply', existingRun.id) }, select: { id: true } });
    return { runId: existingRun.id, operationId: op.id, created: false };
  }
  if (rows[0].status !== 'generating') throw new Error(`AI item ${input.itemId} is ${rows[0].status}, not generating`);
  const control = await readAutomationControl(tx);
  const latest = await tx.aIGenerationRun.findFirst({ where: { itemId: input.itemId }, orderBy: { generationVersion: 'desc' }, select: { generationVersion: true } });
  const run = await tx.aIGenerationRun.create({
    data: {
      itemId: input.itemId,
      generationVersion: (latest?.generationVersion ?? 0) + 1,
      settingsVersion: control.settingsVersion,
      controlEpoch: control.epoch,
      expectedPostVersion: input.expectedPostVersion,
      expectedMaterialHash: input.expectedMaterialHash,
      artifact: input.artifact,
      artifactHash: input.artifactHash,
    },
    select: { id: true },
  });
  const op = await tx.aIOperation.create({
    data: { operationKey: operationKey('apply', run.id), kind: 'apply', itemId: input.itemId, runId: run.id, controlEpoch: control.epoch },
    select: { id: true },
  });
  await enqueueOperationDelivery(tx, op.id);
  return { runId: run.id, operationId: op.id, created: true };
}

/**
 * Takes ownership of a pending, due operation. Returns null when it is not
 * claimable (already running under another owner, finished, cancelled, not
 * yet due, or out of attempts): a duplicate delivery then does nothing.
 */
export async function claimOperation(db: DatabaseClient, input: { operationId: string; owner: string; leaseMs?: number }): Promise<OperationLease | null> {
  const leaseMicros = Math.max(1, input.leaseMs ?? DEFAULT_LEASE_MS) * 1000;
  const owner = input.owner.slice(0, 64);
  const claimed = await db.$executeRaw`
    UPDATE ai_operations
       SET state = 'running', leaseOwner = ${owner},
           leaseUntil = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${leaseMicros} MICROSECOND),
           fencingToken = fencingToken + 1, attempts = attempts + 1, updatedAt = UTC_TIMESTAMP(3)
     WHERE id = ${input.operationId} AND state = 'pending'
       AND nextAttemptAt <= UTC_TIMESTAMP(3) AND attempts < ${MAX_OPERATION_ATTEMPTS}`;
  if (claimed !== 1) return null;
  const row = await db.aIOperation.findUnique({ where: { id: input.operationId }, select: { fencingToken: true, leaseOwner: true } });
  if (!row || row.leaseOwner !== owner) return null;
  return { operationId: input.operationId, owner, fencingToken: row.fencingToken };
}

/** Extends only the caller's own, still-valid lease. */
export async function extendLease(db: DatabaseClient, lease: OperationLease, leaseMs = DEFAULT_LEASE_MS): Promise<boolean> {
  const micros = Math.max(1, leaseMs) * 1000;
  const updated = await db.$executeRaw`
    UPDATE ai_operations SET leaseUntil = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${micros} MICROSECOND), updatedAt = UTC_TIMESTAMP(3)
     WHERE id = ${lease.operationId} AND state = 'running' AND leaseOwner = ${lease.owner}
       AND fencingToken = ${lease.fencingToken} AND leaseUntil > UTC_TIMESTAMP(3)`;
  return updated === 1;
}

/**
 * Asserts, under the operation's row lock, that the caller still holds a
 * valid lease. Must be the first operation-row access in a worker's write
 * transaction; throws StaleLeaseError so the whole transaction rolls back.
 */
export async function assertLease(tx: Tx, lease: OperationLease): Promise<void> {
  const held = await tx.$executeRaw`
    UPDATE ai_operations SET updatedAt = UTC_TIMESTAMP(3)
     WHERE id = ${lease.operationId} AND state = 'running' AND leaseOwner = ${lease.owner}
       AND fencingToken = ${lease.fencingToken} AND leaseUntil > UTC_TIMESTAMP(3)`;
  if (held !== 1) throw new StaleLeaseError(lease.operationId);
}

/** Ends a held operation, in the caller's (lease-asserted) transaction. */
export async function finishOperation(tx: Tx, lease: OperationLease, state: 'succeeded' | 'failed', resultCode: string): Promise<void> {
  const done = await tx.aIOperation.updateMany({
    where: { id: lease.operationId, state: 'running', leaseOwner: lease.owner, fencingToken: lease.fencingToken },
    data: { state, resultCode: resultCode.slice(0, 64), leaseOwner: null, leaseUntil: null },
  });
  if (done.count !== 1) throw new StaleLeaseError(lease.operationId);
}

/**
 * Gives a held operation back after a transient failure (the attempt's
 * transaction rolled back): pending again after a bounded backoff with a new
 * delivery, or failed — with its item — once attempts are exhausted
 * (AI-222, AI-275, AI-276). A lease that is no longer held changes nothing.
 */
export async function releaseForRetry(db: DatabaseClient, lease: OperationLease, errorCode: string, minDelayMs = 0): Promise<'retrying' | 'exhausted' | 'stale'> {
  return db.$transaction(async (tx) => {
    const op = await tx.aIOperation.findUnique({ where: { id: lease.operationId }, select: { attempts: true, itemId: true, kind: true } });
    if (!op) return 'stale';
    try {
      await assertLease(tx, lease);
    } catch (error) {
      if (error instanceof StaleLeaseError) return 'stale';
      throw error;
    }
    if (op.attempts >= MAX_OPERATION_ATTEMPTS) {
      await finishOperation(tx, lease, 'failed', errorCode);
      // An image is subordinate to its article: its failure fails the image, never the article.
      if (op.kind === 'image') {
        await tx.aIImageJob.updateMany({ where: { operationId: lease.operationId, status: 'requested' }, data: { status: 'failed', failureCode: 'attempts_exhausted', version: { increment: 1 } } });
      } else {
        await failItemForOperation(tx, op.itemId, 'attempts_exhausted');
      }
      return 'exhausted';
    }
    // Bounded exponential backoff with jitter, never sooner than a source's Retry-After (AI-275).
    const delayMs = Math.max(minDelayMs, 2 ** op.attempts * 1000) + Math.floor(Math.random() * 500);
    await tx.$executeRaw`
      UPDATE ai_operations
         SET state = 'pending', leaseOwner = NULL, leaseUntil = NULL, resultCode = ${errorCode.slice(0, 64)},
             nextAttemptAt = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${delayMs * 1000} MICROSECOND), updatedAt = UTC_TIMESTAMP(3)
       WHERE id = ${lease.operationId} AND fencingToken = ${lease.fencingToken}`;
    // The outbox dispatcher schedules by this process's clock, as it always has.
    await enqueueOperationDelivery(tx, lease.operationId, new Date(Date.now() + delayMs));
    return 'retrying';
  });
}

async function failItemForOperation(tx: Tx, itemId: string | null, code: string): Promise<void> {
  if (!itemId) return;
  const rows = await tx.$queryRaw<{ status: string; version: number }[]>`SELECT status, version FROM ai_content_items WHERE id = ${itemId} FOR UPDATE`;
  if (rows[0]?.status !== 'generating') return;
  await tx.aIContentItem.updateMany({
    where: { id: itemId, version: Number(rows[0].version) },
    data: { status: 'failed', failureStage: 'application', failureCode: code, version: { increment: 1 } },
  });
  await tx.auditLog.create({ data: { action: 'ai_content.item.failed', targetType: 'ai_topic', targetId: itemId, metadata: { failureStage: 'application', failureCode: code } } });
}

/** Cancels an item's unfinished operations in the caller's transaction; a running owner is fenced out. */
export async function cancelItemOperations(tx: Tx, itemId: string): Promise<number> {
  const result = await tx.aIOperation.updateMany({
    where: { itemId, state: { in: ['pending', 'running'] } },
    data: { state: 'cancelled', leaseOwner: null, leaseUntil: null, resultCode: 'item_cancelled' },
  });
  return result.count;
}

/**
 * A paid generation whose worker vanished. Nothing sent: safe to run again.
 * Accepted with a response id: run again to *retrieve*, never to re-send.
 * Possibly sent without an id: the outcome is unknown and an operator decides
 * (a lapsed lease is not proof the provider did no work).
 */
async function recoverGeneration(db: DatabaseClient, operationId: string, phase: string | null, attempts: number): Promise<void> {
  await db.$transaction(async (tx) => {
    // Out of attempts while holding a sent request is as unresolved as a lost send.
    if (phase === 'sending' || (phase === 'sent' && attempts >= MAX_OPERATION_ATTEMPTS)) {
      const updated = await tx.$executeRaw`UPDATE ai_operations SET state = 'outcome_unknown', leaseOwner = NULL, leaseUntil = NULL, errorClass = 'worker_lost_during_send', resultCode = 'outcome_unknown', updatedAt = UTC_TIMESTAMP(3)
        WHERE id = ${operationId} AND state = 'running' AND leaseUntil < UTC_TIMESTAMP(3)`;
      if (updated === 1) {
        // An image request's job shows the same hold (no-op for text generations).
        await tx.$executeRaw`UPDATE ai_image_jobs SET status = 'outcome_unknown', version = version + 1, updatedAt = UTC_TIMESTAMP(3) WHERE operationId = ${operationId} AND status = 'requested'`;
        await tx.auditLog.create({ data: { action: 'ai_content.generation.outcome_unknown', targetType: 'ai_operation', targetId: operationId, metadata: { errorClass: 'worker_lost_during_send' } } });
      }
      return;
    }
    const updated = await tx.$executeRaw`UPDATE ai_operations SET state = 'pending', leaseOwner = NULL, leaseUntil = NULL, resultCode = 'lease_expired', nextAttemptAt = UTC_TIMESTAMP(3), updatedAt = UTC_TIMESTAMP(3)
      WHERE id = ${operationId} AND state = 'running' AND leaseUntil < UTC_TIMESTAMP(3)`;
    if (updated === 1) await enqueueOperationDelivery(tx, operationId);
  });
}

export interface RecoveryResult {
  reclaimed: number;
  redelivered: number;
  exhausted: number;
}

/**
 * The recovery scan (AI-264, F02, F19, F51). Independent of queue retention:
 * it reads the operations table only.
 */
export async function recoverOperations(db: DatabaseClient, redeliverAfterMs = REDELIVERY_AFTER_MS): Promise<RecoveryResult> {
  const result: RecoveryResult = { reclaimed: 0, redelivered: 0, exhausted: 0 };
  const expired = await db.$queryRaw<{ id: string; kind: string; attempts: number; itemId: string | null; providerPhase: string | null }[]>`
    SELECT id, kind, attempts, itemId, providerPhase FROM ai_operations
     WHERE state = 'running' AND leaseUntil < UTC_TIMESTAMP(3)
     ORDER BY leaseUntil LIMIT ${RECOVERY_BATCH}`;
  for (const op of expired) {
    // Paid calls (text and image) are never re-sent on recovery: see recoverGeneration.
    if (op.kind === 'generate' || op.kind === 'image') {
      await recoverGeneration(db, op.id, op.providerPhase, Number(op.attempts));
      result.reclaimed += 1;
      continue;
    }
    // Only DB-local or read-only work is retried; anything with an external effect would need reconciling first.
    if (!RETRY_SAFE_KINDS.has(op.kind)) continue;
    await db.$transaction(async (tx) => {
      const exhausted = Number(op.attempts) >= MAX_OPERATION_ATTEMPTS;
      const updated = await tx.$executeRaw`
        UPDATE ai_operations
           SET state = ${exhausted ? 'failed' : 'pending'}, leaseOwner = NULL, leaseUntil = NULL,
               resultCode = ${exhausted ? 'attempts_exhausted' : 'lease_expired'}, nextAttemptAt = UTC_TIMESTAMP(3), updatedAt = UTC_TIMESTAMP(3)
         WHERE id = ${op.id} AND state = 'running' AND leaseUntil < UTC_TIMESTAMP(3)`;
      if (updated !== 1) return;
      if (exhausted) {
        await failItemForOperation(tx, op.itemId, 'attempts_exhausted');
        result.exhausted += 1;
      } else {
        await enqueueOperationDelivery(tx, op.id);
        result.reclaimed += 1;
      }
    });
  }
  const redeliverMicros = Math.max(1, redeliverAfterMs) * 1000;
  const lost = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM ai_operations
     WHERE state = 'pending' AND nextAttemptAt <= UTC_TIMESTAMP(3) AND attempts < ${MAX_OPERATION_ATTEMPTS}
       AND (lastEnqueuedAt IS NULL OR lastEnqueuedAt < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${redeliverMicros} MICROSECOND))
     ORDER BY nextAttemptAt LIMIT ${RECOVERY_BATCH}`;
  for (const op of lost) {
    await db.$transaction(async (tx) => {
      await enqueueOperationDelivery(tx, op.id);
    });
    result.redelivered += 1;
  }
  return result;
}
