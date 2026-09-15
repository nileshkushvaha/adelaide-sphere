'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Navigation progress for client-side page changes (SRS NFR 012: the interface
 * says what it is doing). A bar animates across the top of the viewport and a
 * small spinner appears in the corner from the moment an internal link or a
 * GET form is used until the new page is rendered.
 *
 * Deliberately not a `loading.tsx` boundary: a streaming boundary replaces the
 * server-rendered page, and with JavaScript disabled the placeholder is all a
 * visitor ever sees — the defect found during the UAT journeys on /business.
 * This indicator is additive instead, so with JavaScript off nothing renders
 * and every page is still served complete.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  // The address the indicator was started for; the navigation is finished when
  // the rendered address differs from it.
  const startedAt = useRef<string | null>(null);

  useEffect(() => {
    const current = `${pathname}?${searchParams}`;
    if (startedAt.current !== null && startedAt.current !== current) {
      startedAt.current = null;
      setPending(false);
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    const here = () => `${window.location.pathname}${window.location.search}`;

    const start = (href: string) => {
      const target = new URL(href, window.location.href);
      if (target.origin !== window.location.origin) return;
      if (`${target.pathname}${target.search}` === here()) return; // same page: nothing will change
      startedAt.current = `${pathname}?${searchParams}`;
      setPending(true);
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      // A download, a new tab or a non-navigating scheme never replaces this page.
      if (!href || anchor.hasAttribute('download') || anchor.target === '_blank' || /^(mailto:|tel:|#)/.test(href)) return;
      start(anchor.href);
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      if (event.defaultPrevented || (form.method && form.method.toLowerCase() !== 'get')) return;
      start(form.action || window.location.href);
    };

    // A back/forward navigation is served from the client router; clear any bar.
    const onPopState = () => {
      startedAt.current = null;
      setPending(false);
    };

    document.addEventListener('click', onClick, { capture: true });
    document.addEventListener('submit', onSubmit, { capture: true });
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('submit', onSubmit, { capture: true });
      window.removeEventListener('popstate', onPopState);
    };
  }, [pathname, searchParams]);

  return (
    <div aria-live="polite" role="status" className="pointer-events-none">
      <span className="sr-only">{pending ? 'Loading the next page' : ''}</span>
      {pending && (
        <>
          <span aria-hidden="true" className="ms-route-progress" />
          <span aria-hidden="true" className="ms-route-spinner" />
        </>
      )}
    </div>
  );
}
