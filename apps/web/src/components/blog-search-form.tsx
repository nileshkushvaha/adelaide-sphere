import { BLOG_SEARCH_MAX_LENGTH } from '@/lib/blog-search';

/**
 * The blog's search box (SRS 1.10 BLOG 005): a plain GET form to
 * `/blog/search`, so it works without JavaScript and the results have an
 * address that can be shared or bookmarked.
 */
export function BlogSearchForm({ defaultValue = '', tone = 'light' }: { defaultValue?: string; tone?: 'light' | 'dark' }) {
  return (
    <form role="search" aria-label="Articles" action="/blog/search" method="get" className="flex w-full max-w-xl flex-col gap-2 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label htmlFor="blog-search-q" className={`block text-sm font-medium ${tone === 'dark' ? 'text-band-text' : ''}`}>
          Search articles
        </label>
        <input
          id="blog-search-q"
          name="q"
          type="search"
          defaultValue={defaultValue}
          maxLength={BLOG_SEARCH_MAX_LENGTH}
          placeholder="e.g. laneway cafés"
          className="mt-1.5 block min-h-11 w-full rounded-full border border-border bg-white px-4 text-base text-slate-900 placeholder:text-slate-500"
        />
      </div>
      <button type="submit" className="ms-primary-action inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold text-white">
        Search
      </button>
    </form>
  );
}
