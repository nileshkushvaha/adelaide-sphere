import { createHash } from 'node:crypto';
import type { DatabaseClient } from '@adelaide-sphere/database';
import {
  MAX_DISCOVERY_CANDIDATES,
  MAX_OPERATION_ATTEMPTS,
  assertLease,
  completeResearch,
  extendLease,
  finishOperation,
  parseResearchUrls,
  readResearchSettings,
  recordDiscoveryCandidates,
  recordEvidence,
  releaseForRetry,
  researchUrlHash,
  type DiscoverySignal,
  type OperationLease,
} from '@adelaide-sphere/database/automation';
import { matchesNiche, parseTermList, type SourceTier } from '@adelaide-sphere/domain';
import { extractPage, parseFeed } from './extract.js';
import { FEED_TYPES, robotsAllows, safeFetch, type SafeFetchOptions, type SafeFetchResult } from './safe-fetch.js';

/**
 * The free public research adapters (AI plan §F): configured feeds for
 * recent signals and bounded public page retrieval for evidence. Every
 * request goes through the SSRF-safe boundary; nothing is sent to any
 * provider, and no model is involved. Only public pages are requested:
 * no draft, autosave, enquiry, customer, admin or session data leaves here.
 */
export interface ResearchDeps {
  /** Test seam for the fetch boundary (resolver and transport); production uses the defaults. */
  fetchOptions?: Pick<SafeFetchOptions, 'resolve' | 'transport'>;
  now?: () => Date;
}

const TRANSIENT = new Set(['timeout', 'network_error']);
const DISCOVERY_WINDOW_DAYS = 14;
const MAX_FEEDS = 10;

type Registry = Map<string, { tier: SourceTier; label: string }>;

async function loadRegistry(db: DatabaseClient): Promise<Registry> {
  const rows = await db.aIResearchSource.findMany({ where: { active: true }, select: { host: true, tier: true, label: true }, take: 500 });
  return new Map(rows.map((r) => [r.host, { tier: r.tier as SourceTier, label: r.label }]));
}

/** A registered host, or its registered parent domain (www.example.org → example.org). */
export function registeredTier(registry: Registry, host: string): { tier: SourceTier; label: string } | null {
  const parts = host.toLowerCase().split('.');
  for (let i = 0; i < parts.length - 1; i += 1) {
    const hit = registry.get(parts.slice(i).join('.'));
    if (hit) return hit;
  }
  return null;
}

function robotsChecker(deps: ResearchDeps) {
  const cache = new Map<string, string | null>();
  return async (url: URL): Promise<boolean> => {
    if (!cache.has(url.host)) {
      const robots = await safeFetch(`https://${url.host}/robots.txt`, { ...deps.fetchOptions, accept: ['text/plain'], maxBytes: 100_000, timeoutMs: 5_000 });
      cache.set(url.host, robots.ok ? robots.body : null);
    }
    const robots = cache.get(url.host);
    return robots === null || robots === undefined ? true : robotsAllows(robots, `${url.pathname}${url.search}`);
  };
}

async function politeFetch(url: string, allowed: (u: URL) => Promise<boolean>, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const parsed = new URL(url);
  if (!(await allowed(parsed))) return { ok: false, failure: 'robots_disallowed', url, finalUrl: url, status: null, contentType: null, etag: null, lastModified: null, retryAfterSeconds: null, body: '' };
  return safeFetch(url, options);
}

/**
 * Retrieves a packet's evidence under the operation's lease and evaluates it.
 * Stored evidence is kept across attempts, so a retry only fetches what is
 * missing. Transient failures (timeouts, 5xx, 429) retry within the attempt
 * cap, never sooner than Retry-After; after that the packet is evaluated on
 * what was retrieved, and missing evidence is simply missing: unresolved,
 * never filled in.
 */
