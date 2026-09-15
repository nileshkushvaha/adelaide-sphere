import { deviceSummary } from './device-summary.js';

/**
 * Recognisable, not identifying (SRS 1.2 SECS 005). These check the summary
 * says browser and platform and nothing that could support a fingerprinting
 * claim.
 */
describe('deviceSummary', () => {
  it('names the browser family and platform', () => {
    expect(deviceSummary('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36')).toBe('Chrome on macOS');
    expect(deviceSummary('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0')).toBe('Edge on Windows');
    expect(deviceSummary('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS');
    expect(deviceSummary('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('Firefox on Linux');
    expect(deviceSummary('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36')).toBe('Chrome on Android');
  });

  it('prefers the more specific browser when several names appear', () => {
    // Edge and Opera both advertise Chrome and Safari in their user agents.
    expect(deviceSummary('Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36 OPR/115.0')).toBe('Opera on Windows');
  });

  it('says so plainly when it cannot tell', () => {
    expect(deviceSummary(null)).toBe('Unknown device');
    expect(deviceSummary('')).toBe('Unknown device');
    expect(deviceSummary('curl/8.7.1')).toBe('Unknown device');
  });

  it('never returns the user agent itself, however unusual it is', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Build 22631.4169; Serial ABC-123) Chrome/140.0.7259.2 Safari/537.36';
    const summary = deviceSummary(ua);
    expect(summary).toBe('Chrome on Windows');
    expect(summary).not.toContain('22631');
    expect(summary).not.toContain('ABC-123');
    expect(summary).not.toContain('140.0.7259.2');
  });
});
