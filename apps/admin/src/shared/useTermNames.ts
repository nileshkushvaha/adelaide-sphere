import { useEffect, useMemo, useState } from 'react';
import { taxonomyApi, type TermKind } from '@/api/taxonomy';

export interface TermName {
  name: string;
  active: boolean;
}

/**
 * The names of particular categories, services or areas, by id — for showing
 * what is already chosen without loading the whole list. Services alone run
 * to hundreds, so a picker can no longer hold every term; it asks the server
 * for the ones it has to name (the `ids` filter), whatever their status.
 *
 * Names learnt elsewhere (from search results) can be added with `remember`,
 * so a term just picked never needs a second request.
 */
export function useTermNames(kind: TermKind, ids: readonly string[]) {
  const [names, setNames] = useState<Record<string, TermName>>({});
  const missing = useMemo(() => [...new Set(ids)].filter((id) => id && !names[id]).slice(0, 50), [ids, names]);
  const missingKey = missing.join(',');

  useEffect(() => {
    if (!missingKey) return;
    const controller = new AbortController();
    taxonomyApi(kind)
      .list({ ids: missingKey, pageSize: 50 })
      .then((result) => {
        if (controller.signal.aborted) return;
        setNames((current) => {
          const next = { ...current };
          for (const term of result.data) next[term.id] = { name: term.name, active: term.active };
          // An id the server does not know (deleted since) is remembered too, so it is not asked for again.
          for (const id of missingKey.split(',')) next[id] ??= { name: 'Removed term', active: false };
          return next;
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [kind, missingKey]);

  const remember = (terms: readonly { id: string; name: string; active: boolean }[]) =>
    setNames((current) => {
      if (terms.every((term) => current[term.id]?.name === term.name && current[term.id]?.active === term.active)) return current;
      const next = { ...current };
      for (const term of terms) next[term.id] = { name: term.name, active: term.active };
      return next;
    });

  return { names, remember };
}
