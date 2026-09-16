import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StaticPageView } from '@/components/static-page-view';
import { fetchPagePreview } from '@/lib/api';

/** Never cached: the token is checked, and the page read, on every request. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Page preview',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  // The address carries the token; it must not leak to sites the preview links to.
  referrer: 'no-referrer',
};

/**
 * A private preview of an information page in the site's own design (change
 * log 1.17). It shows the editor's unsaved changes when there are some. The
 * link comes from the page editor, works for ten minutes while the editor stays
 * signed in, is never indexed or cached, and answers 404 for anything else.
 */
export default async function PagePreviewPage({ params }: PageProps<'/preview/page/[token]'>) {
  const { token } = await params;
  const page = await fetchPagePreview(token);
  if (!page) notFound();

  return (
    <>
      <div className="border-b border-amber-300 bg-amber-100 text-amber-950">
        <p className="as-container py-3 text-sm font-semibold">
          Preview — this may include changes that are not saved or published yet. Only people with this link can see it, and it stops working ten minutes after it was created.
        </p>
      </div>
      <StaticPageView page={page} />
    </>
  );
}
