import { describe, expect, it } from 'vitest';
import { highlightParts, moveActiveIndex, suggestionHref } from './suggestions';

describe('highlightParts', () => {
  it('splits a label around the typed term, whatever its case', () => {
    expect(highlightParts('Plumbers', 'plum')).toEqual(['', 'Plum', 'bers']);
    expect(highlightParts('Emergency plumbing', 'PLUMB')).toEqual(['Emergency ', 'plumb', 'ing']);
  });

  it('leaves a label whole when the term is not in it', () => {
    // A business can be suggested on a synonym or a second field, so "no
    // visible match" is an ordinary case and not a reason to lose the label.
    expect(highlightParts('Bellair Wine Bar', 'vino')).toEqual(['Bellair Wine Bar', '', '']);
    expect(highlightParts('Anything', '')).toEqual(['Anything', '', '']);
  });
});

describe('moveActiveIndex', () => {
  it('wraps in both directions and starts from either end', () => {
    expect(moveActiveIndex(-1, 1, 3)).toBe(0);
    expect(moveActiveIndex(-1, -1, 3)).toBe(2);
    expect(moveActiveIndex(2, 1, 3)).toBe(0);
    expect(moveActiveIndex(0, -1, 3)).toBe(2);
    expect(moveActiveIndex(0, 1, 0)).toBe(-1);
  });
});

describe('suggestionHref', () => {
  it('opens a business and filters for a category or service (SRS HERO 006)', () => {
    expect(suggestionHref({ kind: 'business', label: 'Bellair Wine Bar', slug: 'bellair-wine-bar', hint: null })).toBe('/business/bellair-wine-bar');
    expect(suggestionHref({ kind: 'category', label: 'Bars', slug: 'bars', hint: null })).toBe('/business?category=bars');
    expect(suggestionHref({ kind: 'service', label: 'Hot water systems', slug: 'hot-water-systems', hint: null })).toBe('/business?q=Hot%20water%20systems');
  });
});
