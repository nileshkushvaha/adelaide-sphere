import type { PublicMenuItem } from '@/lib/api';
import { MenuLink } from './menu-link';

/**
 * Grid templates for the brand column plus one to four menu columns. Written
 * out in full because Tailwind only generates classes it can see in the source.
 */
export const FOOTER_GRID: Record<number, string> = {
  0: 'lg:grid-cols-[1.4fr]',
  1: 'lg:grid-cols-[1.4fr_minmax(0,1fr)]',
  2: 'lg:grid-cols-[1.4fr_repeat(2,minmax(0,1fr))]',
  3: 'lg:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]',
  4: 'lg:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]',
};

const LINK = 'as-footer-link inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-base font-medium';

/**
 * The footer menu's columns (MENU 003): each top-level item is a column
 * heading — a link when it has an address — and its children are the links
 * beneath it. Each column is its own labelled navigation landmark.
 */
export function FooterMenuColumns({ items }: { items: PublicMenuItem[] }) {
  return (
    <>
      {items.slice(0, 4).map((column) => {
        const headingId = `footer-menu-${column.id}`;
        return (
          <nav key={column.id} aria-labelledby={headingId} className="as-footer-section min-w-0">
            <h2 id={headingId} className="as-footer-heading font-display text-lg font-bold text-white">
              {column.href ? <MenuLink item={column} className="inline-flex items-center gap-2 hover:underline" /> : column.label}
            </h2>
            {column.children.length > 0 && (
              <ul className="mt-5 -ml-3 flex flex-col gap-1">
                {column.children.map((item) => (
                  <li key={item.id}>
                    <MenuLink item={item} className={LINK} />
                  </li>
                ))}
              </ul>
            )}
          </nav>
        );
      })}
    </>
  );
}

/** The footer-bottom links beside the copyright notice, usually the policies. */
export function FooterBottomMenu({ items }: { items: PublicMenuItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Legal">
      <ul className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <MenuLink item={item} className={LINK} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
