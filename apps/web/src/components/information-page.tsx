import { MotionHeading } from './motion-heading';
import type { ReactNode } from 'react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { JsonLdScript } from '@/components/json-ld';
import { breadcrumbJsonLd } from '@/lib/structured-data';
import type { PageLayout } from '@/lib/api';

interface Props {
  title: string;
  /** Small label above the title ("Policies"), when the page belongs to a set. */
  eyebrow?: string;
  /** One-line standfirst under the title. */
  intro?: string;
  updatedAt?: string;
  children: ReactNode;
  /** Optional column beside the body: contact details, related links. Ignored on a full-width page. */
  aside?: ReactNode;
  /** Which side the supporting column sits, or whether the page runs full width. Chosen per page in the admin. */
  layout?: PageLayout;
  /** Extra classes for the reading column — e.g. the lead-paragraph treatment the policies use. */
  bodyClassName?: string;
  /** Anything that follows the body across the full width: related pages, a closing band. */
  footer?: ReactNode;
}

const adelaideDate = (value: string) => new Intl.DateTimeFormat('en-AU', { dateStyle: 'long', timeZone: 'Australia/Adelaide' }).format(new Date(value));

/**
 * The dark title band of an information page, with its breadcrumb trail and
 * the matching BreadcrumbList. Exported for the product routes that share the
 * look but not the reading-column body (Contact builds its own two columns).
 * `className` replaces the band background, e.g. the editorial glow.
 */
export function InformationHero({ title, eyebrow, intro, updatedAt, className = 'bg-band' }: Pick<Props, 'title' | 'eyebrow' | 'intro' | 'updatedAt'> & { className?: string }) {
  const crumbs = [{ label: 'Home', href: '/' }, { label: title }];
  return (
    <>
      <JsonLdScript data={breadcrumbJsonLd(crumbs)} />
      <div className={`ms-on-dark text-band-text ${className}`}>
        <div className="ms-container py-10 sm:py-14">
          <Breadcrumbs items={crumbs} tone="dark" />
          {eyebrow && <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">{eyebrow}</p>}
          <h1 className={`font-display ${eyebrow ? 'mt-3' : 'mt-6'} max-w-3xl text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.08] tracking-tight`}><MotionHeading text={title} /></h1>
          {intro && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-band-muted">{intro}</p>}
          {updatedAt && (
            /* A pill rather than a line of grey text: on a policy the date is
               part of what the reader is checking, not a footnote. */
            <p className="mt-7 inline-flex items-center gap-2 rounded-full border border-band-border bg-white/[0.06] px-3.5 py-1.5 text-sm text-band-muted">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-sky-400" />
              Last updated <time dateTime={updatedAt}>{adelaideDate(updatedAt)}</time>
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Shared shell for the information pages (SRS CFG 002): a dark title band that
 * continues the site's light/dark rhythm, then the reading column on the light
 * surface with an optional aside. One layout means About, Contact, Privacy,
 * Terms and the review guidelines all look like the same publication.
 */
export function InformationPage({ title, eyebrow, intro, updatedAt, children, aside, layout = 'rightSidebar', bodyClassName = '', footer }: Props) {
  const column = layout === 'fullWidth' || !aside ? null : layout;
  return (
    <article>
      <InformationHero title={title} eyebrow={eyebrow} intro={intro} updatedAt={updatedAt} />
      <div
        className={`ms-container grid gap-12 py-12 sm:py-16 lg:gap-14 ${
          column === 'rightSidebar' ? 'lg:grid-cols-[minmax(0,1fr)_28rem]' : column === 'leftSidebar' ? 'lg:grid-cols-[28rem_minmax(0,1fr)]' : ''
        }`}
      >
        {/* The body stays first in the source whichever side the column is on,
            so a phone and a screen reader get the page itself before the panel
            beside it; a left sidebar is placed by the grid, not by the order
            things are read in. */}
        <div className={`ms-prose ${column ? 'ms-prose-fill' : ''} ${column === 'leftSidebar' ? 'lg:col-start-2 lg:row-start-1' : ''} ${bodyClassName}`.trim()}>{children}</div>
        {column && <aside className={`lg:pt-1 ${column === 'leftSidebar' ? 'lg:col-start-1 lg:row-start-1' : ''}`.trim()}>{aside}</aside>}
      </div>
      {footer}
    </article>
  );
}
