import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticleView } from '@/components/article-view';
import { fetchPostPreview } from '@/lib/api';

/** Never cached: the token is checked, and the draft read, on every request. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Article preview',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  // The address carries the token; it must not leak to sites the preview links to.
  referrer: 'no-referrer',
};

/**
 * A private preview of an unpublished article in the site's own design (SRS
 * BLOG 003). The link comes from the article editor, works for ten minutes
 * while the editor stays signed in, is never indexed and never cached, and
 * answers 404 for anything else.
 */
export default async function ArticlePreviewPage({ params }: PageProps<'/preview/article/[token]'>) {
  const { token } = await params;
  const post = await fetchPostPreview(token);
  if (!post) notFound();

  return (
    <article>
      <div className="border-b border-amber-300 bg-amber-100 text-amber-950">
        <p className="as-container py-3 text-sm font-semibold">
          Preview — this article is not published yet. Only people with this link can see it, and the link stops working ten minutes after it was created.
        </p>
      </div>
      <ArticleView post={post} preview />
    </article>
  );
}
