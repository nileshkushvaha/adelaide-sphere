import { useEffect, useRef, useState } from 'react';
import { blogApi } from '@/api/blog';
import { clearLocalDraft, writeLocalDraft } from '@/shared/postDrafts';

/** How often a browser copy is written while there are unsaved changes. */
const LOCAL_INTERVAL_MS = 2_000;
/** How often the server copy is written while there are unsaved changes. */
const SERVER_INTERVAL_MS = 20_000;

export type AutosaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'local-only'; at: Date };

interface Snapshot {
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  bodyFormat: 'html' | 'markdown';
}

interface Options {
  postId: string | null;
  baseVersion: number;
  dirty: boolean;
  enabled: boolean;
  /** Reads the form as it is now. */
  read: () => Snapshot;
}

/**
 * Keeps unsaved work safe while writing (SRS 1.10 BLOG 003): a browser copy
 * every two seconds and, for an article that exists, a private server copy
 * every twenty. Neither changes the article; saving it explicitly is still the
 * only way anything reaches readers.
 */
export function useAutosave({ postId, baseVersion, dirty, enabled, read }: Options) {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: 'idle' });
  const readRef = useRef(read);
  const lastSent = useRef<string>('');

  useEffect(() => {
    readRef.current = read;
  });

  useEffect(() => {
    if (!enabled || !dirty) return;
    const local = window.setInterval(() => {
      writeLocalDraft(postId, { ...readRef.current(), baseVersion, savedAt: new Date().toISOString() });
    }, LOCAL_INTERVAL_MS);

    const server = postId
      ? window.setInterval(() => {
          const snapshot = readRef.current();
          const fingerprint = JSON.stringify(snapshot);
          if (fingerprint === lastSent.current) return;
          setStatus({ kind: 'saving' });
          blogApi()
            .saveAutosave(postId, { ...snapshot, baseVersion })
            .then(() => {
              lastSent.current = fingerprint;
              setStatus({ kind: 'saved', at: new Date() });
            })
            .catch(() => setStatus({ kind: 'local-only', at: new Date() }));
        }, SERVER_INTERVAL_MS)
      : undefined;

    return () => {
      window.clearInterval(local);
      if (server) window.clearInterval(server);
    };
  }, [enabled, dirty, postId, baseVersion]);

  /** After an explicit save or a discard: the copies no longer hold anything new. */
  const clear = (id: string | null) => {
    clearLocalDraft(id);
    if (id !== postId) clearLocalDraft(postId);
    lastSent.current = '';
    setStatus({ kind: 'idle' });
  };

  return { status, clear };
}

export function describeAutosave(status: AutosaveStatus): string | null {
  const time = (at: Date) => at.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  switch (status.kind) {
    case 'saving':
      return 'Keeping a copy of your changes…';
    case 'saved':
      return `A copy of your changes was kept at ${time(status.at)}.`;
    case 'local-only':
      return `Couldn't reach the server; your changes are kept in this browser (${time(status.at)}).`;
    default:
      return null;
  }
}
