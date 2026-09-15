import { ROBOTS_DIRECTIVES, SEO_ROUTES, type RobotsDirective } from '@adelaide-sphere/domain';
import { validatePublicUrl } from '../directory/business-rules.js';

/**
 * Search and social metadata for the public routes that have no record behind
 * them (SRS SEO 001).
 *
 * An article, a static page and a business listing each carry their own title
 * and description, edited where the content is edited. The home page, the
 * directory index, the blog index, the FAQ page and the contact page carry
 * theirs nowhere — they are code, not rows — so this document is where an
 * administrator sets them.
 *
 * Precedence, stated once here because three places depend on it: a field set
 * on the route wins; an empty field falls back to the page's built-in text; and
 * anything still missing falls back to the site defaults in general settings.
 * "Empty means inherit" is why no field here is required.
 *
 * The route list itself is `SEO_ROUTES` in `packages/domain`, shared with the
 * admin's picker and the public site's reader, so a route cannot be offered
 * here and ignored there.
 */

export const SEO_SETTINGS_KEY = 'seo';

export const SEO_LIMITS = {
  /** Google truncates around 60; the field allows the length a title tag may usefully be. */
  metaTitle: 70,
  metaDescription: 160,
  metaKeywords: 255,
  canonicalUrl: 300,
  mediaId: 64,
} as const;

/** How a page is shared, when the platform default is not wanted. */
export const TWITTER_CARD_TYPES = ['summary', 'summary_large_image'] as const;
export type TwitterCardType = (typeof TWITTER_CARD_TYPES)[number];

export interface RouteSeo {
  metaTitle: string | null;
  metaDescription: string | null;
  /**
   * Kept because administrators ask for it and some internal search tools read
   * it. Google has ignored the keywords meta tag since 2009, so it is recorded
   * and published but changes nothing about ranking; the screen says so.
   */
  metaKeywords: string | null;
  /** Absolute https URL; empty means the page's own address, which is the norm. */
  canonicalUrl: string | null;
  robots: RobotsDirective;
  /** A ready media asset; empty means the site-wide share image. */
  ogImageMediaId: string | null;
}

/**
 * Identifiers for the search and analytics tools a site is connected to.
 *
 * These are public identifiers, not secrets: each one is visible in the page
 * source of any site using it, so storing them in the settings document breaks
 * no rule about secrets (SET 004). They are stored here; what the public site
 * does with them is a separate decision, recorded where it is read.
 */
export interface SeoVerification {
  /** The `content` value of Google's verification meta tag. */
  googleSearchConsole: string | null;
  googleAnalyticsId: string | null;
  googleTagManagerId: string | null;
  facebookPixelId: string | null;
}

export interface SeoSettings {
  /** One entry per route in `SEO_ROUTES`; a missing key means nothing is overridden. */
  routes: Record<string, RouteSeo>;
  /** How pages are presented when shared, site-wide. */
  twitterCard: TwitterCardType;
  verification: SeoVerification;
}

export const EMPTY_VERIFICATION: SeoVerification = Object.freeze({
  googleSearchConsole: null,
  googleAnalyticsId: null,
  googleTagManagerId: null,
  facebookPixelId: null,
});

/**
 * The shape each identifier takes. Checked so a mistyped value is refused here
 * rather than silently producing a page that no tool recognises.
 */
const ID_FORMATS: { key: keyof SeoVerification; pattern: RegExp; label: string; example: string; max: number }[] = [
  { key: 'googleSearchConsole', pattern: /^[A-Za-z0-9_-]{20,128}$/, label: 'Search Console verification', example: 'the content value from the meta tag', max: 128 },
  { key: 'googleAnalyticsId', pattern: /^G-[A-Z0-9]{6,12}$/, label: 'Google Analytics ID', example: 'G-XXXXXXXXXX', max: 20 },
  { key: 'googleTagManagerId', pattern: /^GTM-[A-Z0-9]{6,10}$/, label: 'Tag Manager ID', example: 'GTM-XXXXXXX', max: 20 },
  { key: 'facebookPixelId', pattern: /^\d{15,16}$/, label: 'Meta Pixel ID', example: '15 or 16 digits', max: 16 },
];

export const EMPTY_ROUTE_SEO: RouteSeo = Object.freeze({
  metaTitle: null,
  metaDescription: null,
  metaKeywords: null,
  canonicalUrl: null,
  robots: 'default',
  ogImageMediaId: null,
});

export const DEFAULT_SEO_SETTINGS: SeoSettings = Object.freeze({
  routes: Object.freeze({}) as Record<string, RouteSeo>,
  twitterCard: 'summary_large_image',
  verification: EMPTY_VERIFICATION,
}) as SeoSettings;

