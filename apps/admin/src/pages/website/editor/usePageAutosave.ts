import { useCallback, useEffect, useRef, useState } from 'react';
import type { PageSection } from '@adelaide-sphere/domain/page-sections';
import { pagesApi } from '@/api/settings';

/** How often a private copy is kept while there are unsaved changes. */
const INTERVAL_MS = 15_000;

export type PageAutosaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'failed'; at: Date };

interface Options {
  /** The page's address, or null while it has never been saved (nothing to attach a copy to). */
  slug: string | null;
  baseVersion: number;
  dirty: boolean;
  enabled: boolean;
  /** Reads the editor as it is now. */
  read: () => { title: string; sections: PageSection[] };
}

/**
 * Keeps unsaved page edits safe (change log 1.17): a private copy on the server
 * every fifteen seconds while something has changed, and on demand before a
 * preview. The copy never changes the page; saving is still the only way
 * anything reaches visitors, and saving removes the copy.
 */
export function usePageAutosave({ slug, baseVersion, dirty, enabled, read }: Options) {
  const [status, setStatus] = useState<PageAutosaveStatus>({ kind: 'idle' });
  const readRef = useRef(read);
  const lastSent = useRef('');

  useEffect(() => {
    readRef.current = read;
  });

  /** Sends the copy now unless nothing changed since the last one; resolves false when it could not be kept. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (!slug) return false;
    const snapshot = readRef.current();
    const fingerprint = JSON.stringify(snapshot);
    if (fingerprint === lastSent.current) return true;
    setStatus({ kind: 'saving' });
    try {
      await pagesApi().saveAutosave(slug, { ...snapshot, baseVersion });
      lastSent.current = fingerprint;
      setStatus({ kind: 'saved', at: new Date() });
      return true;
    } catch {
      setStatus({ kind: 'failed', at: new Date() });
      return false;
    }
  }, [slug, baseVersion]);

  useEffect(() => {
    if (!enabled || !dirty || !slug) return;
    const timer = window.setInterval(() => void flush(), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, dirty, slug, flush]);

  return { status, flush };
}

export function describePageAutosave(status: PageAutosaveStatus): string | null {
  const time = (at: Date) => at.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  switch (status.kind) {
    case 'saving':
      return 'Keeping a copy of your changes…';
    case 'saved':
      return `A private copy of your changes was kept at ${time(status.at)}. Save to make them part of the page.`;
    case 'failed':
      return `Your changes could not be copied to the server at ${time(status.at)}. Save soon so they are not lost.`;
    default:
      return null;
  }
}
