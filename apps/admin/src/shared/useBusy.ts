import { useCallback, useRef, useState } from 'react';

/**
 * Runs one action at a time and reports whether it is running.
 *
 * The editors already prevent a second save through `useRecordEditor`, but the
 * confirmation dialogs did not: a moderation decision, a redaction or a retry
 * could be confirmed twice with two quick clicks, and the second request would
 * arrive after the first had changed the record's version — a confusing
 * `STALE_VERSION` on an action the administrator took once.
 *
 * The ref, not the state, is what closes the gap: two clicks in the same frame
 * both see the old `busy` value, but only the first gets past the ref.
 */
export function useBusy(): [boolean, (action: () => Promise<void>) => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return [busy, run];
}
