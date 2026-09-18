import Link from 'next/link';
import { ArticleBody } from '@/components/article-body';
import { ArticleMedia } from '@/components/article-media';
import { ArticleToc } from '@/components/article-toc';
import { AuthorByline } from '@/components/author-byline';
import { AuthorCard } from '@/components/author-card';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ShareLinks } from '@/components/share-links';
import type { PostDetail } from '@/lib/api';
import { articleOutline } from '@/lib/headings';
import { formatArticleDate } from '@/lib/share';
import { absoluteUrl } from '@/lib/site';

/**
 * The page grid, shared by the article and the comments so both
 * start on the same line as the site navigation: a reading column on the
 * left and a fixed sidebar on the right, with any spare width falling between
 * them rather than stretching the measure.
 */
export const PAGE_GRID = 'as-container grid gap-10 lg:grid-cols-[minmax(0,48rem)_19rem] lg:justify-between lg:gap-12';

/** An article's breadcrumb trail, shared by the page and its structured data. */
export function articleCrumbs(post: PostDetail): { label: string; href?: string }[] {
  return [{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: post.category.name, href: `/blog/category/${post.category.slug}` }, { label: post.title }];
}

/** Reading time from the sanitised body; 200 words per minute is the usual editorial rule of thumb. */
export function readingMinutesOf(body: string): number {
  return Math.max(1, Math.round(body.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length / 200));
}

interface Props {
  post: PostDetail;
  /**
   * A private preview (SRS BLOG 003): the same design, without share links —
   * sharing an address that only works for ten minutes helps nobody.
   */
  preview?: boolean;
}

/**
 * An article's header, body and sidebar (SRS BLOG 004), shared by the public
 * article page and the editor's on-site preview, so a preview is the page a
 * reader will get rather than an approximation of it.
 */
