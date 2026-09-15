'use client';

import { useSyncExternalStore } from 'react';
import { CONSENT_EVENT, readConsent, type ConsentChoice } from './consent';

/** The stored answer is shared state; these are the events that change it. */
function subscribe(onChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onChange);
  // Another tab answering the same question counts as answering it here.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * The visitor's current answer, kept in step across the whole page.
 *
 * `undefined` during server rendering and hydration: `localStorage` cannot be
 * read there, and rendering a banner into the HTML that then disappears for
 * everyone who already answered is worse than rendering nothing for one frame.
 * Read through `useSyncExternalStore` rather than an effect so the value is
 * applied by React during render, with no state write after mount.
 */
export function useConsent(): ConsentChoice | null | undefined {
  return useSyncExternalStore(subscribe, readConsent, () => undefined);
}
