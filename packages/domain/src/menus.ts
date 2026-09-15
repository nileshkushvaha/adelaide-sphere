/**
 * Navigation menu rules (SRS 1.9 MENU 001–006): the locations a menu can be
 * shown in, the kinds of item it can hold, the icons an item may carry and the
 * structural rules a saved tree must satisfy.
 *
 * One definition, read by three things — the API (which is the authority and
 * refuses a tree that breaks a rule), the admin (which checks the same rules
 * before saving so an editor sees the problem on the item they are editing)
 * and the public site (which draws each icon key with its own icon set).
 */
import { validateAlertLink, type ValidatedLink } from './urls.js';
import { SEO_ROUTE_KEYS } from './seo-routes.js';

export type MenuLocationKey = 'primary' | 'secondary' | 'footer' | 'footer_bottom';

export interface MenuLocationDefinition {
  key: MenuLocationKey;
  label: string;
  description: string;
  /** Deepest level an item may sit at; 1 means no children. */
  maxDepth: number;
  /** Most items allowed at the top level. */
  maxTopLevel: number;
  /** Most children under one parent, where the location has children. */
  maxChildren: number;
  /** Most button-style (call to action) items. */
  maxButtons: number;
}

export const MENU_LOCATIONS: readonly MenuLocationDefinition[] = Object.freeze([
  {
    key: 'primary',
    label: 'Primary menu',
    description: 'The main navigation in the site header, with dropdowns and the mobile menu.',
    maxDepth: 3,
    maxTopLevel: 8,
    maxChildren: 12,
    maxButtons: 2,
  },
  {
    key: 'secondary',
    label: 'Secondary menu',
    description: 'Short links on the right of the contact strip above the header.',
    maxDepth: 1,
    maxTopLevel: 6,
    maxChildren: 0,
    maxButtons: 0,
  },
  {
    key: 'footer',
    label: 'Footer menu',
    description: 'Each top-level item is a footer column heading; its children are the links in that column.',
    maxDepth: 2,
    maxTopLevel: 4,
    maxChildren: 12,
    maxButtons: 0,
  },
  {
    key: 'footer_bottom',
    label: 'Footer bottom',
    description: 'The row of links beside the copyright notice, usually the policies.',
    maxDepth: 1,
    maxTopLevel: 6,
    maxChildren: 0,
    maxButtons: 0,
  },
]);

export const MENU_LOCATION_KEYS: readonly MenuLocationKey[] = MENU_LOCATIONS.map((location) => location.key);

export function menuLocation(key: string): MenuLocationDefinition | undefined {
  return MENU_LOCATIONS.find((location) => location.key === key);
}

/**
 * Bounds on one menu. The item cap keeps a whole-tree save of the longest
 * permitted fields inside the API's 64 KB JSON body limit.
 */
export const MENU_LIMITS = Object.freeze({
  menus: 20,
  items: 60,
  name: 80,
  label: 80,
  titleAttribute: 100,
  description: 120,
  url: 300,
  key: 64,
});

export type MenuItemType =
  | 'custom'
  | 'heading'
  | 'route'
  | 'page'
  | 'post'
  | 'blog_category'
  | 'blog_tag'
  | 'business_category'
  | 'area'
  | 'business'
  | 'document';

export interface MenuItemTypeDefinition {
  type: MenuItemType;
  label: string;
  /** Whether the item points at a stored record by id. */
  referenced: boolean;
}

export const MENU_ITEM_TYPES: readonly MenuItemTypeDefinition[] = Object.freeze([
  { type: 'custom', label: 'Custom link', referenced: false },
  { type: 'heading', label: 'Heading', referenced: false },
  { type: 'route', label: 'Site page', referenced: false },
  { type: 'page', label: 'Page', referenced: true },
  { type: 'post', label: 'Post', referenced: true },
  { type: 'blog_category', label: 'Blog category', referenced: true },
  { type: 'blog_tag', label: 'Blog tag', referenced: true },
  { type: 'business_category', label: 'Business category', referenced: true },
  { type: 'area', label: 'Local area', referenced: true },
  { type: 'business', label: 'Business', referenced: true },
  // A PDF from the media library (change log 1.16).
  { type: 'document', label: 'Document', referenced: true },
]);

export const MENU_ITEM_TYPE_KEYS: readonly MenuItemType[] = MENU_ITEM_TYPES.map((definition) => definition.type);

export function menuItemType(type: string): MenuItemTypeDefinition | undefined {
  return MENU_ITEM_TYPES.find((definition) => definition.type === type);
}

export type MenuItemStyle = 'link' | 'button';
export const MENU_ITEM_STYLES: readonly MenuItemStyle[] = ['link', 'button'];

