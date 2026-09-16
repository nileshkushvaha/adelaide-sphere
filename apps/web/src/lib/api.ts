import { DEFAULT_ADELAIDE_MAP_SRC, SITE_MAP_TITLE } from '@adelaide-sphere/domain/embeds';
import type { PageSection } from '@adelaide-sphere/domain/page-sections';
import { DEFAULT_PRICING } from '@adelaide-sphere/domain/pricing';
import { cache } from 'react';
import 'server-only';
import type { components } from '@adelaide-sphere/contracts';
import type { SearchState } from './search-params';
import { DEFAULT_MENUS } from './default-menus';

export type PublicMenuItem = components['schemas']['PublicMenuItemDto'];
export type PublicMenus = components['schemas']['PublicMenusDto'];
export type PublicCategory = components['schemas']['PublicCategoryDto'];
export type BusinessCard = components['schemas']['PublicBusinessCardDto'];
export type BusinessDetail = components['schemas']['PublicBusinessDetailDto'];
export type SearchMeta = components['schemas']['SearchMetaDto'];
export type PublicHome = components['schemas']['PublicHomeDto'];
export type SiteSettings = components['schemas']['PublicSiteSettingsDto'];
export type PublicReview = components['schemas']['PublicReviewDto'];
export type PostCard = components['schemas']['PublicPostCardDto'];
export type PostDetail = components['schemas']['PublicPostDto'];
export type BlogTerm = components['schemas']['PublicBlogTermDto'];
export type PublicComment = components['schemas']['PublicCommentDto'];
export type PublicAuthorPage = components['schemas']['PublicAuthorPageDto'];
export type PublicArea = components['schemas']['PublicLocalAreaDto'];

const apiOrigin = (process.env.API_ORIGIN ?? 'http://127.0.0.1:4001').replace(/\/+$/, '');

/**
 * The longest a render waits for the API, including reading the body: ten
 * times the read target (SRS NFR 002, p95 500 ms). An API that accepts
 * connections but stops answering must fail the page quickly (its error
 * state) rather than hold a web worker until the socket gives up. A failed
 * detail page can wait twice, because Next.js renders the page again after
 * its metadata fails and the two renders do not share a request cache.
 */
export const API_TIMEOUT_MS = 5_000;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

/** Error from the API or the network; pages let it reach the error boundary (SRS DIR 006: never shown as zero results). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ApiRequestError';
  }
}

interface FetchOptions {
  /** Next.js data-cache lifetime in seconds (SRS CACHE 001: explicit per fetch). */
  revalidate: number;
  tags?: string[];
  query?: Record<string, string | number | null | undefined>;
}

