import { addDays, localDate, localWeekday, parseSlotTime, parseWeekdays, zonedTimeToUtc } from './ai-schedule.js';
import { queueForJob } from './queue.js';

const TZ = 'Australia/Adelaide';

describe('daily slot calendar (Australia/Adelaide)', () => {
  it('resolves 07:00 local in standard and daylight time', () => {
    // ACST +9:30 in July; ACDT +10:30 in December.
    expect(zonedTimeToUtc('2026-07-15', '07:00', TZ).toISOString()).toBe('2026-07-14T21:30:00.000Z');
    expect(zonedTimeToUtc('2026-12-15', '07:00', TZ).toISOString()).toBe('2026-12-14T20:30:00.000Z');
  });
  it('is correct on both daylight-saving change days, including the skipped and repeated hours', () => {
    // Starts Sunday 4 October 2026 at 02:00 -> 03:00; ends Sunday 5 April 2026 at 03:00 -> 02:00.
    expect(zonedTimeToUtc('2026-10-04', '07:00', TZ).toISOString()).toBe('2026-10-03T20:30:00.000Z');
    expect(zonedTimeToUtc('2026-04-05', '07:00', TZ).toISOString()).toBe('2026-04-04T21:30:00.000Z');
    // 02:30 does not exist on the start day: it lands after the gap (03:30 daylight time), once.
    const gap = zonedTimeToUtc('2026-10-04', '02:30', TZ);
    expect(gap.toISOString()).toBe('2026-10-03T17:00:00.000Z');
    expect(localDate(gap, TZ)).toBe('2026-10-04');
    // 02:30 happens twice on the end day: the first occurrence (still daylight time) is used.
    expect(zonedTimeToUtc('2026-04-05', '02:30', TZ).toISOString()).toBe('2026-04-04T16:00:00.000Z');
  });
  it('gives the local date and weekday, never the server’s', () => {
    // 22:00 UTC on 18 September is already 19 September (a Saturday) in Adelaide.
    expect(localDate(new Date('2026-09-18T22:00:00Z'), TZ)).toBe('2026-09-19');
    expect(localWeekday('2026-09-19', TZ)).toBe('sat');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('validates settings strictly', () => {
    expect(parseSlotTime('07:00')).toBe('07:00');
    expect(parseSlotTime('7:00')).toBeNull();
    expect(parseSlotTime('24:00')).toBeNull();
    expect(parseWeekdays('mon, TUE,sun,xyz')).toEqual(['mon', 'tue', 'sun']);
    expect(parseWeekdays(undefined)).toEqual([]);
  });
  it('sends AI operations to their own bounded queue and everything else to the main queue', () => {
    expect(queueForJob('ai.operation')).toBe('adelaide-sphere-ai');
    expect(queueForJob('media.process')).toBe('adelaide-sphere');
  });
});
