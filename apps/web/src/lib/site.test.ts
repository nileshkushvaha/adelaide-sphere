import { contactChannelFrom, siteTitle } from './site';
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from './api';

const settings = (over: Partial<SiteSettings> = {}): SiteSettings => ({ ...DEFAULT_SITE_SETTINGS, ...over });

/**
 * The published support address is what the whole site links to. The API
 * refuses to store a development domain, so the web tier's job is simply to
 * offer nothing when nothing has been published — never a blank mailto.
 */
describe('contactChannelFrom', () => {
  it('publishes the configured address with a ready-made listing subject', () => {
    const channel = contactChannelFrom(settings({ name: 'Adelaide Sphere', contact: { ...DEFAULT_SITE_SETTINGS.contact, email: 'listings@adelaidesphere.com' } }));
    expect(channel).toMatchObject({ available: true, email: 'listings@adelaidesphere.com' });
    expect(channel.listingMailto).toBe(`mailto:listings@adelaidesphere.com?subject=${encodeURIComponent('Add or update a business on Adelaide Sphere')}`);
  });

  it('offers nothing while no address is published', () => {
    expect(contactChannelFrom(settings())).toEqual({ available: false, email: null, listingMailto: null });
  });

  it('names the application in the subject line, so a renamed site does not send stale mail', () => {
    const channel = contactChannelFrom(settings({ name: 'Adelaide Guide', contact: { ...DEFAULT_SITE_SETTINGS.contact, email: 'hello@example.com.au' } }));
    expect(channel.listingMailto).toContain(encodeURIComponent('Add or update a business on Adelaide Guide'));
  });
});

describe('siteTitle', () => {
  it('joins the name and tagline', () => {
    expect(siteTitle(settings({ name: 'Adelaide Sphere', tagline: 'Find local businesses across Adelaide' }))).toBe('Adelaide Sphere — Find local businesses across Adelaide');
  });

  it('falls back to the name alone when no tagline is set', () => {
    expect(siteTitle(settings({ name: 'Adelaide Sphere', tagline: null }))).toBe('Adelaide Sphere');
  });
});
