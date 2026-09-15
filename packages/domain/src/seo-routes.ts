/**
 * The public routes whose search metadata is edited on the SEO settings screen.
 *
 * These are the pages with no record behind them: an administrator cannot open
 * "the blog index" in an editor the way they open an article, so its title and
 * description have nowhere else to live. Everything with a record of its own —
 * an article, a static page, a business listing — keeps its metadata in that
 * record's editor, so no field is editable in two places (SRS SEO 001).
 *
 * Shared between the API (which validates what may be stored), the admin (which
 * builds the page picker) and the public site (which reads the overrides), so
 * the three cannot disagree about which routes exist.
 */

export interface SeoRoute {
  /** Stable identifier; the key this route's overrides are stored under. */
  key: string;
  /** The public path, exactly as it appears in the address bar. */
  path: string;
  /** How the route is named in the picker. */
  label: string;
  /** What the page is, for the administrator choosing it. */
  description: string;
}

export const SEO_ROUTES: readonly SeoRoute[] = Object.freeze([
  { key: 'home', path: '/', label: 'Home', description: 'The front page.' },
  { key: 'directory', path: '/business', label: 'Businesses', description: 'The directory index and its search results.' },
  { key: 'blog', path: '/blog', label: 'Blog', description: 'The article index.' },
  { key: 'faqs', path: '/faqs', label: 'Frequently asked questions', description: 'The published FAQ page.' },
  { key: 'about', path: '/about', label: 'About', description: 'The About page.' },
  { key: 'contact', path: '/contact', label: 'Contact', description: 'The contact and listing-request page.' },
]);

export const SEO_ROUTE_KEYS: readonly string[] = SEO_ROUTES.map((route) => route.key);

export function seoRoute(key: string): SeoRoute | undefined {
  return SEO_ROUTES.find((route) => route.key === key);
}

/** Robots directives an administrator may choose for one of these routes. */
export const ROBOTS_DIRECTIVES = ['default', 'index,follow', 'noindex,follow', 'noindex,nofollow'] as const;
export type RobotsDirective = (typeof ROBOTS_DIRECTIVES)[number];
