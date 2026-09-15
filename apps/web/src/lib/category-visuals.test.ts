import { categoryGradient, categoryVisual, editorialGradient, initials } from './category-visuals';

/**
 * The listing grid falls back to these visuals whenever a business has no
 * photograph, which is most of the directory at launch. The mapping has to be
 * deterministic (the same listing must not change appearance between renders)
 * and it must never leave a card without a background.
 */
describe('categoryVisual', () => {
  it.each([
    ['cafes', 'food'],
    ['restaurants', 'food'],
    ['bars', 'drink'],
    ['shopping', 'shopping'],
    ['health-and-wellness', 'health'],
    ['home-services', 'home'],
    ['professional-services', 'professional'],
    ['hair-and-beauty', 'beauty'],
    ['auto-repair', 'auto'],
    ['tutoring-and-education', 'education'],
  ])('maps %s to the %s family', (slug, expected) => {
    expect(categoryVisual(slug)).toBe(expected);
  });

  it('falls back to the general family for an unknown category and is stable', () => {
    expect(categoryVisual('something-brand-new')).toBe('general');
    expect(categoryGradient('something-brand-new')).toBe(categoryGradient('something-brand-new'));
    expect(categoryGradient('something-brand-new')).toMatch(/^linear-gradient/);
  });

  it('is case-insensitive', () => {
    expect(categoryVisual('Cafes')).toBe('food');
  });
});

describe('initials', () => {
  it.each([
    ['Carlton Corner Bakery', 'CC'],
    ['Runtime Check Cafe', 'RC'],
    ['Kew', 'K'],
    ['  spaced   out  name ', 'SO'],
    ['—', '?'],
  ])('reduces %s to %s', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe('editorialGradient', () => {
  it('is stable for a slug, so a category looks the same wherever it appears', () => {
    expect(editorialGradient('city-guides')).toBe(editorialGradient('city-guides'));
  });

  it('separates editorial slugs that the directory keywords would all fold into one panel', () => {
    // None of these match the trade keywords, so `categoryVisual` calls them all
    // `general`; the editorial hash has to spread them instead.
    const subjects = ['city-guides', 'interviews', 'neighbourhoods', 'opinion', 'people'];
    expect(subjects.map(categoryVisual)).toEqual(subjects.map(() => 'general'));
    expect(new Set(subjects.map(editorialGradient)).size).toBeGreaterThan(1);
  });

  it('only ever returns a gradient from the brand set', () => {
    const brand = new Set(['food', 'drink', 'shopping', 'health', 'home', 'professional', 'beauty', 'auto', 'education', 'general'].map(categoryGradient));
    for (const slug of ['city-guides', 'interviews', 'x', '']) expect(brand.has(editorialGradient(slug))).toBe(true);
  });
});
