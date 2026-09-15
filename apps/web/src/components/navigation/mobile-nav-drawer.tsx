'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDownIcon, MenuIcon as MenuGlyph, XIcon } from 'lucide-react';
import type { PublicMenuItem } from '@/lib/api';
import { activeTrail, type ActiveTrail } from './active-trail';
import { MenuIcon } from './menu-icon';
import { MenuLink } from './menu-link';
import { useHydrated } from './use-hydrated';

interface Props {
  primary: PublicMenuItem[];
  secondary: PublicMenuItem[];
}

/**
 * The compact navigation below the desktop breakpoint (MENU 006): a drawer
 * built on the native modal `<dialog>`, which gives the things a hand-rolled
 * drawer gets wrong — the page behind becomes inert, focus stays inside, Escape
 * closes it and it sits above everything else. Focus returns to the button
 * that opened it. Children open as accordions, and call-to-action items sit at
 * the foot of the drawer where a thumb reaches them.
 *
 * Without JavaScript the button is a link to the footer navigation, which holds
 * the same destinations.
 */
export function MobileNavDrawer({ primary, secondary }: Props) {
  const enhanced = useHydrated();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const trail = useMemo(() => activeTrail([...primary, ...secondary], pathname), [primary, secondary, pathname]);

  // Following a link inside the drawer closes it.
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  const links = primary.filter((item) => item.style !== 'button');
  const buttons = primary.filter((item) => item.style === 'button');
  const triggerClass = 'inline-flex size-11 cursor-pointer items-center justify-center rounded-lg border border-border-strong text-text lg:hidden';

  if (!enhanced) {
    return (
      <a href="#footer-navigation" className={triggerClass}>
        <MenuGlyph aria-hidden="true" className="size-5" />
        <span className="sr-only">Menu</span>
      </a>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="site-menu-drawer"
        className={triggerClass}
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
        }}
      >
        <MenuGlyph aria-hidden="true" className="size-5" />
      </button>
      <dialog
        ref={dialogRef}
        id="site-menu-drawer"
        aria-labelledby="site-menu-drawer-title"
        className="ms-drawer"
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
        // Browsers close a modal dialog on Escape themselves, but some ignore a
        // second request without a fresh user activation; closing here as well
        // makes Escape dependable every time.
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.currentTarget.close();
        }}
        // A click on the backdrop lands on the dialog itself, never on the panel inside it.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="ms-drawer-panel">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
            <p id="site-menu-drawer-title" className="font-display text-lg font-bold text-text">
              Menu
            </p>
            <button type="button" aria-label="Close menu" className="inline-flex size-11 items-center justify-center rounded-lg border border-border-strong text-text" onClick={() => dialogRef.current?.close()}>
              <XIcon aria-hidden="true" className="size-5" />
            </button>
          </div>

          <nav aria-label="Main (compact)" className="mt-3">
            <ul className="flex flex-col gap-1">
              {links.map((item) => (
                <DrawerItem key={`${pathname}:${item.id}`} item={item} trail={trail} depth={0} />
              ))}
            </ul>
          </nav>

          {secondary.length > 0 && (
            <nav aria-label="Secondary (compact)" className="mt-4 border-t border-border pt-4">
              <ul className="flex flex-col gap-1">
                {secondary.map((item) => (
                  <DrawerItem key={`${pathname}:${item.id}`} item={item} trail={trail} depth={1} />
                ))}
              </ul>
            </nav>
          )}

          {buttons.length > 0 && (
            <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
              {buttons.map((item) => (
                <MenuLink key={item.id} item={item} className="ms-primary-action flex min-h-12 items-center justify-center gap-2 rounded-full bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-600" />
              ))}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

function DrawerItem({ item, trail, depth }: { item: PublicMenuItem; trail: ActiveTrail; depth: number }) {
  // The branch holding the current page starts open, so the visitor sees where they are. The lists are
  // keyed on the address, so this is worked out again after each client-side navigation.
  const [expanded, setExpanded] = useState(() => trail.ancestors.has(item.id));
  const hasChildren = item.children.length > 0;
  const listId = `drawer-${item.id}`;
  const linkClass = `ms-header-link flex min-h-12 flex-1 items-center gap-2 rounded-lg px-3 ${depth === 0 ? 'text-base font-semibold' : 'text-[0.9375rem] font-medium'}`;

  return (
    <li>
      <div className="flex items-stretch gap-1">
        {item.href ? (
          <MenuLink item={item} current={trail.current === item.id} className={linkClass} showDescription descriptionClassName="text-xs font-normal opacity-75" />
        ) : (
          hasChildren && (
            <button type="button" className={`${linkClass} justify-between text-left`} aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)}>
              <span className="flex items-center gap-2">
                <MenuIcon name={item.icon} className="size-4 shrink-0" />
                {item.label}
              </span>
              <ChevronDownIcon aria-hidden="true" className={`size-4 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )
        )}
        {hasChildren && item.href && (
          <button type="button" className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg text-text hover:bg-sky-50" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)}>
            <span className="sr-only">{item.label} submenu</span>
            <ChevronDownIcon aria-hidden="true" className={`size-4 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {hasChildren && (
        <ul id={listId} hidden={!expanded} className="ml-3 mt-1 flex flex-col gap-1 border-l border-border pl-2">
          {item.children.map((child) => (
            <DrawerItem key={child.id} item={child} trail={trail} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
