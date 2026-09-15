import type { DatabaseService } from '../database/database.service.js';

type PrismaClient = Awaited<ReturnType<DatabaseService['client']>>;

/**
 * Readable names for what an activity event was done to (change log 1.14).
 *
 * An event stores a type and an id; "Business · cmf3x…" tells a reader nothing.
 * The log looks the names up for the page it is showing — one query per type,
 * never one per row — and only for records whose name is not private: a review,
 * comment, enquiry, abuse report or email delivery is identified by type alone,
 * because its text belongs to a visitor (ACT 004). A record deleted since the
 * event simply has no name; the interface falls back to its type.
 */
type Lookup = (db: PrismaClient, ids: string[]) => Promise<Array<{ id: string; label: string }>>;

const byName = <T extends { id: string }>(rows: T[], pick: (row: T) => string) => rows.map((row) => ({ id: row.id, label: pick(row) }));

const LOOKUPS: Record<string, Lookup> = {
  permission: async (db, ids) => (await db.permission.findMany({ where: { key: { in: ids } }, select: { key: true, label: true } })).map((row) => ({ id: row.key, label: row.label || row.key })),
  role: async (db, ids) => byName(await db.role.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (row) => row.name),
  admin_user: async (db, ids) => byName(await db.adminUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }), (row) => row.displayName),
  business: async (db, ids) => byName(await db.business.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (row) => row.name),
  post: async (db, ids) => byName(await db.post.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } }), (row) => row.title),
  static_page: async (db, ids) => byName(await db.staticPage.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } }), (row) => row.title),
  category: async (db, ids) => byName(await db.category.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (row) => row.name),
  service: async (db, ids) => byName(await db.service.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (row) => row.name),
  local_area: async (db, ids) => byName(await db.localArea.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (row) => row.name),
  blog_category: async (db, ids) => byName(await db.blogCategory.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (row) => row.name),
  blog_tag: async (db, ids) => byName(await db.blogTag.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (row) => row.name),
  author: async (db, ids) => byName(await db.author.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }), (row) => row.displayName),
  media_asset: async (db, ids) => byName(await db.mediaAsset.findMany({ where: { id: { in: ids } }, select: { id: true, sourceName: true } }), (row) => row.sourceName),
  redirect: async (db, ids) => byName(await db.redirect.findMany({ where: { id: { in: ids } }, select: { id: true, sourcePath: true } }), (row) => row.sourcePath),
  menu: async (db, ids) => byName(await db.menu.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (row) => row.name),
  faq: async (db, ids) => byName(await db.faq.findMany({ where: { id: { in: ids } }, select: { id: true, question: true } }), (row) => row.question),
  service_alert: async (db, ids) => byName(await db.serviceAlert.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } }), (row) => row.title),
  testimonial: async (db, ids) => byName(await db.testimonial.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }), (row) => row.displayName),
  partner_organisation: async (db, ids) => byName(await db.partnerOrganisation.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }), (row) => row.name),
};

/** Types whose stored id is already a readable name: a queue, a task code, a settings key. */
const SELF_NAMED = new Set(['queue', 'scheduled_task', 'cache_namespace', 'cache_tag', 'setting', 'security_settings', 'menu_location']);

const labelKey = (type: string, id: string) => `${type}:${id}`;

export async function targetLabels(db: PrismaClient, rows: Array<{ targetType: string | null; targetId: string | null }>): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const idsByType = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.targetType || !row.targetId) continue;
    if (SELF_NAMED.has(row.targetType)) labels.set(labelKey(row.targetType, row.targetId), row.targetId);
    else if (LOOKUPS[row.targetType]) idsByType.set(row.targetType, (idsByType.get(row.targetType) ?? new Set()).add(row.targetId));
  }
  await Promise.all(
    [...idsByType.entries()].map(async ([type, ids]) => {
      for (const found of await LOOKUPS[type]!(db, [...ids])) labels.set(labelKey(type, found.id), found.label);
    }),
  );
  return labels;
}

export function targetLabelFor(labels: Map<string, string>, row: { targetType: string | null; targetId: string | null }): string | null {
  return row.targetType && row.targetId ? (labels.get(labelKey(row.targetType, row.targetId)) ?? null) : null;
}
