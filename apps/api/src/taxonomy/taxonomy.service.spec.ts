import { normaliseSynonyms } from './taxonomy.service.js';

describe('normaliseSynonyms', () => {
  it('trims, lower-cases, collapses whitespace, dedupes and drops short terms', () => {
    expect(normaliseSynonyms(['  Flat   White ', 'flat white', 'x', 'Espresso'])).toEqual(['flat white', 'espresso']);
    expect(normaliseSynonyms(undefined)).toEqual([]);
  });
});
