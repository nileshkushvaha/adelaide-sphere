import { PAGE_MIN_BODY_CHARACTERS, pageTextBlockers } from '@adelaide-sphere/domain/page-sections';

/**
 * Information pages (SRS CFG 002, amended in SRS 1.6 and 1.7).
 *
 * There are two kinds of page, and the difference is only who decided the
 * address:
 *
 *  - **System pages** are declared here. They exist because something in the
 *    product refers to them — the review form links to the review guidelines
 *    and the privacy policy is named in the forms' collection notice. They
 *    cannot be created, renamed or deleted from the interface, because the code
 *    that points at them would then point at nothing.
 *  - **Custom pages** are created by an administrator with any address that
 *    passes `pageSlugProblem`. Until SRS 1.7 the slug set was closed, which
 *    guaranteed that no one could publish an arbitrary top-level URL; that
 *    guarantee is now kept by validation instead — a reserved list, a strict
 *    pattern and a uniqueness check — so an editor can add a page without being
 *    able to shadow a product route or take an address the framework already
 *    serves.
 *
 * There is deliberately no `contact` or `about` page of either kind. `/contact`
 * is a product route whose routing address comes from the site settings
 * (CFG 001), so an editor cannot redirect enquiries by typing an address into a
 * document; `/about` became a product route on the same template at client
 * instruction on 13 Sep 2026 (recorded as a discrepancy with SRS ABT 001).
 */
export type StaticPageTemplate = 'generic';

/**
 * The layouts an editor can choose between, the way a CMS offers page
 * templates. The choice is presentation only — it moves the supporting column
 * or removes it, and never changes a word of what the page says.
 */
export const PAGE_LAYOUTS = ['rightSidebar', 'leftSidebar', 'fullWidth'] as const;
export type StaticPageLayout = (typeof PAGE_LAYOUTS)[number];

/**
 * What a page starts as before anybody chooses: the reading column with its
 * supporting column beside it. An editor can change it afterwards, and their
 * choice is what is stored from then on.
 */
export function defaultPageLayout(_slug: string): StaticPageLayout {
  return 'rightSidebar';
}

export interface StaticPageDefinition {
  slug: string;
  defaultTitle: string;
  /** What the page is for; shown to editors, never published. */
  purpose: string;
  /** Which public template renders it, and therefore which editor opens it. */
  template: StaticPageTemplate;
}

/** Pages the product itself refers to. Not creatable, renameable or deletable. */
export const SYSTEM_PAGES: StaticPageDefinition[] = [
  { slug: 'privacy', defaultTitle: 'Privacy Policy', purpose: 'What personal data the site collects, why, how long it is kept and how to request deletion.', template: 'generic' },
  { slug: 'terms', defaultTitle: 'Terms of Use', purpose: 'The terms visitors accept by using the site, including listing accuracy and liability.', template: 'generic' },
  { slug: 'review-guidelines', defaultTitle: 'Review Guidelines', purpose: 'The rules reviewers agree to; linked from the review and comment forms.', template: 'generic' },
];

export const SYSTEM_PAGE_SLUGS = SYSTEM_PAGES.map((page) => page.slug);

export function systemPageDefinition(slug: string): StaticPageDefinition | undefined {
  return SYSTEM_PAGES.find((page) => page.slug === slug);
}

export function isSystemPage(slug: string): boolean {
  return SYSTEM_PAGE_SLUGS.includes(slug);
}

/**
 * A reserved public address that is not a system page: a route the web app
 * renders itself, such as `/contact` and `/about`. A row stored under such an
 * address before it became a product route is kept — nothing is deleted — but
 * is never listed, edited, published or served, so it cannot shadow the route.
 */
export function isProductRoute(slug: string): boolean {
  return !isSystemPage(slug) && (RESERVED_SLUGS as readonly string[]).includes(slug);
}

/** Editor-facing description of a page an administrator created. */
export const CUSTOM_PAGE_PURPOSE = 'A page you created. It is published at this address once it goes live; add it to a menu to link it from the header or footer.';

/**
 * Addresses a custom page may not take.
 *
 * Two groups, for two different failure modes. The first are routes the public
 * site already serves: Next.js resolves a static route before the dynamic page
 * route, so a page slugged `blog` would be created, published, listed in the
 * footer, and answer with the blog index — a page that exists everywhere except
 * where you look for it. The second are addresses that are not routes today but
 * would be surprising to hand to an editor: framework and infrastructure paths,
 * and the admin surface itself.
 */
export const RESERVED_SLUGS = [
  // Public routes.
  'about',
  'blog',
  'business',
  'businesses',
  'contact',
  'directory',
  'faqs',
  // Generated share images (`/og/[kind]/[key]`).
  'og',
  'privacy',
  'terms',
  'review-guidelines',
  'robots.txt',
  'sitemap.xml',
  'sitemaps',
  // Framework, infrastructure and the admin surface.
  '_next',
  'admin',
  'api',
  'assets',
  'account',
  'health',
  'images',
  'login',
  'logout',
  'media',
  'public',
  'search',
  'static',
  'well-known',
] as const;

/** Lower-case letters, digits and single hyphens; 2–64 characters. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 64;

/**
 * Why this address cannot be used, or null when it can.
 *
 * Returns a sentence rather than a boolean because every one of these is shown
 * to the person typing: "invalid" tells an editor nothing they can act on.
 */
export function pageSlugProblem(input: string): string | null {
  const slug = input.trim().toLowerCase();
  if (slug.length < 2) return 'An address needs at least 2 characters';
  if (slug.length > MAX_SLUG_LENGTH) return `An address is at most ${MAX_SLUG_LENGTH} characters`;
  // Reserved before pattern: `sitemap.xml` and `robots.txt` fail both, and
  // "that address belongs to the site" is the more useful of the two answers.
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) return 'That address is used by the site itself, so a page there would never be seen';
  if (!SLUG_PATTERN.test(slug)) return 'Use lower-case letters, numbers and single hyphens, for example community-guidelines';
  return null;
}

/** The address as it will be stored, once `pageSlugProblem` has accepted it. */
export function normalisePageSlug(input: string): string {
  return input.trim().toLowerCase();
}

/** Minimum body length that counts as real content rather than a stub; the rule itself lives in the domain package, shared with the worker. */
export const MIN_BODY_CHARACTERS = PAGE_MIN_BODY_CHARACTERS;

/**
 * Publication gate for an information page's text. Returns the reasons it
 * cannot be published; an empty list means it is ready. Pages built from
 * sections are also held to `pageSectionBlockers` (see `pagePublicationBlockers`).
 */
export function staticPageBlockers(input: { title: string; plainBody: string }): string[] {
  return pageTextBlockers(input);
}
