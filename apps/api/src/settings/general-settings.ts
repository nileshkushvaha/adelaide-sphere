import { DEFAULT_PRICING, PRICING_LIMITS, PRICING_PERIODS, PRICING_PLAN_KEYS, parseEmbedUrl, type PricingPeriod, type PricingSettings } from '@adelaide-sphere/domain';
import { linkHostsFor, parseAustralianPhone, validatePublicUrl, validatePlatformUrl } from '../directory/business-rules.js';

/**
 * General site settings (SRS CFG 001): the application's own identity, branding
 * assets, header contact bar and footer wording. Like every settings document
 * it is validated server-side, versioned and audited; administrators edit
 * wording and references, never markup, secrets or the fixed Adelaide context
 * (SCP 001–005 — city, timezone and routes are owned by the platform).
 *
 * Everything except the application name is optional, and an empty value means
 * "not published" rather than a blank in the interface: the public site omits
 * the element entirely, so a half-filled configuration never shows an empty
 * contact bar or a dead link.
 */

export const GENERAL_SETTINGS_KEY = 'general';

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'x', 'youtube', 'pinterest'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** An empty profile set, built from the platform list so adding one cannot leave a stale literal behind. */
const emptySocial = (): Record<SocialPlatform, string | null> =>
  Object.fromEntries(SOCIAL_PLATFORMS.map((platform) => [platform, null])) as Record<SocialPlatform, string | null>;

export const LIMITS = {
  applicationName: { min: 2, max: 80 },
  shortName: 20,
  organisationName: 120,
  tagline: 120,
  metaDescription: 300,
  supportEmail: 254,
  supportPhone: 30,
  websiteUrl: 200,
  address: 300,
  socialUrl: 300,
  copyrightText: 200,
  footerText: 600,
  /** Google's "Embed a map" HTML; its address alone is at most about 2,000 characters. */
  siteMapSrc: 3000,
  mediaId: 64,
} as const;

/**
 * Domains that only resolve on a developer machine. A support address on one of
 * these is a configuration mistake, not a contact route, and publishing it puts
 * a dead address on every page.
 */
const NON_ROUTABLE = /(\.local|\.localhost|\.test|\.invalid|\.example|\.internal)$/i;

/** Placeholders the copyright line understands; anything else is a typo the visitor would see. */
export const COPYRIGHT_PLACEHOLDERS = ['year', 'name'] as const;

