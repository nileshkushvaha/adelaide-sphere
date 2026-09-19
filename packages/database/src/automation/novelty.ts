import { createHash } from 'node:crypto';
import {
  classifyNovelty,
  locationStopwords,
  normalizeTopicText,
  topicFingerprint,
  type NoveltyCandidate,
  type NoveltyMatch,
  type NoveltyStatus,
  type TopicFingerprint,
} from '@adelaide-sphere/domain';
import type { Prisma } from '../generated/prisma/client.js';
import { AI_CONTROL_ID } from './control.js';

type Tx = Prisma.TransactionClient;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
/** Bounds on the local comparison (plan §E: bounded candidates, no whole-site scan). */
const POST_CANDIDATES = 50;
const ITEM_CANDIDATES = 1000;

export interface StoredFingerprint {
  fingerprint: TopicFingerprint;
  intentKey: string | null;
  eventKey: string | null;
  topicTokens: string | null;
}

/** Fingerprints a topic title; geography words come from the configured location. */
export function fingerprintTopic(title: string, location: string): StoredFingerprint {
  const fingerprint = topicFingerprint(title, locationStopwords(location));
  const tokens = [...fingerprint.tokens, ...fingerprint.dates.map((d) => `#${d}`)].join(' ');
  return {
    fingerprint,
    intentKey: fingerprint.intentBasis ? sha256(fingerprint.intentBasis) : null,
    eventKey: fingerprint.eventBasis ? sha256(fingerprint.eventBasis) : null,
    topicTokens: tokens ? tokens.slice(0, 400) : null,
  };
}

function storedTokens(topicTokens: string | null): { tokens: string[]; dates: string[] } {
  const parts = (topicTokens ?? '').split(' ').filter(Boolean);
  return { tokens: parts.filter((p) => !p.startsWith('#')), dates: parts.filter((p) => p.startsWith('#')).map((p) => p.slice(1)) };
}

/** The configured deployment location; research and novelty never assume one. */
export async function configuredLocation(tx: Tx): Promise<string> {
  const setting = await tx.setting.findUnique({ where: { group_key: { group: 'ai_content', key: 'defaults' } }, select: { data: true } });
  const location = (setting?.data as { location?: unknown } | null)?.location;
  return typeof location === 'string' ? location : '';
}

/**
 * Local inventory candidates: Posts of every status (drafts included — this
 * never leaves the database), found by full-text relevance or exact slug, and
 * AI items including rejected/cancelled history.
 */
async function candidates(tx: Tx, title: string, location: string, excludeItemId: string | null, slug: string | null, includeUnadmitted: boolean, excludePostId: string | null = null): Promise<NoveltyCandidate[]> {
  // Full-text search does not stem, so it is queried with the title's own words; similarity uses the stems.
  const locationWordSet = new Set(locationStopwords(location));
  const words = normalizeTopicText(title).split(' ').filter((w) => w.length >= 3 && !locationWordSet.has(w));
  const posts = words.length
    ? await tx.$queryRaw<{ id: string; title: string; slug: string; status: string }[]>`
        SELECT id, title, slug, status FROM posts
         WHERE MATCH(title, excerpt, searchText) AGAINST (${words.join(' ')} IN NATURAL LANGUAGE MODE)
         LIMIT ${POST_CANDIDATES}`
    : [];
  const slugPost = slug ? await tx.post.findUnique({ where: { slug }, select: { id: true, title: true, slug: true, status: true } }) : null;
  const allPosts = new Map([...posts, ...(slugPost ? [slugPost] : [])].filter((p) => p.id !== excludePostId).map((p) => [p.id, p]));
  const locationWords = locationStopwords(location);
  const items = await tx.aIContentItem.findMany({
    where: {
      topicTokens: { not: null },
      ...(excludeItemId ? { id: { not: excludeItemId } } : {}),
      // Queued and paused ideas are only ideas: they inform an editor, but at admission they neither block nor
      // are blocked by one another. Admitted items and rejected/cancelled history always count.
      ...(includeUnadmitted ? {} : { status: { notIn: ['queued', 'paused'] } }),
    },
    select: { id: true, title: true, status: true, topicTokens: true },
    orderBy: { createdAt: 'desc' },
    take: ITEM_CANDIDATES,
  });
  return [
    ...[...allPosts.values()].map((p) => {
      const f = topicFingerprint(p.title, locationWords);
      return { kind: 'post' as const, id: p.id, title: p.title, status: p.status, tokens: f.tokens, dates: f.dates, slug: p.slug };
    }),
    ...items.map((i) => ({ kind: 'item' as const, id: i.id, title: i.title, status: i.status, ...storedTokens(i.topicTokens) })),
  ];
}

