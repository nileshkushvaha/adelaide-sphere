/**
 * Browser copies of unsaved article work (SRS 1.10 BLOG 003): the recovery
 * that still works for an article that has never been saved, or while the
 * network is down. Text only — never credentials — and cleared on sign-out so
 * the next person at a shared computer does not find it.
 */
const PREFIX = 'ms.post-draft:';

export interface LocalPostDraft {
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  bodyFormat: 'html' | 'markdown';
  /** The article version being edited; 0 for an article that does not exist yet. */
  baseVersion: number;
  savedAt: string;
}

const keyFor = (postId: string | null) => `${PREFIX}${postId ?? 'new'}`;

export function readLocalDraft(postId: string | null): LocalPostDraft | null {
  try {
    const raw = window.localStorage.getItem(keyFor(postId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalPostDraft>;
    if (typeof parsed.bodyMarkdown !== 'string' || typeof parsed.savedAt !== 'string') return null;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      excerpt: typeof parsed.excerpt === 'string' ? parsed.excerpt : '',
      bodyMarkdown: parsed.bodyMarkdown,
      bodyFormat: parsed.bodyFormat === 'markdown' ? 'markdown' : 'html',
      baseVersion: typeof parsed.baseVersion === 'number' ? parsed.baseVersion : 0,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function writeLocalDraft(postId: string | null, draft: LocalPostDraft): void {
  try {
    window.localStorage.setItem(keyFor(postId), JSON.stringify(draft));
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

/** Removes every article copy in this browser; called when an administrator signs out. */
export function clearAllLocalDrafts(): void {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage unavailable: there is nothing stored to clear.
  }
}