export interface GeneralSettings {
  /** Public name of the application; used in the header, titles and the copyright line. */
  applicationName: string;
  /** Compact name for tight spaces (mobile header, share cards). */
  shortName: string | null;
  /** Legal or trading entity behind the site, when it differs from the application name. */
  organisationName: string | null;
  /** Short phrase after the name in the browser title. */
  tagline: string | null;
  /** Default meta description for pages that do not set their own (SRS SEO 001). */
  metaDescription: string | null;
  /** Published contact address; must be routable, so a development domain is refused. */
  supportEmail: string | null;
  /** Australian phone number, stored normalised with its display form and tel: href (BUS 003 formats). */
  supportPhone: { display: string; telHref: string } | null;
  /** The organisation's own site, when it is not this one. */
  websiteUrl: string | null;
  /** Postal or visiting address, free text over at most four lines. */
  address: string | null;
  /** Ready media assets used as the logo, the browser icon and the default share image. */
  logoMediaId: string | null;
  darkLogoMediaId: string | null;
  faviconMediaId: string | null;
  shareImageMediaId: string | null;
  /** Contact strip above the public navigation. */
  headerTopBarEnabled: boolean;
  /** One optional profile URL per platform, each on that platform's own domain. */
  social: Record<SocialPlatform, string | null>;
  /** Footer copyright template; supports {year} and {name}. Empty means the built-in line. */
  copyrightText: string | null;
  /** Short paragraph under the footer brand. */
  footerText: string | null;
  /** Google Maps embed address for the map above the footer (SRS 1.11 BUS 003); null shows Adelaide. */
  siteMapSrc: string | null;
  /** Published prices shown on the home and contact pages (SRS 1.12). */
  pricing: PricingSettings;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = Object.freeze({
  applicationName: 'Adelaide Sphere',
  shortName: null,
  organisationName: null,
  tagline: 'Find local businesses across Adelaide',
  metaDescription: 'An independent directory of businesses across Adelaide, South Australia: cafes, trades, services and more, with opening hours and contact details.',
  supportEmail: null,
  supportPhone: null,
  websiteUrl: null,
  address: null,
  logoMediaId: null,
  darkLogoMediaId: null,
  faviconMediaId: null,
  shareImageMediaId: null,
  headerTopBarEnabled: false,
  social: Object.freeze(emptySocial()) as Record<SocialPlatform, string | null>,
  copyrightText: null,
  footerText: null,
  siteMapSrc: null,
  pricing: DEFAULT_PRICING,
}) as GeneralSettings;

export type FieldErrors = Record<string, string[]>;

const text = (value: unknown): string => (typeof value === 'string' ? value.replace(/[ \t]+/g, ' ').trim() : '');
const singleLine = (value: unknown): string => text(value).replace(/\s*\n\s*/g, ' ').trim();

/**
 * Renders the copyright line. Shared by the API's public payload contract and
 * the public site, so the template behaves identically wherever it is shown.
 */
export function renderCopyright(template: string | null, context: { year: number; name: string }): string {
  const line = template && template.trim() !== '' ? template : '© {year} {name}. All rights reserved.';
  return line.replace(/\{(year|name)\}/g, (_match, key: string) => (key === 'year' ? String(context.year) : context.name));
}

/** Server-side validation (CFG 001); returns the normalised document and any field errors. */
export function validateGeneralSettings(input: unknown): { errors: FieldErrors; value: GeneralSettings } {
  const errors: FieldErrors = {};
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const value: GeneralSettings = {
    ...DEFAULT_GENERAL_SETTINGS,
    social: emptySocial(),
  };

  const applicationName = singleLine(raw.applicationName);
  if (applicationName.length < LIMITS.applicationName.min || applicationName.length > LIMITS.applicationName.max) {
    errors.applicationName = [`Application name must be ${LIMITS.applicationName.min}–${LIMITS.applicationName.max} characters`];
  }
  value.applicationName = applicationName;

  /** Optional single-line field: blank clears it, over-long is an error. */
  const optionalText = (key: keyof GeneralSettings, source: unknown, max: number, label: string): string | null => {
    const trimmed = singleLine(source);
    if (trimmed === '') return null;
    if (trimmed.length > max) {
      errors[key] = [`${label} must be ${max} characters or fewer`];
      return null;
    }
    return trimmed;
  };

  value.shortName = optionalText('shortName', raw.shortName, LIMITS.shortName, 'Short name');
  value.organisationName = optionalText('organisationName', raw.organisationName, LIMITS.organisationName, 'Organisation name');
  value.tagline = optionalText('tagline', raw.tagline, LIMITS.tagline, 'Tagline');
  value.metaDescription = optionalText('metaDescription', raw.metaDescription, LIMITS.metaDescription, 'Meta description');

  const email = singleLine(raw.supportEmail).toLowerCase();
  if (email !== '') {
    const domain = email.split('@')[1] ?? '';
    if (email.length > LIMITS.supportEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.supportEmail = ['Enter a valid email address'];
    else if (NON_ROUTABLE.test(domain)) errors.supportEmail = ['That domain only resolves on a development machine; use the address visitors can write to'];
    else value.supportEmail = email;
  }

  // Accepts what an editor types and what we stored last time: the document
  // keeps the normalised {display, telHref} pair, and re-reading it must not
  // silently drop the number.
  const phoneSource = typeof raw.supportPhone === 'object' && raw.supportPhone !== null ? (raw.supportPhone as { display?: unknown }).display : raw.supportPhone;
  const phone = singleLine(phoneSource);
  if (phone !== '') {
    if (phone.length > LIMITS.supportPhone) errors.supportPhone = [`Phone number must be ${LIMITS.supportPhone} characters or fewer`];
    else {
      const parsed = parseAustralianPhone(phone);
      if (!parsed) errors.supportPhone = ['Enter an Australian phone number, for example 03 9000 0000 or 0400 000 000'];
      else value.supportPhone = { display: parsed.display, telHref: parsed.telHref };
    }
  }

  const website = singleLine(raw.websiteUrl);
  if (website !== '') {
    const normalised = website.length > LIMITS.websiteUrl ? null : validatePublicUrl(website);
    if (!normalised) errors.websiteUrl = ['Enter a full http(s) URL without credentials'];
    else value.websiteUrl = normalised;
  }

  const address = typeof raw.address === 'string' ? raw.address.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : '';
  if (address !== '') {
    if (address.length > LIMITS.address) errors.address = [`Address must be ${LIMITS.address} characters or fewer`];
    else if (address.split('\n').length > 4) errors.address = ['Use at most four lines'];
    else value.address = address;
  }

  for (const key of ['logoMediaId', 'darkLogoMediaId', 'faviconMediaId', 'shareImageMediaId'] as const) {
    const mediaId = singleLine(raw[key]);
    if (mediaId === '') continue;
    if (mediaId.length > LIMITS.mediaId) errors[key] = ['Choose an image from the media library'];
    else value[key] = mediaId;
  }

  const headerTopBarEnabled = raw.headerTopBarEnabled;
  if (headerTopBarEnabled !== undefined && typeof headerTopBarEnabled !== 'boolean') errors.headerTopBarEnabled = ['Choose whether the contact bar is shown'];
  value.headerTopBarEnabled = headerTopBarEnabled === true;

  const social = (typeof raw.social === 'object' && raw.social !== null ? raw.social : {}) as Record<string, unknown>;
  for (const platform of SOCIAL_PLATFORMS) {
    const url = singleLine(social[platform]);
    if (url === '') continue;
    const normalised = url.length > LIMITS.socialUrl ? null : validatePlatformUrl(platform, url);
    if (!normalised) errors[`social.${platform}`] = [`Enter a full https URL on ${linkHostsFor(platform).join(' or ')}`];
    else value.social[platform] = normalised;
  }

  const copyright = singleLine(raw.copyrightText);
  if (copyright !== '') {
    const unknown = [...copyright.matchAll(/\{([^}]*)\}/g)].map((match) => match[1]).filter((token) => !COPYRIGHT_PLACEHOLDERS.includes(token as (typeof COPYRIGHT_PLACEHOLDERS)[number]));
    if (copyright.length > LIMITS.copyrightText) errors.copyrightText = [`Copyright line must be ${LIMITS.copyrightText} characters or fewer`];
    // A mistyped placeholder would be printed literally on every page.
    else if (unknown.length > 0) errors.copyrightText = [`Unknown placeholder {${unknown[0]}}. Use {year} and {name} only.`];
    else value.copyrightText = copyright;
  }

  const footer = typeof raw.footerText === 'string' ? raw.footerText.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim() : '';
  if (footer !== '') {
    if (footer.length > LIMITS.footerText) errors.footerText = [`Footer text must be ${LIMITS.footerText} characters or fewer`];
    else value.footerText = footer;
  }

  // The map above the footer: Google's "Embed a map" HTML or address, read by the same parser as article maps.
  const mapInput = typeof raw.siteMapSrc === 'string' ? raw.siteMapSrc.trim() : '';
  if (mapInput !== '') {
    const parsed = mapInput.length > LIMITS.siteMapSrc ? null : parseEmbedUrl(mapInput);
    if (!parsed) errors.siteMapSrc = ['That is too long to be a Google Maps embed. Copy it again from Share → Embed a map.'];
    else if (!parsed.ok) errors.siteMapSrc = [parsed.reason];
    else if (parsed.embed.provider !== 'map') errors.siteMapSrc = ['Paste a Google Maps embed here, not a video.'];
    else value.siteMapSrc = parsed.embed.src;
  }

  // Published prices (SRS 1.12). Both plans always exist, in a fixed order; an unreadable
  // or missing plan keeps its shipped values rather than disappearing from the pages.
  const pricingRaw = (typeof raw.pricing === 'object' && raw.pricing !== null ? raw.pricing : {}) as Record<string, unknown>;
  const plansRaw = Array.isArray(pricingRaw.plans) ? (pricingRaw.plans as unknown[]) : [];
  value.pricing = {
    enabled: pricingRaw.enabled === undefined ? DEFAULT_PRICING.enabled : pricingRaw.enabled === true,
    plans: PRICING_PLAN_KEYS.map((key, index) => {
      const fallback = DEFAULT_PRICING.plans[index]!;
      const source = plansRaw.find((plan): plan is Record<string, unknown> => typeof plan === 'object' && plan !== null && (plan as { key?: unknown }).key === key);
      if (!source) return { ...fallback, features: [...fallback.features] };
      const at = `pricing.plans.${index}`;
      const name = singleLine(source.name);
      if (name.length < PRICING_LIMITS.name.min || name.length > PRICING_LIMITS.name.max) errors[`${at}.name`] = [`Plan name must be ${PRICING_LIMITS.name.min}–${PRICING_LIMITS.name.max} characters`];
      const price = source.priceCents;
      const priceValid = typeof price === 'number' && Number.isInteger(price) && price >= 0 && price <= PRICING_LIMITS.priceCents;
      if (!priceValid) errors[`${at}.priceCents`] = ['Enter a price between $0 and $10,000'];
      const period = (PRICING_PERIODS as readonly unknown[]).includes(source.period) ? (source.period as PricingPeriod) : null;
      if (!period) errors[`${at}.period`] = ['Choose one time or per year'];
      const summary = singleLine(source.summary);
      if (summary.length > PRICING_LIMITS.summary) errors[`${at}.summary`] = [`Summary must be ${PRICING_LIMITS.summary} characters or fewer`];
      const features = (Array.isArray(source.features) ? source.features : []).map(singleLine).filter((feature) => feature !== '');
      if (features.length > PRICING_LIMITS.features) errors[`${at}.features`] = [`Use at most ${PRICING_LIMITS.features} points`];
      else if (features.some((feature) => feature.length > PRICING_LIMITS.feature)) errors[`${at}.features`] = [`Keep each point to ${PRICING_LIMITS.feature} characters or fewer`];
      return {
        key,
        name: name || fallback.name,
        priceCents: priceValid ? (price as number) : fallback.priceCents,
        period: period ?? fallback.period,
        summary: summary || null,
        features: features.slice(0, PRICING_LIMITS.features),
      };
    }),
  };

  // The header bar exists to show contact details; without one it would be an empty strip.
  if (value.headerTopBarEnabled && !value.supportEmail && !value.supportPhone && SOCIAL_PLATFORMS.every((platform) => value.social[platform] === null)) {
    errors.headerTopBarEnabled = ['Add a support email, phone number or social link before showing the contact bar'];
  }

  return { errors, value };
}
