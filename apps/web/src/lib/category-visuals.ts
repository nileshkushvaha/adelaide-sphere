/**
 * Category-derived visuals. Most Adelaide listings in the directory have no
 * photograph, and repeating one dark placeholder made every card look identical
 * (and made the page look unfinished). Instead each card falls back to a
 * branded panel chosen deterministically from its category, so a grid varies
 * without ever implying a photograph exists.
 *
 * Pure functions live here so the mapping is unit-testable; the icon components
 * live in `components/category-icon.tsx`.
 */

export type CategoryVisualKey = 'food' | 'drink' | 'shopping' | 'health' | 'home' | 'professional' | 'beauty' | 'auto' | 'education' | 'general';

/**
 * Slug fragments mapped to a visual family. Order matters: the more specific
 * trades come first, because "auto-repair" also contains "repair" and would
 * otherwise be given the home-services wrench. Short, ambiguous tokens ("car",
 * which appears inside "carpet") are matched on hyphen boundaries only.
 */
const KEYWORDS: [RegExp, CategoryVisualKey][] = [
  [/(^|-)(auto|cars?|mechanics?|tyres?|motors?|panel-beat)(-|$)|automotive/, 'auto'],
  [/cafe|coffee|bakery|restaurant|food|eat|dining|dessert/, 'food'],
  [/(^|-)bars?(-|$)|pub|brew|wine|drink/, 'drink'],
  [/shop|retail|store|market|grocer|book/, 'shopping'],
  [/health|wellness|medical|dental|clinic|physio|pharmacy|vet/, 'health'],
  [/beauty|hair|salon|spa|barber|nail/, 'beauty'],
  [/education|school|tutor|learn|training|childcare/, 'education'],
  [/home|trade|build|plumb|electric|garden|clean|repair/, 'home'],
  [/professional|legal|account|finance|consult|marketing|office/, 'professional'],
];

export function categoryVisual(slug: string): CategoryVisualKey {
  const value = slug.toLowerCase();
  for (const [pattern, key] of KEYWORDS) if (pattern.test(value)) return key;
  return 'general';
}

/**
 * Background for a listing or category panel. Every gradient stays inside the
 * navy/sky brand range with one warmer or cooler shift, so a grid reads as one
 * family rather than a set of unrelated colours.
 */
const GRADIENTS: Record<CategoryVisualKey, string> = {
  food: 'linear-gradient(135deg, #1d447f 0%, #0e2242 100%)',
  drink: 'linear-gradient(135deg, #26426d 0%, #10243f 100%)',
  shopping: 'linear-gradient(135deg, #0b5f8f 0%, #0e2242 100%)',
  health: 'linear-gradient(135deg, #146a72 0%, #0e2c42 100%)',
  home: 'linear-gradient(135deg, #2b4a6f 0%, #101f38 100%)',
  professional: 'linear-gradient(135deg, #24365c 0%, #0b1a33 100%)',
  beauty: 'linear-gradient(135deg, #4a3a68 0%, #17203c 100%)',
  auto: 'linear-gradient(135deg, #34506b 0%, #0f1e34 100%)',
  education: 'linear-gradient(135deg, #1a5178 0%, #0d2036 100%)',
  general: 'linear-gradient(135deg, #1f3d6b 0%, #0b1a33 100%)',
};

export function categoryGradient(slug: string): string {
  return GRADIENTS[categoryVisual(slug)];
}

const GRADIENT_KEYS = Object.keys(GRADIENTS) as CategoryVisualKey[];

/**
 * Gradient for an *editorial* category ("city-guides", "interviews"), whose
 * slugs describe subjects rather than trades and so would all fall to the one
 * `general` panel above. A stable hash spreads them over the same brand
 * gradients instead, so a blog grid varies while a given category always looks
 * the same wherever it appears.
 */
export function editorialGradient(slug: string): string {
  let hash = 0;
  for (const character of slug.toLowerCase()) hash = (hash * 31 + character.charCodeAt(0)) % 100_000;
  return GRADIENTS[GRADIENT_KEYS[hash % GRADIENT_KEYS.length]!];
}

/** Up to two initials for the fallback panel; never more, so it stays a mark rather than text. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => /[a-z0-9]/i.test(word));
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}
