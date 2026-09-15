import { describe, expect, it } from 'vitest';
import { emptyLookups, orderMenuItems, resolvePublicMenu, resolveSource, toTreeInput, type MenuLookups, type StoredMenuItem } from './menu-resolver.js';

const base: StoredMenuItem = {
  id: 'x',
  parentId: null,
  position: 0,
  type: 'route',
  pageId: null,
  postId: null,
  blogCategoryId: null,
  blogTagId: null,
  categoryId: null,
  localAreaId: null,
  businessId: null,
  documentId: null,
  routeKey: 'home',
  url: null,
  label: null,
  titleAttribute: null,
  description: null,
  icon: null,
  style: 'link',
  openInNewTab: false,
  relNofollow: false,
};
const item = (overrides: Partial<StoredMenuItem>): StoredMenuItem => ({ ...base, ...overrides });

const lookups = (): MenuLookups => {
  const value = emptyLookups();
  value.pages.set('p-live', { slug: 'privacy', title: 'Privacy Policy', status: 'published' });
  value.pages.set('p-draft', { slug: 'draft', title: 'Draft page', status: 'draft' });
  value.posts.set('post-live', { slug: 'hello', title: 'Hello', status: 'published' });
  value.posts.set('post-later', { slug: 'later', title: 'Later', status: 'scheduled' });
  value.blogCategories.set('bc', { slug: 'guides', title: 'Guides', active: true });
  value.blogTags.set('bt', { slug: 'coffee', title: 'Coffee', active: false });
  value.categories.set('c', { slug: 'cafes', title: 'Cafés', active: true });
  value.areas.set('a', { slug: 'fitzroy', title: 'Fitzroy', active: true });
  value.businesses.set('b', { slug: 'bean-there', title: 'Bean There', status: 'published' });
  return value;
};

describe('resolveSource', () => {
  it('computes the public address of every kind of item', () => {
    const l = lookups();
    expect(resolveSource(item({ type: 'route', routeKey: 'directory' }), l)).toEqual({ state: 'ok', title: 'Businesses', href: '/business' });
    expect(resolveSource(item({ type: 'page', routeKey: null, pageId: 'p-live' }), l).href).toBe('/privacy');
    expect(resolveSource(item({ type: 'post', routeKey: null, postId: 'post-live' }), l).href).toBe('/blog/hello');
    expect(resolveSource(item({ type: 'blog_category', routeKey: null, blogCategoryId: 'bc' }), l).href).toBe('/blog/category/guides');
    expect(resolveSource(item({ type: 'blog_tag', routeKey: null, blogTagId: 'bt' }), l).href).toBe('/blog/tag/coffee');
    expect(resolveSource(item({ type: 'business_category', routeKey: null, categoryId: 'c' }), l).href).toBe('/business/category/cafes');
    expect(resolveSource(item({ type: 'area', routeKey: null, localAreaId: 'a' }), l).href).toBe('/business/area/fitzroy');
    expect(resolveSource(item({ type: 'business', routeKey: null, businessId: 'b' }), l).href).toBe('/business/bean-there');
    expect(resolveSource(item({ type: 'custom', routeKey: null, url: 'https://example.com' }), l)).toEqual({ state: 'ok', title: null, href: 'https://example.com' });
  });

  it('reports what the public cannot see', () => {
    const l = lookups();
    expect(resolveSource(item({ type: 'page', routeKey: null, pageId: 'p-draft' }), l).state).toBe('unpublished');
    expect(resolveSource(item({ type: 'post', routeKey: null, postId: 'post-later' }), l).state).toBe('scheduled');
    expect(resolveSource(item({ type: 'blog_tag', routeKey: null, blogTagId: 'bt' }), l).state).toBe('inactive');
    expect(resolveSource(item({ type: 'page', routeKey: null, pageId: null }), l).state).toBe('missing');
    expect(resolveSource(item({ type: 'route', routeKey: 'faqs' }), l).state).toBe('unpublished');
    expect(resolveSource(item({ type: 'route', routeKey: 'faqs' }), { ...l, faqsPublished: true }).state).toBe('ok');
  });
});

describe('resolvePublicMenu', () => {
  it('orders siblings by position and nests children', () => {
    const menu = resolvePublicMenu(
      [item({ id: 'b', position: 1, routeKey: 'blog' }), item({ id: 'a', position: 0 }), item({ id: 'a1', parentId: 'a', routeKey: 'about' })],
      lookups(),
    );
    expect(menu.map((entry) => entry.label)).toEqual(['Home', 'Blog']);
    expect(menu[0]?.children.map((entry) => entry.label)).toEqual(['About']);
  });

  it('hides an unpublished item together with everything under it', () => {
    const menu = resolvePublicMenu([item({ id: 'p', type: 'page', routeKey: null, pageId: 'p-draft' }), item({ id: 'child', parentId: 'p' })], lookups());
    expect(menu).toEqual([]);
  });

  it('drops a heading whose children are all hidden', () => {
    const menu = resolvePublicMenu([item({ id: 'h', type: 'heading', routeKey: null, label: 'Areas' }), item({ id: 'gone', parentId: 'h', type: 'area', routeKey: null, localAreaId: null })], lookups());
    expect(menu).toEqual([]);
  });

  it('uses the label, falling back to the linked title, and sets rel for new tabs', () => {
    const [custom, page] = resolvePublicMenu(
      [
        item({ id: 'c', position: 0, type: 'custom', routeKey: null, url: 'https://example.com', label: 'Partner', openInNewTab: true, relNofollow: true }),
        item({ id: 'p', position: 1, type: 'page', routeKey: null, pageId: 'p-live' }),
      ],
      lookups(),
    );
    expect(custom).toMatchObject({ label: 'Partner', external: true, newTab: true, rel: 'noopener noreferrer nofollow' });
    expect(page).toMatchObject({ label: 'Privacy Policy', external: false, newTab: false, rel: null });
  });
});

describe('orderMenuItems / toTreeInput', () => {
  it('flattens depth first and keeps cleared references structurally valid', () => {
    const ordered = orderMenuItems([item({ id: 'child', parentId: 'root' }), item({ id: 'root' })]);
    expect(ordered.map((entry) => entry.id)).toEqual(['root', 'child']);
    expect(toTreeInput(item({ id: 'p', type: 'page', routeKey: null, pageId: null })).refId).toBe('missing');
  });
});
