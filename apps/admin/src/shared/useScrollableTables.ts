import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Makes a horizontally scrolling table reachable from the keyboard.
 *
 * A wide table scrolls inside its own card, which is right — but a scroll
 * container that nothing can focus is unreachable without a mouse or a
 * touchscreen (WCAG 2.1.1; axe calls it `scrollable-region-focusable`). Ant
 * Design gives us no prop for this, so the containers it renders are marked
 * here, once per navigation and on resize, and only while they actually scroll.
 *
 * The name comes from the nearest heading, so a screen reader announces which
 * table is being scrolled rather than "region".
 */
export function useScrollableTables(): void {
  const location = useLocation();

  useEffect(() => {
    const mark = () => {
      for (const element of document.querySelectorAll<HTMLElement>('.ant-table-content, .ant-table-body')) {
        const scrolls = element.scrollWidth - element.clientWidth > 1;
        if (!scrolls) {
          element.removeAttribute('tabindex');
          element.removeAttribute('role');
          element.removeAttribute('aria-label');
          continue;
        }
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'region');
        const heading = element.closest('.ant-card')?.querySelector('h1, h2, h3');
        element.setAttribute('aria-label', heading?.textContent?.trim() ? `${heading.textContent.trim()}, scrollable table` : 'Scrollable table');
      }
    };

    // A table is re-rendered when its data arrives, which replaces the very
    // node we marked; watching the document is the only way to keep up without
    // every table having to remember to ask.
    let pending = 0;
    const schedule = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(mark);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(pending);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [location.pathname]);
}
