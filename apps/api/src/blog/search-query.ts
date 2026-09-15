/**
 * Blog search terms for MySQL full-text search in boolean mode (SRS 1.10
 * BLOG 005). What a reader types is never passed through: it is reduced to
 * words of letters and digits, so no boolean operator (`+ - < > ( ) ~ * " @`)
 * can reach the query, and each word is required as a prefix (`+word*`), so
 * "laneway cafe" finds "laneways" and "cafes" together.
 */

/** InnoDB drops shorter words from its index (`innodb_ft_min_token_size` = 3). */
export const MIN_SEARCH_WORD_LENGTH = 3;
export const MAX_SEARCH_WORDS = 8;

/**
 * InnoDB's default full-text stopwords. A required stopword can never match,
 * so one left in (`+the*`) would make every search containing it return nothing.
 */
const STOPWORDS = new Set(['a', 'about', 'an', 'are', 'as', 'at', 'be', 'by', 'com', 'de', 'en', 'for', 'from', 'how', 'i', 'in', 'is', 'it', 'la', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'what', 'when', 'where', 'who', 'will', 'with', 'und', 'www']);

/** The boolean-mode search string, or null when nothing searchable is left (the caller then matches titles and summaries directly). */
export function booleanSearchTerms(input: string): string | null {
  const words = (input ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => [...word].length >= MIN_SEARCH_WORD_LENGTH && !STOPWORDS.has(word));
  const unique = [...new Set(words)].slice(0, MAX_SEARCH_WORDS);
  return unique.length > 0 ? unique.map((word) => `+${word}*`).join(' ') : null;
}
