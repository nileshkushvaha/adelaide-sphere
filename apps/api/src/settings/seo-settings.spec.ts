import { describe, expect, it } from 'vitest';
import { SEO_ROUTES } from '@adelaide-sphere/domain';
import { EMPTY_ROUTE_SEO, SEO_LIMITS, validateSeoSettings } from './seo-settings.js';

const at = (key: string, field: string) => `routes.${key}.${field}`;

describe('SEO settings validation', () => {
  it('returns every declared route, empty, when nothing has been set', () => {
    const { errors, value } = validateSeoSettings({});
    expect(errors).toEqual({});
    expect(Object.keys(value.routes).sort()).toEqual(SEO_ROUTES.map((route) => route.key).sort());
    for (const route of SEO_ROUTES) expect(value.routes[route.key]).toEqual(EMPTY_ROUTE_SEO);
    expect(value.twitterCard).toBe('summary_large_image');
  });

  it('drops a route the platform does not declare, rather than storing a page that does not exist', () => {
    const { value } = validateSeoSettings({ routes: { home: { metaTitle: 'Home' }, 'made-up': { metaTitle: 'Nowhere' } } });
    expect(value.routes['made-up']).toBeUndefined();
    expect(value.routes.home?.metaTitle).toBe('Home');
  });

  it('treats an empty field as "inherit", not as an empty tag', () => {
    const { value } = validateSeoSettings({ routes: { blog: { metaTitle: '   ', metaDescription: '' } } });
    expect(value.routes.blog?.metaTitle).toBeNull();
    expect(value.routes.blog?.metaDescription).toBeNull();
  });

  it('reports over-long metadata against the field that produced it', () => {
    const { errors } = validateSeoSettings({ routes: { faqs: { metaTitle: 'x'.repeat(SEO_LIMITS.metaTitle + 1), metaDescription: 'y'.repeat(SEO_LIMITS.metaDescription + 1) } } });
    expect(errors[at('faqs', 'metaTitle')]).toHaveLength(1);
    expect(errors[at('faqs', 'metaDescription')]).toHaveLength(1);
  });

  it('tidies keywords into a list without blanks or duplicates', () => {
    const { value } = validateSeoSettings({ routes: { directory: { metaKeywords: 'cafes, , cafes ,melbourne' } } });
    expect(value.routes.directory?.metaKeywords).toBe('cafes, melbourne');
  });

  it('refuses a canonical URL that is not an absolute http(s) address', () => {
    for (const bad of ['javascript:alert(1)', '/business', 'not a url']) {
      const { errors } = validateSeoSettings({ routes: { directory: { canonicalUrl: bad } } });
      expect(errors[at('directory', 'canonicalUrl')], bad).toBeDefined();
    }
    const { errors, value } = validateSeoSettings({ routes: { directory: { canonicalUrl: 'https://adelaidesphere.com.au/business' } } });
    expect(errors).toEqual({});
    expect(value.routes.directory?.canonicalUrl).toBe('https://adelaidesphere.com.au/business');
  });

  it('accepts only the offered robots directives and card types', () => {
    expect(validateSeoSettings({ routes: { home: { robots: 'noindex,follow' } } }).value.routes.home?.robots).toBe('noindex,follow');
    expect(validateSeoSettings({ routes: { home: { robots: 'noindex, nofollow, noarchive' } } }).errors[at('home', 'robots')]).toBeDefined();
    expect(validateSeoSettings({ twitterCard: 'app' }).errors.twitterCard).toBeDefined();
    expect(validateSeoSettings({ twitterCard: 'summary' }).value.twitterCard).toBe('summary');
  });
});

describe('analytics and verification identifiers', () => {
  it('accepts the documented formats and stores them upper-cased', () => {
    const { errors, value } = validateSeoSettings({
      verification: { googleAnalyticsId: 'g-abc1234567', googleTagManagerId: 'gtm-n55m3xq3', facebookPixelId: '123456789012345', googleSearchConsole: 'AbC-123_xyz456789012345' },
    });
    expect(errors).toEqual({});
    expect(value.verification.googleAnalyticsId).toBe('G-ABC1234567');
    expect(value.verification.googleTagManagerId).toBe('GTM-N55M3XQ3');
    expect(value.verification.facebookPixelId).toBe('123456789012345');
    // The verification token is case-sensitive, so it is stored as entered.
    expect(value.verification.googleSearchConsole).toBe('AbC-123_xyz456789012345');
  });

  it('refuses an identifier that no tool would recognise', () => {
    const { errors } = validateSeoSettings({ verification: { googleAnalyticsId: 'UA-12345-1', facebookPixelId: 'not-digits', googleTagManagerId: 'GTM' } });
    expect(errors['verification.googleAnalyticsId']).toHaveLength(1);
    expect(errors['verification.facebookPixelId']).toHaveLength(1);
    expect(errors['verification.googleTagManagerId']).toHaveLength(1);
  });

  it('treats an empty identifier as "not connected"', () => {
    const { errors, value } = validateSeoSettings({ verification: { googleAnalyticsId: '  ', facebookPixelId: '' } });
    expect(errors).toEqual({});
    expect(value.verification.googleAnalyticsId).toBeNull();
    expect(value.verification.facebookPixelId).toBeNull();
  });
});
