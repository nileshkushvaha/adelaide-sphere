import { describe, expect, it } from 'vitest';
import { buildChips, isFiltered, landingRobots, pageHref, parseSearchParams, toQueryString } from './search-params';

describe('search params', () => {
  it('parses tolerant URL state and drops invalid values', () => {
    expect(parseSearchParams({ q: '  peel   street ', category: 'cafes', area: 'Bad Slug', minRating: '4', sort: 'rating', page: '3' })).toEqual({ q: 'peel street', category: 'cafes', area: null, minRating: 4, openNow: false, sort: 'rating', page: 3 });
    expect(parseSearchParams({ q: ['a', 'b'], minRating: '9', sort: 'nope', page: '0' })).toEqual({ q: 'a', category: null, area: null, minRating: null, openNow: false, sort: null, page: 1 });
    expect(parseSearchParams({ q: 'x'.repeat(200) }).q).toHaveLength(120);
  });

  it('serialises without defaults and round-trips', () => {
    const state = parseSearchParams({ q: 'cafe', area: 'norwood', page: '2' });
    expect(toQueryString(state)).toBe('?q=cafe&area=norwood&page=2');
    expect(toQueryString({ page: 1 })).toBe('');
    expect(parseSearchParams(Object.fromEntries(new URLSearchParams(toQueryString(state))))).toEqual(state);
  });

  it('builds removable chips that reset the page and resolve names', () => {
    const state = parseSearchParams({ q: 'cafe', category: 'cafes', minRating: '4', page: '3' });
    const chips = buildChips(state, '/business', { categories: { cafes: 'Cafés' } });
    expect(chips.map((c) => [c.label, c.href])).toEqual([
      ['“cafe”', '/business?category=cafes&minRating=4'],
      ['Cafés', '/business?q=cafe&minRating=4'],
      ['4+ stars', '/business?q=cafe&category=cafes'],
    ]);
    expect(isFiltered(state)).toBe(true);
    expect(isFiltered(parseSearchParams({ sort: 'name', page: '2' }))).toBe(false);
    expect(pageHref(state, '/business', 4)).toBe('/business?q=cafe&category=cafes&minRating=4&page=4');
  });

  it('carries the conditional "open now" filter through the URL (SRS DIR 008)', () => {
    expect(parseSearchParams({ openNow: '1' }).openNow).toBe(true);
    expect(parseSearchParams({ openNow: 'true' }).openNow).toBe(true);
    // Anything else is off, so a stray value cannot silently narrow the results.
    expect(parseSearchParams({ openNow: 'yes' }).openNow).toBe(false);
    expect(parseSearchParams({}).openNow).toBe(false);
    expect(toQueryString({ openNow: true })).toBe('?openNow=1');
    expect(toQueryString({ openNow: false })).toBe('');
  });

  it('counts "open now" as a filter and offers a chip that removes only it', () => {
    const state = parseSearchParams({ openNow: '1', category: 'cafes', sort: 'rating', page: '3' });
    expect(isFiltered(state)).toBe(true);
    expect(isFiltered(parseSearchParams({ openNow: '1' }))).toBe(true);
    expect(isFiltered(parseSearchParams({ openNow: 'yes' }))).toBe(false);

    const chips = buildChips(state, '/business');
    expect(chips.map((chip) => chip.key)).toEqual(['category', 'openNow']);
    const openNow = chips.find((chip) => chip.key === 'openNow');
    // The other filters and the sort survive; the page resets to 1 (DIR 005).
    expect(openNow).toEqual({ key: 'openNow', label: 'Open now', href: '/business?category=cafes&sort=rating' });
    expect(chips.find((chip) => chip.key === 'category')?.href).toBe('/business?openNow=1&sort=rating');
    expect(buildChips(parseSearchParams({ category: 'cafes' }), '/business').some((chip) => chip.key === 'openNow')).toBe(false);
  });
});

describe('landingRobots (SRS SEO 003)', () => {
  it('indexes only a landing with editorial text and at least one listing, never a filtered view', () => {
    expect(landingRobots('Norwood is…', 12, false)).toBeUndefined();
    expect(landingRobots('', 12, false)).toEqual({ index: false, follow: true });
    expect(landingRobots(null, 12, false)).toEqual({ index: false, follow: true });
    expect(landingRobots('Norwood is…', 0, false)).toEqual({ index: false, follow: true });
    expect(landingRobots('Norwood is…', 12, true)).toEqual({ index: false, follow: true });
  });
});
