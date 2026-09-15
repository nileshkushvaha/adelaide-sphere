import { useEffect, useMemo, useState } from 'react';
import type { SelectProps } from 'antd';
import { taxonomyApi, type TermKind } from '@/api/taxonomy';
import { useAsync } from '@/shared/useAsync';
import { useTermNames } from '@/shared/useTermNames';
import { FormSelect } from './FormSelect';

/** How many matches a search shows; typing narrows it further. */
const RESULTS = 20;

type Value = string | string[] | null | undefined;

interface Props {
  kind: TermKind;
  /** Several terms (services, secondary categories) rather than one. */
  multiple?: boolean;
  /** Supplied by `Form.Item`, or by the screen for a filter. */
  value?: Value;
  onChange?: (value: Value) => void;
  placeholder?: string;
  /** Filters may pick an inactive term; a business may only be given active ones. */
  includeInactive?: boolean;
  /** Categories only: offer top-level categories, as possible parents. */
  topLevelOnly?: boolean;
  /** Terms that may not be chosen here, e.g. the primary category among the secondary ones. */
  excludeIds?: readonly string[];
  allowClear?: boolean;
  disabled?: boolean;
  id?: string;
  style?: React.CSSProperties;
  'aria-label'?: string;
  'aria-required'?: boolean | 'true' | 'false';
}

/**
 * Chooses categories, services or local areas by searching the server as the
 * editor types, instead of loading one page of terms into the browser.
 *
 * The old pickers fetched the first fifty terms by name and filtered those, so
 * once a kind grew past fifty — services now number in the hundreds — anything
 * later in the alphabet, including every newly added term, could not be found.
 * Here each search asks the API (`q`), and chosen terms keep their names from
 * `useTermNames` even when they are not among the current results. An inactive
 * term already on a record is still shown, marked, so saving does not silently
 * drop it.
 */
export function TermSelect({ kind, multiple = false, value, onChange, placeholder, includeInactive = false, topLevelOnly = false, excludeIds = [], allowClear, disabled, id, style, ...aria }: Props) {
  const [typed, setTyped] = useState('');
  const [term, setTerm] = useState('');

  // Typing is debounced so "plumb" is one request, not five racing ones.
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(typed.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const [results] = useAsync(
    () => taxonomyApi(kind).list({ q: term || undefined, status: includeInactive ? undefined : 'active', topLevel: topLevelOnly || undefined, pageSize: RESULTS, sort: 'name' }).then((r) => r.data),
    [kind, term, includeInactive, topLevelOnly],
  );

  const chosen = useMemo(() => (Array.isArray(value) ? value : value ? [value] : []), [value]);
  const { names, remember } = useTermNames(kind, chosen);
  const found = useMemo(() => (results.status === 'ready' ? results.data : []), [results]);

  useEffect(() => {
    if (found.length > 0) remember(found);
    // `remember` is a fresh function each render; the results are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found]);

  const options: SelectProps['options'] = useMemo(() => {
    const label = (name: string, active: boolean) => (active ? name : `${name} (inactive)`);
    const seen = new Set<string>();
    const list: { value: string; label: string; disabled?: boolean }[] = [];
    // Chosen terms first, so they always have a name, even when the search moved on.
    for (const termId of chosen) {
      const known = names[termId];
      list.push({ value: termId, label: known ? label(known.name, known.active) : 'Loading…' });
      seen.add(termId);
    }
    for (const item of found) {
      if (seen.has(item.id) || excludeIds.includes(item.id)) continue;
      list.push({ value: item.id, label: label(item.name, item.active) });
    }
    return list;
  }, [chosen, names, found, excludeIds]);

  return (
    <FormSelect
      id={id}
      {...aria}
      mode={multiple ? 'multiple' : undefined}
      showSearch
      // The server has already matched on name and slug; filtering again here would hide those matches.
      filterOption={false}
      searchValue={typed}
      onSearch={setTyped}
      onBlur={() => setTyped('')}
      onChange={(next: Value) => {
        setTyped('');
        onChange?.(next ?? (multiple ? [] : undefined));
      }}
      value={multiple ? chosen : (chosen[0] ?? undefined)}
      options={options}
      loading={results.status === 'loading'}
      notFoundContent={results.status === 'loading' ? 'Searching…' : results.status === 'error' ? 'Could not load. Try again.' : term ? `Nothing matches “${term}”` : 'Nothing to choose yet'}
      placeholder={placeholder}
      allowClear={allowClear}
      disabled={disabled}
      style={style}
    />
  );
}
