'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const GROUP = '.ms-card-lift, .ms-icon-point, .ms-product-aside, .ms-content-panel';
const TARGETS = `${GROUP}, main h1, main h2, main p, footer nav`;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Logimart entrance timings, with no pre-hidden content or imperative text rewriting. */
export function PageMotion() {
  const pathname = usePathname();
  useEffect(() => {
    if (!window.IntersectionObserver || !Element.prototype.animate) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const seen = new WeakSet<Element>();
    const active = new Map<Animation, Element>();
    let frame = 0;
    const stop = () => {
      active.forEach((_, animation) => animation.cancel());
      active.clear();
    };
    const play = (element: Element, frames: Keyframe[], duration: number, delay: number) => {
      const animation = element.animate(frames, { duration, delay, easing: EASE, fill: 'backwards' });
      active.set(animation, element);
      void animation.finished.then(() => active.delete(animation), () => active.delete(animation));
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target;
        observer.unobserve(element);
        if (media.matches || element.contains(document.activeElement)) continue;
        const characters = element.querySelectorAll('.ms-heading-character');
        if (characters.length) {
          characters.forEach((character, index) => play(character, [
            { opacity: 0, translate: '40px 0' }, { opacity: 1, translate: '0 0' },
          ], 900, Math.min(index * 20, 360)));
        } else {
          const isHeading = element.matches('h1, h2');
          const item = element.parentElement?.matches('li') ? element.parentElement : element;
          const index = Array.from(item.parentElement?.children ?? []).indexOf(item);
          play(element, [
            { opacity: 0, translate: isHeading ? '34px 0' : '0 26px' },
            { opacity: 1, translate: '0 0' },
          ], isHeading ? 900 : 800, Math.min(Math.max(index, 0) * 90, 270));
        }
      }
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });
    const scan = () => {
      frame = 0;
      document.querySelectorAll(TARGETS).forEach((element) => {
        if (seen.has(element) || element.closest('form, [role="alert"], [aria-hidden="true"], [data-motion-skip]')) return;
        if (element.querySelector('form') || element.parentElement?.closest(GROUP)) return;
        seen.add(element);
        if (!media.matches) observer.observe(element);
      });
    };
    const mutations = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(scan);
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    // Never let a keyboard focus target continue fading or moving.
    const onFocus = () => stop();
    const onPreference = () => { if (media.matches) { stop(); observer.disconnect(); } else scan(); };
    media.addEventListener('change', onPreference);
    document.addEventListener('focusin', onFocus);
    scan();
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      observer.disconnect();
      stop();
      media.removeEventListener('change', onPreference);
      document.removeEventListener('focusin', onFocus);
    };
  }, [pathname]);
  return null;
}
