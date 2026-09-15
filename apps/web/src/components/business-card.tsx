import Image from 'next/image';
import Link from 'next/link';
import { MapPinIcon } from 'lucide-react';
import type { BusinessCard as BusinessCardData } from '@/lib/api';
import { categoryGradient, initials } from '@/lib/category-visuals';
import { CategoryIcon } from './category-icon';
import { RatingSummary } from './rating-summary';

/**
 * Directory card (SRS DIR 001): image or fallback, name, primary category,
 * local area, review average/count when available, and a detail action.
 *
 * The whole card is one link — the title anchor stretches over it — so there is
 * a single focus stop and one accessible name; the contact action sits above it
 * as a second, explicitly labelled link. Listings without a photograph get a
 * branded panel derived from their category rather than the same grey box.
 */
export function BusinessCard({ business, featured = false }: { business: BusinessCardData; featured?: boolean }) {
  const href = `/business/${encodeURIComponent(business.slug)}`;
  return (
    <article className="ms-on-light ms-card-lift group relative flex h-full flex-col overflow-hidden rounded-card-lg border border-white/80 bg-surface text-text shadow-md backdrop-blur-sm">
      <div className="ms-media-shine relative aspect-[4/3] overflow-hidden">
        {business.image ? (
          <Image
            src={business.image.url}
            alt={business.image.alt ?? ''}
            fill
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          // Intentional branded fallback: it never pretends a photograph exists.
          <div aria-hidden="true" className="flex size-full flex-col items-center justify-center gap-2 text-white/90" style={{ background: categoryGradient(business.primaryCategory.slug) }}>
            <CategoryIcon slug={business.primaryCategory.slug} className="size-9 opacity-80" />
            <span className="font-display text-3xl tracking-wide">{initials(business.name)}</span>
          </div>
        )}
        {featured && (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-navy-900 shadow-sm">Featured</span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
            <CategoryIcon slug={business.primaryCategory.slug} className="size-3.5" />
            {business.primaryCategory.name}
          </span>
          <span className="inline-flex items-center gap-1 text-text-muted">
            <MapPinIcon aria-hidden="true" className="size-3.5" />
            {business.localArea.name}
          </span>
        </p>

        <h3 className="text-lg font-semibold leading-snug tracking-tight">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] group-hover:text-link">
            {business.name}
          </Link>
        </h3>

        <RatingSummary rating={business.rating} className="mt-auto pt-2" />
      </div>

      <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
        <span className="font-semibold text-link">View details</span>
        <Link href={`${href}#contact`} className="relative z-10 inline-flex min-h-9 items-center rounded-lg px-2 text-text-muted underline-offset-4 hover:text-link ms-text-link">
          Contact
        </Link>
      </div>
    </article>
  );
}
