
/** One queue for MVP; job names distinguish the work (SRS ARC 003). */
export const QUEUE_NAME = 'adelaide-sphere';
export const ENQUIRY_EMAIL_JOB = 'enquiry.email';
export const MEDIA_PROCESS_JOB = 'media.process';
export const CACHE_INVALIDATE_JOB = 'cache.invalidate';

/**
 * Every job name this system dispatches. The worker switches on these and the
 * API produces them, so a name that is not here is a deployment mismatch rather
 * than work.
 */
export const JOB_NAMES = [ENQUIRY_EMAIL_JOB, MEDIA_PROCESS_JOB, CACHE_INVALIDATE_JOB, 'scheduled.task'] as const;
export type JobName = (typeof JOB_NAMES)[number];

/**
 * BullMQ refuses a custom job id containing `:` — it is the separator in its own
 * Redis keys, and `add()` throws "Custom Id cannot contain :". That threw at
 * worker start-up in production and took every background job with it (audit
 * F-01), so id construction lives here, in one function, and is *validated* on
 * the way into the queue rather than trusted.
 *
 * The rule is deliberately stricter than BullMQ's: letters, digits, dot, dash
 * and underscore only. Anything else — a colon, a space, a slash from a path, a
 * newline from a pasted value — is replaced, so an id built from data we do not
 * control cannot become an id the queue rejects.
 */
const JOB_ID_ALLOWED = /[^A-Za-z0-9._-]/g;
export const MAX_JOB_ID_LENGTH = 200;

export function queueJobId(...parts: (string | number)[]): string {
  const id = parts
    .map((part) => String(part).trim())
    .filter((part) => part.length > 0)
    .join('-')
    .replace(JOB_ID_ALLOWED, '-')
    .slice(0, MAX_JOB_ID_LENGTH);
  // An id that reduced to nothing would let the queue assign its own, which
  // silently loses the de-duplication the caller asked for.
  if (id.replace(/-/g, '').length === 0) throw new Error('queueJobId needs at least one part with usable characters');
  return id;
}

/** Why this id cannot be used, or null when it can. Cheap enough to run on every enqueue. */
export function jobIdProblem(id: string): string | null {
  if (id.length === 0) return 'a job id must not be empty';
  if (id.length > MAX_JOB_ID_LENGTH) return `a job id is at most ${MAX_JOB_ID_LENGTH} characters`;
  if (id.includes(':')) return 'a job id must not contain ":" — BullMQ refuses it (audit F-01)';
  if (JOB_ID_ALLOWED.test(id)) {
    JOB_ID_ALLOWED.lastIndex = 0;
    return 'a job id may contain only letters, digits, dot, dash and underscore';
  }
  JOB_ID_ALLOWED.lastIndex = 0;
  return null;
}

/**
 * Throws before the queue does, with a message naming the caller. The point is
 * that a bad id fails in a test rather than at start-up in production.
 */
export function assertQueueJobId(id: string, context: string): void {
  const problem = jobIdProblem(id);
  if (problem) throw new Error(`${context}: ${problem} (got ${JSON.stringify(id.slice(0, 80))})`);
}

export interface JobRetryPolicy {
  attempts: number;
  backoff: { type: 'exponential'; delay: number };
  removeOnComplete: { age: number; count: number };
  removeOnFail: boolean;
}

/** SRS EVT 002: five attempts, exponential backoff with jitter, visible failures. */
export const defaultJobOptions: JobRetryPolicy = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: false,
};

export interface RedisConnection {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest: null;
}

/** BullMQ needs connection parts, not a URL, and requires maxRetriesPerRequest: null. */
export function redisConnectionFromUrl(url: string): RedisConnection {
  const parsed = new URL(url);
  const db = Number(parsed.pathname.replace('/', ''));
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(Number.isInteger(db) && db > 0 ? { db } : {}),
    maxRetriesPerRequest: null,
  };
}

/** Dispatcher-side backoff with jitter (SRS EVT 002); the queue applies its own per-job backoff. */
export const MAX_DISPATCH_ATTEMPTS = 5;

export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(2 ** attempt * 1_000, 60_000);
  return Math.round(base * (0.5 + random() * 0.5));
}

/**
 * Cache tags shared by the API, the worker and the web tier (SRS CACHE 001).
 * A publication change names the tags it affects; the worker asks the web tier
 * to purge exactly those, so a removal never waits for a TTL to expire.
 */
export const CACHE_TAGS = {
  businesses: 'businesses',
  business: (slug: string) => `business:${slug}`,
  posts: 'posts',
  post: (slug: string) => `post:${slug}`,
  author: (slug: string) => `author:${slug}`,
  reviews: 'reviews',
  reviewsFor: (businessId: string) => `reviews:${businessId}`,
  comments: 'comments',
  commentsFor: (postId: string) => `comments:${postId}`,
  taxonomy: 'taxonomy',
  settings: 'settings',
  pages: 'pages',
  page: (slug: string) => `page:${slug}`,
  sitemap: 'sitemap',
  redirects: 'redirects',
  // Website content modules (SRS 1.2 section 26). Service alerts render above
  // the header on every public page, so their tag purges the shell.
  faqs: 'faqs',
  alerts: 'alerts',
  testimonials: 'testimonials',
  partners: 'partners',
  // Navigation menus (SRS 1.9 MENU 005) render in the header and footer of every page.
  menus: 'menus',
} as const;

/** Bounded, de-duplicated tag list; the API and worker both enforce it. */
export const MAX_CACHE_TAGS = 20;

export function normaliseCacheTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const tag of tags) {
    const trimmed = String(tag).trim();
    if (trimmed.length > 0 && trimmed.length <= 120) seen.add(trimmed);
    if (seen.size >= MAX_CACHE_TAGS) break;
  }
  return [...seen];
}
