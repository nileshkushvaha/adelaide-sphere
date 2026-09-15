import type { PublicMenuItem } from '@/lib/api';

export interface ActiveTrail {
  /** The item that represents the current page, if any. */
  current: string | null;
  /** Every item above it, so a dropdown's parent can show where the visitor is. */
  ancestors: Set<string>;
}

const pathOf = (href: string) => href.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';

/**
 * Which menu item the current page belongs to. An exact address wins; failing
 * that, the longest item address the path sits under (so an article marks
 * "Blog"). The home page matches only itself, otherwise every page would.
 */
export function activeTrail(items: readonly PublicMenuItem[], pathname: string | null): ActiveTrail {
  const none: ActiveTrail = { current: null, ancestors: new Set() };
  if (!pathname) return none;
  const path = pathOf(pathname);
  const found: { value: { id: string; score: number; stack: string[] } | null } = { value: null };

  const walk = (list: readonly PublicMenuItem[], stack: string[]) => {
    for (const item of list) {
      if (item.href && !item.external && item.href.startsWith('/')) {
        const href = pathOf(item.href);
        const score = href === path ? 10_000 + href.length : href !== '/' && path.startsWith(`${href}/`) ? href.length : -1;
        if (score >= 0 && (!found.value || score > found.value.score)) found.value = { id: item.id, score, stack };
      }
      walk(item.children, [...stack, item.id]);
    }
  };
  walk(items, []);
  return found.value ? { current: found.value.id, ancestors: new Set(found.value.stack) } : none;
}
