import Link from 'next/link';

/** Breadcrumb trail. `tone` lets it sit on a dark band without losing contrast. */
export function Breadcrumbs({ items, tone = 'light' }: { items: { label: string; href?: string }[]; tone?: 'light' | 'dark' }) {
  const muted = tone === 'dark' ? 'text-band-muted' : 'text-text-muted';
  const current = tone === 'dark' ? 'text-white' : 'text-text';
  return (
    <nav aria-label="Breadcrumb" className={`text-sm ${muted}`}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <Link href={item.href} className="underline-offset-4 ms-text-link">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className={current}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
