'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';

export interface GalleryPhoto {
  alt: string;
  caption: string | null;
  variants: { kind: 'thumbnail' | 'card' | 'hero'; url: string; width: number; height: number }[];
}

interface Props {
  photos: GalleryPhoto[];
  businessName: string;
}

/**
 * The listing's photographs as a strip that slides one picture at a time.
 *
 * It is a scrolling list first and a carousel second: the pictures sit in an
 * ordinary horizontally scrolling `<ul>` with scroll snapping, so touch, a
 * trackpad, the arrow keys on the focused strip and a screen reader all work
 * without any script, and the previous/next buttons only move that scroll.
 * Nothing advances on its own — a gallery that moves while someone reads a
 * caption is the kind of motion WCAG 2.2.2 exists to stop — and the strip
 * respects `prefers-reduced-motion` by scrolling without animation.
 *
 * Each picture is a button that opens it at full size in a native `<dialog>`:
 * the browser handles focus trapping, Escape and the backdrop, so the viewer
 * costs no library and behaves the way every other modal on the platform does.
 */
export function PhotoGallery({ photos, businessName }: Props) {
  const strip = useRef<HTMLUListElement>(null);
  const viewer = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const count = photos.length;

  useEffect(() => {
    const dialog = viewer.current;
    if (!dialog) return;
    if (open !== null && !dialog.open) dialog.showModal();
    if (open === null && dialog.open) dialog.close();
  }, [open]);

  const step = (delta: number) => setOpen((current) => (current === null ? null : (current + delta + count) % count));

  // Which picture is in view, from the scroll position rather than a counter,
  // so a swipe and a button press agree about where the strip is.
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const onScroll = () => {
      const slide = element.firstElementChild as HTMLElement | null;
      if (!slide) return;
      setIndex(Math.round(element.scrollLeft / (slide.offsetWidth + 12)));
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, []);

  const go = (delta: number) => {
    const element = strip.current;
    const slide = element?.firstElementChild as HTMLElement | null;
    if (!element || !slide) return;
    const next = Math.min(count - 1, Math.max(0, index + delta));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollTo({ left: next * (slide.offsetWidth + 12), behavior: reduced ? 'auto' : 'smooth' });
  };

  if (count === 0) return null;

  const control = 'inline-flex size-11 items-center justify-center rounded-full border border-border bg-white text-navy-900 shadow-sm transition-colors hover:bg-surface-sunken disabled:cursor-default disabled:opacity-40';

  return (
    <section aria-labelledby="photos-heading" className="rounded-card-lg border border-white/80 bg-white/82 p-6 shadow-md backdrop-blur-sm sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <h2 id="photos-heading" className="font-display text-2xl tracking-tight">
          Photos
        </h2>
        {count > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-muted" aria-live="polite">
              {index + 1} of {count}
            </span>
            <button type="button" className={control} onClick={() => go(-1)} disabled={index === 0} aria-label="Previous photo">
              <ChevronLeftIcon aria-hidden="true" className="size-5" />
            </button>
            <button type="button" className={control} onClick={() => go(1)} disabled={index === count - 1} aria-label="Next photo">
              <ChevronRightIcon aria-hidden="true" className="size-5" />
            </button>
          </div>
        )}
      </div>

      <ul
        ref={strip}
        aria-label={`Photographs of ${businessName}`}
        tabIndex={0}
        className="ms-gallery-strip mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-link motion-reduce:scroll-auto"
      >
        {photos.map((photo, position) => {
          const picture = photo.variants.find((variant) => variant.kind === 'card') ?? photo.variants.find((variant) => variant.kind === 'hero') ?? photo.variants[0];
          if (!picture) return null;
          return (
            <li key={picture.url} className="w-[85%] shrink-0 snap-start sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.5rem)]">
              <figure>
                <button
                  type="button"
                  onClick={() => setOpen(position)}
                  aria-label={`View photo ${position + 1} of ${count} at full size${photo.alt ? `: ${photo.alt}` : ''}`}
                  className="relative block aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-card bg-navy-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
                >
                  <Image src={picture.url} alt="" fill sizes="(min-width: 1024px) 22rem, (min-width: 640px) 50vw, 85vw" className="object-cover transition-transform duration-300 hover:scale-[1.03] motion-reduce:transition-none" loading={position === 0 ? 'eager' : 'lazy'} />
                </button>
                {photo.caption && <figcaption className="mt-2 text-sm text-text-muted">{photo.caption}</figcaption>}
              </figure>
            </li>
          );
        })}
      </ul>

      <dialog
        ref={viewer}
        onClose={() => setOpen(null)}
        onClick={(event) => {
          // A click on the backdrop — the dialog element itself, outside its
          // content — closes it; a click on the picture or a control does not.
          if (event.target === event.currentTarget) setOpen(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') step(1);
          if (event.key === 'ArrowLeft') step(-1);
        }}
        aria-label={`Photo viewer, ${businessName}`}
        className="m-auto max-h-[100dvh] max-w-[100vw] bg-transparent p-0 backdrop:bg-navy-950/90 backdrop:backdrop-blur-sm"
      >
        {open !== null && photos[open] && (() => {
          const photo = photos[open]!;
          const full = photo.variants.find((variant) => variant.kind === 'hero') ?? photo.variants[photo.variants.length - 1]!;
          return (
            <figure className="flex max-h-[100dvh] w-[min(96vw,72rem)] flex-col items-center gap-3 p-4 text-white sm:p-6">
              <div className="flex w-full items-center justify-between gap-3">
                <span className="text-sm text-white/80" aria-live="polite">
                  {open + 1} of {count}
                </span>
                <div className="flex items-center gap-2">
                  {count > 1 && (
                    <>
                      <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="inline-flex size-11 items-center justify-center rounded-full border border-white/30 bg-black/30 text-white hover:bg-black/50">
                        <ChevronLeftIcon aria-hidden="true" className="size-5" />
                      </button>
                      <button type="button" onClick={() => step(1)} aria-label="Next photo" className="inline-flex size-11 items-center justify-center rounded-full border border-white/30 bg-black/30 text-white hover:bg-black/50">
                        <ChevronRightIcon aria-hidden="true" className="size-5" />
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => setOpen(null)} aria-label="Close photo viewer" className="inline-flex size-11 items-center justify-center rounded-full border border-white/30 bg-black/30 text-white hover:bg-black/50">
                    <XIcon aria-hidden="true" className="size-5" />
                  </button>
                </div>
              </div>
              {/* Sized by its own dimensions rather than `fill`: the dialog is sized by the viewport, not by a layout box. */}
              <Image src={full.url} alt={photo.alt} width={full.width} height={full.height} sizes="96vw" className="max-h-[80dvh] w-auto max-w-full rounded-card object-contain" />
              {photo.caption && <figcaption className="text-sm text-white/80">{photo.caption}</figcaption>}
            </figure>
          );
        })()}
      </dialog>
    </section>
  );
}