export function ArticleView({ post, preview = false }: Props) {
  const readingMinutes = readingMinutesOf(post.body);
  // Section anchors are added here, at render time, so existing articles get them too.
  const outline = articleOutline(post.body);
  const crumbs = articleCrumbs(post);
  const hasCover = post.cover.length > 0;
  const showUpdated = new Date(post.updatedAt).getTime() - new Date(post.publishedAt).getTime() > 24 * 3_600_000;

  return (
    <>
      <header className="as-on-dark as-editorial-band text-band-text">
        <div className={`as-container pt-8 sm:pt-10 ${hasCover ? 'pb-28 sm:pb-36' : 'pb-9 sm:pb-12'}`}>
          <div className="min-w-0">
            <Breadcrumbs items={crumbs} tone="dark" />
            <Link
              href={`/blog/category/${post.category.slug}`}
              className="mt-7 inline-flex min-h-9 items-center rounded-full border border-sky-400/30 bg-sky-400/10 px-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-sky-400 transition-colors hover:border-sky-400/60 hover:bg-sky-400/20 hover:text-white"
            >
              {post.category.name}
            </Link>
            {post.guestPost && (
              <span className="ml-2 mt-7 inline-flex min-h-9 items-center rounded-full border border-amber-300/50 bg-amber-300/15 px-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
                Guest post
              </span>
            )}
            {/* `text-balance` keeps a long headline from leaving one word alone on
                the last line; `break-words` keeps an unbroken one inside the column. */}
            <h1 className="font-display mt-5 text-balance break-words text-[clamp(2rem,1.5rem+2.6vw,3.15rem)] leading-[1.06] tracking-tight lg:max-w-[85%]">{post.title}</h1>
            <p className="mt-5 text-lg leading-relaxed text-band-muted sm:text-xl sm:leading-relaxed lg:max-w-[75%]">{post.excerpt}</p>
            <div className="mt-6 border-t border-band-border pt-5">
              <AuthorByline author={post.author} publishedAt={post.publishedAt} updatedAt={post.updatedAt} readingMinutes={readingMinutes} tone="dark" layout="inline" />
            </div>
          </div>
        </div>
      </header>

      {/*
        The article and its sidebar. When there is a cover the whole grid is
        lifted into the band, so the picture and the sidebar's first card both
        overlap it and start level with each other.
      */}
      <div className={`${PAGE_GRID} relative z-10 pb-12 sm:pb-16 ${hasCover ? '-mt-20 sm:-mt-28' : 'pt-12 sm:pt-16'}`}>
        <div className="flex min-w-0 flex-col gap-10 sm:gap-12">
          {/*
            The cover is only rendered when the article has one. A cover reaches
            the public API only once the worker has processed it, so an
            unprocessed upload publishes no renditions and there is no
            picture-shaped hole to fill.
          */}
          {hasCover && (
            <figure>
              <ArticleMedia
                cover={post.cover}
                coverAlt={post.coverAlt}
                categorySlug={post.category.slug}
                ratio="16/9"
                prefer="hero"
                priority
                sizes="(min-width: 1024px) 768px, 100vw"
                className="rounded-card-lg shadow-lg"
              />
              {/* The photographer credit, which a CC Attribution licence requires
                  wherever the image appears. The alt text is not printed: it is
                  already carried by the image, and the data model has no caption. */}
              {/* An AI-generated image says so in its own words (recorded with the image), never as a "Photograph". */}
              {'coverDisclosure' in post && post.coverDisclosure ? (
                <figcaption className="mt-3 text-sm text-text-muted">{post.coverDisclosure}</figcaption>
              ) : (
                post.coverCredit && <figcaption className="mt-3 text-sm text-text-muted">Photograph: {post.coverCredit}</figcaption>
              )}
            </figure>
          )}

          <ArticleToc headings={outline.headings} variant="inline" />

          {/* A paid article says so before it starts (SRS 1.12). */}
          {post.guestPost && (
            <p className="rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">This is a paid guest post. It was reviewed by our editors before publishing.</p>
          )}

          {/* An AI-assisted article says so before it starts, in the wording recorded with its draft. */}
          {'aiDisclosure' in post && post.aiDisclosure && (
            <p className="rounded-card border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950">{post.aiDisclosure}</p>
          )}

          {/* Reading depth is measured on the published article only, never on a private preview (SRS 1.10 BLOG 006). */}
          <div data-track-read={preview ? undefined : post.slug}>
            <ArticleBody post={post} body={outline.html} />
          </div>

          <AuthorCard author={post.author} />
        </div>

        {/*
          The sidebar follows the body in source order, so on a phone it reads
          after the article; from `lg` it sits beside it and stays in view while
          the body scrolls (the site navigation above is about 4.5rem tall).
        */}
        <aside aria-label="About this article" className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
          <ArticleToc headings={outline.headings} variant="sidebar" />

          <div className="rounded-card border border-border bg-surface-raised p-5 shadow-sm">
            <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-sky-700">Article details</h2>
            <dl className="mt-4 divide-y divide-border text-sm">
              <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0">
                <dt className="text-text-muted">Category</dt>
                <dd className="text-right">
                  <Link href={`/blog/category/${post.category.slug}`} className="font-medium text-link underline-offset-2 as-text-link">
                    {post.category.name}
                  </Link>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-text-muted">{preview ? 'Publishes' : 'Published'}</dt>
                <dd className="text-right">{preview ? 'When you publish it' : <time dateTime={post.publishedAt}>{formatArticleDate(post.publishedAt)}</time>}</dd>
              </div>
              {showUpdated && !preview && (
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-text-muted">Updated</dt>
                  <dd className="text-right">
                    <time dateTime={post.updatedAt}>{formatArticleDate(post.updatedAt)}</time>
                  </dd>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-text-muted">Reading time</dt>
                <dd className="text-right">{readingMinutes} min</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2.5 last:pb-0">
                <dt className="text-text-muted">Comments</dt>
                <dd className="text-right">
                  {preview ? (
                    post.commentsEnabled ? 'On' : 'Off'
                  ) : (
                    <a href="#comments-heading" className="text-link underline-offset-2 as-text-link">
                      {post.approvedCommentCount}
                    </a>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {!preview && (
            <div className="rounded-card border border-border bg-surface-raised p-5 shadow-sm">
              <ShareLinks url={absoluteUrl(`/blog/${post.slug}`)} title={post.title} />
            </div>
          )}

          {post.tags.length > 0 && (
            <nav aria-label="Tags" className="rounded-card border border-border bg-surface-raised p-5 shadow-sm">
              <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-sky-700">Tagged</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <li key={tag.slug}>
                    <Link href={`/blog/tag/${tag.slug}`} className="inline-flex min-h-9 items-center rounded-full border border-border px-3.5 text-sm transition-colors hover:border-border-strong hover:bg-sky-50">
                      {tag.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>
      </div>
    </>
  );
}
