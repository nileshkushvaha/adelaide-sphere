import Link from 'next/link';
import type { BlogTerm } from '@/lib/api';

interface Props {
  /** Only the categories that actually have published articles; the caller filters. */
  categories: BlogTerm[];
  /** The category slug being viewed, or `all` on the blog index. */
  active: string | 'all';
  tone?: 'light' | 'dark';
}

/**
 * Category navigation for the blog (SRS BLOG 005, UX 002).
 *
 * Ordinary links, so it works without JavaScript, is keyboard navigable by
 * default and is crawlable. The current chip carries `aria-current="page"` as
 * well as its own colour, so the active state is not conveyed by colour alone.
 * The row scrolls sideways on a narrow screen rather than wrapping into four
 * lines above the first article.
 *
 * Nothing here is hardcoded: the terms come from `GET /api/v1/blog-categories`,
 * and the row is omitted entirely when the blog has no stocked category, so a
 * site with one category shows "All stories" beside it instead of a lone chip
 * that looks like a broken filter.
 */
export function BlogCategoryNav({ categories, active, tone = 'dark' }: Props) {
  if (categories.length === 0) return null;

  // `whitespace-nowrap` so a two-word term stays on one line and the row
  // scrolls, instead of that one chip growing taller than its neighbours.
  const base = 'inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors';
  const styles =
    tone === 'dark'
      ? { idle: 'border-band-border bg-white/[0.06] text-white hover:border-sky-400 hover:bg-white/12', current: 'border-teal-100 bg-teal-100 text-teal-700', count: 'text-band-muted', currentCount: 'text-teal-700' }
      : { idle: 'border-border bg-surface-raised text-text hover:border-border-strong hover:bg-sky-50', current: 'border-teal-700 bg-teal-100 text-teal-700', count: 'text-text-muted', currentCount: 'text-teal-700' };

  const chip = (href: string, name: string, slug: string, count?: number) => {
    const current = active === slug;
    return (
      <li key={slug}>
        <Link href={href} aria-current={current ? 'page' : undefined} className={`${base} ${current ? styles.current : styles.idle}`}>
          {name}
          {typeof count === 'number' && <span className={current ? styles.currentCount : styles.count}>{count}</span>}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Blog categories">
      {/* The negative margin lets the row bleed into the container's gutter while
          it scrolls, so the last chip is not clipped mid-word on a phone. */}
      <ul className="-mx-[var(--ms-gutter)] flex gap-2.5 overflow-x-auto px-[var(--ms-gutter)] pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {chip('/blog', 'All stories', 'all')}
        {categories.map((category) => chip(`/blog/category/${category.slug}`, category.name, category.slug, category.postCount))}
      </ul>
    </nav>
  );
}
