/**
 * Idempotent default navigation (SRS 1.9 MENU 003): the menus the site shipped
 * with before navigation became editable, so turning the feature on changes
 * nothing a visitor sees.
 *
 * Safe to run against any environment, including production, because it only
 * ever *adds*:
 *
 *  * a location that already shows a menu is left exactly as it is, so an
 *    editor's menus and assignments survive every re-run;
 *  * a menu that already exists under a default name is assigned as it is,
 *    never rewritten;
 *  * links to records point at what exists at the time — the six local areas
 *    and categories the footer listed, the policy pages — and are validated by
 *    the same rules as an editor's save;
 *  * every write is recorded in the audit log and invalidated through the same
 *    cache pipeline an editor's save uses.
 *
 * The secondary location is left empty: the site had no secondary menu.
 *
 *   pnpm --filter api menus:seed
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { CACHE_TAGS, validateMenuTree, type MenuLocationKey, type MenuTreeInputItem } from '@adelaide-sphere/domain';
import { AuditService } from '../audit/audit.service.js';
import { CacheService } from '../cache/cache.service.js';
import { DatabaseService } from '../database/database.service.js';
import { SYSTEM_PAGE_SLUGS, isProductRoute } from '../settings/static-pages.js';
import { MENU_ITEM_SELECT, replaceMenuItems } from '../website/menu-store.js';
import { orderMenuItems, toTreeInput } from '../website/menu-resolver.js';

type Db = Awaited<ReturnType<DatabaseService['client']>>;

interface DefaultMenu {
  location: MenuLocationKey;
  name: string;
  items: (db: Db) => Promise<MenuTreeInputItem[]>;
}

let counter = 0;
const key = () => `seed-${++counter}`;
const route = (routeKey: string, parentKey: string | null = null, label: string | null = null): MenuTreeInputItem => ({ key: key(), parentKey, type: 'route', routeKey, label });

const DEFAULT_MENUS: DefaultMenu[] = [
  {
    location: 'primary',
    name: 'Main navigation',
    items: async () => [
      route('home'),
      route('directory'),
      route('blog'),
      route('about'),
      route('contact'),
      { key: key(), parentKey: null, type: 'custom', url: '/contact', label: 'Add a business', style: 'button' },
    ],
  },
  {
    location: 'footer',
    name: 'Footer',
    items: async (db) => {
      const items: MenuTreeInputItem[] = [];
      const areas = await db.localArea.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }], take: 6, select: { id: true } });
      if (areas.length > 0) {
        const heading = { key: key(), parentKey: null, type: 'heading' as const, label: 'Local areas' };
        items.push(heading, ...areas.map((area) => ({ key: key(), parentKey: heading.key, type: 'area' as const, refId: area.id })));
      }
      const categories = await db.category.findMany({ where: { active: true, parentId: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }], take: 6, select: { id: true } });
      if (categories.length > 0) {
        const heading = { key: key(), parentKey: null, type: 'heading' as const, label: 'Categories' };
        items.push(heading, ...categories.map((category) => ({ key: key(), parentKey: heading.key, type: 'business_category' as const, refId: category.id })));
      }
      const information = { key: key(), parentKey: null, type: 'heading' as const, label: 'Information' };
      const customPages = (await db.staticPage.findMany({ where: { status: 'published' }, orderBy: { title: 'asc' }, select: { id: true, slug: true } })).filter(
        (page) => !SYSTEM_PAGE_SLUGS.includes(page.slug) && !isProductRoute(page.slug),
      );
      items.push(
        information,
        route('about', information.key, 'About us'),
        route('directory', information.key),
        route('blog', information.key, 'Latest articles'),
        route('faqs', information.key),
        ...customPages.slice(0, 5).map((page) => ({ key: key(), parentKey: information.key, type: 'page' as const, refId: page.id })),
        route('contact', information.key, 'Contact us'),
        { key: key(), parentKey: information.key, type: 'custom', url: '/contact', label: 'Add your business' },
      );
      return items;
    },
  },
  {
    location: 'footer_bottom',
    name: 'Footer legal',
    items: async (db) => {
      const pages = await db.staticPage.findMany({ where: { slug: { in: ['privacy', 'terms', 'review-guidelines'] } }, select: { id: true, slug: true } });
      const order = ['privacy', 'terms', 'review-guidelines'];
      return pages
        .sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug))
        .map((page) => ({ key: key(), parentKey: null, type: 'page' as const, refId: page.id }));
    },
  },
];

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'], abortOnError: false });
  try {
    const db = await app.get(DatabaseService).client();
    const cache = app.get(CacheService);
    const audit = app.get(AuditService);
    let assigned = 0;

    for (const menu of DEFAULT_MENUS) {
      const location = await db.menuLocation.findUnique({ where: { location: menu.location } });
      if (!location) {
        console.error(`[menus:seed] ${menu.location}: location row missing — run the migrations first`);
        process.exitCode = 1;
        continue;
      }
      if (location.menuId) {
        console.log(`[menus:seed] ${menu.location}: already shows a menu; nothing written`);
        continue;
      }

      // An existing menu with the default name is checked against the location's rules too, not assigned blindly.
      const existing = await db.menu.findUnique({ where: { name: menu.name }, include: { items: { select: MENU_ITEM_SELECT } } });
      const items: MenuTreeInputItem[] = existing ? orderMenuItems(existing.items).map(toTreeInput) : await menu.items(db);
      const problems = Object.entries(validateMenuTree(items, [menu.location]));
      if (problems.length > 0) {
        console.error(`[menus:seed] ${menu.location}: refusing to seed — ${problems.map(([field, messages]) => `${field}: ${messages.join(', ')}`).join('; ')}`);
        process.exitCode = 1;
        continue;
      }

      const menuId = await db.$transaction(async (tx) => {
        const id = existing?.id ?? (await tx.menu.create({ data: { name: menu.name } })).id;
        if (!existing) await replaceMenuItems(tx, id, items);
        // Only if the location is still empty and unchanged since it was read.
        const claimed = await tx.menuLocation.updateMany({ where: { location: menu.location, version: location.version, menuId: null }, data: { menuId: id, version: { increment: 1 } } });
        if (claimed.count !== 1) throw new Error(`${menu.location} changed while seeding; run the command again`);
        await cache.recordInvalidation(tx, { resourceType: 'menu', resourceId: id, tags: [CACHE_TAGS.menus] });
        return id;
      });
      await cache.bumpNamespace();
      await audit.recordOrThrow({ action: 'website.menu.location.assign', targetType: 'menu_location', targetId: menu.location, metadata: { location: menu.location, to: menuId, created: !existing, itemCount: items.length, source: 'menus:seed' } });
      assigned += 1;
      console.log(`[menus:seed] ${menu.location}: ${existing ? `assigned the existing "${menu.name}"` : `created "${menu.name}" with ${items.length} item(s)`}`);
    }

    console.log(`[menus:seed] ${assigned} location(s) assigned, ${DEFAULT_MENUS.length - assigned} left as they were`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(`[menus:seed] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
