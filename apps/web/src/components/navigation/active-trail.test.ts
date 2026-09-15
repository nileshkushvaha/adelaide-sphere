import { describe, expect, it } from 'vitest';
import type { PublicMenuItem } from '@/lib/api';
import { activeTrail } from './active-trail';

const link = (id: string, href: string | null, children: PublicMenuItem[] = [], external = false): PublicMenuItem => ({
  id,
  label: id,
  href,
  external,
  newTab: false,
  rel: null,
  title: null,
  description: null,
  icon: null,
  style: 'link',
  children,
});

const menu = [
  link('home', '/'),
  link('businesses', '/business', [link('cbd', '/business/area/melbourne-cbd'), link('cafes', '/business/category/cafes', [link('coffee', '/business?q=coffee')])]),
  link('blog', '/blog'),
  link('explore', null, [link('about', '/about'), link('council', 'https://www.melbourne.vic.gov.au', [], true)]),
];

describe('activeTrail', () => {
  it('matches the home page only exactly', () => {
    expect(activeTrail(menu, '/').current).toBe('home');
    expect(activeTrail(menu, '/contact').current).toBeNull();
  });

  it('prefers an exact match and records every ancestor', () => {
    const trail = activeTrail(menu, '/business/category/cafes');
    expect(trail.current).toBe('cafes');
    expect([...trail.ancestors]).toEqual(['businesses']);
  });

  it('falls back to the longest address the page sits under', () => {
    expect(activeTrail(menu, '/blog/a-long-read').current).toBe('blog');
    expect(activeTrail(menu, '/business/some-cafe').current).toBe('businesses');
  });

  it('ignores the query string of an item and never matches external links', () => {
    expect(activeTrail(menu, '/business').current).toBe('businesses');
    const about = activeTrail(menu, '/about');
    expect(about.current).toBe('about');
    expect([...about.ancestors]).toEqual(['explore']);
  });

  it('returns nothing before the path is known', () => {
    expect(activeTrail(menu, null)).toEqual({ current: null, ancestors: new Set() });
  });
});