export type MenuIconKey =
  | 'home' | 'store' | 'newspaper' | 'info' | 'mail' | 'phone' | 'help' | 'map-pin' | 'tag' | 'folder'
  | 'star' | 'users' | 'calendar' | 'shield' | 'file-text' | 'external' | 'search' | 'plus' | 'heart' | 'briefcase'
  | 'coffee' | 'utensils' | 'wrench' | 'shopping-bag' | 'graduation' | 'camera' | 'sparkles' | 'bell' | 'arrow-right' | 'globe'
  | 'book' | 'message';

export const MENU_ICON_LIBRARY: readonly { key: MenuIconKey; label: string }[] = Object.freeze([
  { key: 'home', label: 'Home' },
  { key: 'store', label: 'Shop front' },
  { key: 'newspaper', label: 'Newspaper' },
  { key: 'info', label: 'Information' },
  { key: 'mail', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'message', label: 'Message' },
  { key: 'help', label: 'Help' },
  { key: 'map-pin', label: 'Map pin' },
  { key: 'tag', label: 'Tag' },
  { key: 'folder', label: 'Folder' },
  { key: 'star', label: 'Star' },
  { key: 'users', label: 'People' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'shield', label: 'Shield' },
  { key: 'file-text', label: 'Document' },
  { key: 'book', label: 'Book' },
  { key: 'external', label: 'External link' },
  { key: 'search', label: 'Search' },
  { key: 'plus', label: 'Add' },
  { key: 'heart', label: 'Heart' },
  { key: 'briefcase', label: 'Briefcase' },
  { key: 'coffee', label: 'Coffee' },
  { key: 'utensils', label: 'Dining' },
  { key: 'wrench', label: 'Trades' },
  { key: 'shopping-bag', label: 'Shopping' },
  { key: 'graduation', label: 'Education' },
  { key: 'camera', label: 'Camera' },
  { key: 'sparkles', label: 'Sparkles' },
  { key: 'bell', label: 'Bell' },
  { key: 'arrow-right', label: 'Arrow' },
  { key: 'globe', label: 'Globe' },
]);

const ICON_KEYS = new Set<string>(MENU_ICON_LIBRARY.map((icon) => icon.key));

export function isMenuIconKey(value: unknown): value is MenuIconKey {
  return typeof value === 'string' && ICON_KEYS.has(value);
}

/**
 * A menu link destination: a site-relative path, an http(s) URL, or a single
 * `mailto:` address / `tel:` number. Everything else — `javascript:`, `data:`,
 * protocol-relative hosts, credentials, extra mail headers — is refused when
 * saved, never filtered when rendered.
 */
export function validateMenuLink(value: string): ValidatedLink | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MENU_LIMITS.url) return null;
  if (/^mailto:/i.test(trimmed)) {
    const address = trimmed.slice('mailto:'.length);
    // One address, no query string: `?cc=` / `?bcc=` / `?body=` are refused.
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(address) ? { url: `mailto:${address}`, external: true } : null;
  }
  if (/^tel:/i.test(trimmed)) {
    const number = trimmed.slice('tel:'.length);
    return /^\+?[0-9][0-9 ()-]{2,24}$/.test(number) ? { url: `tel:${number.replace(/[ ()-]/g, '')}`, external: true } : null;
  }
  // A fragment on the current page is a legitimate in-page link.
  if (/^#[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(trimmed)) return { url: trimmed, external: false };
  return validateAlertLink(trimmed);
}

/** One item as a whole-tree save describes it: flat, in display order, parents before children. */
export interface MenuTreeInputItem {
  /** Client-chosen identifier, unique within the save; stored ids may be reused. */
  key: string;
  parentKey: string | null;
  type: MenuItemType;
  refId?: string | null;
  routeKey?: string | null;
  url?: string | null;
  label?: string | null;
  titleAttribute?: string | null;
  description?: string | null;
  icon?: string | null;
  style?: MenuItemStyle;
  openInNewTab?: boolean;
  relNofollow?: boolean;
}

export type MenuFieldErrors = Record<string, string[]>;

function add(fields: MenuFieldErrors, path: string, message: string): void {
  (fields[path] ??= []).push(message);
}

/** Depth (1-based) of every item, or null for an item whose ancestry is broken. */
export function menuItemDepths(items: readonly Pick<MenuTreeInputItem, 'key' | 'parentKey'>[]): Map<string, number | null> {
  const parentOf = new Map(items.map((item) => [item.key, item.parentKey]));
  const depths = new Map<string, number | null>();
  for (const item of items) {
    let depth = 1;
    let parent = item.parentKey;
    const seen = new Set<string>([item.key]);
    while (parent !== null) {
      if (seen.has(parent) || !parentOf.has(parent)) {
        depth = -1;
        break;
      }
      seen.add(parent);
      depth += 1;
      parent = parentOf.get(parent) ?? null;
    }
    depths.set(item.key, depth < 0 ? null : depth);
  }
  return depths;
}

/**
 * Validates a whole menu against its structural rules and against every
 * location it is assigned to (the strictest location wins). Returns field
 * errors keyed by `items[i].field`, or `items` for the tree as a whole; an
 * empty object means the tree is acceptable.
 */
