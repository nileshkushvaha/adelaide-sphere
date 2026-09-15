/**
 * Service alert rules (SRS 1.2 ALRT 002/003/005).
 *
 * Kept apart from the service so the thing worth proving on its own — which
 * alert wins — is testable without a database. The severity table and the link
 * validator live in `@adelaide-sphere/domain`, because the public banner and
 * the admin preview must reach the same verdicts as the server, and are
 * re-exported here so the website module still reads its rules from one place.
 */
import { alertPresentation, validateAlertLink, type AlertSeverity, type ValidatedLink } from '@adelaide-sphere/domain/alerts';

export { validateAlertLink, type ValidatedLink };

// The severity list and how each one is presented and announced live in
// `@adelaide-sphere/domain/alerts`, so the API, the public banner and the admin
// preview cannot disagree about what an emergency looks or sounds like.
export type { AlertSeverity };

/** Highest first. Severity outranks priority: an emergency is never queued behind a promotion. */
const SEVERITY_RANK: Record<AlertSeverity, number> = { emergency: 3, warning: 2, informational: 1 };

/** At most this many alerts render at once; more would bury the page they sit above (ALRT 002). */
export const MAX_VISIBLE_ALERTS = 2;

export interface SelectableAlert {
  id: string;
  severity: AlertSeverity;
  priority: number;
  displayOrder: number;
  createdAt: Date;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** Inside its display window: an absent bound means "from now on" or "until further notice". */
export function isWithinWindow(alert: Pick<SelectableAlert, 'startsAt' | 'endsAt'>, now: Date): boolean {
  if (alert.startsAt && alert.startsAt.getTime() > now.getTime()) return false;
  if (alert.endsAt && alert.endsAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * The deterministic order of ALRT 002: severity, then priority, then display
 * order, then creation time, then id. The last two exist so that two alerts
 * that are equal in every editorial sense still order the same way on every
 * request — a selection that flickers between requests is a caching bug waiting
 * to be filed.
 */
export function selectVisibleAlerts<T extends SelectableAlert>(alerts: readonly T[], now: Date, limit = MAX_VISIBLE_ALERTS): T[] {
  return [...alerts]
    .filter((alert) => isWithinWindow(alert, now))
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        b.priority - a.priority ||
        a.displayOrder - b.displayOrder ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}

/**
 * Accessible semantics by severity (ALRT 004), read from the shared table rather
 * than decided here: an assertive live region interrupts a screen reader
 * mid-sentence, and that decision must be the same one the banner renders.
 */
export function ariaLiveFor(severity: AlertSeverity): 'assertive' | 'polite' {
  return alertPresentation(severity).ariaLive;
}

export function alertRoleFor(severity: AlertSeverity): 'alert' | 'status' {
  return alertPresentation(severity).role;
}
