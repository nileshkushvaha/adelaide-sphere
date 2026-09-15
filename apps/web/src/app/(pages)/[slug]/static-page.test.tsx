// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaticPageContent } from '@/lib/api';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound }));

const fetchStaticPage = vi.fn<(slug: string) => Promise<StaticPageContent | null>>();
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, fetchStaticPage: (slug: string) => fetchStaticPage(slug) };
});

const PAGE: StaticPageContent = {
  slug: 'community-guidelines',
  title: 'Community guidelines',
  body: '<h2>Being useful</h2><p>Say what you would say to a neighbour.</p>',
  seoTitle: null,
  seoDescription: 'How we expect people to behave in reviews and comments.',
  seoKeywords: null,
  ogImage: null,
  ogImageCredit: null,
  layout: 'rightSidebar', sections: [], images: {}, documents: {}, businesses: {}, noindex: false,
  updatedAt: '2026-09-08T02:00:00.000Z',
};

const load = async () => {
  const route = await import('./page');
  /**
   * The route hands the page to the shared `StaticPageView` (also used by the
   * private preview), an async server component the test renderer cannot
   * await; this renders the route and then resolves that view, as the server does.
   */
  const renderRoute = async (props: { params: Promise<{ slug: string }> }) => {
    const element = (await route.default(props as never)) as React.ReactElement<object, (props: object) => Promise<React.ReactNode>>;
    return element.type(element.props);
  };
  return { default: renderRoute, generateMetadata: route.generateMetadata };
};
const params = (slug: string) => Promise.resolve({ slug });

/**
 * The shared reading template serves whatever the API says is published (SRS
 * CFG 002 as amended in 1.7) — including pages an administrator created after
 * this code was written.
 */
describe('Information page route', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SITE_ORIGIN = 'https://adelaidesphere.example';
    notFound.mockClear();
    fetchStaticPage.mockReset();
  });

  it('renders a page an administrator created, with no list of allowed addresses in the way', async () => {
    fetchStaticPage.mockResolvedValue(PAGE);
    const { default: StaticPage } = await load();
    render(await StaticPage({ params: params('community-guidelines') } as never));

    expect(screen.getByRole('heading', { level: 1, name: 'Community guidelines' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Being useful' })).toBeInTheDocument();
    expect(fetchStaticPage).toHaveBeenCalledWith('community-guidelines');
  });

  it('puts the supporting column where the editor asked for it, and takes it away on a full-width page', async () => {
    fetchStaticPage.mockResolvedValue({ ...PAGE, layout: 'leftSidebar' });
    const { default: StaticPage } = await load();
    const { container: left } = render(await StaticPage({ params: params('community-guidelines') } as never));
    expect(left.querySelector('aside')).toBeInTheDocument();
    expect(left.querySelector('.lg\\:grid-cols-\\[28rem_minmax\\(0\\,1fr\\)\\]')).toBeInTheDocument();

    vi.resetModules();
    fetchStaticPage.mockResolvedValue({ ...PAGE, layout: 'fullWidth' });
    const { default: FullWidth } = await load();
    const { container: full } = render(await FullWidth({ params: params('community-guidelines') } as never));
    expect(full.querySelector('aside')).not.toBeInTheDocument();
  });

  it('404s for an address nobody has published', async () => {
    fetchStaticPage.mockResolvedValue(null);
    const { default: StaticPage } = await load();
    await expect(StaticPage({ params: params('never-created') } as never)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('describes a published page for search, and keeps an unpublished one out of the index', async () => {
    fetchStaticPage.mockResolvedValue(PAGE);
    const { generateMetadata } = await load();
    expect(await generateMetadata({ params: params('community-guidelines') } as never)).toMatchObject({
      title: 'Community guidelines',
      description: PAGE.seoDescription,
      alternates: { canonical: '/community-guidelines' },
    });

    fetchStaticPage.mockResolvedValue(null);
    expect(await generateMetadata({ params: params('never-created') } as never)).toMatchObject({ robots: { index: false } });
  });
});
