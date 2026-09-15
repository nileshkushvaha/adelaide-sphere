import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CollectionHeader } from '@/components/collection-header';
import { BusinessResults } from '@/components/business-results';
import { fetchCategories, flattenCategories, searchBusinesses } from '@/lib/api';
import { isFiltered, landingRobots, parseSearchParams, toQueryString } from '@/lib/search-params';

async function findCategory(slug: string) {
  return flattenCategories(await fetchCategories()).find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params, searchParams }: PageProps<'/business/category/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const category = await findCategory(slug);
  if (!category) return { title: 'Category not found' };
  const state = parseSearchParams(await searchParams);
  const filtered = isFiltered(state);
  // Same request the page body makes, so it is served from the data cache; an
  // unfiltered landing is indexed only when it has text and at least one listing.
  const total = filtered ? 0 : (await searchBusinesses({ ...state, category: null }, { category: category.slug })).meta.total;
  // The share image is the category's own choice, then its picture; with
  // neither, the site default or a generated card applies.
  const share = category.shareImage ?? category.image;
  return pageMetadata({
    title: category.seoTitle ?? `${category.name} in Adelaide`,
    description: category.seoDescription ?? category.description ?? `Published ${category.name} businesses across Adelaide, with opening hours, contact details and reviews.`,
    path: `/business/category/${category.slug}`,
    canonical: `/business/category/${category.slug}${toQueryString(state)}`,
    keywords: category.seoKeywords
      ? [category.seoKeywords]
      : [`${category.name} Adelaide`, category.name, `${category.name} near Adelaide`, ...(category.parent ? [category.parent.name] : []), 'Adelaide businesses'],
    robots: landingRobots(category.description, total, filtered),
    image: share ? { url: share.url, alt: share.alt } : null,
    og: { kind: 'business-category', key: category.slug },
  });
}

/** Curated category landing (SRS SEO 003: substantive content plus eligible listings; unknown or inactive → 404). */
export default async function CategoryPage({ params, searchParams }: PageProps<'/business/category/[slug]'>) {
  const { slug } = await params;
  const category = await findCategory(slug);
  if (!category) notFound();
  const state = parseSearchParams(await searchParams);
  const basePath = `/business/category/${category.slug}`;
  return (
    <>
      <CollectionHeader
        eyebrow="Category"
        title={`${category.name} in Adelaide`}
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'Businesses', href: '/business' },
          ...(category.parent ? [{ label: category.parent.name, href: `/business/category/${category.parent.slug}` }] : []),
          { label: category.name },
        ]}
        description={category.description ?? `Published ${category.name.toLowerCase()} businesses across Adelaide.`}
        image={category.image}
      />
      {category.children.length > 0 && (
        <nav aria-label="Subcategories" className="border-b border-border bg-surface">
          <ul className="ms-container flex flex-wrap gap-2 py-4 text-sm">
            {category.children.map((child) => (
              <li key={child.id}>
                <Link href={`/business/category/${child.slug}`} className="inline-flex min-h-9 items-center rounded-full border border-border px-3.5 transition-colors hover:border-border-strong hover:bg-sky-50">
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className="ms-container py-10 sm:py-12">
        <BusinessResults basePath={basePath} state={{ ...state, category: null }} fixed={{ category: category.slug }} />
      </div>
    </>
  );
}
