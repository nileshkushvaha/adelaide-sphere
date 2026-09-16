'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { CategoryCombobox, type CategoryOption } from './category-combobox';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon, LoaderIcon, MapPinIcon, SearchIcon, StoreIcon, TagIcon, WrenchIcon } from 'lucide-react';
import { MIN_SUGGESTION_LENGTH, SUGGESTION_DEBOUNCE_MS, flattenSuggestions, highlightParts, moveActiveIndex, suggestionHref, type FlatSuggestion, type SuggestionGroups } from '@/lib/suggestions';

/** What each kind of suggestion is, at a glance. The label says it too. */
const KIND_ICON = { business: StoreIcon, category: TagIcon, service: WrenchIcon } as const;

/**
 * Hero search panel (SRS HERO 004–006). It is a real GET form to /business, so
 * it works without client JavaScript; suggestions are progressive enhancement
 * that fail silently. The location is fixed text, never an input, and no client
 * city parameter is ever sent.
 */
export function HeroSearch({ categories }: { categories: CategoryOption[] }) {
  const router = useRouter();
  const listId = useId();
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ term: string; groups: SuggestionGroups } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // The last term a request finished for, however it finished. Loading is
  // derived from it rather than stored: a stored flag has to be turned off in
  // every path, and the one that was missed — the term shrinking below the
  // minimum — left the spinner running forever.
  const [settled, setSettled] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const term = query.trim();
  // Only suggestions fetched for the current term are shown, so a shrinking
  // query never displays stale options while the next request is in flight.
  const options: FlatSuggestion[] = term.length >= MIN_SUGGESTION_LENGTH && result?.term === term ? flattenSuggestions(result.groups) : [];
  const loading = term.length >= MIN_SUGGESTION_LENGTH && settled !== term;
  // "Nothing matched" is only true once the answer for *this* term is in;
  // while a request is in flight the previous term's emptiness means nothing.
  const showNothingFound = settled === term && options.length === 0;

  useEffect(() => {
    if (term.length < MIN_SUGGESTION_LENGTH) return;
    const seq = ++requestSeq.current;
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const response = await fetch(`/api/v1/search/suggestions?q=${encodeURIComponent(term)}`, { signal: controller.signal, headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { data: SuggestionGroups };
        if (seq !== requestSeq.current) return; // stale response (SRS HERO 005)
        setResult({ term, groups: body.data });
        setOpen(true);
      } catch {
        // Suggestions are progressive: the form still submits without them.
      } finally {
        if (seq === requestSeq.current) setSettled(term);
      }
    }, SUGGESTION_DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [term]);

  // A long list scrolls; the option the arrow keys moved to has to come with it.
  useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const choose = (option: FlatSuggestion) => {
    setOpen(false);
    router.push(suggestionHref(option));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (options.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => moveActiveIndex(current, event.key === 'ArrowDown' ? 1 : -1, options.length));
      return;
    }
    if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : options.length - 1);
      return;
    }
    // Enter submits the form unless an option is explicitly active (never on focus alone, SRS HERO 006).
    if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault();
      choose(options[active]!);
    }
  };

  return (
    <form
      action="/business"
      method="get"
      role="search"
      aria-label="Search Adelaide businesses"
      // Above the banner's own controls and photo credit, which come later in
      // the hero and were painting over the open suggestion list.
      className="as-hero-search as-glass-light relative z-30 mt-6 w-full max-w-5xl rounded-[1.75rem] p-4 text-panel-text sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-base font-bold text-panel-text sm:text-lg">Find your next local favourite</p>
        {/* Adelaide is fixed; this is a location label, not a filter. */}
        <p className="inline-flex items-center gap-1.5 rounded-full border border-teal-700/20 bg-teal-100 px-3 py-1.5 text-xs font-semibold text-teal-700">
          <MapPinIcon aria-hidden="true" className="size-3.5" />
          <span className="sr-only">Location: </span>Adelaide, Australia
        </p>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        <div ref={boxRef} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }} className="as-search-field relative min-w-0 flex-1 rounded-2xl border border-panel-border bg-panel-muted/60">
          <div className="flex min-h-20 flex-col justify-center px-4 py-3">
            <label htmlFor={inputId} className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-panel-text-muted">
              What are you looking for?
            </label>
            <input
              id={inputId}
              name="q"
              type="search"
              maxLength={120}
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(-1);
              }}
              onKeyDown={onKeyDown}
              onFocus={() => options.length > 0 && setOpen(true)}
              placeholder="Business, category or service"
              role="combobox"
              aria-expanded={open && options.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
              className="mt-0.5 w-full border-0 bg-transparent p-0 text-base text-panel-text outline-none placeholder:text-panel-text-muted"
            />
            {loading && (
              <LoaderIcon aria-hidden="true" className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-panel-text-muted motion-reduce:animate-none" />
            )}
          </div>
          {/* Announced rather than drawn: the list itself is visible, and a
              count read out on every keystroke is what makes a combobox
              exhausting to listen to. */}
          <p className="sr-only" role="status">
            {loading ? 'Searching' : options.length > 0 ? `${options.length} suggestion${options.length === 1 ? '' : 's'}` : showNothingFound ? 'No suggestions' : ''}
          </p>
          {open && (options.length > 0 || showNothingFound) && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-card border border-panel-border bg-panel shadow-lg">
              <ul ref={listRef} id={listId} role="listbox" aria-label="Suggestions" className="max-h-80 overflow-auto py-1">
                {options.map((option, i) => {
                  const Icon = KIND_ICON[option.kind];
                  const [before, match, after] = highlightParts(option.label, term);
                  return (
                    <li key={`${option.kind}-${option.slug}`}>
                      {/* The group name is not an option, so it is not in the
                          listbox's set of them: a screen reader counting
                          options should not count "Businesses" as one. */}
                      {(i === 0 || options[i - 1]!.groupLabel !== option.groupLabel) && (
                        <p role="presentation" className="px-3 pb-1 pt-2.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-panel-text-muted">
                          {option.groupLabel}
                        </p>
                      )}
                      <button
                        type="button"
                        id={`${listId}-${option.index}`}
                        data-index={option.index}
                        role="option"
                        aria-selected={active === option.index}
                        onMouseEnter={() => setActive(option.index)}
                        onClick={() => choose(option)}
                        className={`flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm text-panel-text transition-colors ${active === option.index ? 'bg-sky-50' : ''}`}
                      >
                        <Icon aria-hidden="true" className={`size-4 shrink-0 ${active === option.index ? 'text-sky-700' : 'text-panel-text-muted'}`} />
                        <span className="min-w-0 flex-1 truncate">
                          {before}
                          <mark className="bg-transparent font-semibold text-panel-text">{match}</mark>
                          {after}
                        </span>
                        {option.hint && <span className="shrink-0 text-xs text-panel-text-muted">{option.hint}</span>}
                        <ArrowRightIcon aria-hidden="true" className={`size-4 shrink-0 ${active === option.index ? 'text-sky-700' : 'text-transparent'}`} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {/* Always a way out of the dropdown: search the words as typed. */}
              <p className="border-t border-panel-border px-3 py-2 text-xs text-panel-text-muted">
                {showNothingFound ? (
                  <>
                    Nothing matches <span className="font-semibold text-panel-text">{term}</span>. Press Enter to search the directory for it anyway.
                  </>
                ) : (
                  <>Press Enter to search for everything matching your words.</>
                )}
              </p>
            </div>
          )}
        </div>

        <CategoryCombobox categories={categories} />

        <button
          type="submit"
          className="inline-flex min-h-16 shrink-0 items-center justify-center gap-2 rounded-2xl as-primary-action bg-sky-700 px-8 text-base font-semibold text-white transition-colors hover:bg-sky-600 lg:min-h-20"
        >
          <SearchIcon aria-hidden="true" className="size-5" />
          Search
        </button>
      </div>
    </form>
  );
}
