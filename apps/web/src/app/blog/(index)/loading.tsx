import { ArticleCollectionSkeleton } from '@/components/article-skeleton';

/**
 * Shown while the blog index is being rendered on the server. The heading band
 * is static text, so it is drawn for real and only the articles are placeholders
 * — a visitor navigating to the blog sees where they are immediately.
 */
export default function BlogIndexLoading() {
  return (
    <>
      <div className="as-on-dark as-editorial-band text-band-text">
        <div className="as-container py-8 sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">Adelaide Sphere</p>
          <p className="font-display mt-3.5 text-balance text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.04] tracking-tight">Stories from around the city</p>
          <p className="mt-4 max-w-4xl text-lg leading-relaxed text-band-muted">Local guides, food discoveries, and stories from Adelaide’s neighbourhoods.</p>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-band-muted">Written and edited by our team, with paid guest posts clearly labelled.</p>
          <div aria-hidden="true" className="mt-6 grid gap-5 border-t border-band-border pt-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end lg:gap-8">
            <div className="h-12 max-w-xl animate-pulse rounded-full bg-white/10" />
            <div className="h-[4.25rem] max-w-xl animate-pulse rounded-2xl bg-white/10" />
          </div>
        </div>
      </div>
      <div className="as-container pt-6 pb-12 sm:pt-8 sm:pb-16">
        <ArticleCollectionSkeleton />
      </div>
    </>
  );
}
