import Image from 'next/image';
import Link from 'next/link';
import type { PostCard as PostCardData } from '@/lib/api';
import { formatArticleDate } from '@/lib/share';
import { ArticleMedia } from './article-media';

interface Props {
  post: PostCardData;
  /**
   * `standard` is the grid card; `featured` gives the same data a two-column
   * editorial layout for the lead article of a page. One component with two
   * layouts, so the card's content, semantics and link behaviour cannot drift
   * apart between the blog index, an archive and the home page.
   */
  variant?: 'standard' | 'featured';
  /**
   * Keeps the document outline correct: h2 where the card follows the page h1,
   * h3 inside a section that already has its own h2.
   */
  headingLevel?: 2 | 3;
  /**
   * Off on a category or tag archive, where every card would repeat the term in
   * the page heading above them.
   */
  showCategory?: boolean;
  /** Small standing label, e.g. "Latest" on the newest article of the index. */
  label?: string;
  /** Set on the one card whose picture is the page's largest above-the-fold image. */
  priority?: boolean;
}

const SHELL = 'ms-card-lift group relative isolate overflow-hidden rounded-card-lg border border-border bg-surface-raised shadow-sm';

function Author({ post, size = 28 }: { post: PostCardData; size?: number }) {
  return (
    <p className="mt-auto flex items-center gap-2.5 pt-4 text-sm text-text-muted">
      {post.author.image ? (
        <Image src={post.author.image.url} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
      ) : (
        <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700" style={{ width: size, height: size }}>
          {post.author.displayName.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0">
        By <span className="font-medium text-text">{post.author.displayName}</span>
        {post.author.role ? <span className="text-text-muted"> · {post.author.role}</span> : null}
      </span>
    </p>
  );
}

function Meta({ post, showCategory, label }: { post: PostCardData; showCategory: boolean; label?: string }) {
  // A paid guest post is always disclosed (SRS 1.12); an explicit label such as "Latest" is shown beside it.
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
      {label && <span className="inline-flex items-center rounded-full bg-navy-900 px-2.5 py-1 font-semibold uppercase tracking-[0.08em] text-white">{label}</span>}
      {post.guestPost && <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 font-semibold uppercase tracking-[0.08em] text-amber-900">Guest post</span>}
      {showCategory && <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">{post.category.name}</span>}
      <time dateTime={post.publishedAt} className="text-text-muted">
        {formatArticleDate(post.publishedAt)}
      </time>
    </p>
  );
}

/**
 * The one article card (SRS BLOG 005), used by the blog index, the category and
 * tag archives, the related-articles row and the home page's story band.
 *
 * The whole card is clickable: the headline's own anchor is stretched over it
 * with `after:inset-0`, so there is exactly one link, one focus stop and one
 * accessible name — no nested anchors and nothing a keyboard reader has to pass
 * through twice. Nothing is shown on hover alone.
 *
 * Reading time is deliberately absent: a card carries no body, so the figure
 * cannot be calculated and will not be invented.
 */
export function PostCard({ post, variant = 'standard', headingLevel = 3, showCategory = true, label, priority = false }: Props) {
  const Heading = `h${headingLevel}` as const;
  const href = `/blog/${encodeURIComponent(post.slug)}`;
  const anchor = (
    <Link href={href} className="after:absolute after:inset-0 after:content-[''] group-hover:text-link">
      {post.title}
    </Link>
  );

  if (variant === 'featured') {
    return (
      <article className={`${SHELL} grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]`}>
        <ArticleMedia
          cover={post.cover}
          coverAlt={post.coverAlt}
          categorySlug={post.category.slug}
          ratio="16/9"
          prefer="hero"
          priority={priority}
          zoom
          sizes="(min-width: 1520px) 780px, (min-width: 1024px) 52vw, 100vw"
          className="lg:aspect-auto lg:h-full lg:min-h-[22rem]"
        />
        <div className="flex flex-col gap-4 p-6 sm:p-8 lg:p-10">
          <Meta post={post} showCategory={showCategory} label={label} />
          <Heading className="font-display text-[clamp(1.6rem,2.6vw,2.35rem)] leading-[1.15] tracking-tight">{anchor}</Heading>
          <p className="line-clamp-4 leading-relaxed text-text-muted">{post.excerpt}</p>
          <Author post={post} size={32} />
        </div>
      </article>
    );
  }

  return (
    <article className={`${SHELL} flex h-full flex-col`}>
      <ArticleMedia
        cover={post.cover}
        coverAlt={post.coverAlt}
        categorySlug={post.category.slug}
        ratio="16/9"
        priority={priority}
        zoom
        sizes="(min-width: 1520px) 480px, (min-width: 1024px) 32vw, (min-width: 640px) 48vw, 100vw"
      />
      <div className="flex flex-1 flex-col gap-2.5 p-5 sm:p-6">
        <Meta post={post} showCategory={showCategory} label={label} />
        <Heading className="font-display text-xl leading-snug tracking-tight">{anchor}</Heading>
        <p className="line-clamp-3 text-sm leading-relaxed text-text-muted">{post.excerpt}</p>
        <Author post={post} />
      </div>
    </article>
  );
}

/**
 * The lead article of a page. Kept as a named export because that is how the
 * blog index and the home page read: the lead is a role, not a set of props.
 */
export function FeaturedPostCard({ post, headingLevel = 2, label, showCategory = true, priority = true }: Omit<Props, 'variant'>) {
  return <PostCard post={post} variant="featured" headingLevel={headingLevel} label={label} showCategory={showCategory} priority={priority} />;
}
