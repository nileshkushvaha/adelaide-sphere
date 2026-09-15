import Link from 'next/link';
import type { PublicMenuItem } from '@/lib/api';
import { MenuIcon } from './menu-icon';

interface Props {
  item: PublicMenuItem;
  className?: string;
  /** Marks the link as the current page (`aria-current="page"`). */
  current?: boolean;
  iconClassName?: string;
  /** Show the item's description under its label, as dropdowns and the mobile menu do. */
  showDescription?: boolean;
  descriptionClassName?: string;
}

/**
 * One menu item as a link. Addresses were validated when the menu was saved
 * (MENU 004), so this only decides how to render them: site paths go through
 * the router, everything else is a plain anchor, and a link that opens a new
 * tab says so to people who cannot see the icon. A heading renders as text.
 */
export function MenuLink({ item, className, current = false, iconClassName = 'size-4 shrink-0', showDescription = false, descriptionClassName = 'text-sm font-normal opacity-80' }: Props) {
  const body = (
    <>
      <MenuIcon name={item.icon} className={iconClassName} />
      {showDescription && item.description ? (
        <span className="flex min-w-0 flex-col">
          <span>{item.label}</span>
          <span className={descriptionClassName}>{item.description}</span>
        </span>
      ) : (
        <span className="min-w-0">{item.label}</span>
      )}
      {item.newTab && <span className="sr-only"> (opens in a new tab)</span>}
    </>
  );

  if (!item.href) return <span className={className}>{body}</span>;

  const shared = {
    className,
    title: item.title ?? undefined,
    'aria-current': current ? ('page' as const) : undefined,
    target: item.newTab ? '_blank' : undefined,
    rel: item.rel ?? undefined,
  };
  if (item.external || item.href.startsWith('#')) {
    return (
      <a href={item.href} {...shared}>
        {body}
      </a>
    );
  }
  return (
    <Link href={item.href} {...shared}>
      {body}
    </Link>
  );
}
