import { useEffect } from 'react';

/**
 * Warns before leaving a form with unsaved edits.
 *
 * Nothing in this application saves on its own, so a half-finished listing is
 * lost the moment someone clicks a navigation item — and the editors are long
 * enough that this is easy to do.
 *
 * Two guards, because neither covers the other's case:
 *
 *  * `beforeunload` catches closing the tab, reloading, and following a link out
 *    of the application. The browser's own wording is used; a custom string has
 *    been ignored by every browser for years, and passing one would leave the
 *    reader with a message we did not write.
 *  * A capture-phase click listener catches navigation *inside* the application.
 *    React Router's own `useBlocker` is not available here: it requires a data
 *    router, and the admin is mounted with `BrowserRouter`. Rather than migrate
 *    the router — which would change how every route loads — this intercepts the
 *    click on an internal link before the router sees it.
 *
 * What it does not catch: a programmatic `navigate()` from a component's own
 * code. Those are deliberate moves after an action, which is why the editors
 * clear the dirty flag when they save.
 */
export function useUnsavedChanges(dirty: boolean, message = 'You have unsaved changes. Leave this page without saving?'): void {
  useEffect(() => {
    if (!dirty) return;

    const warnOnUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required by older browsers; the string itself is never displayed.
      event.returnValue = '';
    };

    const warnOnLink = (event: MouseEvent) => {
      // Only a plain left click navigates; a modified click opens a new tab and
      // leaves this page — and its edits — exactly where they are.
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as HTMLElement | null)?.closest?.('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || link.target === '_blank' || link.hasAttribute('download')) return;
      // An address on another origin unloads the page, so `beforeunload` has it.
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith(window.location.origin)) return;
      if (link.pathname === window.location.pathname) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', warnOnUnload);
    // Capture phase: the router's own handler runs on bubble, so this has to see
    // the click first to be able to stop it.
    document.addEventListener('click', warnOnLink, true);
    return () => {
      window.removeEventListener('beforeunload', warnOnUnload);
      document.removeEventListener('click', warnOnLink, true);
    };
  }, [dirty, message]);
}
