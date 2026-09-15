import { describe, expect, it } from 'vitest';
import { replyParentId } from './comments.js';

describe('replyParentId (two-level comment threads)', () => {
  it('replies to a top-level comment under that comment', () => {
    expect(replyParentId({ id: 'top', parentId: null })).toBe('top');
  });

  it('adds a reply to a reply to the same thread, never a third level', () => {
    expect(replyParentId({ id: 'reply', parentId: 'top' })).toBe('top');
  });
});
