import type { AlertSeverity } from '@adelaide-sphere/domain/alerts';

/**
 * What a preview needs to know about an alert, and what the site will do with
 * it. Kept beside the component rather than inside it so the component file
 * exports components only.
 */
export interface AlertPreviewInput {
  title: string;
  message: string;
  severity: AlertSeverity;
  linkLabel?: string | null;
  linkUrl?: string | null;
  dismissible: boolean;
  /** Instants, not wall clock; the caller has already converted from Adelaide time. */
  startsAt?: string | null;
  endsAt?: string | null;
  status?: 'draft' | 'published';
}

/** What the site will actually do with this alert right now, in one sentence. */
export function alertVisibility(alert: AlertPreviewInput, now: Date): string {
  const starts = alert.startsAt ? new Date(alert.startsAt) : null;
  const ends = alert.endsAt ? new Date(alert.endsAt) : null;
  if (alert.status !== 'published') return 'Draft — nobody outside this admin can see it. Publishing is a separate step.';
  if (starts && starts.getTime() > now.getTime()) return 'Published, but not yet started. It appears when its display window opens.';
  if (ends && ends.getTime() <= now.getTime()) return 'Published, but its display window has passed, so nothing is shown.';
  return 'Showing now, above the header on every public page.';
}

