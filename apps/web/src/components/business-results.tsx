import Link from 'next/link';
import { Button } from '@adelaide-sphere/ui';
import { fetchAreas, fetchCategories, flattenCategories, searchBusinesses } from '@/lib/api';
import { buildChips, pageHref, toQueryString, type SearchState } from '@/lib/search-params';
import { BusinessCard } from './business-card';
import { LazyBusinessGrid } from './lazy-list';
import { NextPageLink } from './next-page-link';
import { BusinessFilters } from './business-filters';
import { FilterChips } from './filter-chips';
import { gridColumns } from './page-shell';

interface Props {
  basePath: string;
  state: SearchState;
  fixed?: { category?: string; area?: string };
}

/**
 * Shared results block for /business and the curated category/area pages:
 * filters, chips, count, cards, pagination and the empty state. API failures
 * propagate to the route error boundary (SRS DIR 006).
 */
export async function BusinessResults({ basePath, state, fixed = {} }: Props) {
  const [result, categories, areas] = await Promise.all([searchBusinesses(state, fixed), fetchCategories(), fetchAreas()]);
  const { data, meta } = result;
  const names = {
    categories: Object.fromEntries(flattenCategories(categories).map((c) => [c.slug, c.name])),
    areas: Object.fromEntries(areas.map((a) => [a.slug, a.name])),
  };
  const chips = buildChips(state, basePath, names);
  const beyond = data.length === 0 && meta.total > 0;
  return (
    <div className="flex flex-col gap-6">
      <BusinessFilters
        action={basePath}
        state={state}
        categories={categories}
        areas={areas}
        fixed={{ category: Boolean(fixed.category), area: Boolean(fixed.area) }}
        openNowAvailable={meta.openNow?.available ?? false}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <p role="status" className="text-sm">
          <span className="font-semibold">{meta.total === 0 ? 'No businesses match' : `${meta.total} business${meta.total === 1 ? '' : 'es'}`}</span>
          {/* No page number: the list grows as it is scrolled, so "page 3 of 9"
              would describe something the visitor no longer sees. How many are
              on screen is announced by the list itself. */}
        </p>
        <FilterChips chips={chips} resetHref={basePath} />
      </div>
      {state.page === 1 && meta.featured.length > 0 && (
        <section aria-labelledby="featured-heading" className="rounded-card-lg border border-border bg-sky-50 p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            <h2 id="featured-heading" className="text-lg font-semibold">
              Featured
            </h2>
            <p className="text-sm text-text-muted">Chosen by our editors. They match your filters and are not paid placements.</p>
          </div>
          <ul className={`grid gap-6 ${gridColumns(meta.featured.length)}`}>
            {meta.featured.map((business) => (
              <li key={business.id}>
                <BusinessCard business={business} featured />
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.length > 0 ? (
        /* The first page is rendered here, so the results exist without
           JavaScript; the rest is fetched and appended as the page is
           scrolled, and a plain "More businesses" link stands in when it
           cannot be. */
        <LazyBusinessGrid
          initial={data}
          page={state.page}
          pageCount={meta.pageCount}
          query={toQueryString(state).replace(/^\?/, '')}
          category={fixed.category}
          area={fixed.area}
          fallback={state.page < meta.pageCount ? <NextPageLink href={pageHref(state, basePath, state.page + 1)} label="More businesses" /> : null}
        />
      ) : beyond ? (
        <div className="rounded-card-lg border border-border bg-surface-raised p-10 text-center shadow-sm">
          <p className="text-lg font-semibold">This page is past the end of the results.</p>
          <Button asChild className="mt-4">
            <Link href={`${basePath}${toQueryString({ ...state, page: 1 })}`}>Go to page one</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-card-lg border border-dashed border-border-strong p-12 text-center">
          <p aria-hidden="true" className="text-3xl">🔍</p>
          <p className="mt-3 text-lg font-semibold">No businesses match these filters.</p>
          <p className="mx-auto mt-2 max-w-md text-text-muted">Try a broader search term or remove a filter. We only list businesses inside Adelaide, so widening the area is not an option here.</p>
          {chips.length > 0 && (
            <Button asChild variant="outline" className="mt-4">
              <Link href={basePath}>Clear filters</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
