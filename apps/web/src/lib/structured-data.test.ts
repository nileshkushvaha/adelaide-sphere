import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.SITE_ORIGIN = 'https://adelaidesphere.example';
});

const load = async () => import('./structured-data');
const loadXml = async () => import('./sitemap-xml');

describe('serialiseJsonLd', () => {
  it('escapes characters that could close the script element', async () => {
    const { serialiseJsonLd } = await load();
    const json = serialiseJsonLd({ '@type': 'Thing', name: '</script><script>alert(1)</script> & more' });
    expect(json).not.toContain('</script>');
    expect(json).not.toContain('<');
    expect(json).not.toContain('&');
    expect(JSON.parse(json.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&')).name).toBe('</script><script>alert(1)</script> & more');
  });
});

describe('site identity', () => {
  it('declares one WebSite with the brand name, its alternates and the home page URL', async () => {
    const { webSiteJsonLd } = await load();
    expect(webSiteJsonLd('Adelaide Sphere')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': 'https://adelaidesphere.example/#website',
      url: 'https://adelaidesphere.example/',
      name: 'Adelaide Sphere',
      alternateName: ['AdelaideSphere', 'adelaidesphere.com'],
      inLanguage: 'en-AU',
      publisher: { '@id': 'https://adelaidesphere.example/#organization' },
    });
  });

  it('never repeats the name as an alternate', async () => {
    const { webSiteJsonLd } = await load();
    expect(webSiteJsonLd('AdelaideSphere').alternateName).toEqual(['adelaidesphere.com']);
  });

  it('links the Organization by id and falls back to the square brand mark as its logo', async () => {
    const { organizationJsonLd } = await load();
    const org = organizationJsonLd({ name: 'Adelaide Sphere' });
    expect(org).toMatchObject({
      '@id': 'https://adelaidesphere.example/#organization',
      name: 'Adelaide Sphere',
      url: 'https://adelaidesphere.example/',
      logo: { '@type': 'ImageObject', url: 'https://adelaidesphere.example/brand-logo.png', width: 512, height: 512 },
    });
    expect(org).not.toHaveProperty('sameAs');
  });

  it('keeps an uploaded logo and makes a relative one absolute', async () => {
    const { organizationJsonLd } = await load();
    expect(organizationJsonLd({ logoUrl: 'https://media.example/logo.png' }).logo).toBe('https://media.example/logo.png');
    expect(organizationJsonLd({ logoUrl: '/uploads/logo.png' }).logo).toBe('https://adelaidesphere.example/uploads/logo.png');
  });
});

describe('localBusinessJsonLd', () => {
  const base = {
    id: 'b1',
    name: 'Peel Street Espresso',
    slug: 'peel-street-espresso',
    description: 'A neighbourhood espresso bar.',
    primaryCategory: { name: 'Cafes', slug: 'cafes' },
    secondaryCategories: [],
    localArea: { name: 'Adelaide CBD', slug: 'adelaide-cbd' },
    rating: null,
    image: null,
    gallery: [],
    links: [],
    contact: { phone: null, email: null, website: null },
    address: null,
    hours: null,
  };

  it('uses the most accurate subtype and omits everything the page does not show', async () => {
    const { localBusinessJsonLd } = await load();
    const data = localBusinessJsonLd(base as never);
    expect(data['@type']).toBe('CafeOrCoffeeShop');
    expect(data.url).toBe('https://adelaidesphere.example/business/peel-street-espresso');
    expect(data).not.toHaveProperty('address');
    expect(data).not.toHaveProperty('geo');
    expect(data).not.toHaveProperty('telephone');
    expect(data).not.toHaveProperty('aggregateRating');
    expect(data).not.toHaveProperty('openingHoursSpecification');
  });

  it('omits AggregateRating until review rich results are explicitly enabled (SEO 006)', async () => {
    const { localBusinessJsonLd } = await load();
    const withRating = { ...base, rating: { average: 4.5, count: 12 } } as never;
    expect(localBusinessJsonLd(withRating)).not.toHaveProperty('aggregateRating');
    expect(localBusinessJsonLd(withRating, { reviewMarkup: false })).not.toHaveProperty('aggregateRating');
    expect((localBusinessJsonLd(withRating, { reviewMarkup: true }).aggregateRating as Record<string, unknown>).ratingValue).toBe(4.5);
  });

  it('includes address, geo, phone, rating and scheduled hours when they are published', async () => {
    const { localBusinessJsonLd } = await load();
    const data = localBusinessJsonLd({
      ...base,
      contact: { phone: { display: '03 9000 1234', telHref: 'tel:+61390001234' }, email: 'hello@example.com', website: 'https://example.com' },
      address: { line1: '12 Peel St', line2: null, suburb: 'Adelaide', postcode: '5000', latitude: -34.9235, longitude: 138.5979, directionsUrl: 'https://maps.example' },
      rating: { average: 4.5, count: 12 },
      hours: {
        mode: 'scheduled',
        weekly: {
          monday: { state: 'intervals', intervals: [{ start: '08:00', end: '16:00', endNextDay: false }] },
          tuesday: { state: 'closed' },
          wednesday: { state: 'open24' },
          thursday: { state: 'closed' },
          friday: { state: 'closed' },
          saturday: { state: 'closed' },
          sunday: { state: 'closed' },
        },
        exceptions: [],
        status: { open: true, label: 'Open now' },
        evaluatedAt: '2026-09-06T00:00:00.000Z',
      },
    } as never, { reviewMarkup: true });
    expect(data.telephone).toBe('03 9000 1234');
    expect((data.address as Record<string, unknown>).postalCode).toBe('5000');
    expect((data.geo as Record<string, unknown>).latitude).toBe(-34.9235);
    expect((data.aggregateRating as Record<string, unknown>).reviewCount).toBe(12);
    const hours = data.openingHoursSpecification as Record<string, unknown>[];
    expect(hours).toHaveLength(2);
    expect(hours[0]).toMatchObject({ dayOfWeek: 'https://schema.org/Monday', opens: '08:00', closes: '16:00' });
    expect(hours[1]).toMatchObject({ dayOfWeek: 'https://schema.org/Wednesday', opens: '00:00', closes: '23:59' });
  });
});

describe('blogPostingJsonLd', () => {
  it('describes the article and credits the author profile without inventing fields', async () => {
    const { blogPostingJsonLd } = await load();
    const data = blogPostingJsonLd({
      id: 'p1',
      title: 'Filter coffee',
      slug: 'filter-coffee',
      excerpt: 'A guide.',
      seoTitle: null,
      seoDescription: null,
      body: '<p>Body</p>',
      category: { name: 'Guides', slug: 'guides' },
      tags: [{ name: 'Coffee', slug: 'coffee' }],
      cover: [],
      coverAlt: null,
      publishedAt: '2026-09-01T00:00:00.000Z',
      firstPublishedAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
      commentsEnabled: true,
      approvedCommentCount: 0,
      related: [],
      author: { displayName: 'Alex Editor', slug: 'alex-editor', role: 'Food editor', shortBio: null, bio: null, pronouns: null, location: null, websiteUrl: null, expertise: [], links: [{ kind: 'x', url: 'https://x.com/alex', label: null }], image: null },
    } as never);
    expect(data['@type']).toBe('BlogPosting');
    expect(data.datePublished).toBe('2026-09-01T00:00:00.000Z');
    expect(data.dateModified).toBe('2026-09-02T00:00:00.000Z');
    expect(data.author).toMatchObject({ '@type': 'Person', name: 'Alex Editor', jobTitle: 'Food editor', sameAs: ['https://x.com/alex'] });
    expect(data.author).not.toHaveProperty('image');
    expect(data).not.toHaveProperty('image');
  });
});

describe('sitemap XML', () => {
  it('escapes paths and emits valid ISO timestamps', async () => {
    const { urlSetXml, sitemapIndexXml, escapeXml } = await loadXml();
    expect(escapeXml('/a&b<c>')).toBe('/a&amp;b&lt;c&gt;');
    const xml = urlSetXml([{ path: '/business/caf&e', lastModified: '2026-09-01T00:00:00.000Z' }]);
    expect(xml).toContain('<loc>https://adelaidesphere.example/business/caf&amp;e</loc>');
    expect(xml).toContain('<lastmod>2026-09-01T00:00:00.000Z</lastmod>');
    const index = sitemapIndexXml([{ path: '/sitemaps/businesses.xml', lastModified: 'not-a-date' }]);
    expect(index).toContain('/sitemaps/businesses.xml');
    expect(index).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}T/);
  });
});
