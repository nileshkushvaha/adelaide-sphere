import { menuItemType, seoRoute, type MenuItemStyle, type MenuItemType, type MenuTreeInputItem } from '@adelaide-sphere/domain';

/**
 * Pure navigation-menu logic (SRS 1.9 MENU 005): where each item links, whether
 * the public can see what it links to, and the tree the public site renders.
 *
 * Kept free of the database so the publication rules — the part that decides
 * whether a draft page can leak into the header — are tested directly.
 */

/** A `menu_items` row, as far as this logic needs it. */
export interface StoredMenuItem {
  id: string;
  parentId: string | null;
  position: number;
  type: MenuItemType;
  pageId: string | null;
  postId: string | null;
  blogCategoryId: string | null;
  blogTagId: string | null;
  categoryId: string | null;
  localAreaId: string | null;
  businessId: string | null;
  documentId: string | null;
  routeKey: string | null;
  url: string | null;
  label: string | null;
  titleAttribute: string | null;
  description: string | null;
  icon: string | null;
  style: MenuItemStyle;
  openInNewTab: boolean;
  relNofollow: boolean;
}

export type MenuSourceState = 'ok' | 'unpublished' | 'scheduled' | 'inactive' | 'missing';

export interface MenuSource {
  state: MenuSourceState;
  /** The linked record's own title, used when the item has no label. */
  title: string | null;
  href: string | null;
}

interface Titled {
  slug: string;
  title: string;
}

/** Everything the resolver needs to know about linked records, keyed by id. */
export interface MenuLookups {
  pages: Map<string, Titled & { status: string }>;
  posts: Map<string, Titled & { status: string }>;
  blogCategories: Map<string, Titled & { active: boolean }>;
  blogTags: Map<string, Titled & { active: boolean }>;
  categories: Map<string, Titled & { active: boolean }>;
  areas: Map<string, Titled & { active: boolean }>;
  businesses: Map<string, Titled & { status: string }>;
  /** Documents by id, with their published address when ready (change log 1.16). */
  documents: Map<string, { title: string; url: string | null; status: string }>;
  /** The FAQ route answers 404 while nothing is published. */
  faqsPublished: boolean;
}

export const emptyLookups = (): MenuLookups => ({
  pages: new Map(),
  posts: new Map(),
  blogCategories: new Map(),
  blogTags: new Map(),
  categories: new Map(),
  areas: new Map(),
  businesses: new Map(),
  documents: new Map(),
  faqsPublished: false,
});

/** The id column a referenced item type stores its target in. */
export const REFERENCE_COLUMN = {
  page: 'pageId',
  post: 'postId',
  blog_category: 'blogCategoryId',
  blog_tag: 'blogTagId',
  business_category: 'categoryId',
  area: 'localAreaId',
  business: 'businessId',
  document: 'documentId',
} as const satisfies Partial<Record<MenuItemType, keyof StoredMenuItem>>;

export type ReferencedMenuItemType = keyof typeof REFERENCE_COLUMN;

export function isReferencedType(type: MenuItemType): type is ReferencedMenuItemType {
  return type in REFERENCE_COLUMN;
}

export function referenceOf(item: StoredMenuItem): string | null {
  return isReferencedType(item.type) ? item[REFERENCE_COLUMN[item.type]] : null;
}

const published = (status: string): MenuSourceState => (status === 'published' ? 'ok' : status === 'scheduled' ? 'scheduled' : 'unpublished');
const active = (flag: boolean): MenuSourceState => (flag ? 'ok' : 'inactive');

