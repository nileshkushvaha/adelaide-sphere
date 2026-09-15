/**
 * Whether the visitor has agreed to analytics cookies.
 *
 * Opt-in, not opt-out: nothing is loaded until someone chooses "Accept". That
 * is the safer default under the Privacy Act and the only honest reading of a
 * banner that asks a question — a tracker that has already run before the
 * visitor answers makes the question decorative.
 *
 * The choice lives in `localStorage` rather than a cookie because it is only
 * ever read in the browser: the server renders the same HTML either way, so the
 * page stays cacheable for everyone (SRS CACHE 001).
 */

export const CONSENT_KEY = 'ms.consent.analytics';
export const CONSENT_EVENT = 'ms:consent-changed';
/** Asks the banner to come back after the question has already been answered. */
export const CONSENT_REOPEN_EVENT = 'ms:consent-reopen';

export type ConsentChoice = 'accepted' | 'declined';

/** The stored choice, or null when the visitor has not answered yet. */
export function readConsent(): ConsentChoice | null {
  try {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    return stored === 'accepted' || stored === 'declined' ? stored : null;
  } catch {
    // Private browsing, or storage blocked entirely: treat it as unanswered,
    // which means nothing loads. Refusing to store the answer must never be
    // read as agreement.
    return null;
  }
}

/** Records the choice and tells the page about it in the same tick. */
export function writeConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // The page still honours the choice for this visit even if it cannot be kept.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
}
