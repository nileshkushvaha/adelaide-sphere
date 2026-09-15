/**
 * URL rules shared by everything that accepts a link from an administrator
 * (SRS 1.2 ALRT 005, CFG 001).
 *
 * A link is checked once, when it is saved, and the same check decides whether
 * it leaves the site. Anything that re-derives that answer with its own
 * `startsWith('/')` will eventually give a different one — which is how a
 * `javascript:` URL or a protocol-relative host reaches a page.
 */

/**
 * A public http(s) URL: no credentials, no exotic scheme, a hostname with a dot
 * in it. Returns the normalised URL, or null.
 */
export function validatePublicUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return null;
  return url.toString();
}

export interface ValidatedLink {
  /** A site-relative path, or an absolute http(s) URL. */
  url: string;
  external: boolean;
}

/**
 * Validates an alert's link destination at write time (ALRT 005). Internal
 * destinations are site-relative paths; external ones must be http or https.
 * Everything else — `javascript:`, `data:`, protocol-relative `//host`,
 * credentials in the URL — is refused on save rather than filtered at render,
 * because a renderer that has to decide is a renderer that will eventually
 * decide wrong.
 */
export function validateAlertLink(value: string): ValidatedLink | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 300) return null;
  // A protocol-relative URL reads as a path and behaves as a host.
  if (trimmed.startsWith('//')) return null;
  if (trimmed.startsWith('/')) {
    // One leading slash, no scheme, no backslashes, no control characters.
    if (!/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/.test(trimmed)) return null;
    return { url: trimmed, external: false };
  }
  const absolute = validatePublicUrl(trimmed);
  return absolute ? { url: absolute, external: true } : null;
}
