import Image from 'next/image';
import Link from 'next/link';
import type { PostDetail } from '@/lib/api';
import { BrandIcon, brandLabel } from './brand-icon';

/**
 * Author block shown under an article (SRS BLOG 004, 1.10 BLOG 005). It links
 * to the author's page when they have one (an active author with published
 * articles).
 *
 * Every field is optional and omitted when the editor has not filled it in, and
 * the block itself disappears when there is nothing to say beyond a name the
 * byline has already given.
 */
export function AuthorCard({ author }: { author: PostDetail['author'] }) {
  const hasDetail = Boolean(author.bio || author.shortBio || author.role || author.expertise.length > 0 || author.links.length > 0);
  if (!hasDetail) return null;
  const meta = [author.role, author.pronouns, author.location].filter(Boolean).join(' · ');
  return (
    <aside aria-labelledby="author-heading" className="rounded-card border border-border bg-surface-raised p-5 sm:p-6">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-sky-700">Written by</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:gap-5">
        {author.image ? (
          <Image src={author.image.url} alt="" width={64} height={64} className="size-16 shrink-0 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-full bg-sky-100 text-xl font-semibold text-sky-700">
            {author.displayName.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <h2 id="author-heading" className="font-display text-xl leading-tight tracking-tight">
            {author.displayName}
          </h2>
          {meta && <p className="mt-1 text-sm text-text-muted">{meta}</p>}
          {author.bio ? (
            // Sanitised by the API with the editorial allowlist before storage (SRS SEC 001).
            <div className="as-prose as-prose-fill mt-3 text-sm" dangerouslySetInnerHTML={{ __html: author.bio }} />
          ) : (
            author.shortBio && <p className="mt-3 text-sm leading-relaxed text-text-muted">{author.shortBio}</p>
          )}
          {author.expertise.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Topics">
              {author.expertise.map((topic) => (
                <li key={topic} className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                  {topic}
                </li>
              ))}
            </ul>
          )}
          {author.links.length > 0 && (
            // The mark identifies the network at a glance; the name is still the
            // accessible name, so the row does not depend on recognising a glyph.
            <ul aria-label={`${author.displayName} elsewhere`} className="mt-4 flex flex-wrap gap-1.5">
              {author.links.map((link) => {
                const name = link.label ?? brandLabel(link.kind);
                return (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      rel="noopener noreferrer nofollow"
                      target="_blank"
                      title={name}
                      className="inline-flex size-11 items-center justify-center rounded-full border border-border text-text-muted transition-colors hover:border-border-strong hover:bg-sky-50 hover:text-link"
                    >
                      <BrandIcon kind={link.kind} size={18} />
                      <span className="sr-only">{name}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          {author.profilePath && (
            <Link href={author.profilePath} className="as-text-link mt-4 inline-flex min-h-11 items-center text-sm font-semibold">
              More articles by {author.displayName}
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