export async function runResearch(db: DatabaseClient, lease: OperationLease, deps: ResearchDeps = {}): Promise<string> {
  const op = await db.aIOperation.findUniqueOrThrow({ where: { id: lease.operationId }, select: { itemId: true, packetId: true, attempts: true } });
  const item = await db.aIContentItem.findUniqueOrThrow({ where: { id: op.itemId! }, select: { researchUrls: true } });
  const settings = await readResearchSettings(db);
  const registry = await loadRegistry(db);
  const allowed = robotsChecker(deps);
  let transient = 0;
  let retryAfterMs = 0;
  // Switched off mid-run: no further external requests; evaluate what is already stored.
  if (settings.enabled) {
    for (const source of parseResearchUrls(item.researchUrls)) {
      const stored = await db.aISourceEvidence.findUnique({ where: { packetId_urlHash: { packetId: op.packetId!, urlHash: researchUrlHash(source.url) } }, select: { fetchStatus: true } });
      if (stored?.fetchStatus === 'ok') continue;
      if (!(await extendLease(db, lease))) return 'stale_lease';
      const host = new URL(source.url).hostname.toLowerCase();
      const tier: SourceTier = source.tier ?? registeredTier(registry, host)?.tier ?? 'unclassified';
      const fetchedAt = deps.now?.() ?? new Date();
      const result = await politeFetch(source.url, allowed, { ...deps.fetchOptions });
      const transientHttp = result.failure === 'http_error' && (result.status === 429 || (result.status ?? 0) >= 500);
      if ((result.failure && TRANSIENT.has(result.failure)) || transientHttp) {
        transient += 1;
        retryAfterMs = Math.max(retryAfterMs, (result.retryAfterSeconds ?? 0) * 1000);
      }
      const page = result.ok ? extractPage(result.body) : null;
      try {
        await recordEvidence(db, lease, op.packetId!, {
          url: source.url,
          finalUrl: result.finalUrl,
          host,
          tier,
          fetchStatus: result.ok ? 'ok' : (result.failure ?? 'network_error'),
          httpStatus: result.status,
          contentType: result.contentType,
          contentHash: result.ok ? createHash('sha256').update(result.body).digest('hex') : null,
          etag: result.etag,
          title: page?.title ?? null,
          sourceDate: page?.sourceDate ?? (result.lastModified ? new Date(result.lastModified) : null),
          text: page?.text ?? null,
          structuredData: page ? (page.structuredData as never) : null,
          fetchedAt,
          claims: page?.claims ?? [],
        });
      } catch (error) {
        if ((error as Error).name === 'StaleLeaseError') return 'stale_lease';
        throw error;
      }
    }
  }
  if (transient > 0 && op.attempts < MAX_OPERATION_ATTEMPTS && settings.enabled) {
    const released = await releaseForRetry(db, lease, 'source_unavailable', retryAfterMs);
    return released === 'stale' ? 'stale_lease' : released;
  }
  try {
    return `packet:${await completeResearch(db, lease, deps.now?.() ?? new Date())}`;
  } catch (error) {
    if ((error as Error).name === 'StaleLeaseError') return 'stale_lease';
    throw error;
  }
}

/**
 * Discovery (AI SRS §7; owner policy §7): recent items from configured public
 * feeds, kept only when inside the configured niche, then compared with the
 * existing inventory and rejected history before any candidate is proposed.
 * Runs only when automation is on and title mode allows automatic topics.
 */
export async function runDiscovery(db: DatabaseClient, lease: OperationLease, deps: ResearchDeps = {}): Promise<string> {
  const setting = await db.setting.findUnique({ where: { group_key: { group: 'ai_content', key: 'defaults' } }, select: { data: true } });
  const data = (setting?.data ?? {}) as Record<string, unknown>;
  const finish = async (state: 'succeeded' | 'failed', code: string) => {
    await db.$transaction(async (tx) => {
      await assertLease(tx, lease);
      await finishOperation(tx, lease, state, code);
    });
    return code;
  };
  if (data.enabled !== true) return finish('succeeded', 'skipped:automation_disabled');
  if (data.titleMode !== 'automatic' && data.titleMode !== 'hybrid') return finish('succeeded', 'skipped:manual_title_mode');
  const include = parseTermList(typeof data.discoveryKeywords === 'string' ? data.discoveryKeywords : '');
  const exclude = parseTermList(typeof data.excludedKeywords === 'string' ? data.excludedKeywords : '');
  if (include.length === 0) return finish('succeeded', 'skipped:no_niche_terms');
  const registry = await loadRegistry(db);
  const feeds = await db.aIResearchSource.findMany({ where: { active: true, feedUrl: { not: null } }, select: { host: true, label: true, tier: true, feedUrl: true }, orderBy: { host: 'asc' }, take: MAX_FEEDS });
  if (feeds.length === 0) return finish('succeeded', 'skipped:no_feeds');
  const allowed = robotsChecker(deps);
  const now = deps.now?.() ?? new Date();
  const since = now.getTime() - DISCOVERY_WINDOW_DAYS * 86_400_000;
  const signals: DiscoverySignal[] = [];
  let readable = 0;
  for (const feed of feeds) {
    if (!(await extendLease(db, lease))) return 'stale_lease';
    const result = await politeFetch(feed.feedUrl!, allowed, { ...deps.fetchOptions, accept: FEED_TYPES, maxBytes: 1_000_000 });
    if (!result.ok) continue;
    readable += 1;
    for (const entry of parseFeed(result.body)) {
      // A signal must be recent; an undated or future-dated item is not a current signal.
      if (!entry.publishedAt || entry.publishedAt.getTime() < since || entry.publishedAt.getTime() > now.getTime() + 86_400_000) continue;
      if (!matchesNiche(entry.title, include, exclude)) continue;
      let host: string;
      try {
        host = new URL(entry.link).hostname.toLowerCase();
      } catch {
        continue;
      }
      signals.push({ title: entry.title, link: entry.link, publishedAt: entry.publishedAt, sourceLabel: feed.label, sourceHost: feed.host, tier: registeredTier(registry, host)?.tier ?? 'unclassified' });
    }
  }
  if (readable === 0) return finish('failed', 'failed:no_feed_readable');
  const result = await recordDiscoveryCandidates(db, lease, await requester(db, lease.operationId), signals.slice(0, MAX_DISCOVERY_CANDIDATES * 20));
  return `created:${result.created} duplicate:${result.duplicates} history:${result.history} known:${result.known}`;
}

async function requester(db: DatabaseClient, operationId: string): Promise<string | null> {
  const entry = await db.auditLog.findFirst({ where: { action: 'ai_content.discovery.requested', targetId: operationId }, select: { actorAdminId: true } });
  return entry?.actorAdminId ?? null;
}
