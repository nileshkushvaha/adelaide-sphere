import { DEFAULT_GENERAL_SETTINGS, renderCopyright, validateGeneralSettings } from './general-settings.js';

const complete = {
  applicationName: 'Adelaide Sphere',
  shortName: 'Sphere',
  organisationName: 'Adelaide Sphere Pty Ltd',
  tagline: 'Find local businesses across Adelaide',
  metaDescription: 'An independent directory of Adelaide businesses.',
  supportEmail: 'Listings@AdelaideSphere.com',
  supportPhone: '03 9000 0000',
  websiteUrl: 'https://adelaidesphere.com',
  address: 'Level 2, 100 King William Street\nAdelaide SA 5000',
  headerTopBarEnabled: true,
  social: { facebook: 'https://www.facebook.com/adelaidesphere', x: 'https://x.com/adelaidesphere', pinterest: 'https://www.pinterest.com/adelaidesphere' },
  copyrightText: '© {year} {name}. All rights reserved.',
  footerText: 'An independent directory for Adelaide, South Australia.',
};

describe('validateGeneralSettings', () => {
  it('keeps light and dark branding independent and validates both', () => {
    const result = validateGeneralSettings({ ...complete, logoMediaId: 'light-asset', darkLogoMediaId: 'dark-asset' });
    expect(result.errors).toEqual({});
    expect(result.value.logoMediaId).toBe('light-asset');
    expect(result.value.darkLogoMediaId).toBe('dark-asset');
    expect(validateGeneralSettings({ ...complete, darkLogoMediaId: 'x'.repeat(65) }).errors.darkLogoMediaId).toBeDefined();
    expect(validateGeneralSettings(complete).value.darkLogoMediaId).toBeNull();
  });
  it('normalises a complete document', () => {
    const { errors, value } = validateGeneralSettings(complete);
    expect(errors).toEqual({});
    expect(value.applicationName).toBe('Adelaide Sphere');
    // Addresses are stored as typed (up to four lines); everything else is one line.
    expect(value.address).toBe('Level 2, 100 King William Street\nAdelaide SA 5000');
    // The email is the identity of a mailbox: case is folded so it never differs between saves.
    expect(value.supportEmail).toBe('listings@adelaidesphere.com');
    // Phone numbers are stored ready to render and dial (SRS BUS 003 formats).
    expect(value.supportPhone).toEqual({ display: '03 9000 0000', telHref: 'tel:+61390000000' });
    expect(value.social.facebook).toBe('https://www.facebook.com/adelaidesphere');
    expect(value.social.pinterest).toBe('https://www.pinterest.com/adelaidesphere');
    expect(value.social.instagram).toBeNull();
    expect(Object.keys(value.social)).toEqual(['facebook', 'instagram', 'x', 'youtube', 'pinterest']);
  });

  it('requires an application name and treats every other field as optional', () => {
    const { errors, value } = validateGeneralSettings({ applicationName: 'MS' });
    expect(errors).toEqual({});
    expect(value.supportEmail).toBeNull();
    expect(value.headerTopBarEnabled).toBe(false);
    expect(validateGeneralSettings({}).errors.applicationName).toBeDefined();
    expect(validateGeneralSettings({ applicationName: 'x'.repeat(81) }).errors.applicationName).toBeDefined();
  });

  it('refuses a support address on a development domain', () => {
    // Publishing listings@adelaidesphere.local would put a dead address on
    // every page; this is the mistake the setting exists to prevent.
    const { errors } = validateGeneralSettings({ ...complete, supportEmail: 'listings@adelaidesphere.local' });
    expect(errors.supportEmail?.[0]).toMatch(/development machine/);
    expect(validateGeneralSettings({ ...complete, supportEmail: 'not-an-email' }).errors.supportEmail).toBeDefined();
  });

  it('accepts Australian phone formats and rejects anything else', () => {
    expect(validateGeneralSettings({ ...complete, supportPhone: '0400 000 000' }).value.supportPhone?.display).toBe('0400 000 000');
    expect(validateGeneralSettings({ ...complete, supportPhone: '1300 000 000' }).value.supportPhone?.telHref).toBe('tel:+611300000000');
    expect(validateGeneralSettings({ ...complete, supportPhone: '+1 415 555 0100' }).errors.supportPhone).toBeDefined();
  });

  it('keeps each social link on its own platform', () => {
    // A header link that leaves the platform is how a phishing URL reaches
    // every page of the site, so the host is checked, not just the shape.
    const { errors } = validateGeneralSettings({ ...complete, social: { facebook: 'https://evil.example/adelaidesphere' } });
    expect(errors['social.facebook']?.[0]).toMatch(/facebook\.com/);
    expect(validateGeneralSettings({ ...complete, social: { x: 'https://twitter.com/adelaidesphere' } }).errors).toEqual({});
    expect(validateGeneralSettings({ ...complete, social: { youtube: 'javascript:alert(1)' } }).errors['social.youtube']).toBeDefined();
  });

  it('rejects URLs that are not public http(s) addresses', () => {
    expect(validateGeneralSettings({ ...complete, websiteUrl: 'javascript:alert(1)' }).errors.websiteUrl).toBeDefined();
    expect(validateGeneralSettings({ ...complete, websiteUrl: 'https://user:pass@example.com' }).errors.websiteUrl).toBeDefined();
  });

  it('only allows the placeholders the copyright line understands', () => {
    expect(validateGeneralSettings({ ...complete, copyrightText: '© {year} {name}' }).errors).toEqual({});
    // A mistyped placeholder would be printed literally on every page.
    expect(validateGeneralSettings({ ...complete, copyrightText: '© {yr} {name}' }).errors.copyrightText?.[0]).toMatch(/\{yr\}/);
  });

  it('refuses to show an empty contact bar', () => {
    const { errors } = validateGeneralSettings({ applicationName: 'Adelaide Sphere', headerTopBarEnabled: true });
    expect(errors.headerTopBarEnabled).toBeDefined();
    // One social link is enough for the bar to have something to say.
    expect(validateGeneralSettings({ applicationName: 'Adelaide Sphere', headerTopBarEnabled: true, social: { instagram: 'https://instagram.com/ms' } }).errors).toEqual({});
  });

  it('re-reads its own stored document without losing the phone number', () => {
    // The document stores the normalised {display, telHref} pair; validation
    // runs again on every read, so it has to accept its own output.
    const stored = validateGeneralSettings(complete).value;
    const reread = validateGeneralSettings(stored);
    expect(reread.errors).toEqual({});
    expect(reread.value).toEqual(stored);
  });

  it('limits the address to four lines', () => {
    expect(validateGeneralSettings({ ...complete, address: 'a\nb\nc\nd\ne' }).errors.address).toBeDefined();
  });

  it('clears optional fields when they are submitted empty', () => {
    const { value } = validateGeneralSettings({ ...complete, shortName: '   ', websiteUrl: '', footerText: '' });
    expect(value.shortName).toBeNull();
    expect(value.websiteUrl).toBeNull();
    expect(value.footerText).toBeNull();
  });

  it('never trusts a non-object payload', () => {
    const { errors, value } = validateGeneralSettings('nonsense');
    expect(errors.applicationName).toBeDefined();
    expect(value.social).toEqual(DEFAULT_GENERAL_SETTINGS.social);
  });
});

