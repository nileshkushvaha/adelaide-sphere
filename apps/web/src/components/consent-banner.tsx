'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CONSENT_REOPEN_EVENT, writeConsent } from '@/lib/consent';
import { useConsent } from '@/lib/use-consent';

/**
 * Asks once whether analytics cookies are allowed, and lets the answer be
 * changed afterwards (SRS NFR 011 for the interaction itself).
 *
 * Deliberate choices:
 *
 *  * It is opt-in. Nothing is loaded before an answer, and "Decline" is a
 *    button of the same weight as "Accept" — a banner where refusing is a grey
 *    link is not a choice.
 *  * It is not a modal and does not trap focus. Refusing to answer must leave
 *    the site completely usable, so the banner sits at the end of the document
 *    and can simply be ignored or tabbed past.
 *  * It renders nothing at all when nothing would be loaded anyway, so a site
 *    with no analytics configured never asks a pointless question.
 *  * It is announced politely rather than assertively: it is not an error and
 *    should not interrupt a screen reader mid-sentence.
 */
export function ConsentBanner({
  configured,
  providers = [],
  privacyHref = null,
}: {
  configured: boolean;
  /** Who receives the data, e.g. ["Google"] or ["Google", "Meta"], from the configured analytics. */
  providers?: string[];
  /** The published privacy policy; without one no link is shown, so the banner never points at a missing page. */
  privacyHref?: string | null;
}) {
  const choice = useConsent();
  const banner = useRef<HTMLDivElement>(null);
  // Re-opened from the footer, even though a choice has already been made.
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(CONSENT_REOPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, open);
  }, []);

  useEffect(() => {
    // When the visitor asked for it, move the reading position to it; when it
    // appears on its own, leave focus where the visitor put it.
    if (reopened) banner.current?.focus();
  }, [reopened]);

  if (!configured) return null;
  // `undefined` means the stored answer has not been read yet.
  if (choice === undefined) return null;
  if (choice !== null && !reopened) return null;

  // A Meta pixel is used for advertising as well as measurement, so the purpose says so.
  const purpose = providers.includes('Meta') ? 'analytics and advertising cookies' : 'analytics cookies';
  const from = providers.length > 1 ? `${providers.slice(0, -1).join(', ')} and ${providers.at(-1)}` : (providers[0] ?? '');

  const answer = (value: 'accepted' | 'declined') => {
    writeConsent(value);
    setReopened(false);
  };

  return (
    <div
      ref={banner}
      tabIndex={-1}
      role="region"
      aria-live="polite"
      aria-label="Cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:border-slate-700 dark:bg-slate-900/95"
    >
      <div className="ms-container flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-slate-700 dark:text-slate-200">
          We’d like to use {purpose}
          {from ? ` from ${from}` : ''} to understand how people use this site and improve it. These cookies are only set if you accept, and you can change your choice at any time
          with “Cookie choices” at the bottom of the page.
          {privacyHref && (
            <>
              {' '}
              <Link href={privacyHref} className="font-medium underline underline-offset-4">
                Read our privacy policy
              </Link>
            </>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => answer('declined')}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => answer('accepted')}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            Accept analytics
          </button>
        </div>
      </div>
    </div>
  );
}

/** Footer control that brings the question back, once it has been answered. */
export function ConsentPreferencesLink() {
  const choice = useConsent();
  if (choice === undefined || choice === null) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(CONSENT_REOPEN_EVENT))}
      className="underline underline-offset-4 hover:no-underline"
    >
      Cookie choices
    </button>
  );
}
