/** Public URL slugs: lowercase, hyphen separated, ASCII (SRS SEO 001 / UX 003). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 100;

/** Derives a slug from a name; returns '' when nothing usable remains. */
const TRANSLITERATIONS: Record<string, string> = { ß: 'ss', æ: 'ae', Æ: 'ae', ø: 'o', Ø: 'o', œ: 'oe', Œ: 'oe', đ: 'd', Đ: 'd', ł: 'l', Ł: 'l' };

export function slugify(input: string): string {
  return input
    .replace(/[ßæÆøØœŒđĐłŁ]/g, (ch) => TRANSLITERATIONS[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(slug);
}

/**
 * Slugs a published listing may not take, because the public site serves the
 * curated pages from the same prefix as the listing itself: `/business` is the
 * list, `/business/category/{slug}` and `/business/area/{slug}` are curated
 * pages, and `/business/{slug}` is a listing (SRS UX 003, revision 1.3).
 * A static segment always wins over the dynamic one, so a listing slugged
 * "category" would be unreachable. It is refused at write time instead.
 */
export const RESERVED_BUSINESS_SLUGS = ['category', 'area'] as const;

export function isReservedBusinessSlug(slug: string): boolean {
  return (RESERVED_BUSINESS_SLUGS as readonly string[]).includes(slug);
}
