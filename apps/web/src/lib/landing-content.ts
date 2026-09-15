/** Plain text of a fragment of sanitised HTML, normalised for comparison. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.:–—-]+$/, '')
    .trim();
}

/**
 * Drops the opening heading of an editor's landing content when it only repeats
 * the page's own H1.
 *
 * A category page states its name in the heading, and an editor writing the
 * category's description very reasonably starts by typing the name again — so
 * the page read "City guides / City guides / Our guides.". Removing it here is
 * a presentation decision and nothing is edited: the stored content is
 * untouched, and a heading that says anything else is left exactly where the
 * editor put it.
 *
 * Only the *first* element is considered, and only when it is a heading.
 */
export function withoutRepeatedHeading(html: string | null | undefined, title: string): string | null {
  if (!html) return null;
  const leadingHeading = /^\s*<h[1-6](?:\s[^>]*)?>([\s\S]*?)<\/h[1-6]>/i.exec(html);
  if (!leadingHeading) return html;
  if (plainText(leadingHeading[1] ?? '') !== plainText(title)) return html;
  const remainder = html.slice(leadingHeading[0].length).trim();
  // An entry that was *only* the repeated heading leaves nothing to show.
  return remainder.length > 0 ? remainder : null;
}
