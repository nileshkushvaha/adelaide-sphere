import type { components } from '@adelaide-sphere/contracts';

export type Suggestion = components['schemas']['SuggestionDto'];
export type SuggestionGroups = components['schemas']['SuggestionsDto'];

export const MIN_SUGGESTION_LENGTH = 2;
export const SUGGESTION_DEBOUNCE_MS = 250;

export interface FlatSuggestion extends Suggestion {
  /** Index in the flattened list, for `aria-activedescendant` and arrow keys. */
  index: number;
  groupLabel: string;
}

/** Flattens the grouped response in display order (businesses, categories, services). */
export function flattenSuggestions(groups: SuggestionGroups | null): FlatSuggestion[] {
  if (!groups) return [];
  const order: [keyof SuggestionGroups, string][] = [
    ['businesses', 'Businesses'],
    ['categories', 'Categories'],
    ['services', 'Services'],
  ];
  let index = 0;
  return order.flatMap(([key, groupLabel]) => (groups[key] ?? []).map((s) => ({ ...s, groupLabel, index: index++ })));
}

/** Where selecting a suggestion goes (SRS HERO 006: categories and services filter, a business opens directly). */
export function suggestionHref(suggestion: Suggestion): string {
  if (suggestion.kind === 'business') return `/business/${encodeURIComponent(suggestion.slug)}`;
  if (suggestion.kind === 'category') return `/business?category=${encodeURIComponent(suggestion.slug)}`;
  return `/business?q=${encodeURIComponent(suggestion.label)}`;
}

/**
 * Splits a label around the first case-insensitive occurrence of the term, so
 * the matched part can be emphasised. Returns the three pieces in order; the
 * middle is empty when the term does not appear (a business can match on a
 * synonym or a second word).
 */
export function highlightParts(label: string, term: string): [string, string, string] {
  const at = term.length > 0 ? label.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (at === -1) return [label, '', ''];
  return [label.slice(0, at), label.slice(at, at + term.length), label.slice(at + term.length)];
}

/** Arrow-key movement with wrap-around; -1 means "no active option". */
export function moveActiveIndex(current: number, delta: number, count: number): number {
  if (count === 0) return -1;
  if (current === -1) return delta > 0 ? 0 : count - 1;
  return (current + delta + count) % count;
}