type FieldErrors = Record<string, string[]>;

const singleLine = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/**
 * Server-side validation. Field error keys are addressed as
 * `routes.<key>.<field>` so the admin can put each message on the control that
 * produced it, whichever route is being edited.
 */
export function validateSeoSettings(input: unknown): { errors: FieldErrors; value: SeoSettings } {
  const errors: FieldErrors = {};
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const value: SeoSettings = { routes: {}, twitterCard: DEFAULT_SEO_SETTINGS.twitterCard, verification: { ...EMPTY_VERIFICATION } };

  const verification = (typeof raw.verification === 'object' && raw.verification !== null ? raw.verification : {}) as Record<string, unknown>;
  for (const format of ID_FORMATS) {
    // Google's own consoles show these upper-cased; accepting either spelling
    // and storing one avoids an ID that is right but does not match.
    const entered = singleLine(verification[format.key]).replace(/\s/g, '');
    if (entered === '') continue;
    const normalised = format.key === 'googleSearchConsole' ? entered : entered.toUpperCase();
    if (normalised.length > format.max || !format.pattern.test(normalised)) {
      errors[`verification.${format.key}`] = [`Enter a valid ${format.label} (${format.example})`];
      continue;
    }
    value.verification[format.key] = normalised;
  }

  const card = singleLine(raw.twitterCard);
  if (card !== '') {
    if (!(TWITTER_CARD_TYPES as readonly string[]).includes(card)) errors.twitterCard = ['Choose one of the offered card types'];
    else value.twitterCard = card as TwitterCardType;
  }

  const routes = (typeof raw.routes === 'object' && raw.routes !== null ? raw.routes : {}) as Record<string, unknown>;
  // Only routes the platform declares are stored: an unknown key would be a
  // page that does not exist, saved forever and never read.
  for (const route of SEO_ROUTES) {
    const source = (typeof routes[route.key] === 'object' && routes[route.key] !== null ? routes[route.key] : {}) as Record<string, unknown>;
    const entry: RouteSeo = { ...EMPTY_ROUTE_SEO };
    const at = (field: string) => `routes.${route.key}.${field}`;

    const title = singleLine(source.metaTitle);
    if (title.length > SEO_LIMITS.metaTitle) errors[at('metaTitle')] = [`Meta title must be ${SEO_LIMITS.metaTitle} characters or fewer`];
    else entry.metaTitle = title || null;

    const description = singleLine(source.metaDescription);
    if (description.length > SEO_LIMITS.metaDescription) errors[at('metaDescription')] = [`Meta description must be ${SEO_LIMITS.metaDescription} characters or fewer`];
    else entry.metaDescription = description || null;

    // Stored as the editor typed it, minus empty entries and duplicates, so the
    // published tag is not "cafes,,cafes".
    const keywords = singleLine(source.metaKeywords);
    if (keywords.length > SEO_LIMITS.metaKeywords) errors[at('metaKeywords')] = [`Keywords must be ${SEO_LIMITS.metaKeywords} characters or fewer`];
    else {
      const list = [...new Set(keywords.split(',').map((word) => word.trim()).filter(Boolean))];
      entry.metaKeywords = list.length > 0 ? list.join(', ') : null;
    }

    const canonical = singleLine(source.canonicalUrl);
    if (canonical !== '') {
      if (canonical.length > SEO_LIMITS.canonicalUrl) errors[at('canonicalUrl')] = [`Canonical URL must be ${SEO_LIMITS.canonicalUrl} characters or fewer`];
      else {
        // The same URL rule the rest of the application uses: absolute, http(s)
        // only, so a canonical can never be a `javascript:` or relative string
        // that search engines and browsers read differently.
        const checked = validatePublicUrl(canonical);
        if (checked === null) errors[at('canonicalUrl')] = ['Enter a full web address, starting with https://'];
        else entry.canonicalUrl = checked;
      }
    }

    const robots = singleLine(source.robots) || 'default';
    if (!(ROBOTS_DIRECTIVES as readonly string[]).includes(robots)) errors[at('robots')] = ['Choose one of the offered robots directives'];
    else entry.robots = robots as RobotsDirective;

    const media = singleLine(source.ogImageMediaId);
    if (media !== '') {
      if (media.length > SEO_LIMITS.mediaId) errors[at('ogImageMediaId')] = ['That is not a media reference'];
      else entry.ogImageMediaId = media;
    }

    value.routes[route.key] = entry;
  }

  return { errors, value };
}