describe('renderCopyright', () => {
  it('substitutes the year and the application name', () => {
    expect(renderCopyright('© {year} {name}. All rights reserved.', { year: 2026, name: 'Adelaide Sphere' })).toBe('© 2026 Adelaide Sphere. All rights reserved.');
  });

  it('falls back to the built-in line when no template is set', () => {
    expect(renderCopyright(null, { year: 2026, name: 'Adelaide Sphere' })).toBe('© 2026 Adelaide Sphere. All rights reserved.');
    expect(renderCopyright('   ', { year: 2026, name: 'Adelaide Sphere' })).toBe('© 2026 Adelaide Sphere. All rights reserved.');
  });

  it('repeats a placeholder wherever it appears', () => {
    expect(renderCopyright('{name} · © {year} {name}', { year: 2026, name: 'MS' })).toBe('MS · © 2026 MS');
  });
});

describe('site map setting (SRS 1.11 BUS 003)', () => {
  const pb = '!1m18!1m12!1m3!1d3151.8!2d138.6007!3d-34.9285!5e0!3m2!1sen!2sau';
  const base = { applicationName: 'Adelaide Sphere', headerTopBarEnabled: false };

  it('stores the clean embed address from pasted HTML or the address itself', () => {
    const html = `<iframe src="https://www.google.com/maps/embed?pb=${pb}" width="600" height="450" loading="lazy"></iframe>`;
    expect(validateGeneralSettings({ ...base, siteMapSrc: html }).value.siteMapSrc).toBe(`https://www.google.com/maps/embed?pb=${pb}`);
    expect(validateGeneralSettings({ ...base, siteMapSrc: `https://www.google.com/maps/embed?pb=${pb}` }).errors).toEqual({});
  });

  it('treats empty as the built-in map and refuses share links, videos and other hosts', () => {
    expect(validateGeneralSettings({ ...base, siteMapSrc: '  ' }).value.siteMapSrc).toBeNull();
    for (const bad of ['https://maps.app.goo.gl/abc', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://evil.example/maps/embed?pb=1', 'x'.repeat(3001)]) {
      expect(validateGeneralSettings({ ...base, siteMapSrc: bad }).errors.siteMapSrc, bad).toBeDefined();
    }
  });
});

describe('pricing (SRS 1.12)', () => {
  const base = { applicationName: 'Adelaide Sphere', headerTopBarEnabled: false };
  const plan = (key: string, overrides: Record<string, unknown> = {}) => ({ key, name: 'Guest Post', priceCents: 3900, period: 'one_time', summary: 'One article', features: ['A', 'B'], ...overrides });

  it('ships the published prices when nothing is stored', () => {
    const { value } = validateGeneralSettings(base);
    expect(value.pricing.enabled).toBe(true);
    expect(value.pricing.plans.map((entry) => [entry.key, entry.priceCents, entry.period])).toEqual([
      ['guest_post', 3900, 'one_time'],
      ['business_listing', 6900, 'year'],
    ]);
  });

  it('keeps both plans in order and accepts edited values', () => {
    const { errors, value } = validateGeneralSettings({ ...base, pricing: { enabled: false, plans: [plan('business_listing', { name: 'Listing', priceCents: 7900, period: 'year' }), plan('guest_post')] } });
    expect(errors).toEqual({});
    expect(value.pricing.enabled).toBe(false);
    expect(value.pricing.plans.map((entry) => entry.key)).toEqual(['guest_post', 'business_listing']);
    expect(value.pricing.plans[1]).toMatchObject({ name: 'Listing', priceCents: 7900 });
  });

  it('refuses bad prices, periods, names and too many or too long points', () => {
    const { errors } = validateGeneralSettings({
      ...base,
      pricing: { enabled: true, plans: [plan('guest_post', { priceCents: 39.5, period: 'month', name: 'X' }), plan('business_listing', { features: ['1', '2', '3', '4', '5', '6', '7'] })] },
    });
    expect(errors['pricing.plans.0.priceCents']).toBeDefined();
    expect(errors['pricing.plans.0.period']).toBeDefined();
    expect(errors['pricing.plans.0.name']).toBeDefined();
    expect(errors['pricing.plans.1.features']).toBeDefined();
  });
});
