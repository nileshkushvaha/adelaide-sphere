'use client';

import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import type { PublicMenuItem } from '@/lib/api';
import { activeTrail, type ActiveTrail } from './active-trail';
import { MenuIcon } from './menu-icon';
import { MenuLink } from './menu-link';
import { MobileNavDrawer } from './mobile-nav-drawer';
import { useHydrated } from './use-hydrated';

/** Pointer hover only opens menus on devices that genuinely hover; touch toggles instead. */
const canHover = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Room a flyout needs to its right before it opens to the left instead. */
const FLYOUT_WIDTH = 272;

interface Props {
  primary: PublicMenuItem[];
  secondary: PublicMenuItem[];
}

interface MenuState {
  /** Ids of the open menus, outermost first: [top-level] or [top-level, second-level]. */
  open: string[];
  flip: boolean;
  toggle: (path: string[], trigger: HTMLElement | null) => void;
  hoverOpen: (path: string[], trigger: HTMLElement | null) => void;
  trail: ActiveTrail;
}

/**
 * Main navigation (SRS UX 002, MENU 005–006) as a disclosure navigation, not an
 * ARIA menu: every parent is a real link plus a separate button that opens its
 * submenu, so the parent page stays reachable and screen readers hear ordinary
 * links. Escape closes the innermost open submenu and returns focus to its
 * button; moving focus out of the navigation closes everything.
 *
 * Before hydration the submenus open on hover and keyboard focus through CSS
 * alone, so every link is reachable without JavaScript.
 */
export function PrimaryNav({ primary, secondary }: Props) {
  const pathname = usePathname();
  const enhanced = useHydrated();
  const trail = useMemo(() => activeTrail(primary, pathname), [primary, pathname]);
  const [open, setOpen] = useState<string[]>([]);
  const [flip, setFlip] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const navRef = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);
  // The submenu hovering opened last, so a click that follows does not close it again.
  const hoverOpened = useRef<string | null>(null);

  // A navigation closes whatever was open.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen([]);
  }

  useEffect(() => {
    if (open.length === 0) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpen([]);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open.length]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const openPath = (path: string[], trigger: HTMLElement | null) => {
    window.clearTimeout(timer.current);
    if (path.length === 2 && trigger) setFlip(trigger.getBoundingClientRect().right + FLYOUT_WIDTH > window.innerWidth);
    setOpen(path);
  };

  const state: MenuState = {
    open,
    flip,
    trail,
    toggle: (path, trigger) => {
      const isOpen = path.every((id, index) => open[index] === id);
      const openedByHover = hoverOpened.current === path.join('/');
      hoverOpened.current = null;
      if (isOpen && !openedByHover) setOpen(path.slice(0, -1));
      else openPath(path, trigger);
    },
    hoverOpen: (path, trigger) => {
      if (!canHover()) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        hoverOpened.current = path.join('/');
        openPath(path, trigger);
      }, 80);
    },
  };

  const hoverLeave = () => {
    if (!canHover()) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen([]), 220);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || open.length === 0) return;
    const closing = open[open.length - 1]!;
    setOpen(open.slice(0, -1));
    navRef.current?.querySelector<HTMLElement>(`[aria-controls="submenu-${closing}"]`)?.focus();
    event.stopPropagation();
  };

  const onBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen([]);
  };

  const links = primary.filter((item) => item.style !== 'button');
  const buttons = primary.filter((item) => item.style === 'button');

  return (
    <>
      <nav ref={navRef} aria-label="Main" className="ms-primary-nav ml-6 hidden lg:flex" data-enhanced={enhanced ? '' : undefined} onKeyDown={onKeyDown} onBlur={onBlur} onMouseLeave={hoverLeave}>
        <ul className="flex items-center gap-1">
          {links.map((item) => (
            <TopItem key={item.id} item={item} state={state} />
          ))}
        </ul>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {buttons.map((item) => (
          <MenuLink
            key={item.id}
            item={item}
            current={trail.current === item.id}
            className="ms-primary-action hidden min-h-11 items-center gap-2 rounded-full bg-sky-700 px-5 text-sm font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-sky-600 sm:inline-flex"
          />
        ))}
        <MobileNavDrawer primary={primary} secondary={secondary} />
      </div>
    </>
  );
}

