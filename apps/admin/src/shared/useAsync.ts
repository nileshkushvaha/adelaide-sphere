import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isApiError } from '@/api/errors';

export type AsyncState<T> = { status: 'loading' } | { status: 'ready'; data: T; refreshing?: boolean } | { status: 'error'; message: string; reference: string | null };

/**
 * Small fetch-on-mount helper with explicit reload; errors are user-safe ApiError messages.
 *
 * `reload` starts again from a loading state. `refresh` keeps the data on screen,
 * marked `refreshing`, until the new response arrives, so a screen of charts
 * holds its frame instead of flashing a skeleton.
 */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): [AsyncState<T>, () => void, () => void] {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const latest = useRef(load);
  useLayoutEffect(() => {
    latest.current = load;
  });
  useEffect(() => {
    const controller = new AbortController();
    latest
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isApiError(error) && error.kind === 'aborted') return;
        setState({ status: 'error', message: isApiError(error) ? error.userMessage : 'Something went wrong.', reference: isApiError(error) ? error.reference : null });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the caller's query inputs
  }, [...deps, tick]);
  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setTick((n) => n + 1);
  }, []);
  const refresh = useCallback(() => {
    setState((current) => (current.status === 'ready' ? { ...current, refreshing: true } : { status: 'loading' }));
    setTick((n) => n + 1);
  }, []);
  return [state, reload, refresh];
}

export function errorMessage(error: unknown): string {
  return isApiError(error) ? error.userMessage : 'Something went wrong. Please try again.';
}

export function fieldErrors(error: unknown): Record<string, string[]> {
  return isApiError(error) ? error.fields : {};
}
