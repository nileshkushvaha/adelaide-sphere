import type { PublicMenuItem } from '@/lib/api';
import { MenuLink } from './menu-link';

/**
 * The secondary menu on the right of the contact strip (MENU 003). One level
 * only: a dropdown in a strip that scrolls away would open under the pinned
 * header. Below the tablet breakpoint the same links live in the menu drawer.
 */
export function SecondaryNav({ items }: { items: PublicMenuItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Secondary" className="hidden md:block">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <MenuLink item={item} className="ms-secondary-link inline-flex min-h-9 items-center gap-1.5 text-band-muted transition-colors hover:text-white" iconClassName="size-3.5 shrink-0" />
          </li>
        ))}
      </ul>
    </nav>
  );
}
