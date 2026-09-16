import { normaliseAddressKey, normaliseBusinessName, normalisePhone, parseAustralianPhone, publicationBlockers, TRANSITIONS, validateLinks, validatePublicUrl, EstablishedYearError, validateEstablishedYear } from './business-rules.js';

describe('business rules', () => {
  it('normalises names for duplicate detection', () => {
    expect(normaliseBusinessName("Joe's Café & Bar Pty Ltd")).toBe('joe s cafe and bar');
    expect(normaliseBusinessName('THE  Plumbers')).toBe('plumbers');
    expect(normaliseBusinessName('Joe’s Cafe')).toBe(normaliseBusinessName("joes cafe").replace('joes', 'joe s'));
  });

  it('normalises phones and address keys', () => {
    expect(normalisePhone('+61 3 9000 1234')).toBe('0390001234');
    expect(normalisePhone('(03) 9000-1234')).toBe('0390001234');
    expect(normalisePhone('')).toBeNull();
    expect(normaliseAddressKey({ line1: '12/34 Rundle St.', postcode: '5000' })).toBe('12 34 rundle st|5000');
    expect(normaliseAddressKey(null)).toBeNull();
  });

  it('publication gate lists every unmet BUS 002 requirement and is empty when satisfied', () => {
    const base = { name: 'X Cafe', slug: 'x-cafe', description: 'A'.repeat(40), primaryCategoryActive: true, localAreaActive: true, eligibilityVerifiedAt: new Date(), contentRightsReviewedAt: new Date(), publicPhone: '03 9000 0000', publicEmail: null, publicUrl: null, hasPrivateEnquiryEmail: false };
    expect(publicationBlockers(base)).toEqual([]);
    const blockers = publicationBlockers({ ...base, description: 'short', primaryCategoryActive: false, eligibilityVerifiedAt: null, contentRightsReviewedAt: null, publicPhone: null });
    expect(blockers).toEqual([
      'Description must be at least 40 characters',
      'Primary category must be active',
      'Adelaide eligibility must be verified (record the source)',
      'At least one contact route is required (phone, email, website or private enquiry email)',
      'Content rights must be reviewed',
    ]);
    expect(publicationBlockers({ ...base, publicPhone: null, hasPrivateEnquiryEmail: true })).toEqual([]);
  });

  it('only explicit transitions exist (SRS BUS 006)', () => {
    expect(TRANSITIONS.publish).toEqual({ from: ['draft'], to: 'published' });
    expect(TRANSITIONS.unpublish).toEqual({ from: ['published'], to: 'draft' });
    expect(TRANSITIONS.archive.from).toEqual(['draft', 'published']);
    expect(TRANSITIONS.restore).toEqual({ from: ['archived'], to: 'draft' });
  });
});

describe('established year', () => {
  it('accepts a year between Adelaide and today, and nothing else', () => {
    const now = new Date('2026-09-12T00:00:00Z');
    expect(validateEstablishedYear(null, now)).toBeNull();
    expect(validateEstablishedYear(undefined, now)).toBeNull();
    expect(validateEstablishedYear(1987, now)).toBe(1987);
    expect(validateEstablishedYear(2026, now)).toBe(2026);
    expect(() => validateEstablishedYear(2027, now)).toThrow(EstablishedYearError);
    expect(() => validateEstablishedYear(1835, now)).toThrow(EstablishedYearError);
    expect(() => validateEstablishedYear(2012.5, now)).toThrow(EstablishedYearError);
  });
});

describe('contact and link rules (SRS BUS 003)', () => {
  it('parses Australian phone numbers into tel links and rejects others', () => {
    expect(parseAustralianPhone('(03) 9000 1234')).toEqual({ national: '0390001234', telHref: 'tel:+61390001234', display: '03 9000 1234' });
    expect(parseAustralianPhone('+61 412 345 678')).toEqual({ national: '0412345678', telHref: 'tel:+61412345678', display: '0412 345 678' });
    expect(parseAustralianPhone('1300 123 456')).toEqual({ national: '1300123456', telHref: 'tel:+611300123456', display: '1300 123 456' });
    expect(parseAustralianPhone('13 12 34')).toEqual({ national: '131234', telHref: 'tel:131234', display: '13 1234' });
    expect(parseAustralianPhone('0011 61 3 9000 1234')?.telHref).toBe('tel:+61390001234');
    expect(parseAustralianPhone('1900 123 456')).toBeNull();
    expect(parseAustralianPhone('+1 212 555 0100')).toBeNull();
    expect(parseAustralianPhone('9000 1234')).toBeNull();
  });

  it('validates links: protocol, credentials, host allowlists, uniqueness and count', () => {
    const { errors, normalised } = validateLinks([
      { kind: 'instagram', url: 'https://www.instagram.com/littlecollins/' },
      { kind: 'facebook', url: 'https://instagram.com/notfacebook' },
      { kind: 'x', url: 'ftp://x.com/a' },
      { kind: 'other', url: 'https://user:pw@example.com/' },
      { kind: 'other', url: 'https://menu.example.com/', label: '  Menu  ' },
      { kind: 'instagram', url: 'https://instagram.com/again' },
      { kind: 'youtube', url: 'https://youtu.be/abc' },
    ]);
    expect(errors['links.1.url']?.[0]).toMatch(/facebook\.com/);
    expect(errors['links.2.url']).toBeDefined();
    expect(errors['links.3.url']).toBeDefined();
    expect(errors['links.5.kind']).toEqual(['Only one instagram link is allowed']);
    expect(normalised.map((l) => [l.kind, l.label, l.sortOrder])).toEqual([['instagram', null, 0], ['other', 'Menu', 4], ['youtube', null, 6]]);
    expect(validateLinks(Array.from({ length: 9 }, () => ({ kind: 'other' as const, url: 'https://example.com' }))).errors.links).toBeDefined();
    // Pinterest joined the vocabulary with the site's own profiles; it is host-checked like every other known kind.
    expect(validateLinks([{ kind: 'pinterest', url: 'https://www.pinterest.com.au/adelaidesphere/' }]).errors).toEqual({});
    expect(validateLinks([{ kind: 'pinterest', url: 'https://example.com/adelaidesphere' }]).errors['links.0.url']?.[0]).toMatch(/pinterest\.com/);
    expect(validatePublicUrl('javascript:alert(1)')).toBeNull();
    expect(validatePublicUrl('https://localhost/')).toBeNull();
  });
});
