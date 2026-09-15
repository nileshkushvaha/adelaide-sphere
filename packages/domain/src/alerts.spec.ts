import { describe, expect, it } from 'vitest';
import { ALERT_PRESENTATION, ALERT_SEVERITIES, alertPresentation, contrastRatio } from './alerts.js';

describe('alert presentation', () => {
  it('describes every severity exactly once', () => {
    expect(Object.keys(ALERT_PRESENTATION).sort()).toEqual([...ALERT_SEVERITIES].sort());
    const tones = ALERT_SEVERITIES.map((severity) => ALERT_PRESENTATION[severity].tone);
    expect(new Set(tones).size, 'two severities sharing a tone would be indistinguishable on the page').toBe(tones.length);
  });

  it('meets WCAG 2.2 AA contrast on every band', () => {
    for (const severity of ALERT_SEVERITIES) {
      const { background, foreground } = ALERT_PRESENTATION[severity];
      expect(contrastRatio(background, foreground), `${severity} band`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('reserves an assertive live region for an emergency', () => {
    // Anything else interrupts a screen reader mid-sentence for a promotion.
    expect(alertPresentation('emergency')).toMatchObject({ role: 'alert', ariaLive: 'assertive' });
    expect(alertPresentation('warning')).toMatchObject({ role: 'status', ariaLive: 'polite' });
    expect(alertPresentation('informational')).toMatchObject({ role: 'status', ariaLive: 'polite' });
  });

  it('refuses a severity it has no presentation for rather than guessing at the mildest one', () => {
    expect(() => alertPresentation('catastrophic' as never)).toThrow(/no presentation/i);
  });
});
