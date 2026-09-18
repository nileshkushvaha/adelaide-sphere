/**
 * Topic novelty rules (AI SRS §7, §17; plan §E "Before generation"). Pure and
 * deterministic: the same inputs always give the same decision, and nothing
 * here calls a model. Geography words come from configuration (the deployment's
 * location), never from this module.
 *
 * Honest limit: token overlap catches exact, reordered and lightly reworded
 * duplicates, not every paraphrase. That is why anything uncertain is sent to
 * editorial review rather than accepted.
 */
const STOPWORDS = new Set(
  (
    'a an and are as at be best by can do for from guide guides how in into is it its local near new of on or our the their things this ' +
    'to top ultimate what when where which who why with your you all about after before best-of complete essential'
  ).split(' '),
);
const MONTHS = new Set(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);

/** Unicode-normalised, lower-case words, punctuation removed (the 1A title normalisation). */
export function normalizeTopicText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Words of the configured location ("Adelaide, South Australia") shared by every topic; not evidence of overlap. */
export function locationStopwords(location: string): string[] {
  return normalizeTopicText(location).split(' ').filter(Boolean).map(stem);
}

export interface TopicFingerprint {
  /** Significant, stemmed, de-duplicated, sorted words without date words. */
  tokens: string[];
  /** Years and month names mentioned: what distinguishes one occurrence of an event from another. */
  dates: string[];
  /** Canonical basis of the topic intent; the database hashes it. */
  intentBasis: string;
  /** Intent plus occurrence, only when the topic names a date. */
  eventBasis: string | null;
}

export function topicFingerprint(title: string, locationWords: readonly string[] = []): TopicFingerprint {
  const extra = new Set(locationWords);
  const words = normalizeTopicText(title).split(' ').filter(Boolean);
  const tokens = new Set<string>();
  const dates = new Set<string>();
  for (const word of words) {
    if (/^(19|20)\d{2}$/.test(word) || MONTHS.has(word)) {
      dates.add(word);
      continue;
    }
    const stemmed = stem(word);
    if (STOPWORDS.has(word) || STOPWORDS.has(stemmed) || extra.has(stemmed) || stemmed.length < 2) continue;
    tokens.add(stemmed);
  }
  const sortedTokens = [...tokens].sort();
  const sortedDates = [...dates].sort();
  const intentBasis = sortedTokens.join(' ');
  return { tokens: sortedTokens, dates: sortedDates, intentBasis, eventBasis: sortedDates.length > 0 ? `${intentBasis} | ${sortedDates.join(' ')}` : null };
}

export interface TokenSimilarity {
  jaccard: number;
  containment: number;
  shared: number;
}

export function tokenSimilarity(a: readonly string[], b: readonly string[]): TokenSimilarity {
  const left = new Set(a);
  const right = new Set(b);
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = left.size + right.size - shared;
  const smaller = Math.min(left.size, right.size);
  return { jaccard: union === 0 ? 0 : shared / union, containment: smaller === 0 ? 0 : shared / smaller, shared };
}

/** Thresholds are conservative: near-duplicates are blocked, uncertain overlap goes to a person. */
export const NOVELTY_THRESHOLDS = { duplicateJaccard: 0.85, reviewJaccard: 0.4, reviewContainment: 0.6, minimumShared: 2 } as const;

export type NoveltyStatus = 'clear' | 'review' | 'duplicate';

export interface NoveltyCandidate {
  kind: 'post' | 'item';
  id: string;
  title: string;
  /** Post status, or AI item status (rejected/cancelled count as history). */
  status: string;
  tokens: string[];
  dates: string[];
  slug?: string | null;
}

export interface NoveltyMatch {
  kind: 'post' | 'item';
  id: string;
  title: string;
  status: string;
  score: number;
  reason: 'same_topic' | 'same_event' | 'same_slug' | 'similar_topic' | 'earlier_occurrence' | 'previously_rejected';
  verdict: Exclude<NoveltyStatus, 'clear'>;
}

const REJECTED_HISTORY = new Set(['rejected', 'cancelled']);

/**
 * Compares one topic with local inventory: published and unpublished Posts,
 * AI items, and rejected/cancelled history. Worst verdict wins.
 */
export function classifyNovelty(topic: TopicFingerprint & { slug?: string | null }, candidates: readonly NoveltyCandidate[]): { status: NoveltyStatus; matches: NoveltyMatch[] } {
  const matches: NoveltyMatch[] = [];
  for (const candidate of candidates) {
    const sim = tokenSimilarity(topic.tokens, candidate.tokens);
    const sameIntent = topic.tokens.length > 0 && topic.intentBasis === [...candidate.tokens].sort().join(' ');
    const sameDates = topic.dates.join(' ') === [...candidate.dates].sort().join(' ');
    const history = candidate.kind === 'item' && REJECTED_HISTORY.has(candidate.status);
    let match: Omit<NoveltyMatch, 'kind' | 'id' | 'title' | 'status'> | null = null;
    if (topic.slug && candidate.slug && topic.slug === candidate.slug) match = { score: 1, reason: 'same_slug', verdict: 'duplicate' };
    else if (sameIntent && sameDates) match = { score: 1, reason: topic.dates.length > 0 ? 'same_event' : 'same_topic', verdict: 'duplicate' };
    else if (sameIntent) match = { score: sim.jaccard, reason: 'earlier_occurrence', verdict: 'review' };
    else if (sim.shared >= NOVELTY_THRESHOLDS.minimumShared && sim.jaccard >= NOVELTY_THRESHOLDS.duplicateJaccard && sameDates) match = { score: sim.jaccard, reason: 'similar_topic', verdict: 'duplicate' };
    else if (sim.shared >= NOVELTY_THRESHOLDS.minimumShared && (sim.jaccard >= NOVELTY_THRESHOLDS.reviewJaccard || sim.containment >= NOVELTY_THRESHOLDS.reviewContainment)) {
      match = { score: Math.max(sim.jaccard, sim.containment), reason: 'similar_topic', verdict: 'review' };
    }
    if (!match) continue;
    // A rejected or cancelled idea is history: it never blocks outright, but it is never silently re-admitted.
    if (history) match = { ...match, reason: 'previously_rejected', verdict: 'review' };
    matches.push({ kind: candidate.kind, id: candidate.id, title: candidate.title, status: candidate.status, ...match });
  }
  matches.sort((a, b) => (a.verdict === b.verdict ? b.score - a.score : a.verdict === 'duplicate' ? -1 : 1));
  const status: NoveltyStatus = matches.some((m) => m.verdict === 'duplicate') ? 'duplicate' : matches.length > 0 ? 'review' : 'clear';
  return { status, matches: matches.slice(0, 10) };
}

/** Comma- or line-separated configured terms, normalised; empty entries dropped. */
export function parseTermList(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/[,\n]/)
    .map((term) => normalizeTopicText(term))
    .filter(Boolean);
}

/**
 * Keeps discovery inside the configured niche (AI SRS §7, owner policy §7): a
 * signal must mention at least one configured niche term and no excluded term.
 * With no niche terms configured nothing qualifies: discovery never guesses.
 */
export function matchesNiche(text: string, include: readonly string[], exclude: readonly string[]): boolean {
  const haystack = ` ${normalizeTopicText(text)} `;
  const has = (term: string) => haystack.includes(` ${term} `) || haystack.includes(` ${term}s `);
  if (exclude.some(has)) return false;
  return include.some(has);
}
