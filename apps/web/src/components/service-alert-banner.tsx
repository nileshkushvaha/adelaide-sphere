'use client';

import { useState, useSyncExternalStore } from 'react';
import { alertPresentation, type AlertSeverity } from '@adelaide-sphere/domain/alerts';
import type { PublicServiceAlert } from '@/lib/api';

const STORAGE_PREFIX = 'ms.alert.dismissed.';

/** Keyed by content version, so editing an alert brings it back (SRS 1.2 ALRT 006). */
const storageKey = (alert: PublicServiceAlert) => `${STORAGE_PREFIX}${alert.id}.${alert.contentVersion}`;

/** Another tab dismissing the same alert should be reflected here too. */
function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

function wasDismissed(alert: PublicServiceAlert): boolean {
  try {
    return window.localStorage.getItem(storageKey(alert)) === '1';
  } catch {
    // No storage — a private window, cleared data, a viewer who blocks it.
    // Showing the alert is the safe direction.
    return false;
  }
}

/**
 * One alert. Dismissal is a real button, keyboard operable, with an accessible
 * name that says which alert it closes; the state lives only in this browser and
 * carries no personal data. Storage being unavailable — a private window,
 * cleared data, a viewer who blocks it — shows the alert, never an error.
 */
export function ServiceAlertBanner({ alert }: { alert: PublicServiceAlert }) {
  // The server snapshot is "not dismissed", so the markup always matches on
  // hydration; the stored value is read on the client and applied by React
  // rather than by a state write inside an effect.
  const storedDismissal = useSyncExternalStore(subscribeToStorage, () => wasDismissed(alert), () => false);
  const [dismissedHere, setDismissedHere] = useState(false);
  const dismissed = dismissedHere || storedDismissal;

  if (dismissed) return null;

  const dismiss = () => {
    // Held in component state as well, so dismissal works for this page view
    // even when storage is unavailable.
    setDismissedHere(true);
    try {
      window.localStorage.setItem(storageKey(alert), '1');
    } catch {
      // Dismissal for this page view only; nothing else is affected.
    }
  };

  // The band's colours come from the shared table rather than from classes here,
  // so the admin's preview and this banner cannot drift apart; an unknown
  // severity throws rather than rendering as the mildest one (SRS 1.2 ALRT 004).
  const presentation = alertPresentation(alert.severity as AlertSeverity);

  return (
    <div
      role={alert.role}
      aria-live={alert.ariaLive}
      data-tone={presentation.tone}
      style={{ background: presentation.background, color: presentation.foreground }}
      className="px-4 py-2.5 text-sm"
    >
      <div className="ms-container flex items-start justify-between gap-4">
        <p className="min-w-0">
          <strong className="font-semibold">{alert.title}</strong> <span>{alert.message}</span>
          {alert.linkUrl && alert.linkLabel && (
            <>
              {' '}
              <a
                href={alert.linkUrl}
                className="font-semibold underline underline-offset-4"
                {...(alert.linkExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {alert.linkLabel}
              </a>
            </>
          )}
        </p>
        {alert.dismissible && (
          <button
            type="button"
            onClick={dismiss}
            className="-my-1 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-current underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            <span aria-hidden="true">×</span>
            <span className="sr-only">Dismiss the alert: {alert.title}</span>
          </button>
        )}
      </div>
    </div>
  );
}
