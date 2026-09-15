/**
 * Directory search state lives in the URL (SRS DIR 006): q, category, area,
 * minRating, sort and page. Parsing is tolerant (bad values are dropped so a
 * shared link never crashes the page); the API still validates what it gets.
 */
export const SORTS = ['relevance', 'rating', 'newest', 'name'] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = { relevance: 'Relevance', rating: 'Highest rated', newest: 'Newest', name: 'Name A–Z' };

export interface SearchState {
  q: string;
  category: string | null;
  area: string | null;
  minRating: number | null;
  /** SRS DIR 008: only listings open at request time. Conditional — the API ignores it when hours coverage is too thin. */
  openNow: boolean;
  sort: Sort | null;
  page: number;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_Q = 120;

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export function parseSearchParams(raw: RawSearchParams): SearchState {
  const q = (first(raw.q) ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_Q);
  const category = first(raw.category);
  const area = first(raw.area);
  const minRating = Number(first(raw.minRating));
  const sort = first(raw.sort);
  const page = Number(first(raw.page));
  return {
    q,
    category: category && SLUG.test(category) ? category : null,
    area: area && SLUG.test(area) ? area : null,
    minRating: Number.isInteger(minRating) && minRating >= 1 && minRating <= 5 ? minRating : null,
    openNow: first(raw.openNow) === '1' || first(raw.openNow) === 'true',
    sort: (SORTS as readonly string[]).includes(sort ?? '') ? (sort as Sort) : null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Serialises state back to a query string; omits defaults so canonical URLs stay stable. */
export function toQueryString(state: Partial<SearchState>): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.category) params.set('category', state.category);
  if (state.area) params.set('area', state.area);
  if (state.minRating) params.set('minRating', String(state.minRating));
  if (state.openNow) params.set('openNow', '1');
  if (state.sort) params.set('sort', state.sort);
  if (state.page && state.page > 1) params.set('page', String(state.page));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Whether any filter narrows the directory (drives the noindex rule, SEO 003, and the reset chip). */
export function isFiltered(state: SearchState): boolean {
  return Boolean(state.q || state.category || state.area || state.minRating || state.openNow);
}

export interface Chip {
  key: 'q' | 'category' | 'area' | 'minRating' | 'openNow';
  label: string;
  /** URL with this filter removed (page reset to 1, DIR 005). */
  href: string;
}

/** Removable chips for the active filters; labels resolve slugs to names when known. */
export function buildChips(state: SearchState, basePath: string, names: { categories?: Record<string, string>; areas?: Record<string, string> } = {}): Chip[] {
  const chips: Chip[] = [];
  const without = (key: Chip['key']) => `${basePath}${toQueryString({ ...state, [key]: key === 'q' ? '' : key === 'openNow' ? false : null, page: 1 })}`;
  if (state.q) chips.push({ key: 'q', label: `“${state.q}”`, href: without('q') });
  if (state.category) chips.push({ key: 'category', label: names.categories?.[state.category] ?? state.category, href: without('category') });
  if (state.area) chips.push({ key: 'area', label: names.areas?.[state.area] ?? state.area, href: without('area') });
  if (state.minRating) chips.push({ key: 'minRating', label: `${state.minRating}+ stars`, href: without('minRating') });
  if (state.openNow) chips.push({ key: 'openNow', label: 'Open now', href: without('openNow') });
  return chips;
}

export function pageHref(state: SearchState, basePath: string, page: number): string {
  return `${basePath}${toQueryString({ ...state, page })}`;
}

/**
 * Index policy for a curated category or local-area landing page (SRS SEO 003,
 * UX 003): indexable only when it carries its own editorial text and lists at
 * least one published business; a filtered view is never indexed. Thin or
 * empty landings stay reachable and followed, just not indexed.
 */
export function landingRobots(intro: string | null | undefined, total: number, filtered: boolean): { index: false; follow: true } | undefined {
  const substantive = (intro ?? '').trim().length > 0 && total > 0;
  return filtered || !substantive ? { index: false, follow: true } : undefined;
}
