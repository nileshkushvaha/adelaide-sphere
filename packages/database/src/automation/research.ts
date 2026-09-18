import { createHash } from 'node:crypto';
import {
  CLAIM_KINDS,
  PILOT_FRESHNESS,
  canTransitionAiItem,
  evaluateClaims,
  normalizeClaimValue,
  normalizeTopicText,
  type AiItemStatus,
  type ClaimInput,
  type ClaimKind,
  type FreshnessPolicy,
  type SourceTier,
} from '@adelaide-sphere/domain';
import type { DatabaseClient } from '../client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { readAutomationControl } from './control.js';
import { assessNovelty, bumpInventoryEpoch, lockInventory, noveltyDetailJson, readInventoryEpoch } from './novelty.js';
import { assertLease, enqueueOperationDelivery, finishOperation, operationKey, type OperationLease } from './operations.js';

type Tx = Prisma.TransactionClient;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const MAX_RESEARCH_URLS = 10;
const CONTEXT_EXCERPT = 300;

/**
 * Research and fact verification (AI SRS §9; plan §G; owner pilot policy).
 * The database is the authority for every step; no function here makes a
 * network call. Evidence arrives from the worker's SSRF-safe fetcher.
 */
export class ResearchCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 404 | 409 = 409,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ResearchCommandError';
  }
}

export interface ResearchUrl {
  url: string;
  tier?: SourceTier | null;
}

interface ResearchSettings {
  enabled: boolean;
  freshness: FreshnessPolicy;
  contextPostLimit: number;
}

const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;

export async function readResearchSettings(tx: Pick<Tx, 'setting'>): Promise<ResearchSettings> {
  const setting = await tx.setting.findUnique({ where: { group_key: { group: 'ai_content', key: 'defaults' } }, select: { data: true } });
  const data = (setting?.data ?? {}) as Record<string, unknown>;
  return {
    enabled: data.enabled === true,
    freshness: {
      volatileHours: bounded(data.freshnessVolatileHours, PILOT_FRESHNESS.volatileHours, 1, PILOT_FRESHNESS.volatileHours),
      identityDays: bounded(data.freshnessIdentityDays, PILOT_FRESHNESS.identityDays, 1, PILOT_FRESHNESS.identityDays),
      stableDays: bounded(data.freshnessStableDays, PILOT_FRESHNESS.stableDays, 1, PILOT_FRESHNESS.stableDays),
    },
    contextPostLimit: bounded(data.contextPostLimit, 5, 1, 10),
  };
}

/** Normalised https URL of a public-looking host, or null. The worker's fetch boundary re-validates at connection time. */
export function normalizeResearchUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[') || /(^|\.)(localhost|local|internal|localdomain|home|lan|corp|intranet)$/.test(host)) return null;
  url.hash = '';
  const normalized = url.toString();
  return normalized.length <= 2000 ? normalized : null;
}

export function researchUrlHash(url: string): string {
  return sha256(url);
}

/** Related published articles for later generation context (SRS §8): bounded, public only, never drafts. */
async function relatedPublishedContext(tx: Tx, title: string, limit: number): Promise<Prisma.InputJsonArray> {
  const words = normalizeTopicText(title).split(' ').filter((w) => w.length >= 3);
  if (words.length === 0) return [];
  const rows = await tx.$queryRaw<{ id: string; title: string; slug: string; excerpt: string; categoryId: string }[]>`
    SELECT id, title, slug, excerpt, categoryId FROM posts
     WHERE status = 'published' AND MATCH(title, excerpt, searchText) AGAINST (${words.join(' ')} IN NATURAL LANGUAGE MODE)
     LIMIT ${limit}`;
  return rows.map((r) => ({ id: r.id, title: r.title, slug: r.slug, excerpt: r.excerpt.slice(0, CONTEXT_EXCERPT), categoryId: r.categoryId }));
}

