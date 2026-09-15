import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { useAsync } from '@/shared/useAsync';

export interface RemoteOption {
  value: string;
  label: string;
}

interface Props {
  /** Fetches the options matching what has been typed; called with '' when opened. */
  search: (term: string, signal: AbortSignal) => Promise<RemoteOption[]>;
  value?: string;
  /** Supplied by `Form.Item` when used as a form control. */
  onChange?: (value: string | undefined) => void;
  placeholder: string;
  ariaLabel?: string;
  id?: string;
  /** Shown for the current value before its label has been fetched. */
  valueLabel?: string;
  width?: number;
}

/**
 * A picker for one record out of a set too large to load.
 *
 * The moderation queues can be narrowed to one business or one article, which
 * the API has always accepted and the screens never offered — because offering
 * it naively means fetching every business into a dropdown. This asks the
 * server for the ones matching what has been typed instead, so the control
 * costs one small request rather than the whole table.
 *
 * Typing is debounced: a request per keystroke would send five for "cafe" and
 * race them, and the last to arrive is not reliably the last one typed.
 */
export function RemoteSelect({ search, value, onChange, placeholder, ariaLabel, valueLabel, width = 220, id }: Props) {
  const [typed, setTyped] = useState('');
  const [term, setTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setTerm(typed), 250);
    return () => clearTimeout(timer);
  }, [typed]);

  const [state] = useAsync((signal) => search(term, signal), [term]);
  const options = state.status === 'ready' ? state.data : [];
  // The chosen record may not be in the current results — it usually is not,
  // once something else has been typed — so its own label is kept available.
  const withValue = value && !options.some((option) => option.value === value) ? [{ value, label: valueLabel ?? value }, ...options] : options;

  return (
    <Select
      id={id}
      aria-label={ariaLabel}
      allowClear
      showSearch
      // The server has already filtered; filtering again here would hide
      // matches whose label does not contain the term literally.
      filterOption={false}
      placeholder={placeholder}
      value={value}
      onSearch={setTyped}
      onChange={(next) => onChange?.(next ?? undefined)}
      loading={state.status === 'loading'}
      notFoundContent={state.status === 'loading' ? 'Searching…' : 'Nothing matches'}
      style={{ width }}
      options={withValue}
    />
  );
}
