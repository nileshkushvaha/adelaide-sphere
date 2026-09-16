import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ArticleCollection } from '@/components/article-collection';
import { BrandIcon, brandLabel } from '@/components/brand-icon';
import { CollectionHeader } from '@/components/collection-header';
import { JsonLdScript } from '@/components/json-ld';
import { Pagination } from '@/components/pagination';
import { fetchAuthor, fetchPosts, type PublicAuthorPage } from '@/lib/api';
import { isPastLastPage, pagedPath, pagedTitle, readPageParam } from '@/lib/pagination';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, profilePageJsonLd } from '@/lib/structured-data';

export async function generateMetadata({ params, searchParams }: PageProps<'/blog/author/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const page = readPageParam((await searchParams).page);
  const author = await fetchAuthor(slug);
  if (!author) return { title: 'Author not found', robots: { index: false } };
  return pageMetadata({
    title: pagedTitle(author.seoTitle ?? (author.role ? `${author.displayName}, ${author.role}` : author.displayName), page),
    description: author.seoDescription ?? author.shortBio ?? `Articles by ${author.displayName} for Adelaide Sphere: local guides, stories and practical advice about Adelaide.`,
    path: pagedPath(`/blog/author/${author.slug}`, page),
    image: author.image ? { url: author.image.url, alt: author.displayName } : null,
    og: { kind: 'route', key: 'blog' },
  });
}

/** Photo, role, topics and links, on the header band. Every part is omitted when the editor has not filled it in. */
function ProfileDetails({ author }: { author: PublicAuthorPage }) {
  const meta = [author.role, author.pronouns, author.location].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        {author.image ? (
          <Image src={author.image.url} alt="" width={72} height={72} className="size-18 shrink-0 rounded-full object-cover" priority />
        ) : (
          <span aria-hidden="true" className="grid size-18 shrink-0 place-items-center rounded-full bg-white/12 text-2xl font-semibold text-white">
            {author.displayName.slice(0, 1)}
          </span>
        )}
        {meta && <p className="text-band-muted">{meta}</p>}
      </div>
      {author.expertise.length > 0 && (
        <ul aria-label="Topics" className="flex flex-wrap gap-2">
          {author.expertise.map((topic) => (
            <li key={topic} className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
              {topic}
            </li>
          ))}
        </ul>
      )}
      {author.links.length > 0 && (
        <ul aria-label={`${author.displayName} elsewhere`} className="flex flex-wrap gap-1.5">
          {author.links.map((link) => {
            const name = link.label ?? brandLabel(link.kind);
            return (
              <li key={link.url}>
                <a href={link.url} rel="noopener noreferrer nofollow" target="_blank" title={name} className="inline-flex size-11 items-center justify-center rounded-full border border-white/25 text-white transition-colors hover:bg-white/10">
                  <BrandIcon kind={link.kind} size={18} />
                  <span className="sr-only">{name} (opens in a new tab)</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * An author's page (SRS 1.10 BLOG 005): their published profile and their
 * articles, newest first, 12 per page. It exists only for an active author with
 * at least one published article, so there is never an empty archive.
 */
export default async function AuthorPage({ params, searchParams }: PageProps<'/blog/author/[slug]'>) {
  const { slug } = await params;
  const page = readPageParam((await searchParams).page);
  const author = await fetchAuthor(slug);
  if (!author) notFound();
  const posts = await fetchPosts({ page, author: author.slug });
  if (isPastLastPage(page, posts.meta.pageCount)) notFound();
  const path = `/blog/author/${author.slug}`;
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: author.displayName }];

  return (
    <>
      <JsonLdScript data={[profilePageJsonLd(author), breadcrumbJsonLd(crumbs)]} />
      <CollectionHeader
        eyebrow="Author"
        title={author.displayName}
        crumbs={crumbs}
        // The full profile when there is one, otherwise the short one; never both.
        description={author.bio ? undefined : (author.shortBio ?? undefined)}
        bodyHtml={author.bio}
        meta={`${posts.meta.total} ${posts.meta.total === 1 ? 'article' : 'articles'}`}
        footer={<ProfileDetails author={author} />}
      />
      <div className="as-container py-12 sm:py-16">
        <h2 className="font-display mb-8 text-2xl tracking-tight sm:text-3xl">Articles by {author.displayName}</h2>
        <ArticleCollection posts={posts.data} label={`Articles by ${author.displayName}`} headingLevel={3} leadIsAboveFold />
        {posts.meta.pageCount > 1 && (
          <div className="mt-12">
            <Pagination page={posts.meta.page} pageCount={posts.meta.pageCount} hrefFor={(p) => pagedPath(path, p)} />
          </div>
        )}
      </div>
    </>
  );
}
