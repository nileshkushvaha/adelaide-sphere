import { createHash } from 'node:crypto';
import type { SourceTier } from '@adelaide-sphere/domain';
import type { DatabaseClient } from '../client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { assessNovelty, bumpInventoryEpoch, lockInventory, noveltyDetailJson } from './novelty.js';
import { readAutomationControl } from './control.js';
import { assertLease, enqueueOperationDelivery, finishOperation, operationKey, type OperationLease } from './operations.js';
import { normalizeResearchUrl } from './research.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
/** A discovery run proposes at most this many topics: a daily target is a ceiling, not a quota (owner policy §7). */
export const MAX_DISCOVERY_CANDIDATES = 5;

export interface DiscoverySignal {
  title: string;
  link: string;
  publishedAt: Date;
  sourceLabel: string;
  sourceHost: string;
  tier: SourceTier;
}

export interface DiscoveryResult {
  created: number;
  duplicates: number;
  history: number;
  known: number;
}

/**
 * Records niche-filtered public signals as topic candidates (AI SRS §6–7).
 * Serialised with every other admission through the inventory lock. A signal
 * is used once, ever: its link is the candidate's durable request identity,
 * so a rejected or cancelled idea is never proposed again (rejected-topic
 * history), and duplicates of existing articles, topics or history are
 * skipped. Candidates are queued for editorial approval; nothing is admitted
 * to research automatically.
 */
export async function recordDiscoveryCandidates(db: DatabaseClient, lease: OperationLease, requestedByAdminId: string | null, signals: readonly DiscoverySignal[]): Promise<DiscoveryResult> {
  return db.$transaction(async (tx) => {
    await lockInventory(tx);
    await assertLease(tx, lease);
    const result: DiscoveryResult = { created: 0, duplicates: 0, history: 0, known: 0 };
    const ordered = [...signals].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    for (const signal of ordered) {
      if (result.created >= MAX_DISCOVERY_CANDIDATES) break;
      const link = normalizeResearchUrl(signal.link);
      const title = signal.title.replace(/\s+/g, ' ').trim().slice(0, 180);
      if (!link || title.length < 3) continue;
      const requestKey = sha256(JSON.stringify(['discovery', link]));
      if (await tx.aIContentItem.findUnique({ where: { requestKey }, select: { id: true } })) {
        result.known += 1;
        continue;
      }
      const novelty = await assessNovelty(tx, { title });
      // Automatic proposals are held to the strictest standard: any overlap is skipped, and rejected
      // history is never proposed again. An editor can still add an overlapping topic by hand.
      if (novelty.matches.some((m) => m.reason === 'previously_rejected')) {
        result.history += 1;
        continue;
      }
      if (novelty.status !== 'clear') {
        result.duplicates += 1;
        continue;
      }
      const titleKey = sha256(title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim());
      if (await tx.aIContentItem.findUnique({ where: { activeTitleHash: titleKey }, select: { id: true } })) {
        result.duplicates += 1;
        continue;
      }
      const item = await tx.aIContentItem.create({
        data: {
          title,
          source: 'discovery',
          status: 'queued',
          priority: 0,
          requestKey,
          payloadHash: sha256(JSON.stringify([title, link])),
          activeTitleHash: titleKey,
          createdByAdminId: requestedByAdminId,
          selectionReason: `Recent public signal: ${signal.sourceLabel}, ${signal.publishedAt.toISOString().slice(0, 10)}`.slice(0, 300),
          researchUrls: [{ url: link, tier: signal.tier }] as Prisma.InputJsonArray,
          intentKey: novelty.fingerprint.intentKey,
          eventKey: novelty.fingerprint.eventKey,
          topicTokens: novelty.fingerprint.topicTokens,
          noveltyStatus: novelty.status,
          noveltyCheckedAt: new Date(),
          noveltyDetail: noveltyDetailJson(novelty.matches),
        },
        select: { id: true },
      });
      await tx.auditLog.create({ data: { action: 'ai_content.topic.discovered', actorAdminId: null, targetType: 'ai_topic', targetId: item.id, metadata: { sourceHost: signal.sourceHost, novelty: novelty.status, operationId: lease.operationId } } });
      result.created += 1;
    }
    if (result.created > 0) await bumpInventoryEpoch(tx);
    await finishOperation(tx, lease, 'succeeded', `created:${result.created} duplicate:${result.duplicates} history:${result.history} known:${result.known}`);
    return result;
  });
}

/**
 * Queues one discovery run for an administrator's request; idempotent on the
 * request key, so a retried click is the same run.
 */
export async function requestDiscovery(tx: Prisma.TransactionClient, input: { adminId: string; requestKey: string }): Promise<{ operationId: string; created: boolean }> {
  const key = operationKey('discovery', JSON.stringify([input.adminId, input.requestKey]));
  const existing = await tx.aIOperation.findUnique({ where: { operationKey: key }, select: { id: true } });
  if (existing) return { operationId: existing.id, created: false };
  const control = await readAutomationControl(tx);
  const op = await tx.aIOperation.create({ data: { operationKey: key, kind: 'discovery', controlEpoch: control.epoch }, select: { id: true } });
  await enqueueOperationDelivery(tx, op.id);
  await tx.auditLog.create({ data: { action: 'ai_content.discovery.requested', actorAdminId: input.adminId, targetType: 'ai_operation', targetId: op.id } });
  return { operationId: op.id, created: true };
}
