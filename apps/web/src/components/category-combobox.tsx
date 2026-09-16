'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';

export interface CategoryOption { slug: string; label: string; group?: string; child?: boolean }
const subscribe = () => () => {};
const all: CategoryOption = { slug: '', label: 'All categories' };

/** Searchable grouped category picker; the native select remains the no-JS fallback. */
export function CategoryCombobox({ categories }: { categories: CategoryOption[] }) {
  const enhanced = useSyncExternalStore(subscribe, () => true, () => false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const groups = Array.from(new Set(categories.map(c => c.group ?? 'Categories')));
  const ordered = [all, ...groups.flatMap(group => categories.filter(c => (c.group ?? 'Categories') === group))];
  const options = ordered.filter(c => `${c.label} ${c.group ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const current = ordered.find(c => c.slug === selected) ?? all;
  const choose = (option: CategoryOption) => {
    setSelected(option.slug);
    setQuery('');
    setOpen(false);
    setActive(-1);
  };
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => {
    if (open && active >= 0) root.current?.querySelector(`[id="${id}-option-${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, id, open]);

  const option = (item: CategoryOption) => {
    const index = options.indexOf(item);
    return (
      <div
        key={item.slug}
        id={`${id}-option-${index}`}
        role="option"
        aria-selected={selected === item.slug}
        onMouseDown={event => event.preventDefault()}
        onClick={() => choose(item)}
        onPointerMove={() => setActive(index)}
        className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm ${index === active ? 'bg-teal-100 text-teal-700' : 'text-panel-text'}`}
      >
        <span className={`flex min-w-0 items-center gap-2 ${item.child ? 'pl-4' : 'font-semibold'}`}>
          {item.child && <span aria-hidden="true" className="h-3 w-2 shrink-0 rounded-bl border-b border-l border-current opacity-40" />}
          {item.label}
        </span>
        {selected === item.slug && <CheckIcon aria-hidden="true" className="size-4 shrink-0" />}
      </div>
    );
  };
  return (
    <div ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }} className="as-search-field relative flex min-h-20 min-w-0 flex-col justify-center rounded-2xl border border-panel-border bg-panel-muted/60 px-4 py-3 lg:w-64">
      <label htmlFor={id} className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-panel-text-muted">Category (optional)</label>
      {!enhanced ? (
        <select id={id} name="category" defaultValue="" className="mt-1 w-full border-0 bg-transparent p-0 text-base text-panel-text">
          <option value="">All categories</option>
          {groups.map(group => <optgroup key={group} label={group}>{categories.filter(c => (c.group ?? 'Categories') === group).map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}</optgroup>)}
        </select>
      ) : (
        <>
          <input type="hidden" name="category" value={selected} />
          <div className="mt-1 flex items-center gap-2">
            <input
              ref={input} id={id} role="combobox" type="text" autoComplete="off"
              aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`}
              aria-activedescendant={open && active >= 0 && options[active] ? `${id}-option-${active}` : undefined}
              value={open ? query : current.label} placeholder="Search categories…"
              onFocus={() => { setOpen(true); setQuery(''); setActive(-1); }}
              onChange={event => { setQuery(event.target.value); setOpen(true); setActive(-1); }}
              onKeyDown={event => {
                if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setActive(-1); }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault(); setOpen(true);
                  setActive(value => options.length ? value < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : (value + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length : -1);
                }
                if (open && (event.key === 'Home' || event.key === 'End')) { event.preventDefault(); setActive(event.key === 'Home' ? 0 : options.length - 1); }
                if (open && event.key === 'Enter') { event.preventDefault(); if (options[active]) choose(options[active]); }
              }}
              className="min-w-0 w-full border-0 bg-transparent p-0 text-base text-panel-text placeholder:text-panel-text-muted"
            />
            <button type="button" tabIndex={-1} aria-label={open ? 'Close categories' : 'Open categories'} onMouseDown={event => event.preventDefault()} onClick={() => { if (open) setOpen(false); else { input.current?.focus(); setOpen(true); setQuery(''); } }} className="inline-flex size-6 shrink-0 items-center justify-center text-panel-text-muted">
              <ChevronDownIcon aria-hidden="true" className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {open && (
            <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-card border border-panel-border bg-panel shadow-lg">
              <div id={`${id}-list`} role="listbox" aria-label="Categories" className="max-h-72 overflow-y-auto py-1">
                {options.includes(all) && option(all)}
                {groups.map(group => {
                  const children = options.filter(c => c.slug && (c.group ?? 'Categories') === group);
                  return children.length ? <div key={group} role="group" aria-label={group}><div className="bg-panel-muted px-4 py-2 text-xs font-semibold uppercase tracking-wide text-panel-text-muted">{group}</div>{children.map(option)}</div> : null;
                })}
              </div>
              {!options.length && <p role="status" className="px-4 py-4 text-sm text-panel-text-muted">No matching categories.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
