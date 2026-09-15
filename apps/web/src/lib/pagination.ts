/**
 * Numbered listing pages (SRS 1.10 BLOG 005, SEO 001). Each page past the first
 * is its own crawlable address with a self-referencing canonical; page 1 is
 * always the plain address, so `?page=1` and a malformed value point back to it.
 */

/** The requested page number, or 1 for anything that is not a whole number of at least 1. */
export function readPageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || !/^\d{1,6}$/.test(raw)) return 1;
  const page = Number(raw);
  return page >= 1 ? page : 1;
}

/** The address of a page of a listing: the plain path for page 1, `?page=N` after it. */
export function pagedPath(path: string, page: number): string {
  return page > 1 ? `${path}?page=${page}` : path;
}

/** A page title that tells search results and tabs which page this is. */
export function pagedTitle(title: string, page: number): string {
  return page > 1 ? `${title} — page ${page}` : title;
}

/** True when a page beyond the last one was asked for, which is a 404 rather than an empty page. */
export function isPastLastPage(page: number, pageCount: number): boolean {
  return page > 1 && page > pageCount;
}
