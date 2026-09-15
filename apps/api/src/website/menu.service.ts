import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@adelaide-sphere/database';
import {
  CACHE_TAGS,
  MENU_LIMITS,
  MENU_LOCATIONS,
  menuLocation,
  validateMenuTree,
  type MenuFieldErrors,
  type MenuLocationKey,
  type MenuTreeInputItem,
} from '@adelaide-sphere/domain';
import { AuditService } from '../audit/audit.service.js';
import { CacheService } from '../cache/cache.service.js';
import { DatabaseService } from '../database/database.service.js';
import { ObjectStoragePort } from '../media/storage.port.js';
import type { RequestContext } from '../auth/auth.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { assertVersion, recordContentActivity } from './content-support.js';
import { orderMenuItems, referenceOf, resolvePublicMenu, resolveSource, toTreeInput, type MenuSource, type PublicMenuItem, type StoredMenuItem } from './menu-resolver.js';
import { MENU_ITEM_SELECT, loadMenuLookups, replaceMenuItems } from './menu-store.js';

export interface AdminMenuItem {
  key: string;
  parentKey: string | null;
  type: StoredMenuItem['type'];
  refId: string | null;
  routeKey: string | null;
  url: string | null;
  label: string | null;
  titleAttribute: string | null;
  description: string | null;
  icon: string | null;
  style: StoredMenuItem['style'];
  openInNewTab: boolean;
  relNofollow: boolean;
  source: MenuSource;
}

export interface AdminMenuSummary {
  id: string;
  name: string;
  version: number;
  itemCount: number;
  locations: MenuLocationKey[];
  updatedAt: string;
}

export interface AdminMenuDetail extends AdminMenuSummary {
  items: AdminMenuItem[];
}

export interface AdminMenuLocation {
  location: MenuLocationKey;
  label: string;
  description: string;
  maxDepth: number;
  menuId: string | null;
  menuName: string | null;
  version: number;
  updatedAt: string;
}

export type PublicMenus = Record<MenuLocationKey, PublicMenuItem[]>;

const invalid = (fields: MenuFieldErrors, message = 'Some fields are invalid') => new HttpException({ code: 'VALIDATION_ERROR', message, fields }, HttpStatus.BAD_REQUEST);
const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'No such menu' });
const stale = () => new ConflictException({ code: 'STALE_VERSION', message: 'This was changed by someone else. Reload and try again.' });

/**
 * Navigation menus (SRS 1.9 MENU 001–006).
 *
 * A menu is edited as a whole tree and saved in one transaction with the
 * version it was loaded at, the way a WordPress editor saves a menu: the
 * structure is only meaningful as a whole, so a partial save would publish a
 * tree nobody built. The structural rules live in `@adelaide-sphere/domain`
 * and are applied here against every location the menu is shown in.
 */
/** Refuses a menu that no longer exists, or whose items break the location's rules (depth, headings, limits). */
function assertFitsLocation(menu: { name: string; items: StoredMenuItem[] } | null, location: MenuLocationKey, label: string): void {
  if (!menu) throw invalid({ menuId: ['That menu no longer exists'] });
  const problems = Object.values(validateMenuTree(orderMenuItems(menu.items).map(toTreeInput), [location])).flat();
  if (problems.length > 0) {
    throw new HttpException({ code: 'MENU_EXCEEDS_LOCATION', message: `"${menu.name}" does not fit the ${label.toLowerCase()}: ${problems[0]}`, fields: { menuId: problems.slice(0, 5) } }, HttpStatus.BAD_REQUEST);
  }
}

