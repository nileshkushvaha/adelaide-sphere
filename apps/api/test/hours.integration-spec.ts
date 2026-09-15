import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../src/auth/session.service.js';
import { ORIGIN, TEST_ADMIN, clearThrottleKeys, seedSuperAdmin } from './integration/auth-fixtures.js';
import { closeTestDatabase, createIntegrationApp, testDatabase, truncateApplicationTables } from './integration/harness.js';

describe('Listing hours and links (integration)', () => {
  let app: INestApplication;
  let cookie: string;
  let readerCookie: string;
  let id: string;
  let version: number;
  const agent = () => request(app.getHttpServer());
  const withAuth = (req: request.Test, c = cookie) => req.set('Origin', ORIGIN).set('Cookie', c);
  const loginAs = async (email: string, password: string, ip: string) => {
    const res = await agent().post('/api/v1/admin/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
    return ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`))!.split(';')[0]!;
  };
  const day = (intervals: { start: string; end: string; endNextDay?: boolean }[]) => ({ state: 'intervals', intervals: intervals.map((i) => ({ endNextDay: false, ...i })) });
  const closedWeek = () => ({ monday: { state: 'closed' }, tuesday: { state: 'closed' }, wednesday: { state: 'closed' }, thursday: { state: 'closed' }, friday: { state: 'closed' }, saturday: { state: 'closed' }, sunday: { state: 'closed' } });

  beforeAll(async () => {
    await truncateApplicationTables();
    app = await createIntegrationApp();
    await clearThrottleKeys(app);
    await seedSuperAdmin(app);
    cookie = await loginAs(TEST_ADMIN.email, TEST_ADMIN.password, '203.0.113.140');
    const db = testDatabase();
    const readerRole = await db.role.create({ data: { key: 'hours_reader', name: 'Reader', description: 'test' } });
    const readPerm = await db.permission.findUniqueOrThrow({ where: { key: 'listings.read' } });
    await db.rolePermission.create({ data: { roleId: readerRole.id, permissionId: readPerm.id } });
    await seedSuperAdmin(app, { email: 'hours.reader@example.com', password: 'reader-password-12345', displayName: 'Reader' });
    const reader = await db.adminUser.findUniqueOrThrow({ where: { email: 'hours.reader@example.com' } });
    await db.adminRole.deleteMany({ where: { adminId: reader.id } });
    await db.adminRole.create({ data: { adminId: reader.id, roleId: readerRole.id } });
    readerCookie = await loginAs('hours.reader@example.com', 'reader-password-12345', '203.0.113.141');
    const category = (await withAuth(agent().post('/api/v1/admin/categories')).send({ name: 'Bars' }).expect(201)).body.data.id;
    const area = (await withAuth(agent().post('/api/v1/admin/areas')).send({ name: 'Fitzroy', eligibilitySource: 'council list' }).expect(201)).body.data.id;
    const created = await withAuth(agent().post('/api/v1/admin/businesses'))
      .send({ name: 'Night Owl Bar', description: 'A late-night bar with a long enough description for the record.', primaryCategoryId: category, localAreaId: area, publicPhone: '+61 3 9000 5555', publicUrl: 'https://nightowl.example/', links: [{ kind: 'instagram', url: 'https://www.instagram.com/nightowl' }, { kind: 'other', url: 'https://menu.example.com/', label: 'Menu' }] })
      .expect(201);
    id = created.body.data.id;
    version = created.body.data.version;
    expect(created.body.data).toMatchObject({ publicPhone: '03 9000 5555', telHref: 'tel:+61390005555', hoursMode: 'unknown', links: [{ kind: 'instagram', url: 'https://www.instagram.com/nightowl', label: null }, { kind: 'other', url: 'https://menu.example.com/', label: 'Menu' }] });
  });

  afterAll(async () => {
    await clearThrottleKeys(app);
    await app.close();
    await closeTestDatabase();
  });

  it('rejects invalid phones and links with field paths (SRS BUS 003)', async () => {
    const phone = await withAuth(agent().patch(`/api/v1/admin/businesses/${id}`)).send({ expectedVersion: version, publicPhone: '+1 212 555 0100' }).expect(400);
    expect(phone.body.error.fields.publicPhone).toBeDefined();
    const links = await withAuth(agent().patch(`/api/v1/admin/businesses/${id}`)).send({ expectedVersion: version, links: [{ kind: 'facebook', url: 'https://tiktok.com/x' }, { kind: 'other', url: 'javascript:alert(1)' }] }).expect(400);
    expect(Object.keys(links.body.error.fields).sort()).toEqual(['links.0.url', 'links.1.url']);
    await withAuth(agent().patch(`/api/v1/admin/businesses/${id}`)).send({ expectedVersion: version, publicUrl: 'https://user:pw@example.com/' }).expect(400);
    const replaced = await withAuth(agent().patch(`/api/v1/admin/businesses/${id}`)).send({ expectedVersion: version, links: [] }).expect(200);
    expect(replaced.body.data.links).toEqual([]);
    version = replaced.body.data.version;
    expect(await testDatabase().businessLink.count({ where: { businessId: id } })).toBe(0);
  });

  it('starts unknown, requires listings.write to change, and refuses stale versions', async () => {
    const initial = await withAuth(agent().get(`/api/v1/admin/businesses/${id}/hours`), readerCookie).expect(200);
    expect(initial.body.data).toMatchObject({ mode: 'unknown', status: { state: 'unknown', until: null, source: null }, version });
    await agent().get(`/api/v1/admin/businesses/${id}/hours`).expect(401);
    await withAuth(agent().put(`/api/v1/admin/businesses/${id}/hours`), readerCookie).send({ expectedVersion: version, mode: 'unknown' }).expect(403);
    const stale = await withAuth(agent().put(`/api/v1/admin/businesses/${id}/hours`)).send({ expectedVersion: version + 5, mode: 'unknown' }).expect(409);
    expect(stale.body.error.code).toBe('STALE_VERSION');
  });

  it('validates overlaps, formats and exceptions with field paths', async () => {
    const res = await withAuth(agent().put(`/api/v1/admin/businesses/${id}/hours`))
      .send({
        expectedVersion: version,
        mode: 'scheduled',
        weekly: { ...closedWeek(), monday: day([{ start: '09:00', end: '12:00' }, { start: '11:30', end: '15:00' }]), tuesday: day([{ start: '25:00', end: '12:00' }]), friday: day([{ start: '20:00', end: '03:00', endNextDay: true }]), saturday: { state: 'open24' } },
        exceptions: [{ date: '2026-12-25', kind: 'closed' }, { date: '2026-12-25', kind: 'open24' }, { date: '2026-12-26', kind: 'custom', intervals: [] }],
      })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['exceptions.1.date', 'exceptions.2.intervals', 'weekly.friday.intervals.0.end', 'weekly.monday.intervals.1.start', 'weekly.tuesday.intervals.0.start']);
    await withAuth(agent().put(`/api/v1/admin/businesses/${id}/hours`)).send({ expectedVersion: version, mode: 'scheduled' }).expect(400);
    await withAuth(agent().put(`/api/v1/admin/businesses/${id}/hours`)).send({ expectedVersion: version, mode: 'scheduled', weekly: { ...closedWeek(), monday: { state: 'sometimes' } } }).expect(400);
  });

  it('stores a schedule with overnight hours and exceptions, bumps the version, audits, and evaluates status', async () => {
    const body = {
      expectedVersion: version,
      mode: 'scheduled',
      weekly: { ...closedWeek(), thursday: day([{ start: '17:00', end: '01:00', endNextDay: true }]), friday: day([{ start: '12:00', end: '14:30' }, { start: '17:00', end: '24:00' }]), saturday: { state: 'open24' } },
      exceptions: [{ date: '2026-12-25', kind: 'closed', note: 'Christmas Day' }, { date: '2026-12-31', kind: 'custom', intervals: [{ start: '18:00', end: '02:00', endNextDay: true }, { start: '10:00', end: '12:00', endNextDay: false }], note: 'NYE' }],
    };
    const res = await withAuth(agent().put(`/api/v1/admin/businesses/${id}/hours`)).send(body).expect(200);
    expect(res.body.data.version).toBe(version + 1);
    version = res.body.data.version;
    expect(res.body.data.mode).toBe('scheduled');
    expect(res.body.data.weekly.thursday).toEqual({ state: 'intervals', intervals: [{ start: '17:00', end: '01:00', endNextDay: true }] });
    expect(res.body.data.weekly.friday).toEqual({ state: 'intervals', intervals: [{ start: '12:00', end: '14:30', endNextDay: false }, { start: '17:00', end: '24:00', endNextDay: false }] });
    expect(res.body.data.weekly.saturday).toEqual({ state: 'open24' });
    expect(res.body.data.weekly.sunday).toEqual({ state: 'closed' });
    expect(res.body.data.exceptions).toEqual([
      { date: '2026-12-25', kind: 'closed', note: 'Christmas Day' },
      { date: '2026-12-31', kind: 'custom', intervals: [{ start: '10:00', end: '12:00', endNextDay: false }, { start: '18:00', end: '02:00', endNextDay: true }], note: 'NYE' },
    ]);
    expect(['open', 'closed']).toContain(res.body.data.status.state);
    const again = await withAuth(agent().get(`/api/v1/admin/businesses/${id}/hours`)).expect(200);
    expect(again.body.data.weekly).toEqual(res.body.data.weekly);
    const db = testDatabase();
    expect(await db.openingInterval.count({ where: { businessId: id } })).toBe(4);
    expect(await db.hoursException.count({ where: { businessId: id } })).toBe(3);
    const business = await withAuth(agent().get(`/api/v1/admin/businesses/${id}`)).expect(200);
    expect(business.body.data).toMatchObject({ hoursMode: 'scheduled', version });
    const audit = await db.auditLog.findFirst({ where: { targetId: id, action: 'listing.hours.update' } });
    expect(audit?.metadata).toMatchObject({ mode: 'scheduled', intervals: 4, exceptions: 2 });
    // Switching back to unknown clears the rows and the mode.
    const cleared = await withAuth(agent().put(`/api/v1/admin/businesses/${id}/hours`)).send({ expectedVersion: version, mode: 'unknown' }).expect(200);
    version = cleared.body.data.version;
    expect(cleared.body.data).toMatchObject({ mode: 'unknown', status: { state: 'unknown' }, exceptions: [] });
    expect(await db.openingInterval.count({ where: { businessId: id } })).toBe(0);
  });
});
