import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleCollection } from '@/components/article-collection';
import { TrackOnView } from '@/components/analytics-events';
import { BlogSearchForm } from '@/components/blog-search-form';
import { CollectionHeader } from '@/components/collection-header';
import { Pagination } from '@/components/pagination';
import { fetchBlogTerms, fetchPosts, type BlogTerm } from '@/lib/api';
import { blogSearchHref, readSearchQuery } from '@/lib/blog-search';
import { isPastLastPage, readPageParam } from '@/lib/pagination';
import { pageMetadata } from '@/lib/seo';

/** Search results are for readers, not search engines: noindex, but their links are followed (SRS SEO 003). */
export async function generateMetadata({ searchParams }: PageProps<'/blog/search'>): Promise<Metadata> {
  const q = readSearchQuery((await searchParams).q);
  return pageMetadata({
    title: q ? `Articles matching “${q}”` : 'Search the blog',
    description: 'Search Adelaide Sphere’s guides, local stories and practical advice by keyword.',
    path: '/blog/search',
    robots: { index: false, follow: true },
    og: { kind: 'route', key: 'blog' },
  });
}

/** Blog search (SRS 1.10 BLOG 005): published articles matching every word, most relevant first. */
export default async function BlogSearchPage({ searchParams }: PageProps<'/blog/search'>) {
  const params = await searchParams;
  const q = readSearchQuery(params.q);
  const page = readPageParam(params.page);
  // The categories are suggestions around the results, so they may be missing without failing the page.
  const [posts, terms] = await Promise.all([q ? fetchPosts({ q, page }) : Promise.resolve(null), fetchBlogTerms('blog-categories').then<BlogTerm[], BlogTerm[]>((list) => list, () => [])]);
  if (posts && isPastLastPage(page, posts.meta.pageCount)) notFound();
  const total = posts?.meta.total ?? 0;
  const stocked = terms.filter((category) => category.postCount > 0);

  return (
    <>
      <CollectionHeader
        eyebrow="Blog"
        title="Search the blog"
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: 'Search' }]}
        footer={<BlogSearchForm defaultValue={q} tone="dark" />}
      />
      <div className="as-container py-12 sm:py-16">
        {/* Announced when the results change, so a screen-reader user hears the outcome of the search. */}
        <p role="status" className="mb-8 text-lg">
          {!q ? 'Type a word or phrase to find articles.' : total === 0 ? `No articles match “${q}”.` : `${total} ${total === 1 ? 'article matches' : 'articles match'} “${q}”.`}
        </p>

        {/* Counts that a search happened and how many results it found; the words searched for are never sent. */}
        {q && page === 1 && <TrackOnView event="blog_search" params={{ results_count: total }} />}

        {posts && posts.data.length > 0 && <ArticleCollection posts={posts.data} label={`Articles matching ${q}`} headingLevel={2} leadIsAboveFold />}

        {posts && posts.meta.pageCount > 1 && (
          <div className="mt-12">
            <Pagination page={posts.meta.page} pageCount={posts.meta.pageCount} hrefFor={(p) => blogSearchHref(q, p)} />
          </div>
        )}

        {(!q || total === 0) && (
          <section aria-labelledby="browse-heading" className="flex flex-col gap-4">
            <h2 id="browse-heading" className="font-display text-2xl tracking-tight">
              {q ? 'Try a shorter search, or browse a category' : 'Or browse a category'}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {stocked.map((category) => (
                <li key={category.slug}>
                  <Link href={`/blog/category/${category.slug}`} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm transition-colors hover:border-border-strong hover:bg-sky-50">
                    {category.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/blog" className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm transition-colors hover:border-border-strong hover:bg-sky-50">
                  All stories
                </Link>
              </li>
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
