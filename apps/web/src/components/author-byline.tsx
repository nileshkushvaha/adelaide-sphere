import Image from 'next/image';
import Link from 'next/link';
import type { PostDetail } from '@/lib/api';
import { formatArticleDate } from '@/lib/share';

interface Props {
  author: PostDetail['author'];
  publishedAt: string;
  updatedAt?: string;
  readingMinutes?: number;
  /** `dark` when the byline sits on a navy band. */
  tone?: 'light' | 'dark';
  /** Inline metadata on wider screens, stacked on phones. */
  layout?: 'stacked' | 'inline';
}

/**
 * Byline with the author's photo, role and dates (SRS BLOG 004).
 *
 * "Updated" appears only when the revision is at least a day after publication.
 * A published article's `updatedAt` moves on every save, so showing it
 * unconditionally labelled almost every article as updated on the day it came
 * out, which told a reader nothing.
 */
export function AuthorByline({ author, publishedAt, updatedAt, readingMinutes, tone = 'light', layout = 'stacked' }: Props) {
  const muted = tone === 'dark' ? 'text-band-muted' : 'text-text-muted';
  const strong = tone === 'dark' ? 'text-white' : 'text-text';
  const fallback = tone === 'dark' ? 'bg-white/12 text-white' : 'bg-sky-100 text-sky-700';
  const showUpdated = updatedAt && new Date(updatedAt).getTime() - new Date(publishedAt).getTime() > 24 * 3_600_000;
  return (
    <div className="flex items-center gap-3">
      {author.image ? (
        <Image src={author.image.url} alt="" width={44} height={44} className="size-11 shrink-0 rounded-full object-cover" />
      ) : (
        <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold ${fallback}`}>
          {author.displayName.slice(0, 1)}
        </span>
      )}
      <div className={`min-w-0 text-sm ${layout === 'inline' ? 'sm:flex sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1' : ''}`}>
        <p className={muted}>
          {author.profilePath ? (
            <Link href={author.profilePath} className={`font-semibold ${strong} underline-offset-2 hover:underline`}>
              {author.displayName}
            </Link>
          ) : (
            <span className={`font-semibold ${strong}`}>{author.displayName}</span>
          )}
          {author.role && <span> · {author.role}</span>}
        </p>
        {/* One dot-separated line, so the dates and the reading estimate read as
            one piece of provenance rather than three stacked labels. */}
        <p className={`mt-0.5 flex flex-wrap items-center gap-x-1.5 ${muted} ${layout === 'inline' ? 'sm:mt-0' : ''}`}>
          <time dateTime={publishedAt}>{formatArticleDate(publishedAt)}</time>
          {showUpdated && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Updated <time dateTime={updatedAt}>{formatArticleDate(updatedAt!)}</time>
              </span>
            </>
          )}
          {readingMinutes ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{readingMinutes} min read</span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