@Injectable()
export class MenuService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly storage: ObjectStoragePort,
  ) {}

  private validateName(name: string): string {
    const trimmed = (name ?? '').trim();
    if (trimmed.length === 0) throw invalid({ name: ['Give the menu a name'] });
    if (trimmed.length > MENU_LIMITS.name) throw invalid({ name: [`A name is at most ${MENU_LIMITS.name} characters`] });
    return trimmed;
  }

  private async assertNameFree(db: Prisma.TransactionClient, name: string, exceptId?: string): Promise<void> {
    const clash = await db.menu.findFirst({ where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (clash) throw invalid({ name: ['Another menu already has this name'] });
  }

  private async purge(tx: Prisma.TransactionClient, ctx: RequestContext, menuId: string): Promise<void> {
    await this.cache.recordInvalidation(tx, { resourceType: 'menu', resourceId: menuId, correlationId: ctx.requestId, tags: [CACHE_TAGS.menus] });
  }

  // ---- admin ---------------------------------------------------------------

  async list(query: { page: number; pageSize: number }): Promise<{ rows: AdminMenuSummary[]; total: number }> {
    const db = await this.database.client();
    const [rows, total] = await Promise.all([
      db.menu.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { items: true } }, locations: { select: { location: true } } },
      }),
      db.menu.count(),
    ]);
    return {
      rows: rows.map((row) => ({
        id: row.id,
        name: row.name,
        version: row.version,
        itemCount: row._count.items,
        locations: row.locations.map((entry) => entry.location),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
    };
  }

  async get(id: string): Promise<AdminMenuDetail> {
    const db = await this.database.client();
    const row = await db.menu.findUnique({ where: { id }, include: { items: { select: MENU_ITEM_SELECT }, locations: { select: { location: true } } } });
    if (!row) throw notFound();
    const ordered = orderMenuItems(row.items);
    const lookups = await loadMenuLookups(db, ordered, this.storage);
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      itemCount: ordered.length,
      locations: row.locations.map((entry) => entry.location),
      updatedAt: row.updatedAt.toISOString(),
      items: ordered.map((item) => ({
        key: item.id,
        parentKey: item.parentId,
        type: item.type,
        refId: referenceOf(item),
        routeKey: item.routeKey,
        url: item.url,
        label: item.label,
        titleAttribute: item.titleAttribute,
        description: item.description,
        icon: item.icon,
        style: item.style,
        openInNewTab: item.openInNewTab,
        relNofollow: item.relNofollow,
        source: resolveSource(item, lookups),
      })),
    };
  }

  async create(input: { name: string }, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminMenuDetail> {
    const name = this.validateName(input.name);
    const db = await this.database.client();
    const created = await db.$transaction(async (tx) => {
      if ((await tx.menu.count()) >= MENU_LIMITS.menus) {
        throw new ConflictException({ code: 'MENU_LIMIT', message: `There can be at most ${MENU_LIMITS.menus} menus. Delete one you no longer use first.` });
      }
      await this.assertNameFree(tx, name);
      const row = await tx.menu.create({ data: { name, createdByAdminId: actor.id, updatedByAdminId: actor.id } });
      await recordContentActivity(tx, this.audit, { action: 'website.menu.create', targetType: 'menu', targetId: row.id, actor, ctx, metadata: { name } });
      // An empty, unassigned menu changes nothing public.
      return row;
    });
    return this.get(created.id);
  }

  /** Validates that every referenced record exists; ids from a stale browser tab are refused, not stored. */
  private async assertReferencesExist(tx: Prisma.TransactionClient, items: readonly MenuTreeInputItem[]): Promise<void> {
    const wanted = (type: MenuTreeInputItem['type']) => [...new Set(items.filter((item) => item.type === type && item.refId).map((item) => item.refId!))];
    const found = async (type: MenuTreeInputItem['type'], query: (ids: string[]) => Promise<{ id: string }[]>) => {
      const ids = wanted(type);
      return { type, present: new Set(ids.length ? (await query(ids)).map((row) => row.id) : []) };
    };
    const select = { id: true } as const;
    // Sequential: an interactive transaction holds one connection.
    const results = [];
    for (const lookup of [
      () => found('page', (ids) => tx.staticPage.findMany({ where: { id: { in: ids } }, select })),
      () => found('post', (ids) => tx.post.findMany({ where: { id: { in: ids } }, select })),
      () => found('blog_category', (ids) => tx.blogCategory.findMany({ where: { id: { in: ids } }, select })),
      () => found('blog_tag', (ids) => tx.blogTag.findMany({ where: { id: { in: ids } }, select })),
      () => found('business_category', (ids) => tx.category.findMany({ where: { id: { in: ids } }, select })),
      () => found('area', (ids) => tx.localArea.findMany({ where: { id: { in: ids } }, select })),
      () => found('business', (ids) => tx.business.findMany({ where: { id: { in: ids } }, select })),
      () => found('document', (ids) => tx.mediaAsset.findMany({ where: { id: { in: ids }, kind: 'document' }, select })),
    ]) {
      results.push(await lookup());
    }
    const present = new Map(results.map((result) => [result.type, result.present]));
    const fields: MenuFieldErrors = {};
    items.forEach((item, index) => {
      const set = present.get(item.type);
      if (set && item.refId && !set.has(item.refId)) fields[`items[${index}].refId`] = ['What this item linked to has been deleted. Remove the item or add it again.'];
    });
    if (Object.keys(fields).length > 0) throw invalid(fields);
  }

  async save(id: string, input: { name: string; expectedVersion: number; items: MenuTreeInputItem[] }, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminMenuDetail> {
    const name = this.validateName(input.name);
    const db = await this.database.client();
    const current = await db.menu.findUnique({ where: { id }, include: { locations: { select: { location: true } }, _count: { select: { items: true } } } });
    if (!current) throw notFound();
    assertVersion(current.version, input.expectedVersion);

    const locations = current.locations.map((entry) => entry.location);
    const fields = validateMenuTree(input.items, locations);
    if (Object.keys(fields).length > 0) throw invalid(fields, 'Some menu items need attention');

    const shownCount = await db.$transaction(async (tx) => {
      // The version guard is repeated inside the transaction: two saves that
      // both passed the check above cannot both write.
      const claimed = await tx.menu.updateMany({ where: { id, version: input.expectedVersion }, data: { name, version: { increment: 1 }, updatedByAdminId: actor.id } });
      if (claimed.count === 0) throw stale();
      // Where the menu is shown, read again now that its row is locked: an assignment made since the check above is honoured.
      const shownIn = (await tx.menuLocation.findMany({ where: { menuId: id }, select: { location: true } })).map((entry) => entry.location);
      const lockedFields = validateMenuTree(input.items, shownIn);
      if (Object.keys(lockedFields).length > 0) throw invalid(lockedFields, 'Some menu items need attention');
      await this.assertNameFree(tx, name, id);
      await this.assertReferencesExist(tx, input.items);
      const itemCount = await replaceMenuItems(tx, id, input.items);
      await recordContentActivity(tx, this.audit, {
        action: 'website.menu.update',
        targetType: 'menu',
        targetId: id,
        actor,
        ctx,
        metadata: { name, itemCount, previousItemCount: current._count.items, renamed: name !== current.name },
      });
      if (shownIn.length > 0) await this.purge(tx, ctx, id);
      return shownIn.length;
    });
    if (shownCount > 0) await this.cache.bumpNamespace();
    return this.get(id);
  }

  async remove(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const db = await this.database.client();
    const current = await db.menu.findUnique({ where: { id }, include: { locations: { select: { location: true } }, _count: { select: { items: true } } } });
    if (!current) throw notFound();
    if (current.locations.length > 0) {
      const names = current.locations.map((entry) => menuLocation(entry.location)?.label ?? entry.location).join(', ');
      throw new ConflictException({ code: 'MENU_ASSIGNED', message: `This menu is shown in: ${names}. Assign another menu there first.` });
    }
    await db.$transaction(async (tx) => {
      await tx.menu.delete({ where: { id } });
      await recordContentActivity(tx, this.audit, { action: 'website.menu.delete', targetType: 'menu', targetId: id, actor, ctx, metadata: { name: current.name, itemCount: current._count.items } });
    });
  }

  async locations(): Promise<AdminMenuLocation[]> {
    const db = await this.database.client();
    const rows = await db.menuLocation.findMany({ include: { menu: { select: { name: true } } } });
    const byKey = new Map(rows.map((row) => [row.location, row]));
    return MENU_LOCATIONS.map((definition) => {
      const row = byKey.get(definition.key);
      return {
        location: definition.key,
        label: definition.label,
        description: definition.description,
        maxDepth: definition.maxDepth,
        menuId: row?.menuId ?? null,
        menuName: row?.menu?.name ?? null,
        version: row?.version ?? 1,
        updatedAt: (row?.updatedAt ?? new Date(0)).toISOString(),
      };
    });
  }

  async assignLocation(location: MenuLocationKey, input: { menuId: string | null; expectedVersion: number }, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminMenuLocation[]> {
    const definition = menuLocation(location);
    if (!definition) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such menu location' });
    const db = await this.database.client();
    const current = await db.menuLocation.findUnique({ where: { location } });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such menu location' });
    assertVersion(current.version, input.expectedVersion);

    if (input.menuId === null && location === 'primary') {
      throw new ConflictException({ code: 'LOCATION_REQUIRED', message: 'The site header always needs a primary menu. Assign a different menu instead of clearing it.' });
    }
    if (input.menuId !== null) {
      const menu = await db.menu.findUnique({ where: { id: input.menuId }, include: { items: { select: MENU_ITEM_SELECT } } });
      assertFitsLocation(menu, location, definition.label);
    }
    if (current.menuId === input.menuId) return this.locations();

    await db.$transaction(async (tx) => {
      if (input.menuId !== null) {
        // Locks the menu, then checks its items again, so a save cannot change them between the check above and this assignment.
        await tx.$queryRaw`SELECT id FROM menus WHERE id = ${input.menuId} FOR UPDATE`;
        assertFitsLocation(await tx.menu.findUnique({ where: { id: input.menuId }, include: { items: { select: MENU_ITEM_SELECT } } }), location, definition.label);
      }
      const claimed = await tx.menuLocation.updateMany({ where: { location, version: input.expectedVersion }, data: { menuId: input.menuId, version: { increment: 1 }, updatedByAdminId: actor.id } });
      if (claimed.count === 0) throw stale();
      await recordContentActivity(tx, this.audit, {
        action: 'website.menu.location.assign',
        targetType: 'menu_location',
        targetId: location,
        actor,
        ctx,
        metadata: { location, from: current.menuId, to: input.menuId },
      });
      await this.purge(tx, ctx, input.menuId ?? current.menuId ?? location);
    });
    await this.cache.bumpNamespace();
    return this.locations();
  }

  // ---- public --------------------------------------------------------------

  /**
   * Every location's visible tree. Publication is decided here, in the
   * backend, so a draft page or an inactive category cannot reach the header
   * by any route (MENU 005).
   */
  async publicMenus(): Promise<PublicMenus> {
    const db = await this.database.client();
    const rows = await db.menuLocation.findMany({ where: { menuId: { not: null } }, include: { menu: { include: { items: { select: MENU_ITEM_SELECT } } } } });
    const allItems = rows.flatMap((row) => row.menu?.items ?? []);
    const lookups = await loadMenuLookups(db, allItems, this.storage);
    const out: PublicMenus = { primary: [], secondary: [], footer: [], footer_bottom: [] };
    for (const row of rows) out[row.location] = resolvePublicMenu(row.menu?.items ?? [], lookups);
    return out;
  }
}