async function apiGet<T>(path: string, options: FetchOptions): Promise<T> {
  const url = new URL(`${apiOrigin}/api/v1${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  return (await getJson(url.toString(), options.revalidate, (options.tags ?? []).join('\n'))) as T;
}

/**
 * One request per URL per render. A fetch that carries an abort signal is not
 * memoised by Next.js, and the shell settings and menus are read by several
 * components on every page, so React's request cache does it instead. The key
 * is plain strings because `cache` compares arguments by identity.
 */
const getJson = cache(async (url: string, revalidate: number, tagList: string): Promise<unknown> => {
  const tags = tagList ? tagList.split('\n') : undefined;
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' }, next: { revalidate, tags }, signal: AbortSignal.timeout(API_TIMEOUT_MS) });
  } catch (error) {
    if (isTimeout(error)) throw new ApiRequestError(0, 'TIMEOUT', 'The directory service did not answer in time', null, { cause: error });
    throw new ApiRequestError(0, 'NETWORK', 'The directory service could not be reached', null, { cause: error });
  }
  if (!response.ok) {
    let code = 'HTTP_ERROR';
    let message = `Request failed (${response.status})`;
    let requestId: string | null = response.headers.get('x-request-id');
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string; requestId?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
      requestId = body.error?.requestId ?? requestId;
    } catch {
      // non-JSON error body (or the time ran out while reading it): keep the status-based message
    }
    throw new ApiRequestError(response.status, code, message, requestId);
  }
  try {
    return await response.json();
  } catch (error) {
    if (isTimeout(error)) throw new ApiRequestError(0, 'TIMEOUT', 'The directory service did not answer in time', null, { cause: error });
    throw new ApiRequestError(response.status, 'INVALID_RESPONSE', 'The directory service sent an unreadable response', response.headers.get('x-request-id'), { cause: error });
  }
});

/** Hero content and optional counters (SRS HERO 002/007). Falls back to the SRS wording if the API is unreachable so the hero still renders. */
export async function fetchHome(): Promise<PublicHome> {
  try {
    return (await apiGet<{ data: PublicHome }>('/home', { revalidate: 60, tags: ['settings'] })).data;
  } catch {
    return { heroHeadline: 'Discover Adelaide businesses', heroPhrases: ['local services', 'places to eat', 'independent shops'], heroSlides: [] };
  }
}

/**
 * Shell settings — name, contact details, branding, header bar and footer (SRS
 * CFG 001). Every public page renders the shell, so a failure here must never
 * take a page down: the documented defaults stand in until the API answers
 * again, and an unconfigured value simply means that element is not shown.
 */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  name: 'Adelaide Sphere',
  shortName: null,
  organisationName: null,
  tagline: 'Find local businesses across Adelaide',
  metaDescription: 'An independent directory of businesses across Adelaide, South Australia: cafes, trades, services and more, with opening hours and contact details.',
  contact: { email: null, phone: null, websiteUrl: null, address: null },
  branding: { logo: null, favicon: null, shareImage: null },
  headerTopBarEnabled: false,
  social: [],
  footer: { copyrightText: null, text: null },
  siteMap: { src: DEFAULT_ADELAIDE_MAP_SRC, title: SITE_MAP_TITLE },
  pricing: { ...DEFAULT_PRICING, currency: 'AUD', gstInclusive: true },
  // Nothing overridden: every page keeps the text it was written with.
  seo: { routes: {}, twitterCard: 'summary_large_image', googleSiteVerification: null, analytics: { googleAnalyticsId: null, googleTagManagerId: null, facebookPixelId: null } },
};

export async function fetchSiteSettings(): Promise<SiteSettings> {
  try {
    return (await apiGet<{ data: SiteSettings }>('/site/settings', { revalidate: 300, tags: ['settings'] })).data;
  } catch {
    return DEFAULT_SITE_SETTINGS;
  }
}

/**
 * Navigation for the header, contact strip and footer (SRS 1.9 MENU 005),
 * resolved by the API so a link to unpublished content never reaches a page.
 *
 * Tagged with every content tag a menu can link to as well as its own: when a
 * page is unpublished or a category retired, the purge that refreshes that
 * page also refreshes the menus that pointed at it. A failure falls back to
 * the navigation the site shipped with, because every page renders the shell.
 */
export async function fetchMenus(): Promise<PublicMenus> {
  try {
    const menus = (await apiGet<{ data: PublicMenus }>('/site/menus', { revalidate: 300, tags: ['menus', 'pages', 'posts', 'taxonomy', 'businesses', 'faqs'] })).data;
    // No header menu assigned yet (before `menus:seed`, for example): keep the navigation the site shipped with.
    return menus.primary.length > 0 ? menus : { ...menus, primary: DEFAULT_MENUS.primary };
  } catch {
    return DEFAULT_MENUS;
  }
}

export interface PublicFaq {
  id: string;
  question: string;
  /** Sanitised server-side; rendered inside `.as-prose` like every other editorial body. */
  answerHtml: string;
  groupName: string | null;
}

/**
 * Published questions (SRS 1.2 FAQ 004). Where questions are one section of a
 * larger page a failure returns an empty list, so the section is omitted; the
 * FAQ page itself passes `required`, so an outage shows the error page rather
 * than a 404 that could be cached or drop the page from search.
 */
export async function fetchFaqs(options: { required?: boolean } = {}): Promise<PublicFaq[]> {
  try {
    return (await apiGet<{ data: PublicFaq[] }>('/faqs', { revalidate: 300, tags: ['faqs'] })).data;
  } catch (error) {
    if (options.required) throw error;
    return [];
  }
}

export interface PublicServiceAlert {
  id: string;
  title: string;
  message: string;
  severity: 'informational' | 'warning' | 'emergency';
  linkLabel: string | null;
  linkUrl: string | null;
  linkExternal: boolean;
  dismissible: boolean;
  contentVersion: number;
  role: 'alert' | 'status';
  ariaLive: 'assertive' | 'polite';
}

/**
 * Alerts to render above the header (SRS 1.2 ALRT 002). A failure returns an
 * empty list: a site that cannot reach its API must still render its pages, and
 * an alert nobody can fetch is better than a page nobody can read.
 */
export async function fetchServiceAlerts(): Promise<PublicServiceAlert[]> {
  try {
    return (await apiGet<{ data: PublicServiceAlert[] }>('/service-alerts', { revalidate: 60, tags: ['alerts'] })).data;
  } catch {
    return [];
  }
}

export interface PublicPartner {
  id: string;
  name: string;
  relationshipLabel: string | null;
  websiteUrl: string | null;
  logo: { url: string; width: number; height: number };
  logoAlt: string;
}

/** Published, authorised client and partner organisations (SRS 1.2 PTNR 005). */
export async function fetchPartners(): Promise<PublicPartner[]> {
  try {
    return (await apiGet<{ data: PublicPartner[] }>('/partners', { revalidate: 300, tags: ['partners'] })).data;
  } catch {
    return [];
  }
}

export async function fetchCategories(): Promise<PublicCategory[]> {
  return (await apiGet<{ data: PublicCategory[] }>('/categories', { revalidate: 300, tags: ['taxonomy'] })).data;
}

export async function fetchAreas(): Promise<PublicArea[]> {
  return (await apiGet<{ data: PublicArea[] }>('/areas', { revalidate: 300, tags: ['taxonomy'] })).data;
}

/** Flattens the two-level tree; the parent is kept on children for breadcrumbs. */
export function flattenCategories(tree: PublicCategory[]): (PublicCategory & { parent: PublicCategory | null })[] {
  return tree.flatMap((c) => [{ ...c, parent: null }, ...c.children.map((child) => ({ ...child, parent: c }))]);
}

export async function searchBusinesses(state: SearchState, fixed: { category?: string; area?: string } = {}): Promise<{ data: BusinessCard[]; meta: SearchMeta }> {
  return apiGet('/businesses', {
    revalidate: 30,
    tags: ['businesses'],
    query: { q: state.q, category: fixed.category ?? state.category, area: fixed.area ?? state.area, minRating: state.minRating, openNow: state.openNow ? '1' : undefined, sort: state.sort, page: state.page, pageSize: 20 },
  });
}

/** Approved reviews for a published business (SRS REV 003); pending content never appears here. */
export async function fetchReviews(businessId: string, page = 1): Promise<{ data: PublicReview[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }> {
  return apiGet('/businesses/' + encodeURIComponent(businessId) + '/reviews', { revalidate: 60, tags: ['reviews', `reviews:${businessId}`], query: { page, pageSize: 10 } });
}

export async function fetchPosts(params: { page?: number; pageSize?: number; category?: string; tag?: string; author?: string; q?: string; featured?: boolean } = {}): Promise<{ data: PostCard[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }> {
  return apiGet('/posts', { revalidate: 60, tags: ['posts'], query: { page: params.page ?? 1, pageSize: params.pageSize, featured: params.featured ? 'true' : undefined, author: params.author, category: params.category, tag: params.tag, q: params.q } });
}

export async function fetchBlogTerms(kind: 'blog-categories' | 'tags'): Promise<BlogTerm[]> {
  return (await apiGet<{ data: BlogTerm[] }>(`/${kind}`, { revalidate: 300, tags: ['posts', 'taxonomy'] })).data;
}

/**
 * The draft behind a private preview link (SRS BLOG 003). Never cached — the
 * token and the editor's session are checked on every request — and null for
 * anything the API refuses, so the page answers 404.
 */
export async function fetchPostPreview(token: string): Promise<PostDetail | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  try {
    const response = await fetch(`${apiOrigin}/api/v1/preview/posts/${encodeURIComponent(token)}`, { headers: { accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!response.ok) return null;
    return ((await response.json()) as { data: PostDetail }).data;
  } catch {
    return null;
  }
}

/**
 * The page behind a private preview link (change log 1.17). Never cached — the
 * token and the editor's session are checked on every request — and null for
 * anything the API refuses, so the preview answers 404.
 */
export async function fetchPagePreview(token: string): Promise<StaticPageContent | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  try {
    const response = await fetch(`${apiOrigin}/api/v1/preview/pages/${encodeURIComponent(token)}`, { headers: { accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    if (!response.ok) return null;
    return ((await response.json()) as { data: StaticPageContent }).data;
  } catch {
    return null;
  }
}

/** null for 404 (draft/unknown) so the page renders not-found (SRS BLOG 003). */
export async function fetchPost(slug: string): Promise<PostDetail | null> {
  try {
    return (await apiGet<{ data: PostDetail }>(`/posts/${encodeURIComponent(slug)}`, { revalidate: 60, tags: ['posts', `post:${slug}`] })).data;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null;
    throw error;
  }
}

/** An author page, or null when the author has none (inactive or nothing published) — SRS 1.10 BLOG 005. */
export async function fetchAuthor(slug: string): Promise<PublicAuthorPage | null> {
  try {
    return (await apiGet<{ data: PublicAuthorPage }>(`/authors/${encodeURIComponent(slug)}`, { revalidate: 60, tags: ['posts', `author:${slug}`] })).data;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null;
    throw error;
  }
}

export async function fetchComments(postId: string, page = 1): Promise<{ data: PublicComment[]; meta: { page: number; pageSize: number; total: number; pageCount: number } }> {
  return apiGet(`/posts/${encodeURIComponent(postId)}/comments`, { revalidate: 60, tags: ['comments', `comments:${postId}`], query: { page, pageSize: 20 } });
}

/** null for 404 (unpublished/unknown) so the page can render not-found; other failures propagate. */
export async function fetchBusiness(slug: string): Promise<BusinessDetail | null> {
  try {
    return (await apiGet<{ data: BusinessDetail }>(`/businesses/${encodeURIComponent(slug)}`, { revalidate: 60, tags: ['businesses', `business:${slug}`] })).data;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null;
    throw error;
  }
}

export interface SitemapEntry {
  path: string;
  lastModified: string;
}

/** Canonical, indexable paths for one sitemap section (SRS SEO 002). */
export async function fetchSitemapSection(section: 'businesses' | 'editorial' | 'taxonomies' | 'pages'): Promise<SitemapEntry[]> {
  return (await apiGet<{ data: SitemapEntry[] }>(`/seo/sitemap/${section}`, { revalidate: 300, tags: ['sitemap', `sitemap:${section}`] })).data;
}

export interface RedirectResolution {
  kind: 'permanent' | 'gone';
  status: 301 | 410;
  targetPath: string | null;
}


export type PageLayout = 'rightSidebar' | 'leftSidebar' | 'fullWidth';

export interface StaticPageContent {
  slug: string;
  title: string;
  body: string;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  /** Set only when the page carries its own share image. */
  ogImage: { url: string; alt: string; width: number; height: number } | null;
  /** Photographer credit for that image; several licences require it to be shown. */
  ogImageCredit: string | null;
  /** The layout an editor chose for this page in the admin. */
  layout: PageLayout;
  /** Visible sections in order (change log 1.17); empty for a page still stored as one body. */
  sections: PageSection[];
  /** Section pictures, with the photographer credit recorded in the media library. */
  images: Record<string, { url: string; alt: string; width: number; height: number; credit?: string | null }>;
  documents: Record<string, { url: string; title: string; bytes: number }>;
  businesses: Record<string, { id: string; slug: string; name: string; categoryName: string | null; areaName: string | null }>;
  /** Hidden from search engines by the editor. */
  noindex: boolean;
  updatedAt: string;
}

/** Published information page (SRS CFG 002); null while it is still a draft. */
export async function fetchStaticPage(slug: string): Promise<StaticPageContent | null> {
  try {
    return (await apiGet<{ data: StaticPageContent }>(`/pages/${encodeURIComponent(slug)}`, { revalidate: 300, tags: ['pages', `page:${slug}`] })).data;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Where the acknowledgement on the review and comment forms may link (SRS
 * PRIV 001, REV 001). Null until the review guidelines page is published: the
 * wording stays, the link does not, so no form ever points at a 404.
 */
export async function reviewGuidelinesHref(): Promise<string | null> {
  const pages = await fetchStaticPages();
  return pages.some((page) => page.slug === 'review-guidelines') ? '/review-guidelines' : null;
}

/**
 * The privacy notice's address, on the same terms as the guidelines above: the
 * acknowledgement on a public form names it either way, and links to it only
 * once an editor has published it, so no form ever points at a 404.
 */
export async function privacyNoticeHref(): Promise<string | null> {
  const pages = await fetchStaticPages();
  return pages.some((page) => page.slug === 'privacy') ? '/privacy' : null;
}

export interface SiteMetrics {
  businesses: number | null;
  categories: number | null;
  areas: number | null;
  articles: number | null;
  countedAt: string;
}

/**
 * Live published counts for the About page (SRS CFG 002). Every field is
 * `null` when the count could not be taken, and the page omits what it cannot
 * state truthfully — a failure here must never take the page down.
 */
export async function fetchSiteMetrics(): Promise<SiteMetrics> {
  try {
    return (await apiGet<{ data: SiteMetrics }>('/site/metrics', { revalidate: 300, tags: ['businesses', 'posts'] })).data;
  } catch {
    return { businesses: null, categories: null, areas: null, articles: null, countedAt: new Date().toISOString() };
  }
}

/** Published information pages, for footer navigation; never links to a draft. */
export async function fetchStaticPages(): Promise<{ slug: string; title: string }[]> {
  try {
    return (await apiGet<{ data: { slug: string; title: string }[] }>('/pages', { revalidate: 300, tags: ['pages'] })).data;
  } catch {
    // The footer must render even when the API is unreachable.
    return [];
  }
}
