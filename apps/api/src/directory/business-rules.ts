import { validatePublicUrl } from '@adelaide-sphere/domain';
import type { AddressVisibility, Business, BusinessAddress, BusinessStatus } from '@adelaide-sphere/database';

/** Lower-cased, punctuation- and whitespace-collapsed name for duplicate detection (SRS BUS 007). */
/**
 * The year a business began trading. Anything before 1836 predates Adelaide
 * itself (proclaimed 28 December 1836), and a year in the future is a typo; the rule lives here rather than
 * on the DTO so the upper bound is today's year at the time of the request,
 * not the year the process started.
 */
export class EstablishedYearError extends Error {}

export function validateEstablishedYear(year: number | null | undefined, now = new Date()): number | null {
  if (year === null || year === undefined) return null;
  if (!Number.isInteger(year) || year < 1836 || year > now.getFullYear()) {
    throw new EstablishedYearError(`Enter a year between 1836 and ${now.getFullYear()}`);
  }
  return year;
}

export function normaliseBusinessName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(the|pty|ltd|limited|co|company|inc)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

/** Digits only; Australian numbers keep a leading 61 when given as +61. */
export function normalisePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const national = digits.startsWith('61') && digits.length >= 11 ? `0${digits.slice(2)}` : digits;
  return national.slice(0, 20);
}

export function normaliseAddressKey(address: Pick<BusinessAddress, 'line1' | 'postcode'> | null | undefined): string | null {
  if (!address) return null;
  const line = address.line1.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return line ? `${line}|${address.postcode}` : null;
}

export interface PublicationInput {
  name: string;
  slug: string;
  description: string;
  primaryCategoryActive: boolean;
  localAreaActive: boolean;
  eligibilityVerifiedAt: Date | null;
  contentRightsReviewedAt: Date | null;
  publicPhone: string | null;
  publicEmail: string | null;
  publicUrl: string | null;
  hasPrivateEnquiryEmail: boolean;
}

/** SRS BUS 002 publication gate. Returns human-readable unmet requirements (empty = publishable). */
export function publicationBlockers(b: PublicationInput): string[] {
  const blockers: string[] = [];
  if (b.name.trim().length < 2) blockers.push('Name is required');
  if (!b.slug) blockers.push('Slug is required');
  if (b.description.trim().length < 40) blockers.push('Description must be at least 40 characters');
  if (!b.primaryCategoryActive) blockers.push('Primary category must be active');
  if (!b.localAreaActive) blockers.push('Local area must be active');
  if (!b.eligibilityVerifiedAt) blockers.push('Adelaide eligibility must be verified (record the source)');
  if (!b.publicPhone && !b.publicEmail && !b.publicUrl && !b.hasPrivateEnquiryEmail) blockers.push('At least one contact route is required (phone, email, website or private enquiry email)');
  if (!b.contentRightsReviewedAt) blockers.push('Content rights must be reviewed');
  return blockers;
}

/** Allowed explicit state transitions (SRS BUS 006). */
export const TRANSITIONS: Record<'publish' | 'unpublish' | 'archive' | 'restore', { from: BusinessStatus[]; to: BusinessStatus }> = {
  publish: { from: ['draft'], to: 'published' },
  unpublish: { from: ['published'], to: 'draft' },
  archive: { from: ['draft', 'published'], to: 'archived' },
  restore: { from: ['archived'], to: 'draft' },
};

export function isPubliclyVisible(business: Pick<Business, 'status'>): boolean {
  return business.status === 'published';
}

export function showsStreetAddress(visibility: AddressVisibility): boolean {
  return visibility === 'full';
}

/** Parsed Australian public phone number (SRS BUS 003: "Call" must be a valid tel link). */
export interface AustralianPhone {
  /** Digits in national format, e.g. 0390001234 or 1300123456 or 131234. */
  national: string;
  /** Value for a `tel:` link: E.164 for geographic/mobile/1300/1800 numbers; national digits for 13xxxx. */
  telHref: string;
  /** Display form with Australian grouping. */
  display: string;
}

/**
 * Accepts landlines (02/03/07/08 + 8 digits), mobiles (04/05 + 8 digits),
 * 1300/1800 + 6 digits and 13 + 4 digits, written nationally or with +61/0011 61.
 * Anything else (premium 19xx, international, too short) is rejected.
 */
