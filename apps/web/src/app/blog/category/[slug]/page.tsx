import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { ArticleCollection, BlogEmptyState } from '@/components/article-collection';
import { BlogCategoryNav } from '@/components/blog-category-nav';
import { CollectionHeader } from '@/components/collection-header';
import { Pagination } from '@/components/pagination';
import { isPastLastPage, pagedPath, pagedTitle, readPageParam } from '@/lib/pagination';
import { fetchBlogTerms, fetchPosts, type BlogTerm } from '@/lib/api';

async function categories(): Promise<BlogTerm[]> {
  return fetchBlogTerms('blog-categories');
}

export async function generateMetadata({ params, searchParams }: PageProps<'/blog/category/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const page = readPageParam((await searchParams).page);
  const category = (await categories()).find((c) => c.slug === slug) ?? null;
  if (!category) return { title: 'Category not found', robots: { index: false } };
  // The editor's search appearance first; each empty field falls back to the composed text.
  return pageMetadata({
    title: pagedTitle(category.seoTitle ?? `${category.name} articles`, page),
    description: category.seoDescription ?? `Articles about ${category.name.toLowerCase()} in Adelaide: guides, local stories and practical advice from our editors.`,
    path: pagedPath(`/blog/category/${category.slug}`, page),
    keywords: category.seoKeywords ? [category.seoKeywords] : [category.name, `${category.name} Adelaide`, `${category.name} articles`, 'Adelaide blog'],
    image: category.shareImage ? { url: category.shareImage.url, width: category.shareImage.width, height: category.shareImage.height, alt: `${category.name} articles` } : null,
    // A landing page without editorial content or articles is not worth indexing (SRS BLOG 005, SEO 003).
    robots: category.landingContent || category.postCount > 0 ? undefined : { index: false, follow: true },
    og: { kind: 'blog-category', key: category.slug },
  });
}

export default async function BlogCategoryPage({ params, searchParams }: PageProps<'/blog/category/[slug]'>) {
  const { slug } = await params;
  const terms = await categories();
  const category = terms.find((c) => c.slug === slug) ?? null;
  // An address that is not a published category is a 404, not a category with
  // nothing in it (SRS SEO 001: correct status).
  if (!category) notFound();

  const query = await searchParams;
  const page = readPageParam(query.page);
  const posts = await fetchPosts({ page, category: category.slug });
  if (isPastLastPage(page, posts.meta.pageCount)) notFound();
  const stocked = terms.filter((term) => term.postCount > 0 || term.slug === category.slug);

  return (
    <>
      <CollectionHeader
        eyebrow="Blog category"
        title={category.name}
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: category.name }]}
        // The editor's own description for this category; nothing is invented
        // when they have not written one (SRS CFG 003, BLOG 005).
        bodyHtml={category.landingContent}
        meta={posts.meta.total > 0 ? `${posts.meta.total} article${posts.meta.total === 1 ? '' : 's'}` : undefined}
        footer={<BlogCategoryNav categories={stocked} active={category.slug} />}
      />
      <div className="ms-container py-12 sm:py-16">
        {posts.data.length === 0 ? (
          <BlogEmptyState message="No stories have been published in this category yet." action={{ href: '/blog', label: 'Browse all stories' }} />
        ) : (
          // The category is the page heading, so the cards do not repeat it.
          <ArticleCollection posts={posts.data} label={`Articles in ${category.name}`} showCategory={false} leadIsAboveFold />
        )}
        {posts.meta.pageCount > 1 && (
          <div className="mt-12">
            <Pagination page={posts.meta.page} pageCount={posts.meta.pageCount} hrefFor={(p) => pagedPath(`/blog/category/${category.slug}`, p)} />
          </div>
        )}
      </div>
    </>
  );
}
