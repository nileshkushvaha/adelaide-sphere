/** The longest search the API accepts (SRS 1.10 BLOG 005). */
export const BLOG_SEARCH_MAX_LENGTH = 120;

/** What was searched for, tidied: one string, single spaces, trimmed, never longer than the API allows. */
export function readSearchQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, BLOG_SEARCH_MAX_LENGTH).trim();
}

/** The address of a page of search results. */
export function blogSearchHref(q: string, page = 1): string {
  const params = new URLSearchParams({ q });
  if (page > 1) params.set('page', String(page));
  return `/blog/search?${params.toString()}`;
}