export function parseAustralianPhone(input: string): AustralianPhone | null {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('001161')) digits = `0${digits.slice(6)}`;
  else if (digits.startsWith('61') && digits.length === 11) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith('61') && digits.length === 12 && /^61(1300|1800)/.test(digits)) digits = digits.slice(2);
  if (/^0[2378]\d{8}$/.test(digits)) {
    return { national: digits, telHref: `tel:+61${digits.slice(1)}`, display: `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}` };
  }
  if (/^0[45]\d{8}$/.test(digits)) {
    return { national: digits, telHref: `tel:+61${digits.slice(1)}`, display: `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` };
  }
  if (/^1[38]00\d{6}$/.test(digits)) {
    return { national: digits, telHref: `tel:+61${digits}`, display: `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` };
  }
  if (/^13\d{4}$/.test(digits)) {
    return { national: digits, telHref: `tel:${digits}`, display: `${digits.slice(0, 2)} ${digits.slice(2)}` };
  }
  return null;
}

export const LINK_KINDS = ['facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok', 'pinterest', 'other'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export const MAX_LINKS = 8;

/** Registrable domains each known kind must point at (subdomains allowed). */
const LINK_HOSTS: Record<Exclude<LinkKind, 'other'>, string[]> = {
  facebook: ['facebook.com', 'fb.com'],
  instagram: ['instagram.com'],
  x: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'],
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  pinterest: ['pinterest.com', 'pinterest.com.au', 'pin.it'],
};

export interface LinkInput {
  kind: LinkKind;
  url: string;
  label?: string | null;
}

/** Validates a public http(s) URL: no credentials, no javascript:/data:, a real host. Returns the normalised URL or null. */
const hostMatches = (hostname: string, domains: string[]) => domains.some((d) => hostname === d || hostname.endsWith(`.${d}`));

/** The domains a known link kind may point at; shared with the site's own social links (SRS CFG 001). */
export function linkHostsFor(kind: Exclude<LinkKind, 'other'>): string[] {
  return [...LINK_HOSTS[kind]];
}

/**
 * Validates one social link of a known kind: a public http(s) URL on that
 * platform's own domain. Returns the normalised URL, or null when either rule
 * fails — a link in the site header must never send visitors somewhere else.
 */
// The rule lives in the shared package; it is re-exported here because this is
// where the rest of the directory's link rules are read from.
export { validatePublicUrl };

export function validatePlatformUrl(kind: Exclude<LinkKind, 'other'>, value: string): string | null {
  const url = validatePublicUrl(value);
  if (!url) return null;
  return hostMatches(new URL(url).hostname.toLowerCase(), LINK_HOSTS[kind]) ? url : null;
}

/** Link rules (SRS BUS 003): http(s) only, known kinds on their own domains, one per known kind, at most MAX_LINKS. */
export function validateLinks(links: LinkInput[]): { errors: Record<string, string[]>; normalised: { kind: LinkKind; url: string; label: string | null; sortOrder: number }[] } {
  const errors: Record<string, string[]> = {};
  const normalised: { kind: LinkKind; url: string; label: string | null; sortOrder: number }[] = [];
  if (links.length > MAX_LINKS) {
    errors.links = [`At most ${MAX_LINKS} links`];
    return { errors, normalised };
  }
  const seenKinds = new Set<string>();
  links.forEach((link, index) => {
    const path = `links.${index}`;
    if (!LINK_KINDS.includes(link.kind)) {
      errors[`${path}.kind`] = ['Unknown link kind'];
      return;
    }
    const url = validatePublicUrl(String(link.url ?? ''));
    if (!url) {
      errors[`${path}.url`] = ['Enter a full http(s) URL without credentials'];
      return;
    }
    if (link.kind !== 'other') {
      let failed = false;
      if (seenKinds.has(link.kind)) {
        errors[`${path}.kind`] = [`Only one ${link.kind} link is allowed`];
        failed = true;
      }
      seenKinds.add(link.kind);
      if (!hostMatches(new URL(url).hostname.toLowerCase(), LINK_HOSTS[link.kind])) {
        errors[`${path}.url`] = [`A ${link.kind} link must point at ${LINK_HOSTS[link.kind].join(' or ')}`];
        failed = true;
      }
      if (failed) return;
    }
    const label = typeof link.label === 'string' && link.label.trim() ? link.label.trim().slice(0, 60) : null;
    normalised.push({ kind: link.kind, url, label, sortOrder: index });
  });
  return { errors, normalised };
}
