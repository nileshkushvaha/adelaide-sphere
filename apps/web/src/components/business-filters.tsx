import { Button, Input, Label, Select } from '@adelaide-sphere/ui';
import type { PublicArea, PublicCategory } from '@/lib/api';
import { SORTS, SORT_LABELS, type SearchState } from '@/lib/search-params';

interface Props {
  action: string;
  state: SearchState;
  categories: PublicCategory[];
  areas: PublicArea[];
  /** Filters fixed by the page (curated category/area pages hide their own selector). */
  fixed?: { category?: boolean; area?: boolean };
  /**
   * Whether the API is offering "open now" (SRS DIR 008). It is conditional on
   * published hours coverage, so the control appears only when the filter would
   * give an honest answer — never as a disabled or misleading option.
   */
  openNowAvailable?: boolean;
}

/**
 * Plain GET form so filtering works without client JavaScript; state
 * round-trips through the URL (SRS DIR 006). The layout is a single column on
 * a phone and a toolbar on wider screens, with the action always reachable.
 */
export function BusinessFilters({ action, state, categories, areas, fixed = {}, openNowAvailable = false }: Props) {
  // Static class names: Tailwind only generates classes it can see in the source,
  // so the column count is chosen from a literal map rather than interpolated.
  const columnClass = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }[2 + (fixed.category ? 0 : 1) + (fixed.area ? 0 : 1)] ?? 'lg:grid-cols-4';
  return (
    <form
      action={action}
      method="get"
      role="search"
      aria-label="Filter businesses"
      className="rounded-card border border-border bg-surface-raised p-4 shadow-sm sm:p-5"
    >
      <div className={`grid gap-3 sm:grid-cols-2 ${columnClass}`}>
        <div className="sm:col-span-2 lg:col-span-1">
          <Label htmlFor="q">Search</Label>
          <Input id="q" name="q" type="search" defaultValue={state.q} placeholder="Name, category or service" maxLength={120} />
        </div>
        {!fixed.category && (
          <div>
            <Label htmlFor="category">Category</Label>
            <Select id="category" name="category" defaultValue={state.category ?? ''}>
              <option value="">All categories</option>
              {categories.map((category) => (
                <optgroup key={category.id} label={category.name}>
                  <option value={category.slug}>{category.name}</option>
                  {category.children.map((child) => (
                    <option key={child.id} value={child.slug}>
                      {category.name} › {child.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
        )}
        {!fixed.area && (
          <div>
            <Label htmlFor="area">Local area</Label>
            <Select id="area" name="area" defaultValue={state.area ?? ''}>
              <option value="">All of Adelaide</option>
              {areas.map((area) => (
                <option key={area.id} value={area.slug}>
                  {area.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="minRating">Minimum rating</Label>
          <Select id="minRating" name="minRating" defaultValue={state.minRating ?? ''}>
            <option value="">Any rating</option>
            {[4, 3, 2].map((n) => (
              <option key={n} value={n}>
                {n}+ stars
              </option>
            ))}
          </Select>
        </div>
        {openNowAvailable && (
          <div className="flex items-end">
            <label htmlFor="openNow" className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input id="openNow" name="openNow" type="checkbox" value="1" defaultChecked={state.openNow} className="size-4" />
              <span>
                Open now
                <span className="block text-xs text-text-muted">Listings with published hours only</span>
              </span>
            </label>
          </div>
        )}
        <div>
          <Label htmlFor="sort">Sort by</Label>
          <Select id="sort" name="sort" defaultValue={state.sort ?? ''}>
            <option value="">Most relevant</option>
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="submit">Apply filters</Button>
        <Button asChild variant="ghost">
          <a href={action}>Reset</a>
        </Button>
        <p className="ml-auto text-xs text-text-muted">Adelaide only — widening the area is not an option here.</p>
      </div>
    </form>
  );
}
