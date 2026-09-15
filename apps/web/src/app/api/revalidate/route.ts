import { revalidateTag } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

/** Bound so one request cannot ask for an unbounded amount of work. */
const MAX_TAGS = 20;

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Compare in constant time; different lengths are rejected without leaking where.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Purge endpoint for the worker (SRS CACHE 002). It authenticates with a
 * shared secret, accepts only tag names, and returns 503 when no secret is
 * configured rather than silently accepting anonymous purges.
 */
export async function POST(request: Request): Promise<Response> {
  const expected = (process.env.REVALIDATE_TOKEN ?? '').trim();
  if (expected === '') {
    return Response.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Revalidation is not configured' } }, { status: 503 });
  }
  const provided = request.headers.get('x-revalidate-token') ?? '';
  if (!tokenMatches(provided, expected)) {
    return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid revalidation token' } }, { status: 401 });
  }

  let tags: unknown;
  try {
    ({ tags } = (await request.json()) as { tags?: unknown });
  } catch {
    return Response.json({ error: { code: 'BAD_REQUEST', message: 'Malformed JSON body' } }, { status: 400 });
  }
  if (!Array.isArray(tags) || tags.length === 0) {
    return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a non-empty tags array' } }, { status: 400 });
  }
  const wanted = tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && tag.length <= 120 && /^[a-z0-9:_-]+$/i.test(tag))
    .slice(0, MAX_TAGS);
  if (wanted.length === 0) {
    return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'No valid tags supplied' } }, { status: 400 });
  }

  // Next 16 takes a cacheLife profile; `expire: 0` purges immediately, which is
  // what an unpublish or removal needs (SRS CACHE 002).
  for (const tag of wanted) revalidateTag(tag, { expire: 0 });
  return Response.json({ data: { revalidated: wanted, at: new Date().toISOString() } });
}
