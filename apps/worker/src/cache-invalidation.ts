import { normaliseCacheTags } from '@adelaide-sphere/domain';

export interface CacheInvalidationJobData {
  eventId?: string;
  /** Comma-separated tag list written by the API (SRS CACHE 002). */
  tags?: string;
  urgent?: boolean;
}

export interface RevalidateTarget {
  /** Absolute URL of the web tier's revalidation endpoint. */
  url: string;
  /** Shared secret; the endpoint refuses anything else. */
  token: string;
}

export interface InvalidationResult {
  tags: string[];
  status: 'purged' | 'skipped';
}

/**
 * Asks the web tier to purge the tags a publication change affected (SRS
 * CACHE 002). A failure throws so BullMQ retries with backoff: a TTL alone is
 * not acceptable for a removal, so the purge has to be tracked until it
 * succeeds. With no target configured the job is a no-op, which is the correct
 * behaviour for a deployment that serves no cached HTML.
 */
export async function invalidateCache(
  data: CacheInvalidationJobData,
  deps: { target: RevalidateTarget | null; fetch?: typeof globalThis.fetch; timeoutMs?: number },
): Promise<InvalidationResult> {
  const tags = normaliseCacheTags((data.tags ?? '').split(','));
  if (tags.length === 0) return { tags: [], status: 'skipped' };
  if (!deps.target) return { tags, status: 'skipped' };

  const doFetch = deps.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 5_000);
  try {
    const response = await doFetch(deps.target.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-revalidate-token': deps.target.token },
      body: JSON.stringify({ tags }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`revalidation failed with status ${response.status}`);
    return { tags, status: 'purged' };
  } finally {
    clearTimeout(timer);
  }
}