export function validateMenuTree(items: readonly MenuTreeInputItem[], locations: readonly MenuLocationKey[] = []): MenuFieldErrors {
  const fields: MenuFieldErrors = {};
  if (items.length > MENU_LIMITS.items) add(fields, 'items', `A menu holds at most ${MENU_LIMITS.items} items`);

  const indexOf = new Map<string, number>();
  items.forEach((item, index) => {
    if (!item.key || item.key.length > MENU_LIMITS.key) add(fields, `items[${index}].key`, 'Each item needs a short identifier');
    else if (indexOf.has(item.key)) add(fields, `items[${index}].key`, 'Two items share an identifier');
    else indexOf.set(item.key, index);
  });

  const depths = menuItemDepths(items);
  const definitions = locations.map((key) => menuLocation(key)).filter((location): location is MenuLocationDefinition => Boolean(location));
  const maxDepth = Math.min(3, ...definitions.map((location) => location.maxDepth));
  const childCount = new Map<string, number>();

  items.forEach((item, index) => {
    const at = (field: string) => `items[${index}].${field}`;
    const type = menuItemType(item.type);
    if (!type) {
      add(fields, at('type'), 'Unknown item type');
      return;
    }

    if (item.parentKey !== null) {
      if (item.parentKey === item.key) add(fields, at('parentKey'), 'An item cannot be its own parent');
      else if (!indexOf.has(item.parentKey)) add(fields, at('parentKey'), 'The parent item is not in this menu');
      else if ((indexOf.get(item.parentKey) ?? 0) > index) add(fields, at('parentKey'), 'A parent must come before its children');
      else childCount.set(item.parentKey, (childCount.get(item.parentKey) ?? 0) + 1);
    }
    const depth = depths.get(item.key);
    if (depth === null) add(fields, at('parentKey'), 'This item is inside a loop of parents');
    else if (depth !== undefined && depth > maxDepth) {
      add(fields, at('parentKey'), maxDepth === 1 ? 'This menu is shown where items cannot have children' : `Items can be nested at most ${maxDepth} levels deep here`);
    }

    const label = item.label?.trim() ?? '';
    if (label.length > MENU_LIMITS.label) add(fields, at('label'), `A label is at most ${MENU_LIMITS.label} characters`);
    if ((item.type === 'custom' || item.type === 'heading') && label.length === 0) add(fields, at('label'), 'Enter the text to show');
    if ((item.titleAttribute?.length ?? 0) > MENU_LIMITS.titleAttribute) add(fields, at('titleAttribute'), `A title attribute is at most ${MENU_LIMITS.titleAttribute} characters`);
    if ((item.description?.length ?? 0) > MENU_LIMITS.description) add(fields, at('description'), `A description is at most ${MENU_LIMITS.description} characters`);
    if (item.icon && !isMenuIconKey(item.icon)) add(fields, at('icon'), 'Choose an icon from the library');
    if (item.style && !MENU_ITEM_STYLES.includes(item.style)) add(fields, at('style'), 'Unknown style');

    if (item.type === 'custom') {
      if (!item.url || !validateMenuLink(item.url)) add(fields, at('url'), 'Enter a site path such as /blog, a full https:// address, or a mailto:/tel: link');
    } else if (item.url) add(fields, at('url'), 'Only a custom link has an address of its own');
    if (item.type === 'route') {
      if (!item.routeKey || !SEO_ROUTE_KEYS.includes(item.routeKey)) add(fields, at('routeKey'), 'Choose one of the site pages');
    }
    if (type.referenced && !item.refId) add(fields, at('refId'), 'Choose what this item links to');
    if (item.type === 'heading' && item.style === 'button') add(fields, at('style'), 'A heading cannot be a button');
  });

  // Location caps: counted once, reported against the tree.
  const topLevel = items.filter((item) => item.parentKey === null);
  const buttons = items.filter((item) => item.style === 'button').length;
  for (const location of definitions) {
    if (topLevel.length > location.maxTopLevel) add(fields, 'items', `The ${location.label.toLowerCase()} holds at most ${location.maxTopLevel} top-level items`);
    if (buttons > location.maxButtons) {
      add(fields, 'items', location.maxButtons === 0 ? `The ${location.label.toLowerCase()} cannot show button-style items` : `The ${location.label.toLowerCase()} shows at most ${location.maxButtons} button-style items`);
    }
    for (const [parentKey, count] of childCount) {
      if (location.maxChildren > 0 && count > location.maxChildren) {
        add(fields, `items[${indexOf.get(parentKey)}].parentKey`, `The ${location.label.toLowerCase()} shows at most ${location.maxChildren} links under one item`);
      }
    }
  }

  // A heading with nothing under it would render as a dead label.
  items.forEach((item, index) => {
    if (item.type === 'heading' && definitions.some((location) => location.maxDepth > 1) && !childCount.has(item.key)) {
      add(fields, `items[${index}].type`, 'A heading needs at least one item under it');
    }
  });

  return fields;
}
