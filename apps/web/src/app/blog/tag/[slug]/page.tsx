import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { ArticleCollection, BlogEmptyState } from '@/components/article-collection';
import { CollectionHeader } from '@/components/collection-header';
import { Pagination } from '@/components/pagination';
import { isPastLastPage, pagedPath, pagedTitle, readPageParam } from '@/lib/pagination';
import { fetchBlogTerms, fetchPosts } from '@/lib/api';

async function findTag(slug: string) {
  return (await fetchBlogTerms('tags')).find((t) => t.slug === slug) ?? null;
}

export async function generateMetadata({ params, searchParams }: PageProps<'/blog/tag/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const page = readPageParam((await searchParams).page);
  const tag = await findTag(slug);
  if (!tag) return { title: 'Tag not found', robots: { index: false } };
  // The editor's search appearance first (change log 1.15); each empty field falls back to the composed text.
  return pageMetadata({
    title: pagedTitle(tag.seoTitle ?? `${tag.name} articles`, page),
    description: tag.seoDescription ?? `Articles tagged ${tag.name.toLowerCase()}: Adelaide guides, local stories and practical advice from our editors.`,
    path: pagedPath(`/blog/tag/${tag.slug}`, page),
    keywords: tag.seoKeywords ? [tag.seoKeywords] : [tag.name, `${tag.name} Adelaide`, `${tag.name} articles`, 'Adelaide blog'],
    image: tag.shareImage ? { url: tag.shareImage.url, width: tag.shareImage.width, height: tag.shareImage.height, alt: `${tag.name} articles` } : null,
    // A tag is indexed only with its own landing content and at least one article
    // (SRS BLOG 005: "a tag with no substantive editorial landing shall be
    // noindex"). The sitemap applies the same rule, so the two cannot disagree.
    robots: (tag.landingContent ?? '').trim() && tag.postCount > 0 ? undefined : { index: false, follow: true },
    og: { kind: 'tag', key: tag.slug },
  });
}

export default async function BlogTagPage({ params, searchParams }: PageProps<'/blog/tag/[slug]'>) {
  const { slug } = await params;
  const tag = await findTag(slug);
  if (!tag) notFound();
  const query = await searchParams;
  const page = readPageParam(query.page);
  const posts = await fetchPosts({ page, tag: tag.slug });
  if (isPastLastPage(page, posts.meta.pageCount)) notFound();
  return (
    <>
      <CollectionHeader
        eyebrow="Blog tag"
        title={tag.name}
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: tag.name }]}
        bodyHtml={tag.landingContent}
        meta={posts.meta.total > 0 ? `${posts.meta.total} article${posts.meta.total === 1 ? '' : 's'}` : undefined}
      />
      <div className="ms-container py-12 sm:py-16">
        {posts.data.length === 0 ? (
          <BlogEmptyState message="No stories carry this tag yet." action={{ href: '/blog', label: 'Browse all stories' }} />
        ) : (
          // A tag crosses categories, so each card still names the one it belongs to.
          <ArticleCollection posts={posts.data} label={`Articles tagged ${tag.name}`} leadIsAboveFold />
        )}
        {posts.meta.pageCount > 1 && (
          <div className="mt-12">
            <Pagination page={posts.meta.page} pageCount={posts.meta.pageCount} hrefFor={(p) => pagedPath(`/blog/tag/${tag.slug}`, p)} />
          </div>
        )}
      </div>
    </>
  );
}
