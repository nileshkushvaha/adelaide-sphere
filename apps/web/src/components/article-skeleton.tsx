/**
 * Placeholders for a blog collection while its server render is on the way.
 *
 * Deliberately shapes, not spinners, and deliberately silent: the whole point is
 * that a page waiting on its articles must never say "no articles" before the
 * request has answered. `aria-hidden` with a polite status line beside it keeps
 * a screen reader from reading out a grid of empty boxes.
 *
 * The pulse is dropped under `prefers-reduced-motion` (SRS NFR 006).
 */
function CardSkeleton() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-card-lg border border-border bg-surface-raised">
      <div className="aspect-[16/9] animate-pulse bg-surface-sunken motion-reduce:animate-none" />
      <div className="flex flex-col gap-3 p-5 sm:p-6">
        <div className="h-4 w-24 animate-pulse rounded-full bg-surface-sunken motion-reduce:animate-none" />
        <div className="h-5 w-full animate-pulse rounded bg-surface-sunken motion-reduce:animate-none" />
        <div className="h-5 w-2/3 animate-pulse rounded bg-surface-sunken motion-reduce:animate-none" />
        <div className="mt-2 h-3.5 w-full animate-pulse rounded bg-surface-sunken motion-reduce:animate-none" />
        <div className="h-3.5 w-5/6 animate-pulse rounded bg-surface-sunken motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export function ArticleCollectionSkeleton({ count = 3 }: { count?: number }) {
  return (
    <>
      <p role="status" className="sr-only">
        Loading articles
      </p>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
    </>
  );
}
