import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { CollectionHeader } from '@/components/collection-header';
import { BusinessResults } from '@/components/business-results';
import { fetchAreas, searchBusinesses } from '@/lib/api';
import { isFiltered, landingRobots, parseSearchParams, toQueryString } from '@/lib/search-params';

async function findArea(slug: string) {
  return (await fetchAreas()).find((a) => a.slug === slug) ?? null;
}

export async function generateMetadata({ params, searchParams }: PageProps<'/business/area/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const area = await findArea(slug);
  if (!area) return { title: 'Area not found' };
  const state = parseSearchParams(await searchParams);
  const filtered = isFiltered(state);
  // Same request the page body makes, so it is served from the data cache; an
  // unfiltered landing is indexed only when it has text and at least one listing.
  const total = filtered ? 0 : (await searchBusinesses({ ...state, area: null }, { area: area.slug })).meta.total;
  const share = area.shareImage ?? area.image;
  return pageMetadata({
    title: area.seoTitle ?? `Businesses in ${area.name}, Adelaide`,
    description: area.seoDescription ?? area.editorialIntro ?? `Published businesses in ${area.name}, Adelaide, with opening hours, contact details and reviews.`,
    path: `/business/area/${area.slug}`,
    canonical: `/business/area/${area.slug}${toQueryString(state)}`,
    keywords: area.seoKeywords ? [area.seoKeywords] : [`businesses in ${area.name}`, area.name, `${area.name} Adelaide`, `${area.name} local services`, 'Adelaide local areas'],
    robots: landingRobots(area.editorialIntro, total, filtered),
    image: share ? { url: share.url, alt: share.alt } : null,
    og: { kind: 'area', key: area.slug },
  });
}

/** Approved local area page (SRS BUS 008, UX 003: areas are an allowlist, never a generic city route). */
export default async function AreaPage({ params, searchParams }: PageProps<'/business/area/[slug]'>) {
  const { slug } = await params;
  const area = await findArea(slug);
  if (!area) notFound();
  const state = parseSearchParams(await searchParams);
  const basePath = `/business/area/${area.slug}`;
  return (
    <>
      <CollectionHeader
        eyebrow="Local area"
        title={`Businesses in ${area.name}`}
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Businesses', href: '/business' }, { label: area.name }]}
        description={area.editorialIntro ?? `Published businesses located in ${area.name}, Adelaide.`}
        image={area.image}
      />
      <div className="as-container py-10 sm:py-12">
        <BusinessResults basePath={basePath} state={{ ...state, area: null }} fixed={{ area: area.slug }} />
      </div>
    </>
  );
}
