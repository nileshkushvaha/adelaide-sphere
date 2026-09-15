import { describe, expect, it } from 'vitest';
import { describeDay, formatExceptionDate, formatInterval, formatTime, adelaideToday, weekdayKeyOfDate } from './hours';

describe('public hours formatting', () => {
  it('formats wall-clock times and intervals', () => {
    expect(formatTime('09:00')).toBe('9 am');
    expect(formatTime('17:30')).toBe('5:30 pm');
    expect(formatTime('12:00')).toBe('12 pm');
    expect(formatTime('24:00')).toBe('midnight');
    expect(formatInterval({ start: '18:00', end: '02:00', endNextDay: true })).toBe('6 pm – 2 am (next day)');
    expect(formatInterval({ start: '17:00', end: '00:00', endNextDay: true })).toBe('5 pm – midnight');
  });

  it('describes the distinct day states', () => {
    expect(describeDay({ state: 'closed' })).toBe('Closed');
    expect(describeDay({ state: 'open24' })).toBe('Open 24 hours');
    expect(describeDay({ state: 'intervals', intervals: [{ start: '09:00', end: '12:00', endNextDay: false }, { start: '13:00', end: '17:00', endNextDay: false }] })).toBe('9 am – 12 pm, 1 pm – 5 pm');
    expect(describeDay(undefined)).toBe('Closed');
  });

  it('resolves Adelaide calendar dates', () => {
    expect(weekdayKeyOfDate('2026-09-06')).toBe('sunday');
    expect(adelaideToday(new Date('2026-09-06T14:00:00Z'))).toBe('2026-09-06'); // 23:30 ACST
    expect(adelaideToday(new Date('2026-09-06T15:00:00Z'))).toBe('2026-09-07'); // 00:30 ACST next day
    expect(formatExceptionDate('2026-12-25')).toBe('Fri, 25 Dec');
  });
});
