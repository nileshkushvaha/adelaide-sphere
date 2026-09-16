/**
 * Search advice for an article while it is written (SRS 1.10 BLOG 005). Advice
 * only: nothing here blocks saving or publishing, and each message says what
 * to do in plain words. Everything is worked out in the browser from what is
 * on screen, so it updates as the writer types.
 */

export type SeoCheckStatus = 'good' | 'improve';

export interface SeoCheck {
  code: string;
  status: SeoCheckStatus;
  message: string;
}

export interface SeoCheckInput {
  /** Omitted for content that has no focus phrase (information pages): those checks are skipped. */
  focusPhrase?: string;
  title: string;
  seoTitle: string;
  summary?: string;
  seoDescription: string;
  slug: string;
  bodyHtml: string;
}

export const SEO_MIN_WORDS = 300;
export const SEO_LONG_SENTENCE_WORDS = 25;

const plain = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

/** Lower case, accents and punctuation removed, single spaces: "Cafés, Prospect!" → "cafes prospect". */
const normalise = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const wordsOf = (text: string): string[] => (text ? text.split(/\s+/).filter(Boolean) : []);

/** Whole-word match, so "art" is not found in "start". */
function hasPhrase(text: string, phrase: string): boolean {
  const needle = normalise(phrase);
  return needle !== '' && ` ${normalise(text)} `.includes(` ${needle} `);
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function seoChecks(input: SeoCheckInput): SeoCheck[] {
  const text = plain(input.bodyHtml);
  const words = wordsOf(text);
  const checks: SeoCheck[] = [];
  const add = (code: string, good: boolean, goodMessage: string, improveMessage: string) => checks.push({ code, status: good ? 'good' : 'improve', message: good ? goodMessage : improveMessage });

  const phrase = (input.focusPhrase ?? '').split(',')[0]!.trim();
  if (input.focusPhrase === undefined) {
    // No focus phrase on this kind of content: only the general checks apply.
  } else if (!phrase) {
    checks.push({ code: 'focus', status: 'improve', message: 'Add a focus phrase — the words people would search for — to get advice on using it.' });
  } else {
    const shownTitle = input.seoTitle || input.title;
    const shownDescription = input.seoDescription || input.summary || '';
    add('focus-title', hasPhrase(shownTitle, phrase), 'The focus phrase is in the title.', `Use “${phrase}” in the title, ideally near the start.`);
    add('focus-description', hasPhrase(shownDescription, phrase), 'The focus phrase is in the summary.', `Use “${phrase}” in the summary, which search results show under the title.`);
    add('focus-opening', hasPhrase(words.slice(0, 100).join(' '), phrase), 'The focus phrase appears early in the article.', `Mention “${phrase}” in the opening paragraph.`);
    add('focus-address', hasPhrase(input.slug.replace(/-/g, ' '), phrase), 'The web address contains the focus phrase.', 'The web address does not contain the focus phrase. Change it only before the article is first published.');
  }

  add('length', words.length >= SEO_MIN_WORDS, `${words.length} words — a good length.`, `${words.length} words so far. Articles of ${SEO_MIN_WORDS} words or more tend to do better in search.`);

  if (words.length >= SEO_MIN_WORDS) {
    add('headings', /<h[234][\s>]/i.test(input.bodyHtml), 'The text is broken up with headings.', 'Add a heading or two to break up the text; it also builds the table of contents.');
  }

  const images = [...input.bodyHtml.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  if (images.length > 0) {
    const undescribed = images.filter((tag) => !/\balt\s*=\s*"[^"]*\S[^"]*"/i.test(tag)).length;
    add('image-descriptions', undescribed === 0, 'Every image has a description.', `${plural(undescribed, 'image has', 'images have')} no description. Select the image and open Image settings.`);
  }

  const links = [...input.bodyHtml.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"/gi)].map((match) => match[1]!);
  const internal = links.filter((href) => href.startsWith('/') && !href.startsWith('//')).length;
  add('internal-links', internal > 0, `${plural(internal, 'link', 'links')} to other pages on this site.`, 'Link to at least one related article, business or page on this site (Link → Find on this site).');

  const sentences = text.split(/(?<=[.!?])\s+/).filter((sentence) => wordsOf(sentence).length > 0);
  if (sentences.length >= 5) {
    const long = sentences.filter((sentence) => wordsOf(sentence).length > SEO_LONG_SENTENCE_WORDS).length;
    add('sentences', long / sentences.length <= 0.25, 'Sentences are a comfortable length.', `${long} of ${sentences.length} sentences are over ${SEO_LONG_SENTENCE_WORDS} words. Shorter ones are easier to read.`);
  }

  return checks;
}
