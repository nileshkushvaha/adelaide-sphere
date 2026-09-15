import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/**
 * The page sizes every admin list offers. Fifty is the ceiling because that is
 * what the API allows (`pageSize ≤ 50`); offering a hundred would produce a
 * refusal rather than a longer page.
 */
export const PAGE_SIZES = [10, 20, 50];

/**
 * The query, filters, sort and page of a list screen, kept in the address bar.
 *
 * Every list screen had written this by hand — read a parameter, write it back,
 * remember to drop `page` so changing a filter does not land the reader on page
 * four of a shorter result. Ten copies of those four lines is ten chances to
 * forget the last one, and the screens that used local state instead could not
 * be linked to, bookmarked, or returned to with the browser's Back button.
 *
 * The filter keys are declared once, which is also what lets the screen know
 * whether anything is filtered at all — the difference between "nothing here
 * yet" and "nothing matches what you asked for".
 *
 * `E` names parameters that belong in the address bar but do not narrow the
 * result set — sort field and direction. They are readable and writable, but
 * "clear filters" leaves them alone and a sorted-but-unfiltered list is still
 * everything, so it gets the ordinary empty state.
 *
 * How many rows a page holds is here too, for the same reason the page number
 * is: it is part of the view, so it belongs in the address bar and survives a
 * reload, a link and the Back button. It is clamped to the offered sizes, so a
 * hand-typed `?pageSize=5000` cannot ask the API for more than it allows.
 */
export function useListParams<K extends string, E extends string = never>(
  keys: readonly K[],
  { defaultPageSize = 20 }: { defaultPageSize?: number } = {},
) {
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const asked = Number(params.get('pageSize'));
  const pageSize = PAGE_SIZES.includes(asked) ? asked : defaultPageSize;

  const get = useCallback((key: K | E) => params.get(key) ?? undefined, [params]);

  /** Writes one value; any change other than the page itself returns to page 1. */
  const set = useCallback(
    (key: K | E | 'page', value: string | undefined) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const setPage = useCallback((next: number) => set('page', next > 1 ? String(next) : undefined), [set]);

  /**
   * Changes how many rows a page holds, and returns to the first page: row 300
   * is on page 15 of twenty and page 6 of fifty, so keeping the page number
   * would land the reader somewhere they did not ask to be.
   */
  const setPageSize = useCallback(
    (next: number) => {
      const chosen = PAGE_SIZES.includes(next) ? next : defaultPageSize;
      const params2 = new URLSearchParams(params);
      if (chosen === defaultPageSize) params2.delete('pageSize');
      else params2.set('pageSize', String(chosen));
      params2.delete('page');
      setParams(params2, { replace: true });
    },
    [params, setParams, defaultPageSize],
  );

  /**
   * Writes several parameters in one address change and returns to page 1.
   * Separate `set` calls in one handler would each start from the same address,
   * so every call but the last would be lost.
   */
  const setMany = useCallback(
    (values: Partial<Record<K | E, string | undefined>>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(values) as [string, string | undefined][]) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  /**
   * Sets the sort field and direction together, in one address change, and
   * returns to page 1. Two separate `set` calls would each start from the same
   * address, so the second would silently undo the first; no field clears both.
   */
  const setSort = useCallback(
    (field: string | undefined, order: 'asc' | 'desc' = 'asc') => {
      const next = new URLSearchParams(params);
      if (field) {
        next.set('sort', field);
        next.set('order', order);
      } else {
        next.delete('sort');
        next.delete('order');
      }
      next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  /** The filters currently in force, for chips and for "clear filters". */
  const active = useMemo(() => keys.filter((key) => Boolean(params.get(key))), [keys, params]);

  const clear = useCallback(() => {
    const next = new URLSearchParams(params);
    for (const key of keys) next.delete(key);
    next.delete('page');
    setParams(next, { replace: true });
  }, [keys, params, setParams]);

  return { page, pageSize, get, set, setMany, setPage, setPageSize, setSort, active, filtered: active.length > 0, clear };
}
