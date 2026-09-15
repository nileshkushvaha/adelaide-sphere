import { Prisma } from '@adelaide-sphere/database';
import { escapeLike } from '../directory/search/search-rules.js';
import { ACTIVITY_CATEGORIES, ACTIVITY_DOMAINS, ACTIVITY_FAILURE_SUFFIXES, categoriesVisibleTo, domainsInCategory, type ActivityCategory } from './activity-catalogue.js';

/**
 * Which events one administrator may read, and the filters the activity log
 * applies (change log 1.14, ACT 005).
 *
 * The same criteria are expressed twice — as a Prisma `where` for the plain
 * list and as SQL for the grouped list, which needs `GROUP BY` — so both are
 * built here from one description, side by side, rather than in two places that
 * could drift. Every value reaches SQL as a bound parameter through
 * `Prisma.sql`; nothing is concatenated.
 */
export interface ActivityFilters {
  action?: string;
  /** An admin id, or `null` for events the system recorded itself. */
  actorAdminId?: string | null;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  from?: Date;
  to?: Date;
  category?: ActivityCategory;
  outcome?: 'success' | 'failure';
}

const ALL_DOMAINS = Object.keys(ACTIVITY_DOMAINS);

/** The areas a caller may read; empty means the log is closed to them. */
export function visibleCategories(permissions: readonly string[]): ActivityCategory[] {
  return categoriesVisibleTo(permissions);
}

/** Every area visible: no restriction to add. */
function seesEverything(visible: readonly ActivityCategory[]): boolean {
  return ACTIVITY_CATEGORIES.every((category) => visible.includes(category));
}

// ---- Prisma --------------------------------------------------------------

const prefixes = (domains: string[]): Prisma.AuditLogWhereInput[] => domains.map((domain) => ({ action: { startsWith: `${domain}.` } }));

/** What the caller may see, as a `where`. System visibility also covers unregistered domains. */
export function activityScope(visible: readonly ActivityCategory[]): Prisma.AuditLogWhereInput {
  if (seesEverything(visible)) return {};
  const allowed: Prisma.AuditLogWhereInput[] = prefixes(visible.flatMap((category) => domainsInCategory(category)));
  if (visible.includes('system')) allowed.push({ NOT: { OR: prefixes(ALL_DOMAINS) } });
  // Nothing visible is refused by the guard before this runs; an empty OR would match nothing anyway.
  return { OR: allowed.length > 0 ? allowed : [{ id: '__none__' }] };
}

export function activityWhere(filters: ActivityFilters, visible: readonly ActivityCategory[]): Prisma.AuditLogWhereInput {
  const failure = { OR: ACTIVITY_FAILURE_SUFFIXES.map((suffix) => ({ action: { endsWith: `.${suffix}` } })) };
  const and: Prisma.AuditLogWhereInput[] = [activityScope(visible)];
  if (filters.action) and.push(filters.action.endsWith('*') ? { action: { startsWith: filters.action.slice(0, -1) } } : { action: filters.action });
  if (filters.actorAdminId !== undefined) and.push({ actorAdminId: filters.actorAdminId });
  if (filters.targetType) and.push({ targetType: filters.targetType });
  if (filters.targetId) and.push({ targetId: filters.targetId });
  if (filters.requestId) and.push({ requestId: filters.requestId });
  if (filters.from || filters.to) and.push({ createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } });
  // A category is a set of action prefixes, so it filters in the database.
  if (filters.category) and.push({ OR: prefixes(domainsInCategory(filters.category)) });
  // Outcome is derived from the code, on the same suffixes the derivation uses.
  if (filters.outcome === 'failure') and.push(failure);
  if (filters.outcome === 'success') and.push({ NOT: failure });
  return { AND: and };
}

// ---- SQL (grouped list) --------------------------------------------------

const startsWithSql = (value: string) => Prisma.sql`action LIKE ${`${escapeLike(value)}%`}`;
const endsWithSql = (value: string) => Prisma.sql`action LIKE ${`%${escapeLike(value)}`}`;
const anyOf = (parts: Prisma.Sql[]) => (parts.length === 0 ? Prisma.sql`FALSE` : Prisma.sql`(${Prisma.join(parts, ' OR ')})`);

