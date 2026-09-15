import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { EMBED_TITLE_MAX, htmlToPlainText, isMapEmbedSrc, isRecordId, isYoutubeId } from '@adelaide-sphere/domain';

/**
 * Editorial content pipeline (SRS BLOG 001, SEC 001). Authors write Markdown;
 * the server renders it and then removes everything outside an explicit
 * allowlist, so what is stored is already safe for both public pages and admin
 * previews. Sanitisation never trusts the renderer: raw HTML embedded in the
 * Markdown passes through the same allowlist.
 */
const ALLOWED_TAGS = [
  'h2', 'h3', 'h4', 'p', 'br', 'hr',
  'strong', 'em', 'del', 'sup', 'sub',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  // Only as a validated embed or business-card marker (see transformTags.div).
  'div',
];

/**
 * An embed or business-card marker with only its validated attributes, or null.
 * A marker is inert — it loads nothing — and the public page decides how to
 * show it; an iframe is never stored (SRS 1.10 BLOG 004, SEC 001).
 */
function embedMarker(attribs: sanitizeHtml.Attributes): sanitizeHtml.Attributes | null {
  const title = (attribs['data-embed-title'] ?? '').replace(/[<>"]/g, '').slice(0, EMBED_TITLE_MAX);
  switch (attribs['data-embed']) {
    case 'youtube':
      return isYoutubeId(attribs['data-embed-id']) && title ? { class: 'ms-embed', 'data-embed': 'youtube', 'data-embed-id': attribs['data-embed-id'], 'data-embed-title': title } : null;
    case 'map':
      return isMapEmbedSrc(attribs['data-embed-src']) && title ? { class: 'ms-embed', 'data-embed': 'map', 'data-embed-src': attribs['data-embed-src'], 'data-embed-title': title } : null;
    case 'business':
      return isRecordId(attribs['data-business-id']) ? { class: 'ms-embed', 'data-embed': 'business', 'data-business-id': attribs['data-business-id'], 'data-embed-title': title } : null;
    default:
      return null;
  }
}

const SANITISE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    // A document link (change log 1.16) names its library PDF like an image does, so it counts as in use.
    a: ['href', 'title', 'rel', 'target', 'class', 'data-media-id'],
    // `data-media-id` names the library image so the image counts as in use
    // (MED 004); anything but an id-shaped value is removed below.
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'data-media-id'],
    th: ['scope', 'colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
    code: ['class'],
    figure: ['class'],
    div: ['class', 'data-embed', 'data-embed-id', 'data-embed-src', 'data-embed-title', 'data-business-id'],
  },
  allowedClasses: { figure: ['ms-figure', 'ms-figure--wide'], div: ['ms-embed'], a: ['ms-doc-link'] },
  // Only these protocols survive; javascript:, data: and vbscript: never do.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    // Formatting pasted from word processors and the editor's own shortcuts is
    // kept in the nearest allowed form rather than silently dropped: strike
    // becomes deletion, bold/italic become their semantic tags, and headings
    // outside h2–h4 move to the nearest level (the page title is the only h1).
    s: 'del',
    strike: 'del',
    b: 'strong',
    i: 'em',
    h1: 'h2',
    h5: 'h4',
    h6: 'h4',
    // A div survives only as a valid marker; any other div is unwrapped and its text kept.
    div: (tagName, attribs) => {
      const marker = embedMarker(attribs);
      return marker ? { tagName: 'div', attribs: marker } : { tagName: 'ms-unwrap', attribs: {} };
    },
    // External links open safely; internal ones keep default behaviour (SRS BUS 003 style rules).
    a: (tagName, attribs) => {
      const href = attribs.href ?? '';
      const external = /^https?:\/\//i.test(href);
      const { 'data-media-id': mediaId, ...rest } = attribs;
      const validId = typeof mediaId === 'string' && /^[a-z0-9]{20,40}$/.test(mediaId);
      return { tagName, attribs: { ...rest, ...(validId ? { 'data-media-id': mediaId } : {}), ...(external ? { rel: 'noopener noreferrer nofollow', target: '_blank' } : { rel: attribs.rel ?? 'noopener' }) } };
    },
    img: (tagName, attribs) => {
      const { 'data-media-id': mediaId, ...rest } = attribs;
      const validId = typeof mediaId === 'string' && /^[a-z0-9]{20,40}$/.test(mediaId);
      return { tagName, attribs: { ...rest, ...(validId ? { 'data-media-id': mediaId } : {}), alt: attribs.alt ?? '', loading: 'lazy' } };
    },
  },
  exclusiveFilter: (frame) => frame.tag === 'a' && !frame.attribs.href,
};

marked.setOptions({ gfm: true, breaks: false, async: false });

/** Source format an article was written in; both end up as the same sanitised HTML. */
export type BodyFormat = 'markdown' | 'html';

/**
 * Renders an article body and returns sanitised HTML that is safe to store and
 * display. Markdown is rendered first; rich-editor HTML skips the renderer but
 * passes the identical allowlist, so neither route can introduce script,
 * style or event-handler content (SRS SEC 001).
 */
export function renderSanitisedBody(body: string, format: BodyFormat = 'markdown'): string {
  if (format === 'html') return sanitizeHtml(body ?? '', SANITISE_OPTIONS).trim();
  const rendered = marked.parse(body ?? '', { async: false }) as string;
  return sanitizeHtml(rendered, SANITISE_OPTIONS).trim();
}

/** Sanitises fragments that are already HTML (e.g. taxonomy landing content). */
export function sanitiseHtmlFragment(html: string): string {
  return sanitizeHtml(html ?? '', SANITISE_OPTIONS).trim();
}

/** Plain text for excerpts, search and length checks; never used for rendering. */
export function toPlainText(html: string): string {
  return htmlToPlainText(html);
}
