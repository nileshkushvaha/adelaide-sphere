import type { Metadata } from 'next';
import { SEO_ROUTES } from '@adelaide-sphere/domain';
import { fetchSiteSettings } from './api';
import { pageMetadata } from './seo';

/**
 * Applies the administrator's search metadata to a route that has no record of
 * its own (SRS SEO 001).
 *
 * Precedence, matching what the settings screen says: a field set for the route
 * replaces the page's built-in text; an empty field keeps it; and the site-wide
 * defaults fill anything still missing. A page therefore stays correct whether
 * or not anything has been configured, and an API failure leaves it exactly as
 * it was written — `fetchSiteSettings` already falls back to the defaults.
 * Whatever is overridden is carried into Open Graph and the X card too, so a
 * shared link never disagrees with the search result.
 */
export async function routeMetadata(key: (typeof SEO_ROUTES)[number]['key'], base: Metadata): Promise<Metadata> {
  const settings = await fetchSiteSettings();
  const override = settings.seo?.routes?.[key];
  if (!override) return base;

  const title = override.metaTitle ?? undefined;
  const description = override.metaDescription ?? base.description ?? undefined;
  const image = override.ogImage;
  const card = settings.seo?.twitterCard === 'summary' ? 'summary' : 'summary_large_image';

  return {
    ...base,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(override.metaKeywords ? { keywords: override.metaKeywords.split(',').map((word) => word.trim()).filter(Boolean) } : {}),
    ...(override.canonicalUrl ? { alternates: { ...base.alternates, canonical: override.canonicalUrl } } : {}),
    // "default" means the page keeps whatever it already declared, which for
    // most pages is nothing at all — the site-wide rule then applies.
    ...(override.robots && override.robots !== 'default'
      ? { robots: { index: !override.robots.includes('noindex'), follow: !override.robots.includes('nofollow') } }
      : {}),
    openGraph: {
      ...base.openGraph,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(override.canonicalUrl ? { url: override.canonicalUrl } : {}),
      ...(image ? { images: [{ url: image.url, width: image.width, height: image.height, alt: image.alt || title || '' }] } : {}),
    },
    twitter: {
      ...(base.twitter ?? {}),
      card,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(image ? { images: [{ url: image.url, alt: image.alt || title || '' }] } : {}),
    } as Metadata['twitter'],
  };
}

/**
 * The metadata a static page publishes: its own SEO fields and keywords, and
 * its share image when it sets one — otherwise the site default share image or
 * a generated card for the page (see `pageMetadata`).
 */
export function staticPageMetadata(
  page: { slug: string; title: string; seoTitle: string | null; seoDescription: string | null; seoKeywords: string | null; ogImage: { url: string; alt: string; width: number; height: number } | null; noindex?: boolean },
  canonical: string = `/${page.slug}`,
): Promise<Metadata> {
  return pageMetadata({
    title: page.seoTitle ?? page.title,
    description: page.seoDescription,
    path: canonical,
    keywords: page.seoKeywords ? [page.seoKeywords] : [page.title],
    image: page.ogImage,
    og: { kind: 'page', key: page.slug },
    // Hidden from search by the editor (change log 1.17): still followed, so links out keep their value.
    ...(page.noindex ? { robots: { index: false, follow: true } } : {}),
  });
}
