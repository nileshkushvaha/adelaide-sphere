/**
 * Which analytics a site has configured.
 *
 * Plain module, deliberately not a client one: the server decides whether to
 * render the analytics components at all, and a helper exported from a
 * `'use client'` file cannot be called during server rendering.
 */

export interface AnalyticsIds {
  googleAnalyticsId: string | null;
  googleTagManagerId: string | null;
  facebookPixelId: string | null;
}

/** True when there is anything to ask the visitor about. */
export function hasAnalytics(ids: AnalyticsIds | undefined | null): ids is AnalyticsIds {
  return Boolean(ids && (ids.googleAnalyticsId || ids.googleTagManagerId || ids.facebookPixelId));
}
