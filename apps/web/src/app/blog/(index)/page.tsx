import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pageMetadata } from '@/lib/seo';
import { routeMetadata } from '@/lib/route-seo';
import { ArticleCollection, BlogEmptyState } from '@/components/article-collection';
import { BlogCategoryNav } from '@/components/blog-category-nav';
import { BlogSearchForm } from '@/components/blog-search-form';
import { LazyPostGrid } from '@/components/lazy-list';
import { NextPageLink } from '@/components/next-page-link';
import { PostCard } from '@/components/post-card';
import { Pagination } from '@/components/pagination';
import { fetchBlogTerms, fetchPosts, type BlogTerm } from '@/lib/api';
import { isPastLastPage, pagedPath, pagedTitle, readPageParam } from '@/lib/pagination';

/** The page's own metadata, with any administrator overrides applied (SEO 001). */
export async function generateMetadata({ searchParams }: PageProps<'/blog'>): Promise<Metadata> {
  // Later pages are their own crawlable, self-canonical addresses (SRS 1.10 BLOG 005).
  const page = readPageParam((await searchParams).page);
  const metadata = await routeMetadata(
    'blog',
    await pageMetadata({
      title: 'Blog',
      description: 'Guides, local stories and practical advice about Adelaide’s businesses, neighbourhoods and city life, written by our editors.',
      path: '/blog',
      keywords: ['Adelaide blog', 'Adelaide guides', 'Adelaide neighbourhoods', 'local businesses Adelaide', 'things to do in Adelaide'],
      og: { kind: 'route', key: 'blog' },
    }),
  );
  if (page === 1) return metadata;
  const title = pagedTitle(typeof metadata.title === 'string' ? metadata.title : 'Blog', page);
  return { ...metadata, title, alternates: { ...metadata.alternates, canonical: pagedPath('/blog', page) }, openGraph: { ...metadata.openGraph, url: pagedPath('/blog', page) } };
}

/** Blog index (SRS BLOG 005): 12 per page, newest published first, server rendered. */
export default async function BlogIndexPage({ searchParams }: PageProps<'/blog'>) {
  const page = readPageParam((await searchParams).page);

  // The articles are the page: a failure there reaches the error boundary rather
  // than being reported as "no articles" (SRS DIR 006 applied to editorial).
  // The category row is navigation around them, so it is allowed to be missing
  // without taking the index down with it.
  const [posts, termsResult, featuredResult] = await Promise.all([
    fetchPosts({ page }),
    fetchBlogTerms('blog-categories').then<BlogTerm[], BlogTerm[]>((terms) => terms, () => []),
    // The editor's picks lead page one; like the category row, they may be missing without failing the page.
    page === 1 ? fetchPosts({ page: 1, pageSize: 3, featured: true }).then((result) => result.data, () => []) : Promise.resolve([]),
  ]);
  // A page past the last is a 404, not an empty page search engines would keep (SRS SEO 001).
  if (isPastLastPage(page, posts.meta.pageCount)) notFound();
  const stocked = termsResult.filter((category) => category.postCount > 0);

  // The lead-plus-grid hierarchy needs something to put in the grid. With three
  // articles or fewer it would leave a lead card above one lonely half-row, so
  // those counts are laid out as a single collection instead — the page stays
  // deliberate whether the blog holds one article or a hundred.
  // Picks are shown once: page one's own list leaves them out.
  const picks = featuredResult;
  const pickIds = new Set(picks.map((post) => post.id));
  const listed = posts.data.filter((post) => !pickIds.has(post.id));
  const leadSplit = page === 1 && listed.length >= 4;
  const lead = leadSplit ? listed[0] : undefined;
  const rest = lead ? listed.slice(1) : listed;
  // Page one is server rendered; later pages are appended as the index is
  // scrolled. Without JavaScript a plain "More articles" link takes its place.
  const grid = (
    <LazyPostGrid
      initial={rest}
      page={posts.meta.page}
      pageCount={posts.meta.pageCount}
      fallback={posts.meta.page < posts.meta.pageCount ? <NextPageLink href={pagedPath('/blog', posts.meta.page + 1)} label="More articles" /> : null}
    />
  );

  return (
    <>
      <section aria-labelledby="blog-heading" className="ms-on-dark ms-editorial-band text-band-text">
        <div className="ms-container py-8 sm:py-10">
          {/* The publisher and the size of the archive on one line: both are
              labels for the heading under them, and stacking them separately
              left the band twice as tall as its content needed. */}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold uppercase tracking-[0.18em] text-sky-400">Adelaide Sphere</span>
            {posts.meta.total > 0 && (
              <>
                <span aria-hidden="true" className="text-band-border">
                  •
                </span>
                <span className="text-sm text-band-muted">
                  {posts.meta.total} {posts.meta.total === 1 ? 'story' : 'stories'}
                </span>
              </>
            )}
          </p>
          <h1 id="blog-heading" className="font-display mt-3.5 text-balance text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.04] tracking-tight">
            Stories from around the city
          </h1>
          <p className="mt-4 max-w-4xl text-lg leading-relaxed text-band-muted">
            Local guides, food discoveries, and stories from Adelaide’s neighbourhoods.
          </p>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-band-muted">
            Written and edited by our team, with paid guest posts clearly labelled.
          </p>
          <div className="mt-6 grid min-w-0 gap-5 border-t border-band-border pt-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end lg:gap-8">
            <div className="min-w-0">
              <BlogCategoryNav categories={stocked} active="all" />
            </div>
            <div className="min-w-0">
              <BlogSearchForm tone="dark" />
            </div>
          </div>
        </div>
      </section>

      <div className="ms-container pt-6 pb-12 sm:pt-8 sm:pb-16">
        {posts.data.length === 0 ? (
          <BlogEmptyState message="No articles have been published yet. The first ones are being written." />
        ) : (
          <div className="flex flex-col gap-12 sm:gap-14">
            {picks.length > 0 && (
              <section aria-labelledby="picks-heading" className="flex flex-col gap-6">
                <h2 id="picks-heading" className="font-display text-2xl tracking-tight sm:text-3xl">
                  Editor’s picks
                </h2>
                <ArticleCollection posts={picks} label="Editor’s picks" headingLevel={3} leadIsAboveFold />
              </section>
            )}

            {/* The newest article leads page one once there is a grid to lead. */}
            {lead && <PostCard post={lead} variant="featured" headingLevel={2} label="Latest" priority={picks.length === 0} />}

            {!lead && rest.length === 0 ? null : lead ? (
              <section aria-labelledby="more-stories-heading" className="flex flex-col gap-6">
                <h2 id="more-stories-heading" className="font-display text-2xl tracking-tight sm:text-3xl">
                  More stories
                </h2>
                {grid}
              </section>
            ) : posts.meta.pageCount > 1 ? (
              grid
            ) : (
              <ArticleCollection posts={rest} label="Articles" headingLevel={2} leadIsAboveFold />
            )}
          </div>
        )}
        {/* Numbered pages stay in the rendered page (the scroll loader's own link
            is removed once it hydrates), so every article is reachable by a
            plain link for crawlers and for readers who want a given page. */}
        {posts.meta.pageCount > 1 && (
          <div className="mt-12">
            <Pagination page={posts.meta.page} pageCount={posts.meta.pageCount} hrefFor={(p) => pagedPath('/blog', p)} />
          </div>
        )}
      </div>
    </>
  );
}
