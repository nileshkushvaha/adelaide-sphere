'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Image from 'next/image';
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from 'lucide-react';

export interface HeroSlide {
  url: string;
  previewUrl: string;
  alt: string;
  caption: string | null;
  focalX: number;
  focalY: number;
  width: number;
  height: number;
}

interface Props {
  slides: HeroSlide[];
  children: ReactNode;
}

/** Slide dwell; deliberately slower than the phrase rotation so the two never compete. */
const SLIDE_DWELL_MS = 7000;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const subscribeToReducedMotion = (onChange: () => void) => {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const subscribeToVisibility = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};

/**
 * Hero banner (SRS HERO 001/003): a full-bleed Melbourne photograph behind a
 * directional navy gradient, with the headline and search panel fixed on top.
 * Slides cross-fade in place, so the rotation never moves the layout; it stops
 * under `prefers-reduced-motion`, while the tab is hidden, and whenever the
 * visitor pauses it.
 *
 * The pause control is present but not part of the visual composition (client
 * instruction, 7 Sep 2026): it is off-screen until it receives keyboard focus,
 * then appears in place. HERO 003 and WCAG 2.2 SC 2.2.2 require a mechanism to
 * stop automatically continuing motion, not a permanently visible button, and
 * this keeps one reachable by keyboard and announced to screen readers while the
 * banner stays uncluttered. Stepping through the images with previous, next or a
 * dot also stops the rotation, so a mouse user has a way to stop it too.
 *
 * The first slide is server-rendered and prioritised, and a navy gradient sits
 * underneath so the hero is still a designed banner if the photograph fails to
 * load or none is configured.
 */
export function HeroBanner({ slides, children }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => true);
  const visible = useSyncExternalStore(subscribeToVisibility, () => !document.hidden, () => false);
  const rotating = slides.length > 1 && !reducedMotion && !paused && visible;

  useEffect(() => {
    if (!rotating) return;
    timer.current = setTimeout(() => setIndex((current) => (current + 1) % slides.length), SLIDE_DWELL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [rotating, index, slides.length]);

  const go = (next: number) => {
    // Stepping through the images is itself a request to stop the rotation.
    setPaused(true);
    setIndex((next + slides.length) % slides.length);
  };

  const control = 'inline-flex size-11 items-center justify-center rounded-full border border-white/30 bg-black/30 text-white backdrop-blur transition-colors hover:bg-black/50';

  return (
    <section
      aria-label="Adelaide Sphere"
      className="ms-on-dark relative z-10 isolate flex min-h-[31rem] items-center overflow-x-clip bg-navy-950 py-9 text-band-text sm:min-h-[33rem] sm:py-10 lg:min-h-[34rem]"
    >
      {/* Designed fallback: present whether or not a photograph loads (SRS HERO 001). */}
      <div aria-hidden="true" className="absolute inset-0 -z-30 bg-[radial-gradient(120%_120%_at_10%_-10%,var(--ms-navy-700)_0%,var(--ms-band)_45%,var(--ms-band-deep)_100%)]" />

      {slides.map((slide, position) => (
        <div key={slide.url} aria-hidden={position !== index} className={`absolute inset-0 -z-20 transition-opacity duration-700 ${position === index ? 'opacity-100' : 'opacity-0'}`}>
          <Image
            src={slide.url}
            alt=""
            fill
            priority={position === 0}
            fetchPriority={position === 0 ? 'high' : 'auto'}
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: `${slide.focalX * 100}% ${slide.focalY * 100}%` }}
          />
        </div>
      ))}

      {/* Two overlays. The directional wash is opaque enough over the text
          column to hold WCAG contrast on any photograph — including the bright
          daytime laneway — and clears to almost nothing on the right so the
          picture is still the banner. The base scrim carries the controls and
          the photo credit. */}
      {/* Narrow screens have no "empty" side of the photograph to clear, so they
          get an even tint; from `sm` up the wash is directional. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-navy-950/80 sm:hidden" />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 hidden bg-[linear-gradient(90deg,rgba(1,26,85,0.96)_0%,rgba(1,26,85,0.88)_30%,rgba(1,26,85,0.58)_55%,rgba(1,26,85,0.18)_82%,rgba(1,26,85,0.08)_100%)] sm:block"
      />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-navy-950/70 to-transparent" />

      <div className="ms-container relative w-full">
        {children}

        {slides.length > 1 && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => go(index - 1)} aria-label="Previous banner image" className={control}>
              <ChevronLeftIcon aria-hidden="true" className="size-5" />
            </button>
            <button type="button" onClick={() => go(index + 1)} aria-label="Next banner image" className={control}>
              <ChevronRightIcon aria-hidden="true" className="size-5" />
            </button>
            {!reducedMotion && (
              // Off-screen until focused, then shown in place: the mechanism
              // WCAG 2.2 SC 2.2.2 and HERO 003 require, without a button in the
              // visual composition.
              <button
                type="button"
                onClick={() => setPaused((current) => !current)}
                aria-pressed={paused}
                className="sr-only focus-visible:not-sr-only focus-visible:inline-flex focus-visible:min-h-11 focus-visible:items-center focus-visible:gap-2 focus-visible:rounded-full focus-visible:border focus-visible:border-white/30 focus-visible:bg-black/60 focus-visible:px-4 focus-visible:text-sm focus-visible:font-medium focus-visible:text-white focus-visible:backdrop-blur"
              >
                {paused ? <PlayIcon aria-hidden="true" className="size-4" /> : <PauseIcon aria-hidden="true" className="size-4" />}
                {paused ? 'Resume the banner' : 'Pause the banner'}
              </button>
            )}
            <ol className="flex items-center gap-2" aria-label="Banner images">
              {slides.map((slide, position) => (
                <li key={slide.url} className="flex">
                  <button
                    type="button"
                    aria-label={`Show banner image ${position + 1} of ${slides.length}`}
                    aria-current={position === index ? 'true' : undefined}
                    onClick={() => go(position)}
                    // 44 px target with a small visible indicator inside it (SRS NFR 011).
                    className="inline-flex size-11 items-center justify-center"
                  >
                    <span aria-hidden="true" className={`h-1.5 rounded-full transition-all ${position === index ? 'w-8 bg-white' : 'w-3 bg-white/50'}`} />
                  </button>
                </li>
              ))}
            </ol>
            {slides[index]?.caption && (
              <p className="w-full rounded-full bg-black/35 px-3 py-1 text-xs text-hero-text backdrop-blur sm:ml-auto sm:w-auto sm:max-w-sm sm:text-right">{slides[index]!.caption}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
