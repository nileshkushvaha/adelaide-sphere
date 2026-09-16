import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalDrafts, readLocalDraft, setLocalDraftOwner, writeLocalDraft } from './postDrafts';

const draft = { title: 'Rundle Mall', excerpt: '', bodyMarkdown: '<p>Unsaved</p>', bodyFormat: 'html' as const, baseVersion: 3, savedAt: '2026-09-16T10:00:00.000Z' };

describe('browser copies of unsaved articles', () => {
  beforeEach(() => {
    clearAllLocalDrafts();
    localStorage.clear();
  });

  it('keeps nothing before anyone has signed in', () => {
    writeLocalDraft('p1', draft);
    expect(Object.keys(localStorage)).toHaveLength(0);
    expect(readLocalDraft('p1')).toBeNull();
  });

  it('reads a copy back for the administrator who wrote it', () => {
    setLocalDraftOwner('a1');
    writeLocalDraft('p1', draft);
    expect(readLocalDraft('p1')).toEqual({ ...draft, ownerId: 'a1' });
  });

  it('survives the same administrator signing in again (an expired session)', () => {
    setLocalDraftOwner('a1');
    writeLocalDraft('p1', draft);
    setLocalDraftOwner('a1');
    expect(readLocalDraft('p1')?.bodyMarkdown).toBe('<p>Unsaved</p>');
  });

  it('removes another administrator’s copies when someone else signs in', () => {
    setLocalDraftOwner('a1');
    writeLocalDraft('p1', draft);
    writeLocalDraft(null, draft);
    setLocalDraftOwner('a2');
    expect(readLocalDraft('p1')).toBeNull();
    expect(Object.keys(localStorage).filter((key) => key.startsWith('as.post-draft:'))).toHaveLength(0);
  });

  it('ignores a stored copy that names no owner', () => {
    localStorage.setItem('as.post-draft:p1', JSON.stringify(draft));
    setLocalDraftOwner('a1');
    expect(readLocalDraft('p1')).toBeNull();
    expect(localStorage.getItem('as.post-draft:p1')).toBeNull();
  });

  it('removes every copy and stops writing on sign-out', () => {
    setLocalDraftOwner('a1');
    writeLocalDraft('p1', draft);
    clearAllLocalDrafts();
    writeLocalDraft('p2', draft);
    expect(Object.keys(localStorage)).toHaveLength(0);
  });
});
