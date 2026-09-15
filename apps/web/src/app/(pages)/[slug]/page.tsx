import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StaticPageView } from '@/components/static-page-view';
import { fetchStaticPage } from '@/lib/api';
import { staticPageMetadata } from '@/lib/route-seo';

/**
 * Every information page that shares the reading template (SRS CFG 002 as
 * amended in 1.6 and 1.7): the three policies, and any page an administrator
 * has created. Which addresses exist is the API's answer, not a list here — a
 * list would have to be edited every time an editor added a page, and would be
 * wrong until it was.
 *
 * An address nobody has published is a genuine 404. `/about` and `/contact` are
 * product routes with their own static segments, and the API refuses both as
 * page addresses, so a created page can never shadow them.
 */
export async function generateMetadata({ params }: PageProps<'/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchStaticPage(slug);
  if (!page) return { title: 'Page not found', robots: { index: false } };
  return staticPageMetadata(page);
}

export default async function StaticPage({ params }: PageProps<'/[slug]'>) {
  const { slug } = await params;
  const page = await fetchStaticPage(slug);
  if (!page) notFound();
  return <StaticPageView page={page} />;
}
