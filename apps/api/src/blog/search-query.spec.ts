import { booleanSearchTerms } from './search-query.js';

describe('booleanSearchTerms (SRS 1.10 BLOG 005)', () => {
  it('requires every searchable word as a prefix', () => {
    expect(booleanSearchTerms('Laneway cafés')).toBe('+laneway* +cafés*');
    expect(booleanSearchTerms('  Unley   UNLEY walk ')).toBe('+unley* +walk*');
  });

  it('never lets a boolean operator or quote through', () => {
    const terms = booleanSearchTerms('+tram -"city loop" (free) ~zone* @distance <a> burnside\'s');
    expect(terms).toBe('+tram* +city* +loop* +free* +zone* +distance* +burnside*');
    expect(booleanSearchTerms('")) OR 1=1; DROP TABLE posts; --')).toBe('+drop* +table* +posts*');
  });

  it('drops short words and stopwords, and gives up when nothing is left', () => {
    expect(booleanSearchTerms('the best of the CBD')).toBe('+best* +cbd*');
    expect(booleanSearchTerms('to be or')).toBeNull();
    expect(booleanSearchTerms('St Peters')).toBe('+peters*');
    expect(booleanSearchTerms('!!!')).toBeNull();
    expect(booleanSearchTerms('')).toBeNull();
  });

  it('caps the number of words', () => {
    expect(booleanSearchTerms('one two three four five six seven eight nine ten eleven')?.split(' ')).toHaveLength(8);
  });
});
