import { describe, expect, it } from 'vitest';
import { applyDrop, applyMove, availableMoves, getProjection, removeItem, subtreeHeight, toSaveItems, withDepths, type EditorItem } from './menu-tree';

const item = (key: string, parentKey: string | null = null, label = key): EditorItem => ({
  key,
  parentKey,
  type: 'custom',
  refId: null,
  routeKey: null,
  url: `/${key}`,
  label,
  titleAttribute: null,
  description: null,
  icon: null,
  style: 'link',
  openInNewTab: false,
  relNofollow: false,
  source: { state: 'ok', title: null, href: `/${key}` },
});

const shape = (items: EditorItem[]) => withDepths(items).map((entry) => `${'-'.repeat(entry.depth)}${entry.key}`);

describe('withDepths / subtreeHeight', () => {
  it('derives depth from parents in display order', () => {
    const items = [item('a'), item('b', 'a'), item('c', 'b'), item('d')];
    expect(shape(items)).toEqual(['a', '-b', '--c', 'd']);
    expect(subtreeHeight(withDepths(items), 'a')).toBe(2);
    expect(subtreeHeight(withDepths(items), 'd')).toBe(0);
  });
});

describe('getProjection', () => {
  const items = withDepths([item('a'), item('b'), item('c')]);

  it('nests an item under the one above when dragged right', () => {
    expect(getProjection(items, 'b', 'b', 32, 32, 3, 0)).toEqual({ depth: 1, parentKey: 'a' });
  });

  it('never nests deeper than one level below the item above', () => {
    expect(getProjection(items, 'b', 'b', 200, 32, 3, 0)).toEqual({ depth: 1, parentKey: 'a' });
  });

  it('is clamped by the depth the menu location allows, counting the item’s own children', () => {
    expect(getProjection(items, 'b', 'b', 32, 32, 1, 0)).toEqual({ depth: 0, parentKey: null });
    const nested = withDepths([item('a'), item('b', 'a'), item('c')]);
    // c carries a child of its own, so under b it would reach a fourth level.
    expect(getProjection(nested, 'c', 'c', 64, 32, 3, 1)).toEqual({ depth: 1, parentKey: 'a' });
  });

  it('keeps the first item at the top level', () => {
    expect(getProjection(items, 'a', 'a', 64, 32, 3, 0)).toEqual({ depth: 0, parentKey: null });
  });
});

describe('applyDrop', () => {
  it('moves an item with its children and gives it the projected parent', () => {
    const items = [item('a'), item('b'), item('b1', 'b'), item('c')];
    const next = applyDrop(items, 'b', 'c', 'c');
    expect(shape(next)).toEqual(['a', 'c', '-b', '--b1']);
  });
});

describe('Move links', () => {
  const items = [item('a'), item('a1', 'a'), item('b'), item('b1', 'b'), item('c')];

  it('offers only the moves that make sense for the item’s position', () => {
    expect(availableMoves(items, 'a', 3)).toEqual({ up: false, down: true, top: false, under: null, out: null });
    expect(availableMoves(items, 'b1', 3)).toMatchObject({ up: false, down: false, out: 'b' });
    expect(availableMoves(items, 'b', 3).under).toBe('a');
    expect(availableMoves(items, 'b', 1).under).toBeNull();
  });

  it('moves a whole subtree up and down among its siblings', () => {
    expect(shape(applyMove(items, 'b', 'up', 3))).toEqual(['b', '-b1', 'a', '-a1', 'c']);
    expect(shape(applyMove(items, 'a', 'down', 3))).toEqual(['b', '-b1', 'a', '-a1', 'c']);
    expect(shape(applyMove(items, 'c', 'top', 3))).toEqual(['c', 'a', '-a1', 'b', '-b1']);
  });

  it('nests under the previous sibling and lifts out after the parent', () => {
    expect(shape(applyMove(items, 'b', 'under', 3))).toEqual(['a', '-a1', '-b', '--b1', 'c']);
    expect(shape(applyMove(items, 'a1', 'out', 3))).toEqual(['a', 'a1', 'b', '-b1', 'c']);
  });
});

describe('removeItem / toSaveItems', () => {
  it('promotes children of a removed item to its place, as WordPress does', () => {
    const items = [item('a'), item('a1', 'a'), item('a2', 'a')];
    const next = removeItem(items, 'a');
    expect(next.map((entry) => [entry.key, entry.parentKey])).toEqual([
      ['a1', null],
      ['a2', null],
    ]);
  });

  it('sends the save shape without display-only data and with trimmed text', () => {
    const [saved] = toSaveItems([{ ...item('a'), label: '  Blog  ', description: '   ' }]);
    expect(saved).not.toHaveProperty('source');
    expect(saved).toMatchObject({ label: 'Blog', description: null, url: '/a' });
  });
});
