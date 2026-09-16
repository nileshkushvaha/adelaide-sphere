import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from './api';

const fetchSiteSettings = vi.hoisted(() => vi.fn());
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, fetchSiteSettings };
});

const { keywordList, ogImagePath, pageMetadata, summarise } = await import('./seo');

const settings = (over: Partial<SiteSettings> = {}): SiteSettings => ({ ...DEFAULT_SITE_SETTINGS, name: 'Adelaide Sphere', metaDescription: 'Local businesses across Adelaide.', ...over }) as SiteSettings;

describe('summarise', () => {
  it('keeps short text, strips markup and cuts long text at a word', () => {
    expect(summarise('<p>Hello  <b>there</b></p>')).toBe('Hello there');
    const long = 'Word '.repeat(60);
    const result = summarise(long, 50);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toMatch(/\s…$/);
  });
});

describe('keywordList', () => {
  it('splits, trims, de-duplicates case-insensitively and caps the list', () => {
    expect(keywordList(['Cafés, Norwood', 'cafés', null, ' Adelaide '])).toEqual(['Cafés', 'Norwood', 'Adelaide']);
    expect(keywordList(Array.from({ length: 20 }, (_, i) => `k${i}`))).toHaveLength(12);
  });
});

describe('pageMetadata', () => {
  beforeEach(() => fetchSiteSettings.mockReset());

  it('publishes a complete set: canonical, Open Graph with site name and locale, and the X card', async () => {
    fetchSiteSettings.mockResolvedValue(settings());
    const meta = await pageMetadata({ title: 'Blog', description: 'Guides.', path: '/blog', keywords: ['Adelaide blog'], og: { kind: 'route', key: 'blog' } });
    expect(meta).toMatchObject({
      title: 'Blog',
      description: 'Guides.',
      keywords: ['Adelaide blog'],
      alternates: { canonical: '/blog' },
      openGraph: { type: 'website', url: '/blog', siteName: 'Adelaide Sphere', locale: 'en_AU', title: 'Blog', description: 'Guides.' },
      twitter: { card: 'summary_large_image', title: 'Blog', description: 'Guides.' },
    });
  });

  it('chooses the page image, then the configured default, then the generated card', async () => {
    fetchSiteSettings.mockResolvedValue(settings());
    const own = await pageMetadata({ title: 'A', path: '/a', image: { url: 'https://cdn/a.webp', width: 1600, height: 900, alt: 'A shop' }, og: { kind: 'business', key: 'a' } });
    expect(own.openGraph?.images).toEqual([{ url: 'https://cdn/a.webp', width: 1600, height: 900, alt: 'A shop' }]);

    fetchSiteSettings.mockResolvedValue(settings({ branding: { ...DEFAULT_SITE_SETTINGS.branding, shareImage: { id: 's', url: 'https://cdn/share.jpg', alt: 'Skyline', width: 1200, height: 630 } } }));
    const configured = await pageMetadata({ title: 'B', path: '/b', og: { kind: 'tag', key: 'b' } });
    expect(configured.openGraph?.images).toEqual([expect.objectContaining({ url: 'https://cdn/share.jpg', alt: 'Skyline' })]);

    fetchSiteSettings.mockResolvedValue(settings());
    const generated = await pageMetadata({ title: 'C', path: '/c', og: { kind: 'tag', key: 'coffee' } });
    expect(generated.openGraph?.images).toEqual([{ url: '/og/tag/coffee', width: 1200, height: 630, alt: 'C' }]);
    expect(ogImagePath({ kind: 'page', key: 'a b' })).toBe('/og/page/a%20b');
  });

  it('falls back to the site description, describes articles as articles and follows the configured card type', async () => {
    fetchSiteSettings.mockResolvedValue(settings({ seo: { ...DEFAULT_SITE_SETTINGS.seo, twitterCard: 'summary' } }));
    const meta = await pageMetadata({
      title: 'Winter markets',
      path: '/blog/winter-markets',
      og: { kind: 'post', key: 'winter-markets' },
      article: { publishedTime: '2026-09-01T00:00:00.000Z', authors: ['Editors'], tags: ['Markets'] },
    });
    expect(meta.description).toBe('Local businesses across Adelaide.');
    expect(meta.openGraph).toMatchObject({ type: 'article', publishedTime: '2026-09-01T00:00:00.000Z', authors: ['Editors'], tags: ['Markets'] });
    expect((meta.twitter as { card?: string }).card).toBe('summary');
  });
});