function TopItem({ item, state }: { item: PublicMenuItem; state: MenuState }) {
  const hasChildren = item.children.length > 0;
  const isOpen = state.open[0] === item.id;
  const submenuId = `submenu-${item.id}`;

  return (
    <li
      className="ms-nav-item relative"
      data-active-trail={state.trail.ancestors.has(item.id) ? '' : undefined}
      onMouseEnter={hasChildren ? (event) => state.hoverOpen([item.id], event.currentTarget) : undefined}
    >
      <div className="flex items-center">
        {item.href && (
          <MenuLink
            item={item}
            current={state.trail.current === item.id}
            className={`ms-header-link relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-[0.9375rem] font-semibold`}
          />
        )}
        {hasChildren && (
          <button
            type="button"
            className={item.href ? 'ms-nav-toggle' : 'ms-header-link inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[0.9375rem] font-semibold'}
            aria-expanded={isOpen}
            aria-controls={submenuId}
            onClick={(event) => state.toggle([item.id], event.currentTarget)}
          >
            {item.href ? (
              <span className="sr-only">{item.label} submenu</span>
            ) : (
              <>
                <MenuIcon name={item.icon} className="size-4 shrink-0" />
                <span>{item.label}</span>
              </>
            )}
            <ChevronDownIcon aria-hidden="true" className="ms-nav-chevron size-4" />
          </button>
        )}
      </div>
      {hasChildren && (
        <ul id={submenuId} className="ms-submenu" data-open={isOpen ? '' : undefined}>
          {item.children.map((child) => (
            <SubItem key={child.id} item={child} parentId={item.id} state={state} />
          ))}
        </ul>
      )}
    </li>
  );
}

function SubItem({ item, parentId, state }: { item: PublicMenuItem; parentId: string; state: MenuState }) {
  const hasChildren = item.children.length > 0;
  const isOpen = state.open[0] === parentId && state.open[1] === item.id;
  const flyoutId = `submenu-${item.id}`;

  return (
    <li
      className="relative"
      data-active-trail={state.trail.ancestors.has(item.id) ? '' : undefined}
      onMouseEnter={(event) => state.hoverOpen(hasChildren ? [parentId, item.id] : [parentId], event.currentTarget)}
    >
      <div className="flex items-stretch">
        {item.href ? (
          <MenuLink item={item} current={state.trail.current === item.id} className="ms-submenu-link flex-1" showDescription descriptionClassName="ms-submenu-description" />
        ) : (
          <span className="ms-submenu-link ms-submenu-heading flex-1">
            <MenuIcon name={item.icon} className="size-4 shrink-0" />
            <span>{item.label}</span>
          </span>
        )}
        {hasChildren && (
          <button
            type="button"
            className="ms-nav-toggle ms-nav-toggle--sub"
            aria-expanded={isOpen}
            aria-controls={flyoutId}
            onClick={(event) => state.toggle([parentId, item.id], event.currentTarget.closest('li'))}
          >
            <span className="sr-only">{item.label} submenu</span>
            <ChevronRightIcon aria-hidden="true" className="ms-nav-chevron size-4" />
          </button>
        )}
      </div>
      {hasChildren && (
        <ul id={flyoutId} className="ms-flyout" data-open={isOpen ? '' : undefined} data-flip={state.flip ? '' : undefined}>
          {item.children.map((grandchild) => (
            <li key={grandchild.id}>
              <MenuLink item={grandchild} current={state.trail.current === grandchild.id} className="ms-submenu-link" showDescription descriptionClassName="ms-submenu-description" />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
