'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@adelaide-sphere/ui';
import type { BusinessCard as BusinessCardData, PostCard as PostCardData } from '@/lib/api';
import { loadBusinessPage, loadPostPage } from '@/lib/lazy-actions';
import { BusinessCard } from './business-card';
import { PostCard } from './post-card';
import { cardGridColumns } from './page-shell';

/**
 * How many further pages arrive on their own as the visitor scrolls before the
 * button has to be pressed. Endless auto-loading would keep the footer — and
 * the policy links in it — permanently out of reach (WCAG 2.2 AA), so the list
 * hands control back after a few pages rather than growing without end.
 */
const AUTO_PAGES = 3;

const subscribe = () => () => {};
/** True only after hydration, and without a setState in an effect: the server render and the first client render both see `false`. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

interface GridProps<T> {
  initial: T[];
  /** The page already on screen; loading continues from the one after it. */
  initialPage: number;
  pageCount: number;
  load: (page: number) => Promise<T[]>;
  render: (item: T) => ReactNode;
  keyOf: (item: T) => string;
  /** Plural noun for the button and the live region ("businesses", "articles"). */
  noun: string;
  /** A plain link to the next page, rendered by the server and shown only until the component hydrates, so the list is still walkable without JavaScript and by crawlers. */
  fallback?: ReactNode;
}

/**
 * A grid that grows as it is scrolled (SRS DIR 005 stays satisfied by the
 * numbered pages underneath). The first page is server rendered, so the list is
 * complete for crawlers and for anyone without JavaScript; everything after it
 * is fetched through a server action and appended.
 *
 * A failed load is not fatal: the button says so and can be pressed again.
 */
function LazyGrid<T>({ initial, initialPage, pageCount, load, render, keyOf, noun, fallback }: GridProps<T>) {
  const hydrated = useHydrated();
  const [items, setItems] = useState<T[]>(initial);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [autoUsed, setAutoUsed] = useState(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // The server action closes over the parent's props and so is a new function
  // every render; a ref keeps `loadMore` stable, and with it the observer,
  // which would otherwise be torn down and rebuilt on every render.
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  }, [load]);
  const inFlight = useRef(false);
  const done = page >= pageCount;

  const loadMore = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const next = await loader.current(page + 1);
      // Something published between two loads shifts the pages by one; a card already shown is not added again.
      setItems((current) => {
        const seen = new Set(current.map(keyOf));
        return [...current, ...next.filter((item) => !seen.has(keyOf(item)))];
      });
      setPage((current) => current + 1);
    } catch {
      // The message is in the button; the page itself is still good.
      setFailed(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [page, keyOf]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || done || autoUsed >= AUTO_PAGES || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setAutoUsed((used) => used + 1);
        void loadMore();
      },
      // Start fetching a screenful early, so the next cards are usually there
      // by the time the visitor reaches the end of the ones they are reading.
      { rootMargin: '600px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, done, autoUsed, failed]);

  return (
    <div className="flex flex-col gap-8">
      <ul className={`grid gap-6 ${cardGridColumns}`}>
        {items.map((item) => (
          <li key={keyOf(item)}>{render(item)}</li>
        ))}
      </ul>
      {/* Announced to screen readers when a page lands, so the list growing
          under the cursor is not a silent change. */}
      <p role="status" aria-live="polite" className="sr-only">
        {loading ? `Loading more ${noun}` : `Showing ${items.length} ${noun}`}
      </p>
      {hydrated && !done && (
        <div ref={sentinel} className="flex flex-col items-center gap-2">
          {failed && <p className="text-sm text-text-muted">That didn’t load. Try again, or use the pages below.</p>}
          <Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loading}>
            {loading ? 'Loading…' : failed ? 'Try again' : `Show more ${noun}`}
          </Button>
        </div>
      )}
      {!hydrated && !done && fallback}
    </div>
  );
}

/** Directory results that grow as they are scrolled; the filters travel with them. */
export function LazyBusinessGrid({
  initial,
  page,
  pageCount,
  query,
  category,
  area,
  fallback,
}: {
  initial: BusinessCardData[];
  page: number;
  pageCount: number;
  /** The visitor's own query string (`?q=…&sort=…`), re-parsed and re-validated on the server. */
  query: string;
  category?: string;
  area?: string;
  fallback?: ReactNode;
}) {
  return (
    <LazyGrid
      initial={initial}
      initialPage={page}
      pageCount={pageCount}
      load={(next) => loadBusinessPage({ query, category, area, page: next })}
      render={(business) => <BusinessCard business={business} />}
      keyOf={(business) => business.id}
      noun="businesses"
      fallback={fallback}
    />
  );
}

/** Blog index grid that grows as it is scrolled. */
export function LazyPostGrid({
  initial,
  page,
  pageCount,
  category,
  tag,
  showCategory = true,
  fallback,
}: {
  initial: PostCardData[];
  page: number;
  pageCount: number;
  category?: string;
  tag?: string;
  /** Off on an archive, where the term is already the page heading. */
  showCategory?: boolean;
  fallback?: ReactNode;
}) {
  return (
    <LazyGrid
      initial={initial}
      initialPage={page}
      pageCount={pageCount}
      load={(next) => loadPostPage({ page: next, category, tag })}
      render={(post) => <PostCard post={post} showCategory={showCategory} />}
      keyOf={(post) => post.id}
      noun="articles"
      fallback={fallback}
    />
  );
}
