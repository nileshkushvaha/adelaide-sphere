import { CACHE_TAGS } from '@adelaide-sphere/domain';

/**
 * The caches an operator may see and clear (SRS 1.2 CMGR 001–004).
 *
 * Two kinds, because there are two caches:
 *
 *  - **Namespaces** are entries this API holds in Redis under a declared key
 *    prefix. Clearing one scans that prefix inside the current publication
 *    namespace and deletes what it finds.
 *  - **Tags** are what the web tier caches. Clearing one emits the ordinary
 *    invalidation event the publication flow already uses, so the same worker
 *    purges the same pages.
 *
 * Nothing outside this file can be cleared. That is the whole safety property:
 * an administrator names a registered entry, never a key or a pattern, so the
 * prohibited capabilities of CMGR 004 — arbitrary commands, raw keys, whole-store
 * flushes, pattern deletion from input — have nowhere to enter. `PROTECTED_PREFIXES`
 * records the key spaces this interface must never touch, and
 * `cache-registry.spec.ts` proves no declaration overlaps them.
 */

export interface CacheNamespace {
  key: string;
  label: string;
  description: string;
  /** Redis key prefix *inside* the publication namespace, e.g. `search:`. */
  prefix: string;
  /** Nominal time to live of an entry, for the operator's information. */
  ttlSeconds: number;
}

export interface CacheTagTarget {
  key: string;
  label: string;
  description: string;
  tag: string;
}

/**
 * Key spaces owned by other modules. Sessions, throttle counters, the
 * authorization cache and the queue are operated through their own screens
 * under their own permissions; a cache-clearing button must never reach them,
 * because "clear the cache" would otherwise mean "sign everyone out and reset
 * every rate limit", which is exactly the trap the reference project fell into.
 */
export const PROTECTED_PREFIXES = ['session:', 'throttle:', 'authz:', 'bull:', 'idempotency:'] as const;

export const CACHE_NAMESPACES: readonly CacheNamespace[] = [
  {
    key: 'search',
    label: 'Directory search results',
    description: 'Answers to search and filter queries. Cleared automatically when a listing is published or removed.',
    prefix: 'search:',
    ttlSeconds: 30,
  },
  {
    key: 'business',
    label: 'Listing detail',
    description: 'The data behind each published listing page.',
    prefix: 'business:',
    ttlSeconds: 300,
  },
];

export const CACHE_TAG_TARGETS: readonly CacheTagTarget[] = [
  { key: 'businesses', label: 'Business pages', description: 'The public list and every listing page.', tag: CACHE_TAGS.businesses },
  { key: 'posts', label: 'Blog pages', description: 'The blog index and article pages.', tag: CACHE_TAGS.posts },
  { key: 'taxonomy', label: 'Categories and areas', description: 'Category, service and local area pages.', tag: CACHE_TAGS.taxonomy },
  { key: 'settings', label: 'Site shell', description: 'The header, footer and anything driven by the general settings.', tag: CACHE_TAGS.settings },
  { key: 'pages', label: 'Information pages', description: 'About, contact, privacy, terms and the review guidelines.', tag: CACHE_TAGS.pages },
  { key: 'faqs', label: 'FAQs', description: 'The public FAQ page.', tag: CACHE_TAGS.faqs },
  { key: 'alerts', label: 'Service alerts', description: 'The alert bar above the header, on every page.', tag: CACHE_TAGS.alerts },
  { key: 'testimonials', label: 'Testimonials', description: 'The testimonials section of the home page.', tag: CACHE_TAGS.testimonials },
  { key: 'partners', label: 'Client and partner logos', description: 'The logo section of the home page.', tag: CACHE_TAGS.partners },
  { key: 'menus', label: 'Navigation menus', description: 'The header, top bar and footer navigation on every page.', tag: CACHE_TAGS.menus },
  { key: 'redirects', label: 'Redirect rules', description: 'Old addresses that send visitors somewhere else.', tag: CACHE_TAGS.redirects },
];

export function cacheNamespace(key: string): CacheNamespace | null {
  return CACHE_NAMESPACES.find((namespace) => namespace.key === key) ?? null;
}

export function cacheTagTarget(key: string): CacheTagTarget | null {
  return CACHE_TAG_TARGETS.find((target) => target.key === key) ?? null;
}

/** True when a prefix would reach a key space this interface must not touch. */
export function reachesProtectedKeys(prefix: string): boolean {
  return PROTECTED_PREFIXES.some((protectedPrefix) => prefix.startsWith(protectedPrefix) || protectedPrefix.startsWith(prefix));
}