export function activitySqlWhere(filters: ActivityFilters, visible: readonly ActivityCategory[]): Prisma.Sql {
  const and: Prisma.Sql[] = [];
  if (!seesEverything(visible)) {
    const allowed = visible.flatMap((category) => domainsInCategory(category)).map((domain) => startsWithSql(`${domain}.`));
    if (visible.includes('system')) allowed.push(Prisma.sql`NOT ${anyOf(ALL_DOMAINS.map((domain) => startsWithSql(`${domain}.`)))}`);
    and.push(anyOf(allowed));
  }
  if (filters.action) and.push(filters.action.endsWith('*') ? startsWithSql(filters.action.slice(0, -1)) : Prisma.sql`action = ${filters.action}`);
  if (filters.actorAdminId !== undefined) and.push(filters.actorAdminId === null ? Prisma.sql`actorAdminId IS NULL` : Prisma.sql`actorAdminId = ${filters.actorAdminId}`);
  if (filters.targetType) and.push(Prisma.sql`targetType = ${filters.targetType}`);
  if (filters.targetId) and.push(Prisma.sql`targetId = ${filters.targetId}`);
  if (filters.requestId) and.push(Prisma.sql`requestId = ${filters.requestId}`);
  if (filters.from) and.push(Prisma.sql`createdAt >= ${filters.from}`);
  if (filters.to) and.push(Prisma.sql`createdAt <= ${filters.to}`);
  if (filters.category) and.push(anyOf(domainsInCategory(filters.category).map((domain) => startsWithSql(`${domain}.`))));
  const failure = anyOf(ACTIVITY_FAILURE_SUFFIXES.map((suffix) => endsWithSql(`.${suffix}`)));
  if (filters.outcome === 'failure') and.push(failure);
  if (filters.outcome === 'success') and.push(Prisma.sql`NOT ${failure}`);
  return and.length === 0 ? Prisma.sql`TRUE` : Prisma.join(and, ' AND ');
}

// ---- Groups --------------------------------------------------------------

/**
 * One group of repeated events: the same action by the same actor, in the same
 * request — or, when the event had no request, in the same minute. The key is
 * opaque to the interface and checked again when it comes back.
 */
export interface ActivityGroupKey {
  action: string;
  actorAdminId: string | null;
  /** A request id, or a UTC minute `YYYY-MM-DD HH:MM` for events without one. */
  bucket: { kind: 'request'; value: string } | { kind: 'minute'; value: string };
}

const MINUTE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const ACTION = /^[a-z0-9_.]{1,64}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function encodeGroupKey(key: ActivityGroupKey): string {
  return Buffer.from(JSON.stringify([key.action, key.actorAdminId, key.bucket.kind === 'request' ? 'r' : 'm', key.bucket.value]), 'utf8').toString('base64url');
}

/** Null for anything that is not a key this server could have issued. */
export function decodeGroupKey(raw: string): ActivityGroupKey | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    const [action, actor, kind, value] = parsed as unknown[];
    if (typeof action !== 'string' || !ACTION.test(action)) return null;
    if (actor !== null && (typeof actor !== 'string' || !ID.test(actor))) return null;
    if (typeof value !== 'string') return null;
    if (kind === 'm' && MINUTE.test(value)) return { action, actorAdminId: actor, bucket: { kind: 'minute', value } };
    if (kind === 'r' && value.length > 0 && value.length <= 64) return { action, actorAdminId: actor, bucket: { kind: 'request', value } };
    return null;
  } catch {
    return null;
  }
}

/** The members of a group, as a `where` to add to the caller's scope. */
export function groupWhere(key: ActivityGroupKey): Prisma.AuditLogWhereInput {
  const base: Prisma.AuditLogWhereInput = { action: key.action, actorAdminId: key.actorAdminId };
  if (key.bucket.kind === 'request') return { ...base, requestId: key.bucket.value };
  const start = new Date(`${key.bucket.value.replace(' ', 'T')}:00.000Z`);
  return { ...base, requestId: null, createdAt: { gte: start, lt: new Date(start.getTime() + 60_000) } };
}
