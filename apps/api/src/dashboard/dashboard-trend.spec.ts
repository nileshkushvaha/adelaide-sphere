import { describe, expect, it } from 'vitest';
import { bucketByDay, adelaideDay, periods, trailingDays, windowStart } from './dashboard-trend.js';

describe('dashboard trend buckets (Adelaide calendar days)', () => {
  it('dates an instant by the Adelaide clock, not UTC', () => {
    // 23:00 UTC on 12 Sep is 08:30 on 13 Sep in Adelaide (ACST, +9:30).
    expect(adelaideDay(new Date('2026-09-12T23:00:00Z'))).toBe('2026-09-13');
    // After daylight saving starts on 4 Oct 2026 the offset is +10:30.
    expect(adelaideDay(new Date('2026-10-04T14:00:00Z'))).toBe('2026-10-05');
    expect(adelaideDay(new Date('2026-10-04T13:00:00Z'))).toBe('2026-10-04');
  });

  it('lists thirty consecutive, distinct days ending today, across a daylight-saving change', () => {
    const days = trailingDays(new Date('2026-10-20T01:30:00Z'));
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toBe('2026-10-20');
    expect(days[0]).toBe('2026-09-21');
    expect(new Set(days).size).toBe(30);
    expect(days).toContain('2026-10-04');
  });

  it('counts each instant on its Adelaide day and ignores anything outside the window', () => {
    const days = trailingDays(new Date('2026-10-06T02:30:00Z'), 3); // 04, 05, 06 Oct
    const counts = bucketByDay(
      [
        new Date('2026-10-04T14:29:00Z'), // 00:59 on 5 Oct, ACDT
        new Date('2026-10-05T01:30:00Z'), // 12:00 on 5 Oct
        new Date('2026-10-03T10:30:00Z'), // 3 Oct, outside
        new Date('2026-10-05T23:30:00Z'), // 10:00 on 6 Oct
      ],
      days,
    );
    expect(days).toEqual(['2026-10-04', '2026-10-05', '2026-10-06']);
    expect(counts).toEqual([0, 2, 1]);
  });

  it('queries from far enough back that the first day is never cut short', () => {
    const now = new Date('2026-09-13T02:30:00Z');
    expect(windowStart(now, 30).getTime()).toBeLessThan(new Date('2026-08-15T00:00:00+09:30').getTime());
    const { currentStart, previousStart } = periods(now, 30);
    expect(now.getTime() - currentStart.getTime()).toBe(30 * 86_400_000);
    expect(currentStart.getTime() - previousStart.getTime()).toBe(30 * 86_400_000);
  });
});
