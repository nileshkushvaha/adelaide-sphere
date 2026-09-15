'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PauseIcon, PlayIcon } from 'lucide-react';
import { PHRASE_DWELL_MS, PHRASE_TRANSITION_MS, accessibleHeadline, nextPhraseIndex } from '@/lib/hero';

interface Props {
  headline: string;
  phrases: string[];
  /** Longest phrase, rendered invisibly to reserve height so rotation causes no layout shift (SRS HERO 002). */
  children?: never;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function subscribeToVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/**
 * Rotating hero phrase (SRS HERO 002/003). The accessible name is one stable
 * sentence; the visible phrase is `aria-hidden`, so screen readers never hear a
 * per-phrase announcement. Rotation stops under `prefers-reduced-motion`, while
 * the tab is hidden, and whenever the visitor pauses it.
 *
 * The pause control is present but not part of the visual composition (client
 * instruction, 7 Sep 2026): it is off-screen until it receives keyboard focus,
 * then appears in place. HERO 003 and WCAG 2.2 SC 2.2.2 require a mechanism to
 * stop automatically continuing motion, not a permanently visible button.
 */
export function HeroHeadline({ headline, phrases }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Server render assumes reduced motion and a hidden document, so no rotation
  // is implied before hydration reads the real values.
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => true);
  const visible = useSyncExternalStore(subscribeToVisibility, () => !document.hidden, () => false);

  const rotating = phrases.length > 1 && !reducedMotion && !paused && visible;

  useEffect(() => {
    if (!rotating) return;
    timer.current = setTimeout(() => setIndex((i) => nextPhraseIndex(i, phrases.length)), PHRASE_DWELL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [rotating, index, phrases.length]);

  const current = phrases[index] ?? phrases[0] ?? '';
  const canPause = phrases.length > 1 && !reducedMotion;

  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="font-display max-w-5xl text-[clamp(2.2rem,5vw,4.5rem)] leading-[1.02] text-white">
        <span className="sr-only">{accessibleHeadline(headline, phrases)}</span>
        <span aria-hidden="true">
          {headline}
          {phrases.length > 0 && (
            <>
              {' '}
              <span className="relative inline-grid align-bottom">
                {/* Invisible longest phrase reserves the height and width so nothing shifts. */}
                <span className="invisible col-start-1 row-start-1 whitespace-nowrap">{phrases.reduce((a, b) => (b.length > a.length ? b : a), '')}</span>
                <span
                  key={index}
                  className="col-start-1 row-start-1 bg-gradient-to-r from-sky-400 to-[#9dc7ff] bg-clip-text text-transparent motion-safe:animate-[ms-fade_var(--ms-phrase-transition)_ease-out]"
                  style={{ ['--ms-phrase-transition' as string]: `${PHRASE_TRANSITION_MS}ms` }}
                >
                  {current}
                </span>
              </span>
            </>
          )}
        </span>
      </h1>
      {canPause && (
        // Off-screen until focused, then shown in place (client instruction,
        // 7 Sep 2026): the SC 2.2.2 mechanism without a button in the design.
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          aria-label={paused ? 'Resume the rotating text' : 'Pause the rotating text'}
          className="sr-only focus-visible:not-sr-only focus-visible:inline-flex focus-visible:size-11 focus-visible:items-center focus-visible:justify-center focus-visible:rounded-full focus-visible:border focus-visible:border-white/30 focus-visible:bg-black/60 focus-visible:text-hero-text"
        >
          {paused ? <PlayIcon aria-hidden="true" className="size-4" /> : <PauseIcon aria-hidden="true" className="size-4" />}
        </button>
      )}
    </div>
  );
}
