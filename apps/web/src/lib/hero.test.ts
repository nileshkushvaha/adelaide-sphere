import { describe, expect, it } from 'vitest';
import { accessibleHeadline, nextPhraseIndex, usablePhrases } from './hero';
import { flattenSuggestions, moveActiveIndex, suggestionHref } from './suggestions';

describe('hero headline and rotation', () => {
  it('builds one stable accessible headline from the phrases', () => {
    expect(accessibleHeadline('Discover Adelaide businesses', ['local services', 'places to eat', 'independent shops'])).toBe('Discover Adelaide businesses: local services, places to eat and independent shops');
    expect(accessibleHeadline('Discover Adelaide businesses', ['cafes'])).toBe('Discover Adelaide businesses: cafes');
    expect(accessibleHeadline('Discover Adelaide businesses', [])).toBe('Discover Adelaide businesses');
  });

  it('rotates with wrap-around and trims unusable phrases', () => {
    expect([0, 1, 2].map((i) => nextPhraseIndex(i, 3))).toEqual([1, 2, 0]);
    expect(nextPhraseIndex(0, 0)).toBe(0);
    expect(usablePhrases([' cafes ', '', '   ', 'bars', 'a', 'b', 'c', 'd'])).toEqual(['cafes', 'bars', 'a', 'b', 'c']);
    expect(usablePhrases(undefined)).toEqual([]);
  });
});

describe('suggestion list behaviour', () => {
  const groups = {
    businesses: [{ kind: 'business' as const, label: 'Cafe Lumen', slug: 'cafe-lumen', hint: 'Norwood' }],
    categories: [{ kind: 'category' as const, label: 'Cafes', slug: 'cafes', hint: null }],
    services: [{ kind: 'service' as const, label: 'Specialty coffee', slug: 'specialty-coffee', hint: 'cafe latte' }],
  };

  it('flattens groups in display order with stable indexes', () => {
    expect(flattenSuggestions(groups).map((s) => [s.groupLabel, s.label, s.index])).toEqual([
      ['Businesses', 'Cafe Lumen', 0],
      ['Categories', 'Cafes', 1],
      ['Services', 'Specialty coffee', 2],
    ]);
    expect(flattenSuggestions(null)).toEqual([]);
  });

  it('links businesses directly and terms into the directory', () => {
    expect(suggestionHref(groups.businesses[0]!)).toBe('/business/cafe-lumen');
    expect(suggestionHref(groups.categories[0]!)).toBe('/business?category=cafes');
    expect(suggestionHref(groups.services[0]!)).toBe('/business?q=Specialty%20coffee');
  });

  it('moves the active option with wrap-around', () => {
    expect(moveActiveIndex(-1, 1, 3)).toBe(0);
    expect(moveActiveIndex(-1, -1, 3)).toBe(2);
    expect(moveActiveIndex(2, 1, 3)).toBe(0);
    expect(moveActiveIndex(0, -1, 3)).toBe(2);
    expect(moveActiveIndex(0, 1, 0)).toBe(-1);
  });
});
