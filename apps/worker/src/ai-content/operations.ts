import type { DatabaseClient } from '@adelaide-sphere/database';
import { applyOperation, claimOperation, DEFAULT_LEASE_MS } from '@adelaide-sphere/database/automation';
import { runDiscovery, runResearch, type ResearchDeps } from './research.js';

export interface AiOperationJobData {
  operationId?: string;
}

/**
 * Handles one `ai.operation` delivery. The job carries only an id; the
 * `ai_operations` row decides everything, including which stage runs. A
 * duplicate or late delivery finds nothing claimable and does nothing.
 * Retries are the database's (bounded, with backoff and a new delivery),
 * never BullMQ's, so a failing attempt is never repeated outside the cap.
 */
export async function runAiOperation(db: DatabaseClient, data: AiOperationJobData, owner: string, deps: ResearchDeps = {}): Promise<string> {
  if (typeof data.operationId !== 'string' || !/^[a-z0-9]{20,40}$/.test(data.operationId)) return 'ignored: no operation id';
  const lease = await claimOperation(db, { operationId: data.operationId, owner, leaseMs: DEFAULT_LEASE_MS });
  if (!lease) return 'not claimable';
  const op = await db.aIOperation.findUniqueOrThrow({ where: { id: lease.operationId }, select: { kind: true } });
  if (op.kind === 'research') return runResearch(db, lease, deps);
  if (op.kind === 'discovery') return runDiscovery(db, lease, deps);
  return applyOperation(db, lease);
}
