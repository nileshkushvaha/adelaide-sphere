import Image from 'next/image';
import type { ReactNode } from 'react';
import { withoutRepeatedHeading } from '@/lib/landing-content';
import { Breadcrumbs } from './breadcrumbs';

interface Props {
  eyebrow: string;
  title: string;
  crumbs: { label: string; href?: string }[];
  /** Plain standfirst. */
  description?: string;
  /** Editor-written landing content, already sanitised by the API (SRS SEC 001). */
  bodyHtml?: string | null;
  /** e.g. "12 businesses" — the collection's own count, when there is one. */
  meta?: string;
  /** The collection's own picture, beside the words on wide screens and above them on a phone. */
  image?: { url: string; alt: string } | null;
  /** Navigation belonging to the band, such as the blog's category row, placed under the words. */
  footer?: ReactNode;
}

/**
 * Dark title band for a collection page (blog category or tag, directory
 * category or local area). One component keeps every landing page in the same
 * light/dark rhythm as the home page instead of a bare heading on white.
 *
 * The kind of page and its size share one line above the heading — they are
 * both labels for what follows, and as separate stacked blocks they stretched
 * the band to twice the height its content needed.
 */
export function CollectionHeader({ eyebrow, title, crumbs, description, bodyHtml, meta, image, footer }: Props) {
  // An editor's description usually opens by repeating the category name, which
  // the heading has just said. Shown as written, the page read
  // "City guides / City guides / Our guides."
  const body = withoutRepeatedHeading(bodyHtml, title);
  return (
    <div className="ms-on-dark ms-editorial-band text-band-text">
      <div className={`ms-container py-10 sm:py-14 ${image ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:gap-12' : ''}`}>
        <div>
          <Breadcrumbs items={crumbs} tone="dark" />
          <p className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold uppercase tracking-[0.18em] text-sky-400">{eyebrow}</span>
            {meta && (
              <>
                <span aria-hidden="true" className="text-band-border">
                  •
                </span>
                <span className="text-sm text-band-muted">{meta}</span>
              </>
            )}
          </p>
          <h1 className="font-display mt-3.5 max-w-3xl text-balance text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.04] tracking-tight">{title}</h1>
          {description && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-band-muted">{description}</p>}
          {body && <div className="ms-prose mt-4 max-w-2xl text-band-muted [&_a]:text-band-link [&_h2]:text-white [&_h3]:text-white [&_strong]:text-white" dangerouslySetInnerHTML={{ __html: body }} />}
          {footer && <div className="mt-8">{footer}</div>}
        </div>
        {image && (
          <div className="relative mt-8 aspect-[4/3] overflow-hidden rounded-[2rem] bg-navy-950 shadow-lg ring-1 ring-white/10 lg:mt-0">
            <Image src={image.url} alt={image.alt} fill sizes="(min-width: 1024px) 22rem, 100vw" className="object-cover" priority />
          </div>
        )}
      </div>
    </div>
  );
}
