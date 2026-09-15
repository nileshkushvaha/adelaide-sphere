import { arrayMove } from '@dnd-kit/sortable';
import { MENU_ITEM_TYPES } from '@adelaide-sphere/domain/menus';
import type { MenuItemInput, MenuItemRecord, MenuLinkSource, MenuLinkSourceType } from '@/api/menus';

/**
 * Pure tree operations for the menu editor. The editor holds the menu the way
 * it is saved — a flat list in display order, parents before their children —
 * so every operation here keeps that invariant: a subtree always travels as
 * one contiguous block.
 */

export type EditorItem = MenuItemRecord;

export interface DepthItem extends EditorItem {
  /** 0 for a top-level item. */
  depth: number;
}

export function withDepths(items: readonly EditorItem[]): DepthItem[] {
  const depthOf = new Map<string, number>();
  return items.map((item) => {
    const depth = item.parentKey === null ? 0 : (depthOf.get(item.parentKey) ?? 0) + 1;
    depthOf.set(item.key, depth);
    return { ...item, depth };
  });
}

/** [start, end) of an item and everything nested under it. */
export function blockRange(items: readonly DepthItem[], key: string): [number, number] {
  const start = items.findIndex((item) => item.key === key);
  if (start < 0) return [-1, -1];
  let end = start + 1;
  while (end < items.length && items[end]!.depth > items[start]!.depth) end += 1;
  return [start, end];
}

/** How many levels sit below an item (0 when it has no children). */
export function subtreeHeight(items: readonly DepthItem[], key: string): number {
  const [start, end] = blockRange(items, key);
  if (start < 0) return 0;
  let height = 0;
  for (let index = start + 1; index < end; index += 1) height = Math.max(height, items[index]!.depth - items[start]!.depth);
  return height;
}

export function descendantKeys(items: readonly EditorItem[], key: string): Set<string> {
  const depthItems = withDepths(items);
  const [start, end] = blockRange(depthItems, key);
  return new Set(depthItems.slice(start + 1, end).map((item) => item.key));
}

const strip = (items: readonly DepthItem[]): EditorItem[] => items.map(({ depth: _depth, ...item }) => item);

/**
 * Where a dragged item would land: its depth follows the horizontal drag
 * offset, clamped so it can only become a child of the item above it, can
 * never leave the item below it stranded, and never exceeds the menu's depth.
 * Returns null when no depth satisfies all three — the drop is refused.
 *
 * `items` excludes the dragged item's own descendants, which travel with it.
 */
export function getProjection(
  items: readonly DepthItem[],
  activeKey: string,
  overKey: string,
  offsetX: number,
  indentWidth: number,
  maxDepth: number,
  activeHeight: number,
): { depth: number; parentKey: string | null } | null {
  const overIndex = items.findIndex((item) => item.key === overKey);
  const activeIndex = items.findIndex((item) => item.key === activeKey);
  if (overIndex < 0 || activeIndex < 0) return null;
  const active = items[activeIndex]!;
  const moved = arrayMove([...items], activeIndex, overIndex);
  const previous = moved[overIndex - 1];
  const next = moved[overIndex + 1];

  const projected = active.depth + Math.round(offsetX / indentWidth);
  const maxAllowed = Math.min(previous ? previous.depth + 1 : 0, maxDepth - 1 - activeHeight);
  const minAllowed = next ? next.depth : 0;
  if (maxAllowed < minAllowed || maxAllowed < 0) return null;
  const depth = Math.max(minAllowed, Math.min(projected, maxAllowed));

  let parentKey: string | null = null;
  if (depth > 0 && previous) {
    if (depth === previous.depth) parentKey = previous.parentKey;
    else if (depth > previous.depth) parentKey = previous.key;
    else parentKey = moved.slice(0, overIndex).reverse().find((item) => item.depth === depth)?.parentKey ?? null;
  }
  return { depth, parentKey };
}

/** Applies a projected drop: the dragged block moves to the target position under its new parent. */
export function applyDrop(items: readonly EditorItem[], activeKey: string, overKey: string, parentKey: string | null): EditorItem[] {
  const descendants = descendantKeys(items, activeKey);
  const dragList = items.filter((item) => item.key === activeKey || !descendants.has(item.key));
  const from = dragList.findIndex((item) => item.key === activeKey);
  const to = dragList.findIndex((item) => item.key === overKey);
  if (from < 0 || to < 0) return [...items];
  const moved = arrayMove(dragList, from, to);
  const carried = items.filter((item) => descendants.has(item.key));
  return moved.flatMap((item) => (item.key === activeKey ? [{ ...item, parentKey }, ...carried] : [item]));
}

export type MoveAction = 'up' | 'down' | 'under' | 'out' | 'top';

export interface AvailableMoves {
  up: boolean;
  down: boolean;
  top: boolean;
  /** Label of the sibling above, when the item can be nested under it. */
  under: string | null;
  /** Label of the parent, when the item can move out from under it. */
  out: string | null;
}

