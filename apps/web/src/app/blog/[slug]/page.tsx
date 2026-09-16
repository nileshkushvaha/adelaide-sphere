import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { ArticleView, PAGE_GRID, articleCrumbs } from '@/components/article-view';
import { JsonLdScript } from '@/components/json-ld';
import { blogPostingJsonLd, breadcrumbJsonLd } from '@/lib/structured-data';
import { CommentForm } from '@/components/comment-form';
import { CommentList } from '@/components/comment-list';
import { PostCard } from '@/components/post-card';
import { cardGridColumns } from '@/components/page-shell';
import { fetchComments, fetchPost, privacyNoticeHref, reviewGuidelinesHref } from '@/lib/api';
import { turnstileSiteKey } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPost(slug);
  if (!post) return { title: 'Article not found', robots: { index: false } };
  // The article's own share image when it sets one, otherwise its cover — the
  // same order the editor is shown.
  const picture = post.shareImage ?? post.cover.find((variant) => variant.kind === 'hero') ?? post.cover.at(-1) ?? null;
  const tags = post.tags.map((tag) => tag.name);
  return pageMetadata({
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
    path: `/blog/${post.slug}`,
    keywords: [...tags, post.category.name, 'Adelaide'],
    image: picture ? { url: picture.url, width: picture.width, height: picture.height, alt: post.coverAlt ?? post.title } : null,
    og: { kind: 'post', key: post.slug },
    article: { publishedTime: post.firstPublishedAt, modifiedTime: post.updatedAt, authors: [post.author.displayName], section: post.category.name, tags },
  });
}

/** Article page (SRS BLOG 004): byline, date, cover, body, optional tags, share links, related articles and approved comments. */
export default async function ArticlePage({ params }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params;
  const post = await fetchPost(slug);
  if (!post) notFound();
  const comments = await fetchComments(post.id);
  const crumbs = articleCrumbs(post);
  // The API returns up to four (SRS BLOG 004), shown in the same four-column
  // card grid as the blog index so the row keeps its shape with fewer cards.
  const related = post.related.slice(0, 4);
  // Everything a comment or reply form needs; null when comments are closed.
  const commentForm = post.commentsEnabled ? { turnstileSiteKey: turnstileSiteKey(), guidelinesHref: await reviewGuidelinesHref(), privacyHref: await privacyNoticeHref() } : null;

  return (
    <article>
      <JsonLdScript data={[blogPostingJsonLd(post), breadcrumbJsonLd(crumbs)]} />

      <ArticleView post={post} />

      {/*
        Related articles sit between the article and its comments: the reader has
        finished the piece and is offered another before the conversation about
        this one. The relationship is the API's — shared category, then shared
        tags, never itself or unpublished content (SRS BLOG 004) — and the front
        end invents none of it.
      */}
      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="border-y border-border bg-surface-sunken py-12 sm:py-16">
          <div className="as-container">
            <h2 id="related-heading" className="font-display text-2xl tracking-tight sm:text-3xl">
              More from Adelaide Sphere
            </h2>
            <ul className={`mt-8 grid gap-6 ${cardGridColumns}`}>
              {related.map((item) => (
                <li key={item.id} data-track="related_click">
                  <PostCard post={item} headingLevel={3} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className={`${PAGE_GRID} py-12 sm:py-16`}>
        <section aria-labelledby="comments-heading" className="flex min-w-0 scroll-mt-24 flex-col gap-6">
          <div>
            <h2 id="comments-heading" className="font-display scroll-mt-24 text-2xl tracking-tight sm:text-3xl">
              Comments{post.approvedCommentCount > 0 ? ` (${post.approvedCommentCount})` : ''}
            </h2>
            {comments.data.length === 0 && post.commentsEnabled && (
              <p className="mt-2 text-text-muted">No comments yet. Be the first to join the conversation.</p>
            )}
          </div>

          {comments.data.length > 0 && <CommentList comments={comments.data} postId={post.id} pageCount={comments.meta.pageCount} replyForm={commentForm} />}

          {post.commentsEnabled ? (
            <div className="border-t border-border pt-8">
              <h3 className="font-display text-xl tracking-tight">Leave a comment</h3>
              <p className="mt-2 text-sm text-text-muted">
                Every comment is read by a moderator before it appears. Your email address is never published; it is used only to contact you about this comment.
              </p>
              <div className="mt-5">
                <CommentForm postId={post.id} turnstileSiteKey={commentForm?.turnstileSiteKey ?? null} guidelinesHref={commentForm?.guidelinesHref ?? null} privacyHref={commentForm?.privacyHref ?? null} />
              </div>
            </div>
          ) : (
            <p className="border-t border-border pt-8 text-text-muted">Comments are closed on this article.</p>
          )}
        </section>
      </div>
    </article>
  );
}
