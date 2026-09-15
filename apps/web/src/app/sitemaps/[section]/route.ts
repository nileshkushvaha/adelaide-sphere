import { notFound } from 'next/navigation';
import { fetchSitemapSection } from '@/lib/api';
import { urlSetXml } from '@/lib/sitemap-xml';

// Rendered per request (with a five-minute public cache header) rather than at
// build time: a sitemap must reflect what is published now, and the build must
// not depend on a running API.
export const dynamic = 'force-dynamic';

const SECTIONS = ['businesses', 'editorial', 'taxonomies', 'pages'] as const;
type Section = (typeof SECTIONS)[number];

/** One child sitemap; only canonical pages that return 200 are listed (SRS SEO 002). */
export async function GET(_request: Request, { params }: { params: Promise<{ section: string }> }): Promise<Response> {
  const { section } = await params;
  const name = section.replace(/\.xml$/, '');
  if (!(SECTIONS as readonly string[]).includes(name)) notFound();
  let entries;
  try {
    entries = await fetchSitemapSection(name as Section);
  } catch {
    return new Response('Temporarily unavailable', { status: 503, headers: { 'Retry-After': '120', 'cache-control': 'no-store' } });
  }
  return new Response(urlSetXml(entries), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
