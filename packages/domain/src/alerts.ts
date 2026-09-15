/**
 * How a service alert is presented, shared by every application that draws one
 * (SRS 1.2 ALRT 004, NFR 006).
 *
 * The public site and the admin preview are built with different frameworks —
 * Tailwind and Ant Design — and that is exactly why the *values* live here
 * rather than in either of them. A preview that guesses at the banner's colours
 * is a preview that eventually lies, and the person it lies to is the one
 * deciding whether an emergency is worth interrupting a screen reader for.
 *
 * This module is deliberately plain TypeScript: no runtime dependency, no
 * framework, no CSS. It is exported as its own subpath so the admin bundle picks
 * up a table and nothing else.
 *
 * Adding a severity is a type error in both applications until each has said how
 * it renders — which is the point. Neither app may fall back to "informational"
 * for an unknown severity: a new severity was almost certainly introduced
 * because it matters *more*, and rendering it as the mildest one is the failure
 * mode worth designing out.
 */

export { validateAlertLink, type ValidatedLink } from './urls.js';

export const ALERT_SEVERITIES = ['informational', 'warning', 'emergency'] as const;

export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/**
 * A presentation-neutral name for the band. It is not a colour and not a CSS
 * class: it is what the band *means*, so a design change is a change of hex in
 * one table rather than a rename across two applications.
 */
export type AlertTone = 'notice' | 'caution' | 'critical';

export interface AlertPresentation {
  tone: AlertTone;
  /** The band's background, as a hex value both applications use verbatim. */
  background: string;
  /** Text and link colour on that band; the pair is checked for WCAG 2.2 AA contrast. */
  foreground: string;
  /** What an editor calls this severity. */
  label: string;
  /** What choosing it does, in the words an editor needs before choosing it. */
  guidance: string;
  /**
   * The ARIA role and live-region politeness the API also computes for each
   * published alert. An assertive live region interrupts a screen reader
   * mid-sentence, so it is reserved for a genuine emergency (ALRT 004).
   */
  role: 'alert' | 'status';
  ariaLive: 'assertive' | 'polite';
}

export const ALERT_PRESENTATION: Record<AlertSeverity, AlertPresentation> = {
  informational: {
    tone: 'notice',
    background: '#0D2340',
    foreground: '#FFFFFF',
    label: 'Informational',
    guidance: 'Something worth knowing. It does not stop anyone using the site.',
    role: 'status',
    ariaLive: 'polite',
  },
  warning: {
    tone: 'caution',
    background: '#FEF3C7',
    foreground: '#451A03',
    label: 'Warning',
    guidance: 'Something is degraded or about to change. Visitors may need to act.',
    role: 'status',
    ariaLive: 'polite',
  },
  emergency: {
    tone: 'critical',
    background: '#991B1B',
    foreground: '#FFFFFF',
    label: 'Emergency',
    guidance: 'A genuine outage or safety matter. It interrupts what a screen reader is saying, so keep it for those.',
    role: 'alert',
    ariaLive: 'assertive',
  },
};

/** The presentation for a severity, refusing an unknown one rather than guessing. */
export function alertPresentation(severity: AlertSeverity): AlertPresentation {
  const presentation = ALERT_PRESENTATION[severity];
  if (!presentation) throw new Error(`No presentation is defined for the alert severity "${String(severity)}"`);
  return presentation;
}

/** Relative luminance of a `#rrggbb` colour, per WCAG 2.2. */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Not a six-digit hex colour: ${hex}`);
  const value = match[1]!;
  const channel = (offset: number) => {
    const srgb = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Contrast ratio between two `#rrggbb` colours (WCAG 2.2: 4.5:1 for body text). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}
