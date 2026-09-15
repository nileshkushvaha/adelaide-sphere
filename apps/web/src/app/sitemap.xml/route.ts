import { fetchSitemapSection } from '@/lib/api';
import { sitemapIndexXml } from '@/lib/sitemap-xml';

// Rendered per request (with a five-minute public cache header) rather than at
// build time: a sitemap must reflect what is published now, and the build must
// not depend on a running API.
export const dynamic = 'force-dynamic';

const SECTIONS = ['businesses', 'editorial', 'taxonomies', 'pages'] as const;

/**
 * Sitemap index split by businesses, editorial content and curated taxonomies
 * (SRS SEO 002). Each child's last-modified time is the newest real change in
 * that section; a section with nothing to list is left out entirely.
 */
export async function GET(): Promise<Response> {
  try {
    return await sitemapIndex();
  } catch {
    // A crawler told to come back later keeps what it has; a 500 reads as broken.
    return new Response('Temporarily unavailable', { status: 503, headers: { 'Retry-After': '120', 'cache-control': 'no-store' } });
  }
}

async function sitemapIndex(): Promise<Response> {
  const sections = await Promise.all(
    SECTIONS.map(async (section) => {
      const entries = await fetchSitemapSection(section);
      const newest = entries.reduce((latest, entry) => (entry.lastModified > latest ? entry.lastModified : latest), '');
      return { section, count: entries.length, lastModified: newest };
    }),
  );
  const xml = sitemapIndexXml(
    sections.filter((section) => section.count > 0).map((section) => ({ path: `/sitemaps/${section.section}.xml`, lastModified: section.lastModified })),
  );
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
