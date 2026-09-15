import { directionsUrl, effectiveSort, escapeLike, normaliseQuery, ratingAverage } from './search-rules.js';

describe('search rules', () => {
  it('normalises keywords and escapes LIKE wildcards', () => {
    expect(normaliseQuery('  Little   COLLINS ')).toBe('little collins');
    expect(normaliseQuery(undefined)).toBe('');
    expect(escapeLike('100%_free\\')).toBe('100\\%\\_free\\\\');
  });

  it('applies the DIR 004 default sort rules', () => {
    expect(effectiveSort(undefined, '')).toBe('name');
    expect(effectiveSort(undefined, 'cafe')).toBe('relevance');
    expect(effectiveSort('relevance', '')).toBe('name');
    expect(effectiveSort('rating', '')).toBe('rating');
  });

  it('rounds rating averages and returns null when unrated', () => {
    expect(ratingAverage(0, 0)).toBeNull();
    expect(ratingAverage(13, 3)).toBe(4.3);
  });

  it('builds directions from coordinates or the address text', () => {
    expect(directionsUrl({ line1: '1 King William St', suburb: 'Adelaide', postcode: '5000', latitude: -34.9285, longitude: 138.6007 })).toBe('https://www.google.com/maps/dir/?api=1&destination=-34.9285%2C138.6007');
    expect(directionsUrl({ line1: '1 King William St', suburb: 'Adelaide', postcode: '5000', latitude: null, longitude: null })).toContain('destination=1%20King%20William%20St%2C%20Adelaide%20SA%205000%2C%20Australia');
  });
});
