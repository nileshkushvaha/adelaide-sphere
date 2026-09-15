import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SiteSettings } from './api';
import { DEFAULT_SITE_SETTINGS } from './api';

const fetchSiteSettings = vi.hoisted(() => vi.fn());
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, fetchSiteSettings };
});

const { routeMetadata } = await import('./route-seo');

const withSeo = (routes: Record<string, unknown>, twitterCard = 'summary_large_image'): SiteSettings =>
  ({ ...DEFAULT_SITE_SETTINGS, seo: { routes, twitterCard } }) as SiteSettings;

const base = { title: 'Blog', description: 'Written text', alternates: { canonical: '/blog' } };
const entry = (over: Record<string, unknown> = {}) => ({ metaTitle: null, metaDescription: null, metaKeywords: null, canonicalUrl: null, robots: 'default', ogImage: null, ...over });

describe('route metadata overrides', () => {
  beforeEach(() => fetchSiteSettings.mockReset());

  it('keeps the page as written when nothing is configured', async () => {
    fetchSiteSettings.mockResolvedValue(withSeo({}));
    expect(await routeMetadata('blog', base)).toMatchObject(base);
  });

  it('keeps the page as written when the API is unreachable', async () => {
    fetchSiteSettings.mockResolvedValue(DEFAULT_SITE_SETTINGS);
    expect(await routeMetadata('blog', base)).toMatchObject(base);
  });

  it('replaces only the fields that were set', async () => {
    fetchSiteSettings.mockResolvedValue(withSeo({ blog: entry({ metaTitle: 'Melbourne stories' }) }));
    const result = await routeMetadata('blog', base);
    expect(result.title).toBe('Melbourne stories');
    expect(result.description).toBe('Written text');
    expect(result.alternates?.canonical).toBe('/blog');
  });

  it('applies a canonical, keywords and a robots directive', async () => {
    fetchSiteSettings.mockResolvedValue(withSeo({ blog: entry({ canonicalUrl: 'https://example.com.au/blog', metaKeywords: 'cafes, melbourne', robots: 'noindex,follow' }) }));
    const result = await routeMetadata('blog', base);
    expect(result.alternates?.canonical).toBe('https://example.com.au/blog');
    expect(result.keywords).toEqual(['cafes', 'melbourne']);
    expect(result.robots).toEqual({ index: false, follow: true });
  });

  it('leaves robots alone when the directive is the default', async () => {
    fetchSiteSettings.mockResolvedValue(withSeo({ blog: entry({ robots: 'default' }) }));
    expect((await routeMetadata('blog', base)).robots).toBeUndefined();
  });

  it('uses the route share image and the configured card type', async () => {
    fetchSiteSettings.mockResolvedValue(withSeo({ blog: entry({ ogImage: { id: 'm1', url: 'https://cdn/x.jpg', alt: 'Trams', width: 1200, height: 630 } }) }, 'summary'));
    const result = await routeMetadata('blog', base);
    expect(result.openGraph?.images).toEqual([{ url: 'https://cdn/x.jpg', width: 1200, height: 630, alt: 'Trams' }]);
    // `card` is only on the union's summary variants, which is what we set.
    expect((result.twitter as { card?: string } | undefined)?.card).toBe('summary');
  });
});
