/**
 * Browser copies of unsaved article work (SRS 1.10 BLOG 003): the recovery
 * that still works for an article that has never been saved, or while the
 * network is down. Text only — never credentials.
 *
 * Each copy records the administrator who wrote it and is only ever read back
 * for that administrator. Choosing "Sign out" removes every copy; an expired
 * session does not, because that is exactly when the copy is needed. Copies
 * written by anyone else are removed when a different administrator signs in,
 * so the next person at a shared computer never sees them.
 */
const PREFIX = 'as.post-draft:';

let owner: string | null = null;

export interface LocalPostDraft {
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  bodyFormat: 'html' | 'markdown';
  /** The article version being edited; 0 for an article that does not exist yet. */
  baseVersion: number;
  savedAt: string;
  /** The administrator who wrote the copy. */
  ownerId: string;
}

const keyFor = (postId: string | null) => `${PREFIX}${postId ?? 'new'}`;

function parse(raw: string | null): Partial<LocalPostDraft> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<LocalPostDraft>;
  } catch {
    return null;
  }
}

/**
 * Sets the administrator whose copies are read and written, and removes any
 * copy another administrator left in this browser. It is not cleared when a
 * session expires: the editor keeps writing until someone else signs in.
 */
export function setLocalDraftOwner(adminId: string): void {
  owner = adminId;
  removeDrafts((draft) => draft?.ownerId !== adminId);
}

export function readLocalDraft(postId: string | null): LocalPostDraft | null {
  if (!owner) return null;
  try {
    const parsed = parse(window.localStorage.getItem(keyFor(postId)));
    if (!parsed || parsed.ownerId !== owner) return null;
    if (typeof parsed.bodyMarkdown !== 'string' || typeof parsed.savedAt !== 'string') return null;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      excerpt: typeof parsed.excerpt === 'string' ? parsed.excerpt : '',
      bodyMarkdown: parsed.bodyMarkdown,
      bodyFormat: parsed.bodyFormat === 'markdown' ? 'markdown' : 'html',
      baseVersion: typeof parsed.baseVersion === 'number' ? parsed.baseVersion : 0,
      savedAt: parsed.savedAt,
      ownerId: owner,
    };
  } catch {
    return null;
  }
}

export function writeLocalDraft(postId: string | null, draft: Omit<LocalPostDraft, 'ownerId'>): void {
  // Nobody has signed in in this tab yet, so there is no one to keep it for.
  if (!owner) return;
  try {
    window.localStorage.setItem(keyFor(postId), JSON.stringify({ ...draft, ownerId: owner }));
  } catch {
    // Storage full, blocked or unavailable: the server copy still applies.
  }
}

export function clearLocalDraft(postId: string | null): void {
  try {
    window.localStorage.removeItem(keyFor(postId));
  } catch {
    // Nothing to clear.
  }
}

/** Removes every article copy in this browser; called when an administrator chooses to sign out. */
export function clearAllLocalDrafts(): void {
  owner = null;
  removeDrafts(() => true);
}

function removeDrafts(matches: (draft: Partial<LocalPostDraft> | null) => boolean): void {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(PREFIX) && matches(parse(window.localStorage.getItem(key)))) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage unavailable: there is nothing stored to clear.
  }
}