async function lockItem(tx: Tx, itemId: string) {
  const rows = await tx.$queryRaw<{ id: string; status: AiItemStatus; version: number; title: string; researchUrls: unknown; followUpOfPostId: string | null }[]>`
    SELECT id, status, version, title, researchUrls, followUpOfPostId FROM ai_content_items WHERE id = ${itemId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new ResearchCommandError('NOT_FOUND', 'This topic does not exist.', 404);
  return { ...row, version: Number(row.version), researchUrls: parseResearchUrls(row.researchUrls) };
}

export function parseResearchUrls(value: unknown): ResearchUrl[] {
  const raw = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  return Array.isArray(raw) ? (raw as ResearchUrl[]).filter((u) => typeof u?.url === 'string').slice(0, MAX_RESEARCH_URLS) : [];
}

async function auditItem(tx: Tx, action: string, itemId: string, actorAdminId: string | null, metadata: Record<string, string | number | boolean | null>, requestId?: string | null) {
  await tx.auditLog.create({ data: { action, actorAdminId, targetType: 'ai_topic', targetId: itemId, requestId: requestId ?? null, metadata } });
}

async function moveItem(tx: Tx, item: { id: string; status: AiItemStatus; version: number }, to: AiItemStatus, extra: Prisma.AIContentItemUncheckedUpdateManyInput = {}): Promise<number> {
  if (item.status !== to && !canTransitionAiItem(item.status, to)) throw new ResearchCommandError('INVALID_TRANSITION', `This topic cannot move from ${item.status} to ${to}.`);
  const updated = await tx.aIContentItem.updateMany({ where: { id: item.id, version: item.version }, data: { ...extra, ...(item.status !== to ? { status: to } : {}), version: { increment: 1 } } });
  if (updated.count !== 1) throw new ResearchCommandError('STALE_VERSION', 'This topic changed. Reload it before trying again.');
  return item.version + 1;
}

/** Opens the next packet for an item with its research operation and delivery, in the caller's transaction. */
async function openPacket(tx: Tx, itemId: string, title: string, inventoryEpoch: number, settings: ResearchSettings) {
  const latest = await tx.aIResearchPacket.findFirst({ where: { itemId }, orderBy: { version: 'desc' }, select: { version: true, status: true } });
  if (latest?.status === 'collecting') throw new ResearchCommandError('RESEARCH_IN_PROGRESS', 'Research for this topic is already running.');
  const packet = await tx.aIResearchPacket.create({
    data: { itemId, version: (latest?.version ?? 0) + 1, inventoryEpoch, context: await relatedPublishedContext(tx, title, settings.contextPostLimit) },
    select: { id: true, version: true },
  });
  const control = await readAutomationControl(tx);
  const op = await tx.aIOperation.create({
    data: { operationKey: operationKey('research', packet.id), kind: 'research', itemId, packetId: packet.id, controlEpoch: control.epoch },
    select: { id: true },
  });
  await enqueueOperationDelivery(tx, op.id);
  return { packetId: packet.id, packetVersion: packet.version, operationId: op.id };
}

export interface AdmissionInput {
  itemId: string;
  expectedVersion: number;
  adminId: string;
  requestId?: string | null;
  /** Required to admit a topic whose novelty needs review: an explicit, justified follow-up of an existing article. */
  followUp?: { postId: string; reason: string } | null;
}

/**
 * Topic approval and novelty admission (plan §E steps 4–5; SRS §7, §17).
 * The inventory is locked for the whole decision, which is local and fast, so
 * no concurrent admission, Post creation or retitle can slip past it. Exact or
 * near duplicates are refused; uncertain overlap and rejected history need an
 * explicit follow-up justification. Admission opens the first research packet.
 */
export async function admitTopic(tx: Tx, input: AdmissionInput) {
  await lockInventory(tx);
  const settings = await readResearchSettings(tx);
  const item = await lockItem(tx, input.itemId);
  if (item.version !== input.expectedVersion) throw new ResearchCommandError('STALE_VERSION', 'This topic changed. Reload it before trying again.');
  if (item.status !== 'queued' && item.status !== 'failed') throw new ResearchCommandError('INVALID_TRANSITION', 'Only a queued topic, or one whose research failed, can be approved for research.');
  if (!settings.enabled) throw new ResearchCommandError('AUTOMATION_DISABLED', 'AI automation is switched off, so no research can start.');
  if (item.researchUrls.length === 0) throw new ResearchCommandError('NO_RESEARCH_SOURCES', 'Add at least one source page before approving research.', 400, { fields: { researchUrls: ['Add at least one https source page'] } });
  const novelty = await assessNovelty(tx, { title: item.title, itemId: item.id, includeUnadmitted: false });
  if (novelty.status === 'duplicate') {
    throw new ResearchCommandError('NOVELTY_DUPLICATE', 'This topic duplicates existing content or another topic.', 409, { novelty: noveltyDetailJson(novelty.matches) });
  }
  if (novelty.status === 'review' && !input.followUp) {
    throw new ResearchCommandError('NOVELTY_REVIEW_REQUIRED', 'This topic overlaps existing content. Approve it only as a justified follow-up.', 409, { novelty: noveltyDetailJson(novelty.matches) });
  }
  if (input.followUp) {
    const post = await tx.post.findUnique({ where: { id: input.followUp.postId }, select: { id: true } });
    if (!post) throw new ResearchCommandError('VALIDATION_ERROR', 'Choose the existing article this topic follows up.', 400, { fields: { followUpOfPostId: ['Unknown article'] } });
  }
  const epoch = await bumpInventoryEpoch(tx);
  const now = new Date();
  await moveItem(tx, item, 'researching', {
    topicApprovedAt: now,
    topicApprovedByAdminId: input.adminId,
    noveltyStatus: novelty.status,
    noveltyEpoch: epoch,
    noveltyCheckedAt: now,
    noveltyDetail: noveltyDetailJson(novelty.matches),
    intentKey: novelty.fingerprint.intentKey,
    eventKey: novelty.fingerprint.eventKey,
    topicTokens: novelty.fingerprint.topicTokens,
    failureStage: null,
    failureCode: null,
    ...(input.followUp ? { followUpOfPostId: input.followUp.postId, followUpReason: input.followUp.reason.slice(0, 500) } : {}),
  });
  const opened = await openPacket(tx, item.id, item.title, epoch, settings);
  await auditItem(tx, 'ai_content.topic.approved', item.id, input.adminId, { novelty: novelty.status, followUp: Boolean(input.followUp), packetVersion: opened.packetVersion, inventoryEpoch: epoch }, input.requestId);
  return opened;
}

/**
 * Starts a fresh evidence retrieval for an admitted item: a new packet
 * version, so earlier evidence and verdicts stay as they were (plan §G step 8).
 */
export async function refreshResearch(tx: Tx, input: { itemId: string; expectedVersion: number; adminId: string; requestId?: string | null }) {
  const epoch = await readInventoryEpoch(tx);
  const settings = await readResearchSettings(tx);
  const item = await lockItem(tx, input.itemId);
  if (item.version !== input.expectedVersion) throw new ResearchCommandError('STALE_VERSION', 'This topic changed. Reload it before trying again.');
  if (!['researching', 'needs_fact_review'].includes(item.status)) throw new ResearchCommandError('INVALID_TRANSITION', 'Only a topic in research or fact review can be refreshed.');
  if (!settings.enabled) throw new ResearchCommandError('AUTOMATION_DISABLED', 'AI automation is switched off, so no research can start.');
  if (item.researchUrls.length === 0) throw new ResearchCommandError('NO_RESEARCH_SOURCES', 'Add at least one source page before refreshing research.', 400);
  await moveItem(tx, item, 'researching');
  const opened = await openPacket(tx, item.id, item.title, epoch, settings);
  await auditItem(tx, 'ai_content.research.refreshed', item.id, input.adminId, { packetVersion: opened.packetVersion }, input.requestId);
  return opened;
}

export interface ClaimCandidate {
  kind: ClaimKind;
  subject: string;
  value: string;
  excerpt: string;
  location?: string | null;
  validUntil?: Date | null;
}

export interface EvidenceInput {
  url: string;
  finalUrl?: string | null;
  host: string;
  tier: SourceTier;
  fetchStatus: 'ok' | 'http_error' | 'blocked' | 'robots_disallowed' | 'timeout' | 'too_large' | 'unsupported_type' | 'network_error';
  httpStatus?: number | null;
  contentType?: string | null;
  contentHash?: string | null;
  etag?: string | null;
  title?: string | null;
  sourceDate?: Date | null;
  text?: string | null;
  structuredData?: Prisma.InputJsonValue | null;
  fetchedAt: Date;
  claims: ClaimCandidate[];
}

export function claimKey(kind: ClaimKind, subject: string, value: string): string {
  return sha256(JSON.stringify([kind, normalizeClaimValue(subject), normalizeClaimValue(value)]));
}

async function attachClaim(tx: Tx, packetId: string, evidenceId: string, claim: ClaimCandidate, origin: 'extracted' | 'editor', adminId: string | null, material = true): Promise<string> {
  const key = claimKey(claim.kind, claim.subject, claim.value);
  const existing = await tx.aIFactClaim.findUnique({ where: { packetId_claimKey: { packetId, claimKey: key } }, select: { id: true } });
  const id =
    existing?.id ??
    (
      await tx.aIFactClaim.create({
        data: {
          packetId,
          claimKey: key,
          kind: claim.kind,
          subject: claim.subject.slice(0, 200),
          value: claim.value.slice(0, 1000),
          origin,
          material,
          validUntil: claim.validUntil ?? null,
          createdByAdminId: adminId,
        },
        select: { id: true },
      })
    ).id;
  await tx.aIClaimSource.upsert({
    where: { claimId_evidenceId: { claimId: id, evidenceId } },
    create: { claimId: id, evidenceId, excerpt: claim.excerpt.slice(0, 1000), location: claim.location?.slice(0, 200) ?? null },
    update: {},
  });
  return id;
}

/**
 * Stores one retrieval and the claims extracted from it, under the worker's
 * lease. Idempotent per packet and URL: a repeated delivery keeps the first
 * retrieval, never overwrites evidence.
 */
export async function recordEvidence(db: DatabaseClient, lease: OperationLease, packetId: string, evidence: EvidenceInput): Promise<'stored' | 'exists'> {
  return db.$transaction(async (tx) => {
    await assertLease(tx, lease);
    const urlHash = researchUrlHash(evidence.url);
    const existing = await tx.aISourceEvidence.findUnique({ where: { packetId_urlHash: { packetId, urlHash } }, select: { id: true, fetchStatus: true } });
    if (existing && existing.fetchStatus === 'ok') return 'exists';
    // A failed retrieval may be replaced by a later successful attempt of the same operation.
    if (existing) await tx.aISourceEvidence.delete({ where: { id: existing.id } });
    const row = await tx.aISourceEvidence.create({
      data: {
        packetId,
        url: evidence.url.slice(0, 2000),
        urlHash,
        finalUrl: evidence.finalUrl?.slice(0, 2000) ?? null,
        host: evidence.host.slice(0, 253),
        tier: evidence.tier,
        fetchStatus: evidence.fetchStatus,
        httpStatus: evidence.httpStatus ?? null,
        contentType: evidence.contentType?.slice(0, 100) ?? null,
        contentHash: evidence.contentHash ?? null,
        etag: evidence.etag?.slice(0, 200) ?? null,
        title: evidence.title?.slice(0, 300) ?? null,
        sourceDate: evidence.sourceDate ?? null,
        text: evidence.text?.slice(0, 20_000) ?? null,
        structuredData: evidence.structuredData ?? undefined,
        fetchedAt: evidence.fetchedAt,
      },
      select: { id: true },
    });
    if (evidence.fetchStatus === 'ok') for (const claim of evidence.claims.slice(0, 100)) await attachClaim(tx, packetId, row.id, claim, 'extracted', null);
    return 'stored';
  });
}

/**
 * Applies the verification policy to a packet and stores every verdict
 * (plan §G step 5). Change detection compares material values with the
 * item's previous verified packet: a changed value is never inherited as
 * verified.
 */
export async function evaluatePacket(tx: Tx, packetId: string, now: Date) {
  const packet = await tx.aIResearchPacket.findUniqueOrThrow({ where: { id: packetId }, select: { id: true, itemId: true, version: true } });
  const settings = await readResearchSettings(tx);
  const claims = await tx.aIFactClaim.findMany({
    where: { packetId },
    include: { sources: { include: { evidence: { select: { id: true, host: true, tier: true, fetchedAt: true, fetchStatus: true } } } } },
  });
  const evidenceOk = await tx.aISourceEvidence.count({ where: { packetId, fetchStatus: 'ok' } });
  const previous = await tx.aIResearchPacket.findFirst({
    where: { itemId: packet.itemId, status: 'verified', version: { lt: packet.version } },
    orderBy: { version: 'desc' },
    select: { claims: { where: { status: 'verified', material: true }, select: { kind: true, subject: true, value: true } } },
  });
  const previousValues = new Map<string, Set<string>>();
  for (const c of previous?.claims ?? []) {
    const key = `${c.kind}|${normalizeClaimValue(c.subject)}`;
    previousValues.set(key, new Set([...(previousValues.get(key) ?? []), normalizeClaimValue(c.value)]));
  }
  const changes: { kind: string; subject: string; value: string }[] = [];
  const inputs: ClaimInput[] = claims.map((c) => {
    const before = previousValues.get(`${c.kind}|${normalizeClaimValue(c.subject)}`);
    const changed = Boolean(before && !before.has(normalizeClaimValue(c.value)));
    if (changed && c.material) changes.push({ kind: c.kind, subject: c.subject.slice(0, 120), value: c.value.slice(0, 200) });
    return {
      id: c.id,
      kind: c.kind as ClaimKind,
      subject: c.subject,
      value: c.value,
      material: c.material,
      excluded: c.excluded,
      accepted: c.accepted,
      validUntil: c.validUntil,
      changed,
      sources: c.sources.filter((s) => s.evidence.fetchStatus === 'ok').map((s) => ({ evidenceId: s.evidence.id, host: s.evidence.host, tier: s.evidence.tier as SourceTier, fetchedAt: s.evidence.fetchedAt })),
    };
  });
  const { verdicts, packet: result } = evaluateClaims(inputs, now, settings.freshness, evidenceOk);
  for (const claim of claims) {
    const verdict = verdicts.get(claim.id)!;
    if (claim.status !== verdict.status || claim.reason !== verdict.reason || claim.freshUntil?.getTime() !== verdict.freshUntil?.getTime()) {
      await tx.aIFactClaim.update({ where: { id: claim.id }, data: { status: verdict.status, reason: verdict.reason, freshUntil: verdict.freshUntil } });
    }
  }
  const reasons = [...result.reasons, ...(changes.length > 0 ? [`${changes.length} material value${changes.length === 1 ? '' : 's'} changed since the last verification`] : [])];
  // What an approval certifies: the verified material claims and the exact evidence behind them.
  const certified = claims
    .filter((c) => c.material && verdicts.get(c.id)?.status === 'verified')
    .map((c) => [c.kind, c.subject, c.value, c.sources.map((s) => s.evidence.id).sort()])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const evidenceHashes = await tx.aISourceEvidence.findMany({ where: { packetId, fetchStatus: 'ok' }, select: { id: true, contentHash: true }, orderBy: { id: 'asc' } });
  const contentHash = result.status === 'verified' ? sha256(JSON.stringify([certified, evidenceHashes])) : null;
  await tx.aIResearchPacket.update({
    where: { id: packetId },
    data: {
      contentHash,
      status: result.status,
      failureCode: result.status === 'failed' ? 'no_evidence' : null,
      reasons,
      changes: changes.slice(0, 50),
      freshUntil: result.freshUntil,
      evaluatedAt: now,
    },
  });
  return { status: result.status, reasons, freshUntil: result.freshUntil };
}

/**
 * Finishes a research operation (under its lease): evaluates the packet,
 * re-checks novelty if the inventory changed since admission (a new human
 * article can win), and moves the item. A verified packet leaves the item in
 * `researching` with research complete: generation is a later, separately
 * approved phase, so nothing moves to `generating` here.
 */
export async function completeResearch(db: DatabaseClient, lease: OperationLease, now = new Date()) {
  return db.$transaction(async (tx) => {
    const epoch = await readInventoryEpoch(tx);
    const op = await tx.aIOperation.findUniqueOrThrow({ where: { id: lease.operationId }, select: { itemId: true, packetId: true } });
    const item = await lockItem(tx, op.itemId!);
    await assertLease(tx, lease);
    const packet = await tx.aIResearchPacket.findUniqueOrThrow({ where: { id: op.packetId! }, select: { id: true, inventoryEpoch: true, version: true } });
    const latest = await tx.aIResearchPacket.findFirst({ where: { itemId: item.id }, orderBy: { version: 'desc' }, select: { id: true } });
    const result = await evaluatePacket(tx, packet.id, now);
    let noveltyConflict: string | null = null;
    if (epoch !== packet.inventoryEpoch && !item.followUpOfPostId) {
      const novelty = await assessNovelty(tx, { title: item.title, itemId: item.id, includeUnadmitted: false });
      await tx.aIContentItem.update({ where: { id: item.id }, data: { noveltyStatus: novelty.status, noveltyEpoch: epoch, noveltyCheckedAt: now, noveltyDetail: noveltyDetailJson(novelty.matches), version: { increment: 1 } } });
      if (novelty.status !== 'clear') noveltyConflict = novelty.status;
      item.version += 1;
    }
    // Only the newest packet moves the item; an older one's result stays on record.
    if (latest?.id === packet.id && item.status === 'researching') {
      if (noveltyConflict) await moveItem(tx, item, 'failed', { failureStage: 'research', failureCode: `novelty_${noveltyConflict}` });
      else if (result.status === 'failed') await moveItem(tx, item, 'failed', { failureStage: 'research', failureCode: 'no_evidence' });
      else if (result.status === 'needs_fact_review') await moveItem(tx, item, 'needs_fact_review');
      else await moveItem(tx, item, 'researching', { failureStage: null, failureCode: null });
    }
    await finishOperation(tx, lease, 'succeeded', `packet:${result.status}${noveltyConflict ? `:novelty_${noveltyConflict}` : ''}`);
    await auditItem(tx, 'ai_content.research.completed', item.id, null, { packetVersion: packet.version, status: result.status, novelty: noveltyConflict ?? 'unchanged', operationId: lease.operationId });
    return `${result.status}${noveltyConflict ? `:novelty_${noveltyConflict}` : ''}`;
  });
}

/** Moves the item to match its newest packet after an editor decision, in the same transaction. */
async function syncItemWithPacket(tx: Tx, itemId: string, packetId: string, status: 'verified' | 'needs_fact_review' | 'failed') {
  const item = await lockItem(tx, itemId);
  const latest = await tx.aIResearchPacket.findFirst({ where: { itemId }, orderBy: { version: 'desc' }, select: { id: true } });
  if (latest?.id !== packetId) throw new ResearchCommandError('STALE_PACKET', 'A newer research packet exists for this topic; review that one.');
  if (status === 'verified' && item.status === 'needs_fact_review') await moveItem(tx, item, 'researching');
  else if (status === 'needs_fact_review' && item.status === 'researching') await moveItem(tx, item, 'needs_fact_review');
}

async function editablePacket(tx: Tx, packetId: string) {
  const packet = await tx.aIResearchPacket.findUnique({ where: { id: packetId }, select: { id: true, itemId: true, status: true } });
  if (!packet) throw new ResearchCommandError('NOT_FOUND', 'This research packet does not exist.', 404);
  const item = await lockItem(tx, packet.itemId);
  if (!['researching', 'needs_fact_review'].includes(item.status)) throw new ResearchCommandError('INVALID_TRANSITION', 'Claims can only change while the topic is in research or fact review.');
  if (packet.status === 'collecting') throw new ResearchCommandError('RESEARCH_IN_PROGRESS', 'Research is still collecting evidence.');
  return packet;
}

/**
 * An editor's evidence-backed decision on one claim (plan §G steps 5 and 8):
 * accept this value over conflicting ones, exclude it from the article, or
 * undo either. Accepting needs fresh supporting evidence; excluding needs a
 * reason. Nothing is deleted and no check is bypassed: the packet is
 * re-evaluated under the same rules.
 */
export async function resolveClaim(
  tx: Tx,
  input: { claimId: string; expectedVersion: number; action: 'accept' | 'exclude' | 'reopen'; note: string | null; adminId: string; requestId?: string | null; now?: Date },
) {
  const now = input.now ?? new Date();
  const note = input.note?.trim() || null;
  if (input.action === 'exclude' && !note) throw new ResearchCommandError('VALIDATION_ERROR', 'Say why this claim is excluded from the article.', 400, { fields: { note: ['A reason is required'] } });
  const claim = await tx.aIFactClaim.findUnique({ where: { id: input.claimId }, include: { sources: { include: { evidence: { select: { fetchStatus: true } } } } } });
  if (!claim) throw new ResearchCommandError('NOT_FOUND', 'This claim does not exist.', 404);
  if (claim.version !== input.expectedVersion) throw new ResearchCommandError('STALE_VERSION', 'This claim changed. Reload it before trying again.');
  const packet = await editablePacket(tx, claim.packetId);
  if (input.action === 'accept' && !claim.sources.some((s) => s.evidence.fetchStatus === 'ok')) {
    throw new ResearchCommandError('NO_EVIDENCE', 'A claim can only be accepted on retrieved evidence.', 409);
  }
  const data =
    input.action === 'accept'
      ? { accepted: true, excluded: false }
      : input.action === 'exclude'
        ? { excluded: true, accepted: false }
        : { excluded: false, accepted: false };
  if (input.action === 'accept') {
    // One accepted value per kind and subject.
    await tx.aIFactClaim.updateMany({ where: { packetId: packet.id, kind: claim.kind, subject: claim.subject, id: { not: claim.id }, accepted: true }, data: { accepted: false, version: { increment: 1 } } });
  }
  const updated = await tx.aIFactClaim.updateMany({
    where: { id: claim.id, version: input.expectedVersion },
    data: { ...data, resolutionNote: note, resolvedByAdminId: input.adminId, resolvedAt: now, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new ResearchCommandError('STALE_VERSION', 'This claim changed. Reload it before trying again.');
  const result = await evaluatePacket(tx, packet.id, now);
  await syncItemWithPacket(tx, packet.itemId, packet.id, result.status);
  await auditItem(tx, `ai_content.claim.${input.action === 'reopen' ? 'reopened' : input.action === 'accept' ? 'accepted' : 'excluded'}`, packet.itemId, input.adminId, { claimId: claim.id, kind: claim.kind, material: claim.material, packetStatus: result.status, noteProvided: Boolean(note) }, input.requestId);
  return result;
}

const squash = (text: string) => normalizeClaimValue(text).replace(/\s+/g, ' ');

/**
 * An editor adds a claim the article may make, backed by stored evidence
 * (plan §G step 4). The excerpt must appear in the retrieved text and must
 * contain the value; nothing is taken on the editor's word alone.
 */
export async function addEditorClaim(
  tx: Tx,
  input: { packetId: string; evidenceId: string; kind: ClaimKind; subject: string; value: string; excerpt: string; material: boolean; validUntil?: Date | null; adminId: string; requestId?: string | null; now?: Date },
) {
  const packet = await editablePacket(tx, input.packetId);
  if (!CLAIM_KINDS.includes(input.kind)) throw new ResearchCommandError('VALIDATION_ERROR', 'Choose a claim type.', 400, { fields: { kind: ['Unknown claim type'] } });
  const evidence = await tx.aISourceEvidence.findUnique({ where: { id: input.evidenceId }, select: { packetId: true, fetchStatus: true, text: true } });
  if (!evidence || evidence.packetId !== packet.id || evidence.fetchStatus !== 'ok' || !evidence.text) {
    throw new ResearchCommandError('VALIDATION_ERROR', 'Choose retrieved evidence from this research packet.', 400, { fields: { evidenceId: ['Not retrieved evidence of this packet'] } });
  }
  const excerpt = input.excerpt.trim();
  if (!excerpt || !squash(evidence.text).includes(squash(excerpt))) {
    throw new ResearchCommandError('VALIDATION_ERROR', 'The excerpt must be copied from the retrieved source text.', 400, { fields: { excerpt: ['Not found in the source text'] } });
  }
  if (!squash(excerpt).includes(squash(input.value))) {
    throw new ResearchCommandError('VALIDATION_ERROR', 'The excerpt must state the value exactly.', 400, { fields: { value: ['Not stated in the excerpt'] } });
  }
  const claimId = await attachClaim(tx, packet.id, input.evidenceId, { kind: input.kind, subject: input.subject.trim(), value: input.value.trim(), excerpt, location: 'editor excerpt', validUntil: input.validUntil ?? null }, 'editor', input.adminId, input.material);
  const result = await evaluatePacket(tx, packet.id, input.now ?? new Date());
  await syncItemWithPacket(tx, packet.itemId, packet.id, result.status);
  await auditItem(tx, 'ai_content.claim.added', packet.itemId, input.adminId, { claimId, kind: input.kind, material: input.material, packetStatus: result.status }, input.requestId);
  return { claimId, ...result };
}

/**
 * Publication-time research freshness (owner policy §5, plan §G step 8): the
 * newest packet must be verified and still inside every material claim's
 * freshness window, and any event must still be upcoming.
 */
export async function researchFreshnessBlocker(tx: Tx, itemId: string, now: Date): Promise<string | null> {
  const packet = await tx.aIResearchPacket.findFirst({ where: { itemId }, orderBy: { version: 'desc' }, select: { status: true, freshUntil: true } });
  if (!packet || packet.status !== 'verified' || !packet.freshUntil) return 'The research for this AI article is not verified; review its facts first.';
  if (packet.freshUntil.getTime() <= now.getTime()) return 'The research evidence for this AI article has expired; refresh it before publishing.';
  return null;
}