export function resolveSource(item: StoredMenuItem, lookups: MenuLookups): MenuSource {
  const missing: MenuSource = { state: 'missing', title: null, href: null };
  switch (item.type) {
    case 'custom':
      return { state: item.url ? 'ok' : 'missing', title: null, href: item.url };
    case 'heading':
      return { state: 'ok', title: null, href: null };
    case 'route': {
      const route = item.routeKey ? seoRoute(item.routeKey) : undefined;
      if (!route) return missing;
      const state = route.key === 'faqs' && !lookups.faqsPublished ? 'unpublished' : 'ok';
      return { state, title: route.label, href: route.path };
    }
    case 'page': {
      const row = item.pageId ? lookups.pages.get(item.pageId) : undefined;
      return row ? { state: published(row.status), title: row.title, href: `/${row.slug}` } : missing;
    }
    case 'post': {
      const row = item.postId ? lookups.posts.get(item.postId) : undefined;
      return row ? { state: published(row.status), title: row.title, href: `/blog/${row.slug}` } : missing;
    }
    case 'blog_category': {
      const row = item.blogCategoryId ? lookups.blogCategories.get(item.blogCategoryId) : undefined;
      return row ? { state: active(row.active), title: row.title, href: `/blog/category/${row.slug}` } : missing;
    }
    case 'blog_tag': {
      const row = item.blogTagId ? lookups.blogTags.get(item.blogTagId) : undefined;
      return row ? { state: active(row.active), title: row.title, href: `/blog/tag/${row.slug}` } : missing;
    }
    case 'business_category': {
      const row = item.categoryId ? lookups.categories.get(item.categoryId) : undefined;
      return row ? { state: active(row.active), title: row.title, href: `/business/category/${row.slug}` } : missing;
    }
    case 'area': {
      const row = item.localAreaId ? lookups.areas.get(item.localAreaId) : undefined;
      return row ? { state: active(row.active), title: row.title, href: `/business/area/${row.slug}` } : missing;
    }
    case 'business': {
      const row = item.businessId ? lookups.businesses.get(item.businessId) : undefined;
      return row ? { state: published(row.status), title: row.title, href: `/business/${row.slug}` } : missing;
    }
    case 'document': {
      // A document is shown only once its upload has been checked and published.
      const row = item.documentId ? lookups.documents.get(item.documentId) : undefined;
      return row ? { state: row.status === 'ready' && row.url ? 'ok' : 'unpublished', title: row.title, href: row.url } : missing;
    }
  }
}

/** Display order: siblings by position, depth first, parents before children. */
export function orderMenuItems<T extends Pick<StoredMenuItem, 'id' | 'parentId' | 'position'>>(items: readonly T[]): T[] {
  const byParent = new Map<string | null, T[]>();
  for (const item of items) byParent.set(item.parentId, [...(byParent.get(item.parentId) ?? []), item]);
  for (const list of byParent.values()) list.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const out: T[] = [];
  const walk = (parentId: string | null, depth: number) => {
    if (depth > 3) return;
    for (const item of byParent.get(parentId) ?? []) {
      out.push(item);
      walk(item.id, depth + 1);
    }
  };
  walk(null, 1);
  return out;
}

/** A stored item as the whole-tree rules see it. */
export function toTreeInput(item: StoredMenuItem): MenuTreeInputItem {
  const referenced = menuItemType(item.type)?.referenced ?? false;
  return {
    key: item.id,
    parentKey: item.parentId,
    type: item.type,
    // A cleared reference still counts as "chosen" for structural checks.
    refId: referenced ? (referenceOf(item) ?? 'missing') : null,
    routeKey: item.routeKey,
    url: item.url,
    label: item.label,
    titleAttribute: item.titleAttribute,
    description: item.description,
    icon: item.icon,
    style: item.style,
    openInNewTab: item.openInNewTab,
    relNofollow: item.relNofollow,
  };
}

export interface PublicMenuItem {
  id: string;
  label: string;
  href: string | null;
  external: boolean;
  newTab: boolean;
  rel: string | null;
  title: string | null;
  description: string | null;
  icon: string | null;
  style: MenuItemStyle;
  children: PublicMenuItem[];
}

/**
 * The tree a visitor sees. An item whose target is unpublished, inactive or
 * deleted is hidden together with everything under it — a child of a hidden
 * parent has nowhere to appear — and a heading left with no children is
 * dropped rather than shown as a dead label.
 */
export function resolvePublicMenu(items: readonly StoredMenuItem[], lookups: MenuLookups): PublicMenuItem[] {
  const byParent = new Map<string | null, StoredMenuItem[]>();
  for (const item of orderMenuItems(items)) byParent.set(item.parentId, [...(byParent.get(item.parentId) ?? []), item]);

  const build = (parentId: string | null, depth: number): PublicMenuItem[] => {
    if (depth > 3) return [];
    const out: PublicMenuItem[] = [];
    for (const item of byParent.get(parentId) ?? []) {
      const source = resolveSource(item, lookups);
      if (source.state !== 'ok') continue;
      const children = build(item.id, depth + 1);
      if (item.type === 'heading' && children.length === 0) continue;
      const label = (item.label?.trim() || source.title || '').trim();
      if (!label) continue;
      const href = source.href;
      const rel = [item.openInNewTab ? 'noopener noreferrer' : null, item.relNofollow ? 'nofollow' : null].filter(Boolean).join(' ');
      out.push({
        id: item.id,
        label,
        href,
        external: href !== null && /^(https?:|mailto:|tel:)/i.test(href),
        newTab: item.openInNewTab && href !== null,
        rel: rel || null,
        title: item.titleAttribute?.trim() || null,
        description: item.description?.trim() || null,
        icon: item.icon,
        style: item.type === 'heading' ? 'link' : item.style,
        children,
      });
    }
    return out;
  };
  return build(null, 1);
}
