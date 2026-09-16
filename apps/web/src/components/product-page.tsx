import { MotionHeading } from './motion-heading';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRightIcon, type LucideIcon } from 'lucide-react';

/**
 * The building blocks of the product pages that are not editable documents:
 * `/contact` (SRS UX 003) and `/about` (a product route at client instruction,
 * 13 Sep 2026). One layout, one sidebar card and one way of listing points, so
 * both pages read as the same publication and neither carries its own copy of
 * the grid, the sticky rules or the icon treatment.
 */

/** A gradient tile for an icon that supports scanning; the text beside it carries the meaning. */
export function IconTile({ icon: Icon, className = '' }: { icon: LucideIcon; className?: string }) {
  return (
    <span aria-hidden="true" className={`as-product-icon grid size-10 shrink-0 place-items-center rounded-card bg-linear-to-br from-sky-400 to-sky-700 text-white shadow-sm shadow-sky-700/25 ${className}`}>
      <Icon className="size-[1.125rem]" strokeWidth={1.9} />
    </span>
  );
}

export interface IconPoint {
  icon: LucideIcon;
  title: string;
  /** One short line at most; most points need none. */
  text?: string;
}

/**
 * Short points, each led by an icon. `ordered` renders a real ordered list with
 * the step number on the tile, for a sequence (ABT 006: semantic lists).
 */
export function IconPoints({ items, ordered = false, columns = 2 }: { items: IconPoint[]; ordered?: boolean; columns?: 1 | 2 }) {
  const List = ordered ? 'ol' : 'ul';
  return (
    <List className={`grid gap-x-8 gap-y-4 ${columns === 2 ? 'sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2' : ''}`}>
      {items.map((item, index) => (
        <li key={item.title} className={`as-icon-point flex gap-3.5 ${item.text ? 'items-start' : 'items-center'}`}>
          <span className="relative shrink-0">
            <IconTile icon={item.icon} />
            {ordered && (
              <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-surface text-[0.65rem] font-bold text-sky-700 shadow-sm ring-1 ring-sky-100">
                {index + 1}
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="font-semibold leading-snug">{item.title}</p>
            {item.text && <p className="mt-0.5 text-sm leading-relaxed text-text-muted">{item.text}</p>}
          </div>
        </li>
      ))}
    </List>
  );
}

/** A titled section of the main column. */
export function ContentSection({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="as-content-panel">
      <h2 id={id} className="font-display text-2xl tracking-tight sm:text-3xl">
        <MotionHeading text={title} />
      </h2>
      {intro && <p className="mt-2 max-w-2xl leading-relaxed text-text-muted">{intro}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/**
 * The page body: the main column on the left and one sidebar card on the right
 * from `lg`. Source order is `lead` → `aside` → `children`, so a phone reaches
 * the card straight after the opening section; the grid puts `children` back
 * under `lead` on a wide screen. The sidebar column spans both rows, which is
 * what gives its sticky card room to travel and stops it above the footer.
 */
export function ProductPageLayout({ lead, aside, children, split }: { lead?: ReactNode; aside: ReactNode; children: ReactNode; split?: [ReactNode, ReactNode] }) {
  if (split) {
    // Two equal columns. Left: the first half, then the sections. Right: the second
    // half at its own height with the aside directly under it; that column spans the
    // whole height, so a sticky aside stays in view while the left side scrolls. The
    // document order is first half, second half, aside, sections, which is also the
    // reading order on narrow screens.
    return (
      <div className="bg-surface-muted">
        <div className="as-container grid gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-x-12 xl:gap-x-16">
          <div className="flex min-w-0 flex-col lg:col-start-1 lg:row-start-1">{split[0]}</div>
          <div className="flex min-w-0 flex-col gap-10 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            {split[1]}
            {aside}
          </div>
          <div className="flex min-w-0 flex-col gap-12 lg:col-start-1 lg:row-start-2">
            {lead}
            {children}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-surface-muted">
      <div className="as-container grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-x-12 xl:grid-cols-[minmax(0,1fr)_32rem] xl:gap-x-20">
        <div className="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-1">{lead}</div>
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">{aside}</div>
        <div className="flex min-w-0 flex-col gap-12 lg:col-start-1 lg:row-start-2">{children}</div>
      </div>
    </div>
  );
}

const STICKY = {
  /** For a tall card such as the contact form: only where it fits under the pinned navigation, and never while it holds an alert. */
  fits: 'lg:[@media(min-height:58rem)]:sticky lg:[@media(min-height:58rem)]:top-24 xl:[@media(min-height:54rem)]:sticky xl:[@media(min-height:54rem)]:top-24 has-[[role=alert]]:static',
  /** For a short card that fits any desktop viewport. */
  always: 'lg:sticky lg:top-24',
  /** For a form the page keeps in view on every desktop; static again once it holds an alert, so nothing is hidden. */
  form: 'lg:sticky lg:top-24 has-[[role=alert]]:static',
} as const;

/**
 * A sidebar card. `sticky` (the default, `true`) keeps it in view only where a
 * card of ordinary height fits under the pinned navigation (about 4.5rem; the
 * contact strip above it scrolls away), and static once it holds an alert: on
 * a short laptop screen, or once validation messages lengthen it, a sticky card
 * taller than the viewport would hide its own last controls. `'always'` is for
 * a short card that fits any desktop viewport. When a sidebar stacks several
 * cards, only the last should be sticky.
 */
export function AsideCard({ id, anchorId, icon, title, description, sticky = true, children }: { id: string; anchorId?: string; icon: LucideIcon; title: string; description: string; sticky?: boolean | 'always' | 'form'; children?: ReactNode }) {
  const stickiness = sticky === 'always' ? STICKY.always : sticky === 'form' ? STICKY.form : sticky ? STICKY.fits : '';
  return (
    <section
      id={anchorId}
      aria-labelledby={id}
      className={`as-product-aside relative overflow-hidden rounded-card-lg border border-border bg-surface-raised p-5 shadow-md sm:p-6 ${stickiness}`}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-sky-400 to-sky-700" />
      <div className="flex items-start gap-3.5">
        <IconTile icon={icon} className="mt-0.5" />
        <div className="min-w-0">
          <h2 id={id} className="font-display text-2xl tracking-tight">
            <MotionHeading text={title} />
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{description}</p>
        </div>
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}

/** A quiet list of onward links, only ever to routes that answer. */
export function LinkList({ id, title, links }: { id: string; title: string; links: { href: string; label: string }[] }) {
  return (
    <nav aria-labelledby={id} className="as-product-links">
      <h2 id={id} className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
        <MotionHeading text={title} />
      </h2>
      <ul className="mt-3 grid gap-x-8 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href} className="border-b border-border">
            <Link href={link.href} className="group flex min-h-12 items-center justify-between gap-3 font-medium transition-colors hover:text-link">
              {link.label}
              <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-link motion-reduce:transition-none" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
