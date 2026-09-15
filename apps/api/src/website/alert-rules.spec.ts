import { alertRoleFor, ariaLiveFor, isWithinWindow, selectVisibleAlerts, validateAlertLink, type SelectableAlert } from './alert-rules.js';

const alert = (overrides: Partial<SelectableAlert> & { id: string }): SelectableAlert => ({
  severity: 'informational',
  priority: 0,
  displayOrder: 0,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  startsAt: null,
  endsAt: null,
  ...overrides,
});

const now = new Date('2026-09-07T02:00:00Z'); // 11:30 on 7 September in Adelaide (ACST)

describe('service alert selection (SRS 1.2 ALRT 002/003)', () => {
  it('shows an alert with no window at all', () => {
    expect(isWithinWindow({ startsAt: null, endsAt: null }, now)).toBe(true);
  });

  it('respects both bounds, and treats the end as exclusive', () => {
    expect(isWithinWindow({ startsAt: new Date('2026-09-07T03:00:00Z'), endsAt: null }, now)).toBe(false);
    expect(isWithinWindow({ startsAt: new Date('2026-09-07T01:00:00Z'), endsAt: null }, now)).toBe(true);
    expect(isWithinWindow({ startsAt: null, endsAt: new Date('2026-09-07T02:00:00Z') }, now)).toBe(false);
    expect(isWithinWindow({ startsAt: null, endsAt: new Date('2026-09-07T02:00:01Z') }, now)).toBe(true);
  });

  it('orders by severity first, so an emergency is never queued behind a promotion', () => {
    const selected = selectVisibleAlerts(
      [alert({ id: 'promo', priority: 99 }), alert({ id: 'outage', severity: 'emergency', priority: 0 })],
      now,
    );
    expect(selected.map((a) => a.id)).toEqual(['outage', 'promo']);
  });

  it('breaks every tie deterministically, so the same state always renders the same order', () => {
    const same = { severity: 'warning' as const, priority: 5, displayOrder: 1, createdAt: new Date('2026-09-02T00:00:00Z') };
    const forwards = selectVisibleAlerts([alert({ id: 'b', ...same }), alert({ id: 'a', ...same })], now);
    const backwards = selectVisibleAlerts([alert({ id: 'a', ...same }), alert({ id: 'b', ...same })], now);
    expect(forwards.map((a) => a.id)).toEqual(['a', 'b']);
    expect(backwards.map((a) => a.id)).toEqual(forwards.map((a) => a.id));
  });

  it('bounds how many render at once', () => {
    const many = ['a', 'b', 'c', 'd'].map((id) => alert({ id }));
    expect(selectVisibleAlerts(many, now)).toHaveLength(2);
  });

  it('drops an alert whose window has passed even when it is the highest severity', () => {
    const expired = alert({ id: 'old', severity: 'emergency', endsAt: new Date('2026-09-06T00:00:00Z') });
    expect(selectVisibleAlerts([expired, alert({ id: 'current' })], now).map((a) => a.id)).toEqual(['current']);
  });

  it('is unaffected by the daylight saving change, because it compares instants', () => {
    // Adelaide moves to ACDT at 02:00 on 4 October 2026 (16:30 UTC on 3 October).
    const beforeChange = new Date('2026-10-03T16:29:00Z');
    const afterChange = new Date('2026-10-03T16:31:00Z');
    const window = { startsAt: new Date('2026-10-03T16:30:00Z'), endsAt: new Date('2026-10-04T16:30:00Z') };
    expect(isWithinWindow(window, beforeChange)).toBe(false);
    expect(isWithinWindow(window, afterChange)).toBe(true);
  });
});

describe('service alert links (SRS 1.2 ALRT 005)', () => {
  it('trims surrounding whitespace rather than refusing an otherwise valid path', () => {
    expect(validateAlertLink('  /business  ')).toEqual({ url: '/business', external: false });
  });

  it('accepts a site-relative path and an https URL', () => {
    expect(validateAlertLink('/business')).toEqual({ url: '/business', external: false });
    expect(validateAlertLink('/blog/some-article?utm=1#top')).toMatchObject({ external: false });
    expect(validateAlertLink('https://adelaidesphere.com/help')).toMatchObject({ external: true });
  });

  it('refuses every destination that is not a plain path or an http(s) URL', () => {
    for (const unsafe of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      '//evil.example/path',
      'file:///etc/passwd',
      'https://user:pass@evil.example',
      '/path\\with\\backslashes',
      '',
      '   ',
      'x'.repeat(301),
    ]) {
      expect(validateAlertLink(unsafe), unsafe).toBeNull();
    }
  });
});

describe('service alert accessibility (SRS 1.2 ALRT 004)', () => {
  it('reserves the assertive announcement for a genuine emergency', () => {
    expect(ariaLiveFor('emergency')).toBe('assertive');
    expect(alertRoleFor('emergency')).toBe('alert');
    for (const severity of ['informational', 'warning'] as const) {
      expect(ariaLiveFor(severity)).toBe('polite');
      expect(alertRoleFor(severity)).toBe('status');
    }
  });
});
