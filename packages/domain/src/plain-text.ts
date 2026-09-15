/**
 * Plain text from sanitised HTML, for length checks, summaries and search —
 * never for display. Shared by the API and the worker so both count an
 * article's text the same way (SRS 1.10 BLOG 002). Block elements become word
 * breaks, inline elements join their text, and entities are decoded.
 */
const BLOCK_TAG = /<\/?(?:p|div|h[1-6]|li|ul|ol|br|hr|blockquote|pre|figure|figcaption|table|thead|tbody|tr|td|th|img|section|article)\b[^>]*>/gi;
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntity(entity: string, body: string): string {
  if (body.startsWith('#')) {
    const code = /^#x/i.test(body) ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
}

export function htmlToPlainText(html: string): string {
  return (html ?? '')
    .replace(BLOCK_TAG, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => decodeEntity(entity, body))
    .replace(/\s+/g, ' ')
    .trim();
}
