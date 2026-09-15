'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { PublicPartner } from '@/lib/api';

/** Gap between entries, matching the `gap-4` on the strip. */
const GAP_PX = 16;

/**
 * The partners strip: each organisation's mark with its name beside it,
 * scrolling one entry at a time once there are more than fit.
 *
 * The name is HTML text rather than part of the logo image. A logo is rendered
 * about forty pixels tall here, so a name drawn into the bitmap came out
 * unreadable and clipped — and text in an image cannot reflow, scale, be
 * selected, be searched or be translated.
 *
 * Same construction as the testimonials slider: an ordinary scrolling list
 * with snapping, so swipe, trackpad, arrow keys and a screen reader all work
 * without script, and nothing moves on its own.
 */
export function PartnerStrip({ partners, tone = 'light' }: { partners: PublicPartner[]; /** `dark` when the strip sits on a navy band. */ tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  const strip = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const [perView, setPerView] = useState(1);

  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const measure = () => {
      const card = element.firstElementChild as HTMLElement | null;
      if (!card) return;
      const step = card.offsetWidth + GAP_PX;
      setPerView(Math.max(1, Math.round((element.clientWidth + GAP_PX) / step)));
      setIndex(Math.round(element.scrollLeft / step));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', measure);
    };
  }, [partners.length]);

  const lastIndex = Math.max(0, partners.length - perView);

  const go = (next: number) => {
    const element = strip.current;
    const card = element?.firstElementChild as HTMLElement | null;
    if (!element || !card) return;
    const target = Math.min(lastIndex, Math.max(0, next));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollTo({ left: target * (card.offsetWidth + GAP_PX), behavior: reduced ? 'auto' : 'smooth' });
  };

  const control = `inline-flex size-11 shrink-0 items-center justify-center rounded-full border shadow-sm transition-colors hover:border-sky-400 disabled:cursor-default disabled:opacity-35 ${
    dark ? 'border-white/20 bg-white/10 text-white' : 'border-border bg-white text-navy-900 hover:text-link'
  }`;
  const card = `flex h-full items-center gap-3 rounded-card border p-4 ${dark ? 'border-white/12 bg-white/[0.06]' : 'border-border bg-white'}`;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3">
        {lastIndex > 0 && (
          <button type="button" className={`${control} hidden sm:inline-flex`} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous partners">
            <ChevronLeftIcon aria-hidden="true" className="size-5" />
          </button>
        )}

        <ul
          ref={strip}
          tabIndex={0}
          aria-label="Organisations we work with"
          className={`ms-gallery-strip flex flex-1 snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 focus-visible:outline-2 focus-visible:outline-offset-4 motion-reduce:scroll-auto ${dark ? 'focus-visible:outline-sky-400' : 'focus-visible:outline-link'}`}
        >
          {partners.map((partner) => {
            const inside = (
              <>
                {/* Decorative: the organisation's name is the text beside it. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- small fixed-size mark from our own media pipeline */}
                <img src={partner.logo.url} alt="" width={partner.logo.width} height={partner.logo.height} className={`size-12 shrink-0 rounded-xl object-contain ${dark ? 'bg-white p-1' : ''}`} />
                <span className="min-w-0">
                  {/* Wrapped to two lines rather than truncated: an organisation
                      cut off mid-word ("Victoria Small Business …") is not a name. */}
                  <span className={`block font-semibold leading-snug ${dark ? 'text-white' : 'text-navy-900'}`}>{partner.name}</span>
                  {partner.relationshipLabel && <span className={`mt-0.5 block text-xs ${dark ? 'text-band-muted' : 'text-text-muted'}`}>{partner.relationshipLabel}</span>}
                </span>
              </>
            );
            return (
              <li key={partner.id} className="w-[17rem] shrink-0 snap-start sm:w-[19rem]">
                {partner.websiteUrl ? (
                  <a
                    href={partner.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${card} transition-colors hover:border-sky-400`}
                  >
                    {inside}
                  </a>
                ) : (
                  <div className={card}>{inside}</div>
                )}
              </li>
            );
          })}
        </ul>

        {lastIndex > 0 && (
          <button type="button" className={`${control} hidden sm:inline-flex`} onClick={() => go(index + 1)} disabled={index >= lastIndex} aria-label="Next partners">
            <ChevronRightIcon aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>

      {lastIndex > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center">
          {Array.from({ length: lastIndex + 1 }, (_, position) => (
            <button
              key={position}
              type="button"
              onClick={() => go(position)}
              className="inline-flex size-11 items-center justify-center"
              aria-label={`Show partner ${position + 1} of ${lastIndex + 1}`}
              aria-current={position === index ? 'true' : undefined}
            >
              <span aria-hidden="true" className={`rounded-full transition-all ${position === index ? 'size-2.5 bg-sky-500' : `size-2 ${dark ? 'bg-white/35' : 'bg-border-strong'}`}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
