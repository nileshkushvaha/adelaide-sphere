import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { routeMetadata } from '@/lib/route-seo';
import { BusinessResults } from '@/components/business-results';
import { isFiltered, parseSearchParams, toQueryString } from '@/lib/search-params';

/**
 * Lives in a route group so its loading boundary does not wrap the category and
 * area pages (a streamed shell would turn their 404s into 200 responses).
 * Filtered searches are noindex,follow with a normalised self canonical (SRS SEO 003); the base list is indexable. */
export async function generateMetadata({ searchParams }: PageProps<'/business'>): Promise<Metadata> {
  const state = parseSearchParams(await searchParams);
  const filtered = isFiltered(state);
  const base = await pageMetadata({
    title: filtered ? `Search results${state.q ? ` for “${state.q}”` : ''}` : 'Businesses in Adelaide',
    description: 'Every published business across Adelaide, with opening hours, contact details and reviews. Filter by category, local area and rating.',
    path: '/business',
    canonical: `/business${toQueryString(state)}`,
    keywords: ['Adelaide businesses', 'business directory Adelaide', 'local services Adelaide', 'shops and services Adelaide'],
    robots: filtered ? { index: false, follow: true } : undefined,
    og: { kind: 'route', key: 'directory' },
  });
  // A filtered search is not the directory index: it keeps its own normalised
  // canonical and stays out of the index (SEO 003), whatever has been
  // configured for the index itself.
  if (filtered) return base;
  return routeMetadata('directory', base);
}

export default async function BusinessListPage({ searchParams }: PageProps<'/business'>) {
  const state = parseSearchParams(await searchParams);
  return (
    <>
      <div className="as-on-dark bg-band text-band-text">
        <div className="as-container py-10 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">Adelaide, South Australia</p>
          <h1 className="font-display mt-3 max-w-3xl text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.06] tracking-tight">Adelaide business directory</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-band-muted">
            Every published listing inside Adelaide, checked by our editors. Combine a keyword with a category, local area or minimum rating.
          </p>
        </div>
      </div>
      <div className="as-container py-10 sm:py-12">
        <BusinessResults basePath="/business" state={state} />
      </div>
    </>
  );
}