export interface NoveltyAssessment {
  status: NoveltyStatus;
  matches: NoveltyMatch[];
  fingerprint: StoredFingerprint;
}

/** Local-only novelty assessment; no network call, no provider. */
export async function assessNovelty(tx: Tx, input: { title: string; itemId?: string | null; slug?: string | null; includeUnadmitted?: boolean; /** The item's own article, never a competitor of itself. */ excludePostId?: string | null }): Promise<NoveltyAssessment> {
  const location = await configuredLocation(tx);
  const fingerprint = fingerprintTopic(input.title, location);
  const result = classifyNovelty({ ...fingerprint.fingerprint, slug: input.slug ?? null }, await candidates(tx, input.title, location, input.itemId ?? null, input.slug ?? null, input.includeUnadmitted ?? true, input.excludePostId ?? null));
  return { ...result, fingerprint };
}

export function noveltyDetailJson(matches: readonly NoveltyMatch[]): Prisma.InputJsonArray {
  return matches.map((m) => ({ kind: m.kind, id: m.id, title: m.title.slice(0, 180), status: m.status, score: Math.round(m.score * 100) / 100, reason: m.reason, verdict: m.verdict }));
}

async function ensureControlRow(tx: Tx): Promise<void> {
  await tx.$executeRaw`INSERT INTO ai_automation_controls (id, epoch, inventoryEpoch, updatedAt) VALUES (${AI_CONTROL_ID}, 1, 1, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE id = id`;
}

/**
 * Serialises novelty admission (plan §E step 4): the control row is held for
 * update, so no admission and no inventory change can interleave with the
 * decision. Returns the inventory epoch the decision is made against.
 */
export async function lockInventory(tx: Tx): Promise<number> {
  await ensureControlRow(tx);
  const rows = await tx.$queryRaw<{ inventoryEpoch: number }[]>`SELECT inventoryEpoch FROM ai_automation_controls WHERE id = ${AI_CONTROL_ID} FOR UPDATE`;
  return Number(rows[0]!.inventoryEpoch);
}

/** Records an inventory change in the caller's transaction (Post create/retitle/rewrite, AI admission/cancel/reject). */
export async function bumpInventoryEpoch(tx: Tx): Promise<number> {
  await ensureControlRow(tx);
  await tx.$executeRaw`UPDATE ai_automation_controls SET inventoryEpoch = inventoryEpoch + 1, updatedAt = UTC_TIMESTAMP(3) WHERE id = ${AI_CONTROL_ID}`;
  const rows = await tx.$queryRaw<{ inventoryEpoch: number }[]>`SELECT inventoryEpoch FROM ai_automation_controls WHERE id = ${AI_CONTROL_ID}`;
  return Number(rows[0]!.inventoryEpoch);
}

export async function readInventoryEpoch(tx: Tx): Promise<number> {
  const rows = await tx.$queryRaw<{ inventoryEpoch: number }[]>`SELECT inventoryEpoch FROM ai_automation_controls WHERE id = ${AI_CONTROL_ID}`;
  return Number(rows[0]?.inventoryEpoch ?? 0);
}
