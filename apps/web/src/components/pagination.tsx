import Link from 'next/link';
import { Button } from '@adelaide-sphere/ui';

interface Props {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}

/** Page-numbered navigation (SRS DIR 005); links only, so it works without JavaScript. */
export function Pagination({ page, pageCount, hrefFor }: Props) {
  if (pageCount <= 1) return null;
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const ordered = [...pages].sort((a, b) => a - b);
  return (
    <nav aria-label="Results pages" className="flex flex-wrap items-center gap-2">
      {page > 1 && (
        <Button asChild variant="outline" size="sm">
          <Link href={hrefFor(page - 1)} rel="prev">
            Previous
          </Link>
        </Button>
      )}
      <ul className="flex items-center gap-1">
        {ordered.map((p, i) => (
          <li key={p} className="flex items-center gap-1">
            {i > 0 && ordered[i - 1]! < p - 1 && <span aria-hidden="true">…</span>}
            {p === page ? (
              <span aria-current="page" className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md bg-navy-800 px-2 text-sm font-semibold text-text-inverse">
                {p}
              </span>
            ) : (
              <Link href={hrefFor(p)} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm hover:bg-surface-muted">
                {p}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {page < pageCount && (
        <Button asChild variant="outline" size="sm">
          <Link href={hrefFor(page + 1)} rel="next">
            Next
          </Link>
        </Button>
      )}
    </nav>
  );
}
