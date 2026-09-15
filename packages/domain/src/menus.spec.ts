import { describe, expect, it } from 'vitest';
import { MENU_LIMITS, isMenuIconKey, validateMenuLink, validateMenuTree, type MenuTreeInputItem } from './menus.js';

const item = (key: string, parentKey: string | null = null, extra: Partial<MenuTreeInputItem> = {}): MenuTreeInputItem => ({
  key,
  parentKey,
  type: 'route',
  routeKey: 'home',
  ...extra,
});

describe('validateMenuLink', () => {
  it('accepts site paths, http(s) addresses, fragments and single mailto/tel links', () => {
    expect(validateMenuLink('/blog')).toEqual({ url: '/blog', external: false });
    expect(validateMenuLink('#footer-navigation')).toEqual({ url: '#footer-navigation', external: false });
    expect(validateMenuLink('https://example.com/a')?.external).toBe(true);
    expect(validateMenuLink('mailto:hello@example.com')).toEqual({ url: 'mailto:hello@example.com', external: true });
    expect(validateMenuLink('tel:+61 3 9000 0000')).toEqual({ url: 'tel:+61390000000', external: true });
  });

  it('refuses scripts, data, protocol-relative hosts, credentials and mail header injection', () => {
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,x', '//evil.example', 'https://u:p@example.com', 'mailto:a@b.com?bcc=c@d.com', 'mailto:a@b.com%0Abcc:x', 'tel:abc', '/a\\b', '', 'x'.repeat(301)]) {
      expect(validateMenuLink(bad), bad).toBeNull();
    }
  });
});

describe('validateMenuTree', () => {
  it('accepts a three-level primary tree', () => {
    expect(validateMenuTree([item('a'), item('b', 'a'), item('c', 'b')], ['primary'])).toEqual({});
  });

  it('enforces the depth of the strictest assigned location', () => {
    const tree = [item('a'), item('b', 'a')];
    expect(validateMenuTree(tree, ['primary'])).toEqual({});
    expect(validateMenuTree(tree, ['primary', 'secondary'])['items[1].parentKey']).toBeDefined();
    expect(validateMenuTree([item('a'), item('b', 'a'), item('c', 'b')], ['footer'])['items[2].parentKey']).toBeDefined();
  });

  it('never allows more than three levels, even unassigned', () => {
    expect(validateMenuTree([item('a'), item('b', 'a'), item('c', 'b'), item('d', 'c')])['items[3].parentKey']).toBeDefined();
  });

  it('refuses orphans, self-parents, children before parents and duplicate keys', () => {
    expect(validateMenuTree([item('a', 'missing')])['items[0].parentKey']).toBeDefined();
    expect(validateMenuTree([item('a', 'a')])['items[0].parentKey']).toBeDefined();
    expect(validateMenuTree([item('b', 'a'), item('a')])['items[0].parentKey']).toBeDefined();
    expect(validateMenuTree([item('a'), item('a')])['items[1].key']).toBeDefined();
  });

  it('refuses a loop of parents', () => {
    const errors = validateMenuTree([item('a', 'b'), item('b', 'a')]);
    expect(errors['items[0].parentKey']).toBeDefined();
  });

  it('caps the number of items in a menu', () => {
    const many = Array.from({ length: MENU_LIMITS.items + 1 }, (_, index) => item(`k${index}`));
    expect(validateMenuTree(many).items).toBeDefined();
  });

  it('caps top-level items, columns and buttons per location', () => {
    const nine = Array.from({ length: 9 }, (_, index) => item(`k${index}`));
    expect(validateMenuTree(nine, ['primary']).items).toBeDefined();
    expect(validateMenuTree([item('a', null, { style: 'button' })], ['footer']).items).toBeDefined();
    expect(validateMenuTree([item('a', null, { style: 'button' })], ['primary'])).toEqual({});
  });

  it('requires the fields each type needs', () => {
    expect(validateMenuTree([{ key: 'a', parentKey: null, type: 'custom', label: 'X' }])['items[0].url']).toBeDefined();
    expect(validateMenuTree([{ key: 'a', parentKey: null, type: 'custom', url: '/x' }])['items[0].label']).toBeDefined();
    expect(validateMenuTree([{ key: 'a', parentKey: null, type: 'custom', label: 'X', url: 'javascript:alert(1)' }])['items[0].url']).toBeDefined();
    expect(validateMenuTree([{ key: 'a', parentKey: null, type: 'page' }])['items[0].refId']).toBeDefined();
    expect(validateMenuTree([{ key: 'a', parentKey: null, type: 'route', routeKey: 'nope' }])['items[0].routeKey']).toBeDefined();
    expect(validateMenuTree([{ key: 'a', parentKey: null, type: 'page', refId: 'p1', url: '/x' }])['items[0].url']).toBeDefined();
  });

  it('refuses an empty heading where headings group children', () => {
    expect(validateMenuTree([{ key: 'h', parentKey: null, type: 'heading', label: 'Areas' }], ['footer'])['items[0].type']).toBeDefined();
    expect(validateMenuTree([{ key: 'h', parentKey: null, type: 'heading', label: 'Areas' }, item('a', 'h')], ['footer'])).toEqual({});
  });

  it('refuses icons outside the library', () => {
    expect(validateMenuTree([item('a', null, { icon: 'skull' })])['items[0].icon']).toBeDefined();
    expect(validateMenuTree([item('a', null, { icon: 'home' })])).toEqual({});
    expect(isMenuIconKey('home')).toBe(true);
    expect(isMenuIconKey('constructor')).toBe(false);
  });
});

