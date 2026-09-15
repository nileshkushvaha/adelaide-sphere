import { readConsent } from './consent';

/**
 * Blog analytics events (SRS 1.10 BLOG 006). Only these names can be sent, so
 * a typo or a new call site cannot quietly start collecting something else.
 */
export const ANALYTICS_EVENTS = ['share', 'copy_link', 'article_read_75', 'related_click', 'blog_search', 'embed_load', 'business_card_click', 'toc_click'] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export type AnalyticsParams = Record<string, string | number | boolean>;

const PARAM_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_PARAMS = 8;
const MAX_TEXT = 100;

export function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  return typeof value === 'string' && (ANALYTICS_EVENTS as readonly string[]).includes(value);
}

/**
 * Keeps only short, plain values under simple names. Call sites pass paths,
 * slugs, counts and provider names — never what someone typed, their email or
 * a query string — and this is the second line of that rule.
 */
export function cleanParams(params: Record<string, unknown>): AnalyticsParams {
  const clean: AnalyticsParams = {};
  for (const [name, value] of Object.entries(params)) {
    if (Object.keys(clean).length >= MAX_PARAMS) break;
    if (!PARAM_NAME.test(name)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) clean[name] = value;
    else if (typeof value === 'boolean') clean[name] = value;
    else if (typeof value === 'string' && value.trim() && !value.includes('@') && !value.includes('?')) clean[name] = value.trim().slice(0, MAX_TEXT);
  }
  return clean;
}

type AnalyticsWindow = Window & { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] };

/**
 * Sends one event, and only when the visitor has accepted analytics. Returns
 * whether anything was sent. With consent but no Google tag on the page (none
 * configured, or blocked), nothing happens. Events go to Google Analytics or
 * Tag Manager only; the Meta pixel is never sent reading or search behaviour.
 */
export function track(event: AnalyticsEvent, params: Record<string, unknown> = {}): boolean {
  if (typeof window === 'undefined' || !isAnalyticsEvent(event)) return false;
  // Private previews are never measured; their address carries the preview token.
  if (window.location?.pathname?.startsWith('/preview/')) return false;
  if (readConsent() !== 'accepted') return false;
  const w = window as AnalyticsWindow;
  const clean = cleanParams(params);
  try {
    if (typeof w.gtag === 'function') {
      w.gtag('event', event, clean);
      return true;
    }
    if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push({ event, ...clean });
      return true;
    }
  } catch {
    // Analytics failing must never affect the page (SRS NFR 012).
  }
  return false;
}
