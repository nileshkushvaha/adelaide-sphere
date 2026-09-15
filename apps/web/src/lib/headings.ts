/**
 * Anchors for the sections of an editor-written page, so a long policy can be
 * navigated and linked to section by section.
 *
 * The body is HTML the API has already sanitised with an allowlist before
 * storing it (SRS SEC 001), so this only adds `id` attributes to the top-level
 * headings it finds; it never introduces markup of its own beyond that. An
 * `id` an editor set by hand is kept, and duplicate titles get a numeric
 * suffix, so two "Your choices" sections still have distinct addresses.
 */
export interface Heading {
  id: string;
  text: string;
}

const HEADING = /<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi;
const EXISTING_ID = /\bid\s*=\s*["']([^"']+)["']/i;

const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/** Returns the body with anchored headings, and the headings themselves in document order. */
export function withHeadingAnchors(body: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const used = new Set<string>();
  const html = body.replace(HEADING, (match, attributes: string | undefined, inner: string) => {
    const label = text(inner);
    if (!label) return match;
    const existing = attributes?.match(EXISTING_ID)?.[1];
    let id = existing ?? slugify(label) ?? '';
    if (!id) return match;
    if (!existing) {
      let n = 2;
      const base = id;
      while (used.has(id)) id = `${base}-${n++}`;
    }
    used.add(id);
    headings.push({ id, text: label });
    return existing ? match : `<h2${attributes ?? ''} id="${id}">${inner}</h2>`;
  });
  return { html, headings };
}

export interface OutlineHeading extends Heading {
  level: 2 | 3;
}

const OUTLINE_HEADING = /<(h[23])(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;

/** The prefix on article section ids, so a heading can never take an id the page itself uses (e.g. `comments-heading`). */
export const SECTION_ID_PREFIX = 'section-';

/**
 * Sections and subsections of an article, for its table of contents (SRS 1.10
 * BLOG 004). Ids are added when the page is rendered, never stored, so every
 * existing article gets them without rewriting its body. The sanitiser does not
 * keep `id` attributes, so every id here is generated, prefixed and unique.
 */
export function articleOutline(body: string): { html: string; headings: OutlineHeading[] } {
  const headings: OutlineHeading[] = [];
  const used = new Set<string>();
  const html = body.replace(OUTLINE_HEADING, (match, tag: string, attributes: string | undefined, inner: string) => {
    const label = text(inner);
    const slug = slugify(label);
    if (!label || !slug) return match;
    const base = `${SECTION_ID_PREFIX}${slug}`;
    let id = base;
    for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
    used.add(id);
    const level = tag.toLowerCase() === 'h3' ? 3 : 2;
    headings.push({ id, text: label, level });
    const kept = (attributes ?? '').replace(/\s+id\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return `<${tag}${kept} id="${id}">${inner}</${tag}>`;
  });
  return { html, headings };
}
