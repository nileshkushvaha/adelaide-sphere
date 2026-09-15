import { DEFAULT_HOME_SETTINGS, validateHomeSettings } from './home-settings.js';

describe('home settings validation (SRS CFG 001, HERO 002)', () => {
  it('accepts and normalises a valid document', () => {
    const { errors, value } = validateHomeSettings({ heroHeadline: '  Discover   Adelaide businesses ', heroPhrases: [' local services ', 'places to eat'], countersEnabled: true });
    expect(errors).toEqual({});
    expect(value).toEqual({ heroHeadline: 'Discover Adelaide businesses', heroPhrases: ['local services', 'places to eat'], heroSlides: [], countersEnabled: true });
    expect(validateHomeSettings(DEFAULT_HOME_SETTINGS).errors).toEqual({});
  });

  it('rejects bad headlines, phrase counts, lengths, duplicates and missing toggles', () => {
    expect(validateHomeSettings({ heroHeadline: 'x'.repeat(81), heroPhrases: ['a b', 'c d'], countersEnabled: false }).errors.heroHeadline).toBeDefined();
    expect(validateHomeSettings({ heroHeadline: 'Discover Melbourne', heroPhrases: ['only one'], countersEnabled: false }).errors.heroPhrases).toEqual(['Provide between 2 and 5 phrases']);
    expect(validateHomeSettings({ heroHeadline: 'Discover Melbourne', heroPhrases: Array.from({ length: 6 }, (_, i) => `phrase ${i}`), countersEnabled: false }).errors.heroPhrases).toBeDefined();
    const dup = validateHomeSettings({ heroHeadline: 'Discover Melbourne', heroPhrases: ['cafes', 'CAFES', 'x'.repeat(61)], countersEnabled: false }).errors;
    expect(dup['heroPhrases.1']).toEqual(['Phrases must be different']);
    expect(dup['heroPhrases.2']).toBeDefined();
    expect(validateHomeSettings({ heroHeadline: 'Discover Melbourne', heroPhrases: ['a b', 'c d'] }).errors.countersEnabled).toBeDefined();
    expect(validateHomeSettings(null).errors.heroHeadline).toBeDefined();
  });

  it('accepts hero slides, normalises focal points and captions, and rejects duplicates', () => {
    const { errors, value } = validateHomeSettings({
      heroHeadline: 'Discover Adelaide businesses',
      heroPhrases: ['local services', 'places to eat'],
      countersEnabled: false,
      heroSlides: [
        { mediaId: 'm1', caption: '  Flinders   Street  ', focalX: 0.25, focalY: 0.75 },
        { mediaId: 'm2' },
      ],
    });
    expect(errors).toEqual({});
    expect(value.heroSlides).toEqual([
      { mediaId: 'm1', caption: 'Flinders Street', focalX: 0.25, focalY: 0.75 },
      { mediaId: 'm2', caption: null, focalX: 0.5, focalY: 0.5 },
    ]);
  });

  it('rejects too many slides, missing images, duplicates and out-of-range focal points', () => {
    const base = { heroHeadline: 'Discover Adelaide businesses', heroPhrases: ['local services', 'places to eat'], countersEnabled: false };
    expect(validateHomeSettings({ ...base, heroSlides: Array.from({ length: 7 }, (_, i) => ({ mediaId: `m${i}` })) }).errors.heroSlides).toBeDefined();
    expect(validateHomeSettings({ ...base, heroSlides: [{ mediaId: '' }] }).errors['heroSlides.0.mediaId']).toBeDefined();
    expect(validateHomeSettings({ ...base, heroSlides: [{ mediaId: 'm1' }, { mediaId: 'm1' }] }).errors['heroSlides.1.mediaId']).toBeDefined();
    expect(validateHomeSettings({ ...base, heroSlides: [{ mediaId: 'm1', focalX: 4 }] }).errors['heroSlides.0.focalX']).toBeDefined();
    expect(validateHomeSettings({ ...base, heroSlides: [{ mediaId: 'm1', caption: 'x'.repeat(121) }] }).errors['heroSlides.0.caption']).toBeDefined();
  });
});
