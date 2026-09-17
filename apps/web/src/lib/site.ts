import 'server-only';

import type { SiteSettings } from './api';

/**
 * Names used before the settings document has been read (metadata generated
 * outside a request, error documents). The published values in
 * `GET /site/settings` are authoritative everywhere else (SRS CFG 001).
 */
export const SITE_NAME = 'Adelaide Sphere';
export const SITE_TAGLINE = 'Find local businesses across Adelaide';
/**
 * Other names the site is known by, declared on the WebSite entity so search
 * engines show the brand rather than the bare domain (SRS SEO 005).
 */
export const SITE_ALTERNATE_NAMES = ['AdelaideSphere', 'adelaidesphere.com'] as const;
/** The shipped square brand mark: the browser icon's source and the organisation's default logo. */
export const BRAND_ICON = { favicon: '/brand-favicon.png', faviconSize: 96, appleTouch: '/apple-touch-icon.png', logo: '/brand-logo.png', logoSize: 512 } as const;

const ORIGIN_RE = /^https?:\/\/[^/\s]+$/;

/**
 * Absolute public origin used for canonical URLs and metadata (SRS SEO 001,
 * ARC 004: the hostname is configured, never assumed). Defaults to the local
 * dev origin outside production; production must set it explicitly.
 */
export function siteOrigin(): string {
  const value = (process.env.SITE_ORIGIN ?? (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:4000')).replace(/\/+$/, '');
  if (!ORIGIN_RE.test(value)) throw new Error('SITE_ORIGIN must be set to the public https origin without a path (e.g. https://adelaidesphere.com)');
  return value;
}

export function absoluteUrl(path: string): string {
  return `${siteOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * True on a staging or preview deployment (`SITE_NOINDEX=true`): robots.txt
 * disallows everything and every page says noindex, so a copy of the site can
 * never compete with the real one in search. Production leaves it unset.
 */
export function siteNoindex(): boolean {
  return (process.env.SITE_NOINDEX ?? '').trim().toLowerCase() === 'true';
}

/** Turnstile site key for public forms; null when unset, so forms explain they are closed instead of failing silently (SRS SEC 003). */
export function turnstileSiteKey(): string | null {
  const value = (process.env.TURNSTILE_SITE_KEY ?? '').trim();
  return value.length > 0 ? value : null;
}

/**
 * Whether business pages may carry Review/AggregateRating structured data
 * (SRS SEO 006). Default off: the markup is switched on only after the
 * technical lead has verified Google's current eligibility rules for directory
 * reviews and recorded that in docs/launch/seo-approval.md.
 */
export function reviewRichResultsEnabled(): boolean {
  return (process.env.REVIEW_RICH_RESULTS ?? '').trim().toLowerCase() === 'true';
}

/**
 * Emit `FAQPage` structured data (SRS 1.2 FAQ 005). Off unless the technical
 * lead has confirmed current search-engine eligibility for the site and set
 * FAQ_RICH_RESULTS=true; the visible questions are unaffected either way.
 */
export function faqRichResultsEnabled(): boolean {
  return (process.env.FAQ_RICH_RESULTS ?? '').trim().toLowerCase() === 'true';
}

export interface ContactChannel {
  /** True only when an editor has published a routable support address. */
  available: boolean;
  email: string | null;
  /** Ready-made mailto for the "Add or update a business" action, or null when no address is published. */
  listingMailto: string | null;
}

/**
 * Public contact route (SRS UX 002, CFG 001/002). The address comes from the
 * general settings an administrator edits, and the API refuses to store one on
 * a development domain — so anything published here is a mailbox visitors can
 * actually write to. Until one is set the site says the contact route is being
 * finalised rather than printing a dead address.
 */
export function contactChannelFrom(settings: SiteSettings): ContactChannel {
  const email = settings.contact.email;
  if (!email) return { available: false, email: null, listingMailto: null };
  return { available: true, email, listingMailto: `mailto:${email}?subject=${encodeURIComponent(`Add or update a business on ${settings.name}`)}` };
}

/** The browser title suffix: "Name — tagline", or just the name when no tagline is set. */
export function siteTitle(settings: SiteSettings): string {
  return settings.tagline ? `${settings.name} — ${settings.tagline}` : settings.name;
}
