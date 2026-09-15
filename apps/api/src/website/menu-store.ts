import { randomUUID } from 'node:crypto';
import type { Prisma } from '@adelaide-sphere/database';
import type { ObjectStoragePort } from '../media/storage.port.js';
import { menuItemDepths, validateMenuLink, type MenuTreeInputItem } from '@adelaide-sphere/domain';
import { REFERENCE_COLUMN, isReferencedType, type MenuLookups, type StoredMenuItem } from './menu-resolver.js';

/**
 * Database access shared by the menu service and the `menus:seed` command, so
 * both write a tree the same way and read linked records the same way.
 */

const titled = <T extends { id: string; slug: string; title: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));

/** Loads exactly the linked records these items reference, in one query per kind. */
export async function loadMenuLookups(db: Prisma.TransactionClient, items: readonly StoredMenuItem[], storage?: Pick<ObjectStoragePort, 'publicUrl'>): Promise<MenuLookups> {
  const ids = (column: (typeof REFERENCE_COLUMN)[keyof typeof REFERENCE_COLUMN]) => [...new Set(items.map((item) => item[column]).filter((id): id is string => Boolean(id)))];
  const pageIds = ids('pageId');
  const postIds = ids('postId');
  const blogCategoryIds = ids('blogCategoryId');
  const blogTagIds = ids('blogTagId');
  const categoryIds = ids('categoryId');
  const areaIds = ids('localAreaId');
  const businessIds = ids('businessId');
  const documentIds = ids('documentId');
  const needsFaqs = items.some((item) => item.type === 'route' && item.routeKey === 'faqs');

  const [pages, posts, blogCategories, blogTags, categories, areas, businesses, documents, faqCount] = await Promise.all([
    pageIds.length ? db.staticPage.findMany({ where: { id: { in: pageIds } }, select: { id: true, slug: true, title: true, status: true } }) : [],
    postIds.length ? db.post.findMany({ where: { id: { in: postIds } }, select: { id: true, slug: true, title: true, status: true } }) : [],
    blogCategoryIds.length ? db.blogCategory.findMany({ where: { id: { in: blogCategoryIds } }, select: { id: true, slug: true, name: true, active: true } }) : [],
    blogTagIds.length ? db.blogTag.findMany({ where: { id: { in: blogTagIds } }, select: { id: true, slug: true, name: true, active: true } }) : [],
    categoryIds.length ? db.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, slug: true, name: true, active: true, parent: { select: { active: true } } } }) : [],
    areaIds.length ? db.localArea.findMany({ where: { id: { in: areaIds } }, select: { id: true, slug: true, name: true, active: true } }) : [],
    businessIds.length ? db.business.findMany({ where: { id: { in: businessIds } }, select: { id: true, slug: true, name: true, status: true } }) : [],
    documentIds.length ? db.mediaAsset.findMany({ where: { id: { in: documentIds }, kind: 'document' }, select: { id: true, title: true, sourceName: true, status: true, publicObjectKey: true } }) : [],
    needsFaqs ? db.faq.count({ where: { status: 'published' } }) : 0,
  ]);

  return {
    pages: titled(pages),
    posts: titled(posts),
    blogCategories: titled(blogCategories.map((row) => ({ ...row, title: row.name }))),
    blogTags: titled(blogTags.map((row) => ({ ...row, title: row.name }))),
    // A child category under an inactive parent is not public (the parent is its path).
    categories: titled(categories.map((row) => ({ id: row.id, slug: row.slug, title: row.name, active: row.active && (row.parent?.active ?? true) }))),
    areas: titled(areas.map((row) => ({ ...row, title: row.name }))),
    businesses: titled(businesses.map((row) => ({ ...row, title: row.name }))),
    // Without storage (the seed command) no address can be built, so a document reads as not published.
    documents: new Map(documents.map((row) => [row.id, { title: row.title ?? row.sourceName, status: row.status, url: storage && row.publicObjectKey ? storage.publicUrl(row.publicObjectKey) : null }])),
    faqsPublished: faqCount > 0,
  };
}

export const MENU_ITEM_SELECT = {
  id: true,
  parentId: true,
  position: true,
  type: true,
  pageId: true,
  postId: true,
  blogCategoryId: true,
  blogTagId: true,
  categoryId: true,
  localAreaId: true,
  businessId: true,
  documentId: true,
  routeKey: true,
  url: true,
  label: true,
  titleAttribute: true,
  description: true,
  icon: true,
  style: true,
  openInNewTab: true,
  relNofollow: true,
} as const satisfies Prisma.MenuItemSelect;

/**
 * Replaces a menu's items with a validated tree. Items are inserted one level
 * at a time so every parent row exists before its children reference it, and
 * each save gets fresh ids — the editor reloads after saving.
 */
export async function replaceMenuItems(tx: Prisma.TransactionClient, menuId: string, items: readonly MenuTreeInputItem[]): Promise<number> {
  await tx.menuItem.deleteMany({ where: { menuId } });
  const depths = menuItemDepths(items);
  const idFor = new Map(items.map((item) => [item.key, randomUUID()]));
  const positions = new Map<string | null, number>();
  const byDepth: Prisma.MenuItemCreateManyInput[][] = [[], [], []];

  for (const item of items) {
    const depth = depths.get(item.key) ?? 1;
    const position = positions.get(item.parentKey) ?? 0;
    positions.set(item.parentKey, position + 1);
    const row: Prisma.MenuItemCreateManyInput = {
      id: idFor.get(item.key)!,
      menuId,
      parentId: item.parentKey === null ? null : (idFor.get(item.parentKey) ?? null),
      position,
      type: item.type,
      routeKey: item.type === 'route' ? (item.routeKey ?? null) : null,
      // The normalised address validation produced, e.g. a phone number without spaces.
      url: item.type === 'custom' ? (item.url ? (validateMenuLink(item.url)?.url ?? item.url.trim()) : null) : null,
      label: item.label?.trim() || null,
      titleAttribute: item.titleAttribute?.trim() || null,
      description: item.description?.trim() || null,
      icon: item.icon || null,
      style: item.type === 'heading' ? 'link' : (item.style ?? 'link'),
      openInNewTab: item.openInNewTab ?? false,
      relNofollow: item.relNofollow ?? false,
    };
    if (isReferencedType(item.type)) row[REFERENCE_COLUMN[item.type]] = item.refId ?? null;
    byDepth[Math.min(Math.max(depth, 1), 3) - 1]!.push(row);
  }
  for (const rows of byDepth) if (rows.length > 0) await tx.menuItem.createMany({ data: rows });
  return items.length;
}
