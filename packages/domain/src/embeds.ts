/**
 * Videos and maps inside articles (SRS 1.10 BLOG 004). Shared by the admin,
 * which turns a pasted address into an embed while the article is written, and
 * the API, which accepts an embed on save only when it passes these same rules.
 *
 * An embed is stored as an inert marker — `<div data-embed="youtube"
 * data-embed-id="…">` — never as an iframe, so the stored HTML still contains
 * nothing that loads anything. The public page swaps the marker for a
 * placeholder, and the third-party frame loads only when a reader asks for it.
 */

export type EmbedProvider = 'youtube' | 'map';

export type ParsedEmbed = { provider: 'youtube'; id: string } | { provider: 'map'; src: string };

export type EmbedParseResult = { ok: true; embed: ParsedEmbed } | { ok: false; reason: string };

export const EMBED_TITLE_MAX = 150;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
/** Google's `pb` parameter: an opaque token of letters, digits and a few separators. */
const MAP_PB = /^[A-Za-z0-9!._%:+-]{1,2000}$/;
const MAP_PREFIX = 'https://www.google.com/maps/embed?pb=';
/** A stored record id (cuid). */
const RECORD_ID = /^[a-z0-9]{20,40}$/;

export function isYoutubeId(value: unknown): value is string {
  return typeof value === 'string' && YOUTUBE_ID.test(value);
}

export function isRecordId(value: unknown): value is string {
  return typeof value === 'string' && RECORD_ID.test(value);
}

/** A map embed address exactly as stored: Google's embed endpoint with a valid `pb` and nothing else. */
export function isMapEmbedSrc(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(MAP_PREFIX) && MAP_PB.test(value.slice(MAP_PREFIX.length));
}

const fail = (reason: string): EmbedParseResult => ({ ok: false, reason });

/**
 * Reads what an editor pastes — a YouTube link in any of its usual forms, or
 * Google Maps' "Embed a map" HTML or address — and returns the embed, or a
 * sentence saying what to paste instead. Anything else is refused rather than
 * guessed at.
 */
export function parseEmbedUrl(input: string): EmbedParseResult {
  let text = (input ?? '').trim();
  if (!text) return fail('Paste the address of a YouTube video or a Google Maps embed.');
  // Google Maps offers HTML to copy; take the address out of it.
  const iframe = /<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(text);
  if (iframe) text = iframe[1]!.replace(/&amp;/g, '&');

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return fail('Paste the full address of a YouTube video or a Google Maps embed, starting with https://.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return fail('Only web addresses can be embedded.');
  if (url.username || url.password) return fail('That address cannot be embedded.');
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');

  let videoId: string | null | undefined;
  if (host === 'youtu.be') videoId = url.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v');
    else videoId = /^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null;
  }
  if (videoId !== undefined) {
    return isYoutubeId(videoId) ? { ok: true, embed: { provider: 'youtube', id: videoId } } : fail('That YouTube address does not point at a single video. Copy the address of the video itself.');
  }

  if (host === 'google.com' && url.pathname === '/maps/embed') {
    const rawPb = /[?&]pb=([^&#]+)/.exec(text)?.[1];
    if (rawPb && MAP_PB.test(rawPb)) return { ok: true, embed: { provider: 'map', src: `${MAP_PREFIX}${rawPb}` } };
    return fail('That Google Maps embed address is incomplete. Copy it again from Share → Embed a map.');
  }
  if ((host === 'google.com' && url.pathname.startsWith('/maps')) || host === 'maps.google.com' || host === 'maps.app.goo.gl' || host === 'goo.gl') {
    return fail('For Google Maps, open Share → Embed a map → Copy HTML, and paste that here.');
  }
  return fail('Only YouTube videos and Google Maps embeds can be added.');
}

/** The map above the footer when an administrator has not chosen one (SRS 1.11 BUS 003): Adelaide, from Google's keyless embed. */
// `z=13` opens on the city centre and inner suburbs rather than the whole region.
export const DEFAULT_ADELAIDE_MAP_SRC = 'https://www.google.com/maps?q=Adelaide%20SA&z=13&output=embed';
export const SITE_MAP_TITLE = 'Map of Adelaide';

/** A source the site-wide map may load: a validated Google Maps embed, or exactly the built-in Adelaide map. */
export function isSiteMapSrc(value: unknown): value is string {
  return value === DEFAULT_ADELAIDE_MAP_SRC || isMapEmbedSrc(value);
}
