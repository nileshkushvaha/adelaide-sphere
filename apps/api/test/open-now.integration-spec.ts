import { Prisma } from '@adelaide-sphere/database';
import { evaluateHours } from '../src/directory/hours/hours-rules.js';
import { scheduleFromRows } from '../src/directory/hours/hours.service.js';
import { openNowAvailable, openNowSql, OPEN_NOW_MIN_COVERAGE, OPEN_NOW_MIN_LISTINGS } from '../src/directory/hours/open-now.js';
import { toLocal } from '../src/directory/hours/adelaide-time.js';
import { closeTestDatabase, testDatabase, truncateApplicationTables } from './integration/harness.js';

/**
 * "Open now" (SRS DIR 008) against the real MySQL.
 *
 * The filter runs in SQL so that paging and counts stay in the database, while
 * `evaluateHours` remains the authority for what a listing's hours *mean*. The
 * two must agree exactly, so this seeds a listing for every case and compares
 * the filtered set with the evaluator's own answer at the same instant.
 */
describe('Open now filtering (integration)', () => {
  const db = testDatabase();
  const at = new Date();
  const local = toLocal(at);
  /** A minute that is inside "now" for the fixtures below. */
  const minute = local.minuteOfDay;
  const weekday = local.weekday;
  const yesterdayWeekday = ((weekday + 5) % 7) + 1;
  const ids: Record<string, string> = {};
  /** Closing minute for the overnight fixture: after "now", and before its 23:59 opening. */
  const overnightEnd = Math.min(minute + 30, 1438);
  /** In the last two minutes of the day the overnight fixture cannot still be open. */
  const overnightCoversNow = overnightEnd > minute;

  const seedBusiness = async (key: string, mode: 'scheduled' | 'unknown') => {
    const category = await db.category.upsert({
      where: { slug: 'open-now-fixture' },
      create: { name: 'Open now fixture', slug: 'open-now-fixture', active: true },
      update: {},
    });
    const area = await db.localArea.upsert({
      where: { slug: 'open-now-area' },
      create: { name: 'Open now area', slug: 'open-now-area', active: true },
      update: {},
    });
    const business = await db.business.create({
      data: {
        name: `Open now ${key}`,
        normalizedName: `open now ${key}`,
        slug: `open-now-${key}`,
        description: 'Fixture listing for the open-now filter, long enough to publish.',
        status: 'published',
        firstPublishedAt: new Date(),
        eligibilityVerifiedAt: new Date(),
        hoursMode: mode,
        primaryCategoryId: category.id,
        localAreaId: area.id,
      },
    });
    ids[key] = business.id;
    return business.id;
  };

  beforeAll(async () => {
    await truncateApplicationTables();

    // Open: today's interval covers this minute.
    const open = await seedBusiness('open', 'scheduled');
    await db.openingInterval.create({ data: { businessId: open, weekday, allDay: false, startMinute: Math.max(0, minute - 60), endMinute: Math.min(1440, minute + 60), endNextDay: false } });

    // Closed: today's interval is over by now (or not started).
    const closed = await seedBusiness('closed', 'scheduled');
    const closedStart = minute >= 120 ? 0 : Math.min(1380, minute + 60);
    await db.openingInterval.create({ data: { businessId: closed, weekday, allDay: false, startMinute: closedStart, endMinute: Math.min(1440, closedStart + 30), endNextDay: false } });

    // Open 24 hours today.
    const allDay = await seedBusiness('all-day', 'scheduled');
    await db.openingInterval.create({ data: { businessId: allDay, weekday, allDay: true, startMinute: null, endMinute: null, endNextDay: false } });

    // Overnight: yesterday's interval runs past midnight and still covers now.
    // A genuine overnight row closes *earlier* than it opens, which is what the
    // schedule validator requires, so this opens at 23:59 and closes after now.
    const overnight = await seedBusiness('overnight', 'scheduled');
    await db.openingInterval.create({ data: { businessId: overnight, weekday: yesterdayWeekday, allDay: false, startMinute: 1439, endMinute: overnightEnd, endNextDay: true } });

    // An exception replaces today's weekly rule, in both directions.
    const exceptionClosed = await seedBusiness('exception-closed', 'scheduled');
    await db.openingInterval.create({ data: { businessId: exceptionClosed, weekday, allDay: true, startMinute: null, endMinute: null, endNextDay: false } });
    await db.hoursException.create({ data: { businessId: exceptionClosed, date: new Date(Date.UTC(local.year, local.month - 1, local.day)), kind: 'closed', startMinute: null, endMinute: null, endNextDay: false } });

    const exceptionOpen = await seedBusiness('exception-open', 'scheduled');
    // Weekly says closed today (no rows for this weekday); the exception opens it.
    await db.openingInterval.create({ data: { businessId: exceptionOpen, weekday: yesterdayWeekday, allDay: false, startMinute: 540, endMinute: 600, endNextDay: false } });
    await db.hoursException.create({ data: { businessId: exceptionOpen, date: new Date(Date.UTC(local.year, local.month - 1, local.day)), kind: 'open24', startMinute: null, endMinute: null, endNextDay: false } });

    // No schedule at all: never "open", because an absent schedule is not evidence.
    const unknown = await seedBusiness('unknown', 'unknown');
    expect(unknown).toBeTruthy();
  });

  afterAll(async () => {
    await truncateApplicationTables();
    await closeTestDatabase();
  });

  /** The evaluator's answer for a listing, from its stored rows. */
  const evaluatorSaysOpen = async (id: string): Promise<boolean> => {
    const business = await db.business.findUniqueOrThrow({ where: { id }, include: { openingHours: true, hoursExceptions: true } });
    const schedule = scheduleFromRows(business.hoursMode, business.openingHours, business.hoursExceptions);
    return evaluateHours(schedule, at).state === 'open';
  };

  it('matches the hours evaluator exactly, case for case', async () => {
    const rows = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT b.id FROM businesses b WHERE b.status = 'published' ${openNowSql(at)}`,
    );
    const sqlSaysOpen = new Set(rows.map((row) => row.id));

    const mismatches: string[] = [];
    for (const [key, id] of Object.entries(ids)) {
      const expected = await evaluatorSaysOpen(id);
      if (sqlSaysOpen.has(id) !== expected) mismatches.push(`${key}: SQL=${sqlSaysOpen.has(id)}, evaluator=${expected} (at minute ${minute}, weekday ${weekday})`);
    }
    // A divergence here means the filter and the listing page would disagree
    // about the same shop at the same moment.
    expect(mismatches).toEqual([]);
  });

  it('includes the cases it is meant to, and excludes the rest', async () => {
    const rows = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT b.id FROM businesses b WHERE b.status = 'published' ${openNowSql(at)}`,
    );
    const open = new Set(rows.map((row) => row.id));
    expect(open.has(ids.open), 'a listing whose interval covers now').toBe(true);
    expect(open.has(ids['all-day']), 'a listing open 24 hours today').toBe(true);
    expect(open.has(ids.overnight), 'an interval that began yesterday and runs past midnight').toBe(overnightCoversNow);
    expect(open.has(ids['exception-open']), 'an exception that opens a day the weekly rule closes').toBe(true);
    expect(open.has(ids.closed), 'a listing whose hours do not cover now').toBe(false);
    expect(open.has(ids['exception-closed']), 'an exception that closes a day the weekly rule opens').toBe(false);
    expect(open.has(ids.unknown), 'a listing with no published schedule').toBe(false);
  });

  it('offers the filter only when published hours coverage supports it', () => {
    // Conditional by requirement: a filter over sparse data hides good listings.
    expect(openNowAvailable(0, 0)).toBe(false);
    expect(openNowAvailable(OPEN_NOW_MIN_LISTINGS - 1, OPEN_NOW_MIN_LISTINGS - 1)).toBe(false);
    expect(openNowAvailable(OPEN_NOW_MIN_LISTINGS, OPEN_NOW_MIN_LISTINGS)).toBe(true);
    expect(openNowAvailable(6, 10)).toBe(OPEN_NOW_MIN_COVERAGE <= 0.6);
    expect(openNowAvailable(5, 100)).toBe(false);
  });
});
