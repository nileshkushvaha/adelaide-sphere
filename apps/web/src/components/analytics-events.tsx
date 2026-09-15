'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isAnalyticsEvent, track, type AnalyticsEvent } from '@/lib/track';

/** How far through an article counts as read. */
const READ_THRESHOLD = 0.75;

/**
 * Blog analytics (SRS 1.10 BLOG 006), mounted once in the layout. Server
 * components mark areas with `data-track="<event>"`; a click on a link inside
 * one sends that event with the link's path (never its query string). An
 * article body marked `data-track-read="<slug>"` sends one `article_read_75`
 * per page view. `track` sends nothing without the visitor's consent.
 */
export function AnalyticsEvents() {
  const pathname = usePathname();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a');
      const zone = link?.closest<HTMLElement>('[data-track]');
      if (!link || !zone || !isAnalyticsEvent(zone.dataset.track)) return;
      const href = link.getAttribute('href') ?? '';
      const params: Record<string, unknown> = {};
      if (href.startsWith('#')) params.section = href.slice(1);
      else if (href.startsWith('/')) params.link_path = href.split(/[?#]/)[0];
      if (link.dataset.trackMethod) params.method = link.dataset.trackMethod;
      track(zone.dataset.track, params);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    const body = document.querySelector<HTMLElement>('[data-track-read]');
    if (!body) return;
    let sent = false;
    let frame = 0;
    const check = () => {
      frame = 0;
      const rect = body.getBoundingClientRect();
      if (rect.height > 0 && window.innerHeight - rect.top >= rect.height * READ_THRESHOLD) {
        sent = track('article_read_75', { article: body.dataset.trackRead });
        // Stops once sent. Until then it keeps checking, so a reader who
        // accepts analytics part-way through is still counted once.
        if (sent) window.removeEventListener('scroll', onScroll);
      }
    };
    const onScroll = () => {
      if (!sent && !frame) frame = window.requestAnimationFrame(check);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    // Checked once at the start too: a short article, or a page opened already scrolled, never scrolls past the point.
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}

/** Sends one event when shown, e.g. how many results a blog search found (never the words searched for). */
export function TrackOnView({ event, params }: { event: AnalyticsEvent; params: Record<string, string | number | boolean> }) {
  const key = JSON.stringify(params);
  useEffect(() => {
    track(event, JSON.parse(key) as Record<string, unknown>);
  }, [event, key]);
  return null;
}
