import { validatePublicUrl } from '../directory/business-rules.js';

/**
 * Public author profile rules (SRS BLOG 001/004). An author is attribution
 * only: nothing here creates or references a login, and the public email is an
 * editorial contact address, never an administrator's account email.
 */
export const AUTHOR_LINK_KINDS = ['website', 'facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok', 'pinterest', 'threads', 'mastodon', 'github', 'other'] as const;
export type AuthorLinkKind = (typeof AUTHOR_LINK_KINDS)[number];

export const MAX_AUTHOR_LINKS = 8;
export const MAX_EXPERTISE = 8;
export const MAX_EXPERTISE_LENGTH = 40;

/** Domains a known network must live on; kinds absent here accept any host. */
const LINK_HOSTS: Partial<Record<AuthorLinkKind, string[]>> = {
  facebook: ['facebook.com', 'fb.com'],
  instagram: ['instagram.com'],
  x: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'],
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  pinterest: ['pinterest.com', 'pinterest.com.au', 'pin.it'],
  threads: ['threads.net', 'threads.com'],
  github: ['github.com'],
};

const hostMatches = (hostname: string, domains: string[]) => domains.some((d) => hostname === d || hostname.endsWith(`.${d}`));

export interface AuthorLinkInput {
  kind: AuthorLinkKind;
  url: string;
  label?: string | null;
}

export interface NormalisedAuthorLink {
  kind: AuthorLinkKind;
  url: string;
  label: string | null;
  sortOrder: number;
}

/** One link per known network, http(s) only, on the network's own domain. */
export function validateAuthorLinks(links: AuthorLinkInput[]): { errors: Record<string, string[]>; normalised: NormalisedAuthorLink[] } {
  const errors: Record<string, string[]> = {};
  const normalised: NormalisedAuthorLink[] = [];
  if (links.length > MAX_AUTHOR_LINKS) {
    errors.links = [`At most ${MAX_AUTHOR_LINKS} links`];
    return { errors, normalised };
  }
  const seen = new Set<string>();
  links.forEach((link, index) => {
    const path = `links.${index}`;
    if (!(AUTHOR_LINK_KINDS as readonly string[]).includes(link.kind)) {
      errors[`${path}.kind`] = ['Unknown link kind'];
      return;
    }
    const url = validatePublicUrl(String(link.url ?? ''));
    if (!url) {
      errors[`${path}.url`] = ['Enter a full http(s) URL without credentials'];
      return;
    }
    if (link.kind !== 'other') {
      if (seen.has(link.kind)) {
        errors[`${path}.kind`] = [`Only one ${link.kind} link is allowed`];
        return;
      }
      seen.add(link.kind);
      const hosts = LINK_HOSTS[link.kind];
      if (hosts && !hostMatches(new URL(url).hostname.toLowerCase(), hosts)) {
        errors[`${path}.url`] = [`A ${link.kind} link must point at ${hosts.join(' or ')}`];
        return;
      }
    }
    const label = typeof link.label === 'string' && link.label.trim() ? link.label.trim().slice(0, 60) : null;
    normalised.push({ kind: link.kind, url, label, sortOrder: index });
  });
  return { errors, normalised };
}

/** Topic labels shown on author cards: trimmed, de-duplicated, bounded. */
export function validateExpertise(values: string[] | null | undefined): { errors: Record<string, string[]>; normalised: string[] } {
  const list = (values ?? []).map((value) => String(value).replace(/\s+/g, ' ').trim()).filter((value) => value.length > 0);
  if (list.length > MAX_EXPERTISE) return { errors: { expertise: [`At most ${MAX_EXPERTISE} topics`] }, normalised: [] };
  const tooLong = list.find((value) => value.length > MAX_EXPERTISE_LENGTH);
  if (tooLong) return { errors: { expertise: [`Each topic must be ${MAX_EXPERTISE_LENGTH} characters or fewer`] }, normalised: [] };
  const seen = new Set<string>();
  const normalised = list.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { errors: {}, normalised };
}

/** Public contact address for the profile; deliberately unrelated to admin logins. */
export function validatePublicEmail(value: string | null | undefined): { ok: boolean; normalised: string | null } {
  if (!value || value.trim() === '') return { ok: true, normalised: null };
  const email = value.trim().toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 255;
  return { ok, normalised: ok ? email : null };
}