export function itemLabel(item: Pick<EditorItem, 'label' | 'source' | 'type'>): string {
  return item.label?.trim() || item.source.title || MENU_ITEM_TYPES.find((definition) => definition.type === item.type)?.label || 'Menu item';
}

function siblingsOf(items: readonly DepthItem[], parentKey: string | null): DepthItem[] {
  return items.filter((item) => item.parentKey === parentKey);
}

export function availableMoves(items: readonly EditorItem[], key: string, maxDepth: number): AvailableMoves {
  const depthItems = withDepths(items);
  const item = depthItems.find((entry) => entry.key === key);
  if (!item) return { up: false, down: false, top: false, under: null, out: null };
  const siblings = siblingsOf(depthItems, item.parentKey);
  const position = siblings.findIndex((entry) => entry.key === key);
  const previous = siblings[position - 1];
  const parent = item.parentKey ? depthItems.find((entry) => entry.key === item.parentKey) : undefined;
  const height = subtreeHeight(depthItems, key);
  return {
    up: position > 0,
    down: position < siblings.length - 1,
    top: position > 0,
    under: previous && item.depth + 1 + height <= maxDepth - 1 ? itemLabel(previous) : null,
    out: parent ? itemLabel(parent) : null,
  };
}

export function applyMove(items: readonly EditorItem[], key: string, action: MoveAction, maxDepth: number): EditorItem[] {
  const depthItems = withDepths(items);
  const item = depthItems.find((entry) => entry.key === key);
  if (!item) return [...items];
  const moves = availableMoves(items, key, maxDepth);
  const siblings = siblingsOf(depthItems, item.parentKey);
  const position = siblings.findIndex((entry) => entry.key === key);
  const [start, end] = blockRange(depthItems, key);
  const block = depthItems.slice(start, end);
  const without = [...depthItems.slice(0, start), ...depthItems.slice(end)];

  switch (action) {
    case 'up': {
      if (!moves.up) return [...items];
      const [prevStart] = blockRange(depthItems, siblings[position - 1]!.key);
      return strip([...depthItems.slice(0, prevStart), ...block, ...depthItems.slice(prevStart, start), ...depthItems.slice(end)]);
    }
    case 'down': {
      if (!moves.down) return [...items];
      const [, nextEnd] = blockRange(depthItems, siblings[position + 1]!.key);
      return strip([...depthItems.slice(0, start), ...depthItems.slice(end, nextEnd), ...block, ...depthItems.slice(nextEnd)]);
    }
    case 'top': {
      if (!moves.top) return [...items];
      const insertAt = item.parentKey === null ? 0 : without.findIndex((entry) => entry.key === item.parentKey) + 1;
      return strip([...without.slice(0, insertAt), ...block, ...without.slice(insertAt)]);
    }
    case 'under': {
      if (!moves.under) return [...items];
      // The block already sits directly after the previous sibling's subtree, so it becomes that sibling's last child.
      const previous = siblings[position - 1]!;
      return items.map((entry) => (entry.key === key ? { ...entry, parentKey: previous.key } : entry));
    }
    case 'out': {
      if (!moves.out || !item.parentKey) return [...items];
      const parent = depthItems.find((entry) => entry.key === item.parentKey)!;
      const withoutDepths = withDepths(strip(without));
      const [, parentEnd] = blockRange(withoutDepths, parent.key);
      const lifted = strip(block).map((entry) => (entry.key === key ? { ...entry, parentKey: parent.parentKey } : entry));
      const rest = strip(withoutDepths);
      return [...rest.slice(0, parentEnd), ...lifted, ...rest.slice(parentEnd)];
    }
  }
}

/** Removes one item; its children move up to take its place, as they do in WordPress. */
export function removeItem(items: readonly EditorItem[], key: string): EditorItem[] {
  const removed = items.find((item) => item.key === key);
  if (!removed) return [...items];
  return items.filter((item) => item.key !== key).map((item) => (item.parentKey === key ? { ...item, parentKey: removed.parentKey } : item));
}

export function newKey(): string {
  return `new-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
}

export function itemFromSource(type: MenuLinkSourceType, source: MenuLinkSource): EditorItem {
  return {
    key: newKey(),
    parentKey: null,
    type,
    refId: type === 'route' ? null : source.id,
    routeKey: type === 'route' ? source.id : null,
    url: null,
    label: null,
    titleAttribute: null,
    description: null,
    icon: null,
    style: 'link',
    openInNewTab: false,
    relNofollow: false,
    source: { state: source.state, title: source.title, href: source.href },
  };
}

export function toSaveItems(items: readonly EditorItem[]): MenuItemInput[] {
  return items.map(({ source: _source, ...item }) => ({
    ...item,
    label: item.label?.trim() || null,
    titleAttribute: item.titleAttribute?.trim() || null,
    description: item.description?.trim() || null,
    url: item.type === 'custom' ? (item.url?.trim() ?? null) : null,
  }));
}
