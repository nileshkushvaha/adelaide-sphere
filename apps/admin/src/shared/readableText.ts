/**
 * Text a person would read, from an HTML body or a Markdown one, with paragraph
 * breaks kept so a comparison reads as paragraphs rather than one long line.
 */
export function readableText(source: string, format: 'html' | 'markdown'): string {
  if (format === 'markdown' || typeof DOMParser === 'undefined') return source;
  const doc = new DOMParser().parseFromString(source, 'text/html');
  doc.querySelectorAll('p, h2, h3, h4, li, blockquote, pre, tr').forEach((element) => element.append('\n'));
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}
