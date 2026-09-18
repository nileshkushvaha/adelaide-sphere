import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { planSlots } from '@adelaide-sphere/database/automation';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { SUPER_ADMIN_ROLE } from '../src/identity/permissions.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

/**
 * AI Content Phase 1F: the daily slot (plan §N T3/T6/T10), on the isolated
 * `*_test` MySQL database only. The planner runs with fixed clock times, so
 * slot times, the grace period, the monthly cap and daylight saving are
 * exercised deterministically. Nothing here generates, pays or publishes.
 */
const at = (iso: string) => new Date(iso);
// 07:00 in Adelaide in November (daylight time, +10:30) is 20:30 UTC the day before.
const NOV = (day: number, hhmm = '20:40') => at(`2026-11-${String(day - 1).padStart(2, '0')}T${hhmm}:00Z`);

describe('AI Content Phase 1F daily slot (real MySQL/API)', () => {
  let app: INestApplication;
  let cookie: string;
  let viewCookie: string;
  let authorId: string;
  let categoryId: string;
  const db = () => testDatabase();
  const agent = () => request(app.getHttpServer());
  const admin = (req: request.Test, c = cookie) => req.set('Origin', ORIGIN).set('Cookie', c);
  const base = '/api/v1/admin/ai-content';
  const login = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };
  async function saveSettings(values: Record<string, unknown>) {
    const current = (await admin(agent().get('/api/v1/admin/settings/ai-content')).expect(200)).body.data;
    return admin(agent().put('/api/v1/admin/settings/ai-content')).send({ expectedVersion: current.version, values });
  }
  const detail = async (id: string) => (await admin(agent().get(`${base}/topics/${id}`)).expect(200)).body.data;
  /** A topic with a source page, approved by a person for the daily slot. */
  async function approvedForSlot(title: string, priority = 0) {
    const item = (await admin(agent().post(`${base}/topics`)).set('Idempotency-Key', randomUUID()).send({ title, priority }).expect(201)).body.data;
    await admin(agent().put(`${base}/topics/${item.id}/sources`)).send({ expectedVersion: (await detail(item.id)).version, sources: [{ url: 'https://cafe.example.org/' }] }).expect(200);
    await admin(agent().post(`${base}/topics/${item.id}/research`)).send({ expectedVersion: (await detail(item.id)).version, action: 'approve_for_slot' }).expect(200);
    return detail(item.id);
  }
  const slots = () => db().aIScheduleSlot.findMany({ orderBy: { localDate: 'asc' } });
  const resetSlots = async () => {
    await db().aIScheduleSlot.deleteMany({});
  };

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await login(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.80');
    await seedSuperAdmin(app, { email: 'ai-view-1f@example.com', password: 'view-1f-password-123456', displayName: 'Viewer 1F' });
    const viewer = await db().adminUser.findUniqueOrThrow({ where: { email: 'ai-view-1f@example.com' } });
    const superRole = await db().role.findUniqueOrThrow({ where: { key: SUPER_ADMIN_ROLE.key } });
    await db().adminRole.delete({ where: { adminId_roleId: { adminId: viewer.id, roleId: superRole.id } } });
    const role = await db().role.create({ data: { key: 'ai_view_1f', name: 'AI view only', description: 'test' } });
    const perm = await db().permission.findUniqueOrThrow({ where: { key: 'ai_content.view' } });
    await db().rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    await db().adminRole.create({ data: { adminId: viewer.id, roleId: role.id } });
    viewCookie = await login('ai-view-1f@example.com', 'view-1f-password-123456', '203.0.113.81');
    authorId = (await admin(agent().post('/api/v1/admin/authors')).send({ displayName: 'Casey Editor', bio: 'Edits local guides.' }).expect(201)).body.data.id;
    categoryId = (await admin(agent().post('/api/v1/admin/blog-categories')).send({ name: 'Cafes' }).expect(201)).body.data.id;
    expect((await saveSettings({ enabled: true, titleMode: 'manual' })).status).toBe(200);
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('admits a topic for the slot without starting research, and fills nothing while the slot is off or not yet due', async () => {
    const topic = await approvedForSlot('Norwood espresso crawl');
    expect(topic).toMatchObject({ status: 'queued', noveltyStatus: expect.stringMatching(/clear|review/) });
    expect(topic.awaitingSlotSince).not.toBeNull();
    expect(topic.topicApprovedAt).not.toBeNull();
    expect(await db().aIResearchPacket.count({ where: { itemId: topic.id } })).toBe(0);
    // Off by default (owner rule): the slot never runs until it is switched on.
    expect(await planSlots(db(), NOV(2))).toMatchObject({ inactive: 'slot_disabled' });
    expect((await saveSettings({ postingEnabled: true })).status).toBe(200);
    // 06:55 local: not yet due.
    expect(await planSlots(db(), NOV(2, '20:25'))).toEqual({ inactive: null, filled: [], missed: [] });
    expect(await slots()).toEqual([]);
    // Automation off: nothing, even when due.
    await saveSettings({ enabled: false });
    expect(await planSlots(db(), NOV(2))).toMatchObject({ inactive: 'automation_disabled' });
    await saveSettings({ enabled: true });
  });

  it('fills one slot per day with the highest-priority approved topic and starts only its free research, once, however many ticks race', async () => {
    await resetSlots();
    const low = (await db().aIContentItem.findFirstOrThrow({ where: { title: 'Norwood espresso crawl' } })).id;
    const high = await approvedForSlot('Kent Town bakery trail', 50);
    // Three ticks at once (two replicas and a manual run): one slot, one research start.
    const results = await Promise.all([planSlots(db(), NOV(2)), planSlots(db(), NOV(2)), planSlots(db(), NOV(2))]);
    expect(results.flatMap((r) => r.filled)).toEqual([high.id]);
    const [slot] = await slots();
    expect(await slots()).toHaveLength(1);
    expect(slot).toMatchObject({ localDate: '2026-11-02', ordinal: 1, state: 'filled', itemId: high.id, timeZone: 'Australia/Adelaide' });
    expect(slot!.dueAt.toISOString()).toBe('2026-11-01T20:30:00.000Z');
    expect(await detail(high.id)).toMatchObject({ status: 'researching', awaitingSlotSince: null });
    expect(await db().aIResearchPacket.count({ where: { itemId: high.id } })).toBe(1);
    // Free research only: no paid generation, image or publication is ever started by a slot.
    expect(await db().aIOperation.groupBy({ by: ['kind'], _count: true })).toEqual([{ kind: 'research', _count: 1 }]);
    expect(await db().post.count()).toBe(0);
    // Later ticks the same day do nothing; the next day takes the next topic.
    expect(await planSlots(db(), NOV(2, '21:00'))).toEqual({ inactive: null, filled: [], missed: [] });
    expect((await planSlots(db(), NOV(3))).filled).toEqual([low]);
  });

  it('records an empty queue and a late start as missed for review, never catching up, and requires a note from a reviewer', async () => {
    await resetSlots();
    // A queued topic nobody approved for the slot is never taken, even with sources.
    const unapproved = (await admin(agent().post(`${base}/topics`)).set('Idempotency-Key', randomUUID()).send({ title: 'Hackney ramen house', priority: 999 }).expect(201)).body.data;
    await admin(agent().put(`${base}/topics/${unapproved.id}/sources`)).send({ expectedVersion: unapproved.version, sources: [{ url: 'https://cafe.example.org/' }] }).expect(200);
    expect(await planSlots(db(), NOV(4))).toEqual({ inactive: null, filled: [], missed: [{ date: '2026-11-04', reason: 'queue_empty' }] });
    expect((await detail(unapproved.id)).status).toBe('queued');
    const waiting = await approvedForSlot('Stepney dumpling lane');
    // The worker was down: at 08:30 local the 07:00 slot is past its 60-minute grace.
    expect(await planSlots(db(), NOV(5, '22:00'))).toEqual({ inactive: null, filled: [], missed: [{ date: '2026-11-05', reason: 'not_started_in_time' }] });
    expect((await detail(waiting.id)).awaitingSlotSince).not.toBeNull(); // not started late, still waiting
    // Down for a whole day while the schedule was running: that day is recorded as missed, once, and not caught up.
    expect(await planSlots(db(), NOV(7))).toEqual({ inactive: null, filled: [waiting.id], missed: [{ date: '2026-11-06', reason: 'not_started_in_time' }] });
    const status = (await admin(agent().get(`${base}/schedule`), viewCookie).expect(200)).body.data;
    expect(status).toMatchObject({ active: true, slotTime: '07:00', maxPerMonth: 30, missedAwaitingReview: 3 });
    const missed = status.slots.find((s: { localDate: string }) => s.localDate === '2026-11-04');
    await admin(agent().post(`${base}/slots/${missed.id}/review`), viewCookie).send({ expectedVersion: missed.version, note: 'Queue was empty' }).expect(403);
    await admin(agent().post(`${base}/slots/${missed.id}/review`)).send({ expectedVersion: missed.version, note: 'no' }).expect(400);
    const reviewed = (await admin(agent().post(`${base}/slots/${missed.id}/review`)).send({ expectedVersion: missed.version, note: 'Queue was empty; topics added' }).expect(200)).body.data;
    expect(reviewed.missedAwaitingReview).toBe(2);
    await admin(agent().post(`${base}/slots/${missed.id}/review`)).send({ expectedVersion: missed.version + 1, note: 'Twice' }).expect(409);
  });

  it('respects the monthly ceiling and the configured weekdays', async () => {
    await resetSlots();
    await approvedForSlot('Glynde curry corner');
    await approvedForSlot('Payneham gelato bar');
    expect((await planSlots(db(), NOV(9))).filled).toHaveLength(1);
    expect((await saveSettings({ maxSlotsPerMonth: 1 })).status).toBe(200);
    expect(await planSlots(db(), NOV(10))).toMatchObject({ filled: [], missed: [{ date: '2026-11-10', reason: 'monthly_cap' }] });
    await saveSettings({ maxSlotsPerMonth: 30, slotWeekdays: 'mon' });
    // 11 November 2026 is a Wednesday: no slot at all.
    expect(await planSlots(db(), NOV(11))).toEqual({ inactive: null, filled: [], missed: [] });
    // 16 November 2026 is a Monday.
    expect((await planSlots(db(), NOV(16))).filled).toHaveLength(1);
    expect((await saveSettings({ slotWeekdays: 'someday' })).status).toBe(400);
    expect((await saveSettings({ slotTime: '7am' })).status).toBe(400);
    await saveSettings({ slotWeekdays: 'mon,tue,wed,thu,fri,sat,sun' });
  });

  it('leaves a topic for review when a human article took it after approval, and skips paused topics', async () => {
    await resetSlots();
    const topic = await approvedForSlot('Maylands sushi counter');
    const paused = await approvedForSlot('Marden pho kitchen', 100);
    await admin(agent().post(`${base}/topics/${paused.id}/actions`)).send({ expectedVersion: paused.version, action: 'pause' }).expect(201);
    // A person publishes an article on the same topic before the slot runs.
    const post = (await admin(agent().post('/api/v1/admin/posts')).send({ title: 'Maylands sushi counter', excerpt: 'A human guide to the sushi counter in Maylands.', bodyMarkdown: 'Sushi in Maylands. '.repeat(20), authorId, categoryId }).expect(201)).body.data;
    await admin(agent().post(`/api/v1/admin/posts/${post.id}/publish`)).send({ expectedVersion: post.version }).expect(200);
    expect(await planSlots(db(), NOV(18))).toMatchObject({ filled: [], missed: [{ date: '2026-11-18', reason: 'no_eligible_topic:novelty_changed' }] });
    expect(await detail(topic.id)).toMatchObject({ status: 'queued', awaitingSlotSince: null, noveltyStatus: 'duplicate' });
    expect(await detail(paused.id)).toMatchObject({ status: 'paused' });
    expect(await db().aIResearchPacket.count({ where: { itemId: { in: [topic.id, paused.id] } } })).toBe(0);
  });

  it('keeps the slot at 07:00 local across the daylight-saving change', async () => {
    await resetSlots();
    const topic = await approvedForSlot('Unley brunch terrace');
    // Daylight saving starts on Sunday 4 October 2026: 07:00 is 20:30 UTC on the 3rd (not 21:30).
    expect(await planSlots(db(), at('2026-10-03T20:25:00Z'))).toEqual({ inactive: null, filled: [], missed: [] });
    expect((await planSlots(db(), at('2026-10-03T20:35:00Z'))).filled).toEqual([topic.id]);
    expect((await slots())[0]!.dueAt.toISOString()).toBe('2026-10-03T20:30:00.000Z');
  });
});
