import type { MediaVariantKind } from '@adelaide-sphere/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@adelaide-sphere/database';
import { collectionMeta, skipFor } from '../common/pagination.js';
import { DatabaseService } from '../database/database.service.js';
import { ObjectStoragePort } from '../media/storage.port.js';
import { relatedScore } from './post-rules.js';
import { booleanSearchTerms } from './search-query.js';
import { PREVIEW_LINK_PREFIX } from './blog.service.js';
import { visibleCommentsWhere } from './comments.service.js';
import { RedisService } from '../redis/redis.service.js';
import type { ListPublicPostsQueryDto, PublicAuthorPageDto, PublicBlogTermDto, PublicEmbeddedBusinessDto, PublicImageVariantDto, PublicPostCardDto, PublicPostDto } from './dto/public-post.dto.js';

const cardInclude = {
  author: {
    select: {
      displayName: true, slug: true, active: true, role: true, shortBio: true, bio: true, pronouns: true, location: true, websiteUrl: true, expertise: true,
      links: { orderBy: { sortOrder: 'asc' }, select: { kind: true, url: true, label: true } },
      image: { include: { variants: true } },
    },
  },
  category: { select: { name: true, slug: true } },
  tags: { include: { tag: { select: { name: true, slug: true, active: true } } } },
  cover: { include: { variants: true } },
  ogImage: { include: { variants: true } },
} satisfies Prisma.PostInclude;

type CardRow = Prisma.PostGetPayload<{ include: typeof cardInclude }>;

const RELATED_LIMIT = 4;

const EXTERNAL_LINK_REL = 'rel="noopener noreferrer nofollow"';

/**
 * Outbound links in a paid guest post are marked sponsored, as search engines
 * require for paid links (SRS 1.12). Applied when the article is read, so
 * switching the flag on or off needs no change to the stored text.
 */
export function sponsoredLinks(body: string, guestPost: boolean): string {
  return guestPost ? body.replaceAll(EXTERNAL_LINK_REL, 'rel="sponsored noopener noreferrer nofollow"') : body;
}
/** The most matches a search ranks; far more than anyone pages through, and it bounds the work per query. */
const SEARCH_CANDIDATE_LIMIT = 500;

/**
 * Public blog reads (SRS BLOG 004–005). Only published articles are visible;
 * drafts, scheduled and archived posts are invisible even by direct slug.
 */
@Injectable()
export class BlogPublicService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStoragePort,
    private readonly redis: RedisService,
  ) {}

  async list(query: ListPublicPostsQueryDto): Promise<{ data: PublicPostCardDto[]; meta: ReturnType<typeof collectionMeta> }> {
    const db = await this.database.client();
    const where: Prisma.PostWhereInput = {
      status: 'published',
      ...(query.category ? { category: { slug: query.category, active: true } } : {}),
      ...(query.tag ? { tags: { some: { tag: { slug: query.tag, active: true } } } } : {}),
      ...(query.featured ? { featuredAt: { not: null } } : {}),
      ...(query.author ? { author: { slug: query.author, active: true } } : {}),
    };
    const q = query.q?.trim();
    const terms = q ? booleanSearchTerms(q) : null;
    if (q && terms) return this.search(where, terms, query);
    // Nothing indexable left (only very short words or stopwords): match titles and summaries directly.
    if (q) where.OR = [{ title: { contains: q } }, { excerpt: { contains: q } }];
    const [rows, total] = await Promise.all([
      db.post.findMany({ where, orderBy: query.featured ? [{ featuredAt: 'desc' }, { id: 'asc' }] : [{ publishedAt: 'desc' }, { id: 'asc' }], skip: skipFor(query.page, query.pageSize), take: query.pageSize, include: cardInclude }),
      db.post.count({ where }),
    ]);
    return { data: rows.map((row) => this.toCard(row)), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  /**
   * Blog search (SRS 1.10 BLOG 005): published articles whose title, summary or
   * text contain every searched word, most relevant first and newest first among
   * equals. MySQL ranks the candidates; category and tag filters then apply to
   * those, and only the requested page is loaded in full.
   */
  private async search(where: Prisma.PostWhereInput, terms: string, query: ListPublicPostsQueryDto): Promise<{ data: PublicPostCardDto[]; meta: ReturnType<typeof collectionMeta> }> {
    const db = await this.database.client();
    // `terms` is built from letters and digits only and is passed as a bound parameter.
    // Category, tag, author and featured filters apply inside the ranked query, so
    // a narrowed search is not limited to whichever posts ranked highest overall.
    const filters = Prisma.sql`${query.category ? Prisma.sql`AND p.categoryId IN (SELECT bc.id FROM blog_categories bc WHERE bc.slug = ${query.category} AND bc.active = 1)` : Prisma.empty}
      ${query.tag ? Prisma.sql`AND EXISTS (SELECT 1 FROM post_tags pt JOIN blog_tags bt ON bt.id = pt.tagId WHERE pt.postId = p.id AND bt.slug = ${query.tag} AND bt.active = 1)` : Prisma.empty}
      ${query.author ? Prisma.sql`AND p.authorId IN (SELECT a.id FROM authors a WHERE a.slug = ${query.author} AND a.active = 1)` : Prisma.empty}
      ${query.featured ? Prisma.sql`AND p.featuredAt IS NOT NULL` : Prisma.empty}`;
    const hits = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p.id FROM posts p
      WHERE p.status = 'published' AND MATCH(p.title, p.excerpt, p.searchText) AGAINST (${terms} IN BOOLEAN MODE) ${filters}
      ORDER BY MATCH(p.title, p.excerpt, p.searchText) AGAINST (${terms} IN BOOLEAN MODE) DESC, p.publishedAt DESC, p.id ASC
      LIMIT ${SEARCH_CANDIDATE_LIMIT}`);
    if (hits.length === 0) return { data: [], meta: collectionMeta(query.page, query.pageSize, 0) };
    const rank = new Map(hits.map((hit, index) => [hit.id, index]));
    const matching = await db.post.findMany({ where: { ...where, id: { in: [...rank.keys()] } }, select: { id: true } });
    const ordered = matching.map((row) => row.id).sort((a, b) => rank.get(a)! - rank.get(b)!);
    const pageIds = ordered.slice(skipFor(query.page, query.pageSize), skipFor(query.page, query.pageSize) + query.pageSize);
    const rows = pageIds.length > 0 ? await db.post.findMany({ where: { id: { in: pageIds } }, include: cardInclude }) : [];
    rows.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    return { data: rows.map((row) => this.toCard(row)), meta: collectionMeta(query.page, query.pageSize, ordered.length) };
  }

  async detail(slug: string): Promise<PublicPostDto> {
    const db = await this.database.client();
    const row = await db.post.findFirst({ where: { slug, status: 'published' }, include: cardInclude });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Article not found' });
    const [related, approvedCommentCount, businesses, aiRun] = await Promise.all([
      this.related(row),
      db.comment.count({ where: visibleCommentsWhere(row.id) }),
      this.embeddedBusinesses(row.sanitizedBody),
      // An article is AI-assisted only through its item link; its disclosure is the one recorded with its draft.
      db.aIGenerationRun.findFirst({ where: { item: { postId: row.id }, status: 'applied', disclosureText: { not: null } }, orderBy: { generationVersion: 'desc' }, select: { disclosureText: true } }),
    ]);
    return {
      ...this.toCard(row),
      body: sponsoredLinks(row.sanitizedBody, row.guestPost),
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      commentsEnabled: row.commentsEnabled,
      approvedCommentCount,
      firstPublishedAt: (row.firstPublishedAt ?? row.publishedAt ?? row.createdAt).toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      related,
      businesses,
      ...(aiRun?.disclosureText ? { aiDisclosure: aiRun.disclosureText } : {}),
    };
  }

  /**
   * The published businesses an article's body shows as cards. Resolved on
   * every read, so a listing that is unpublished stops appearing inside
   * articles as soon as those pages refresh (SRS SEO 007).
   */
  private async embeddedBusinesses(body: string): Promise<PublicEmbeddedBusinessDto[]> {
    const ids = [...new Set([...body.matchAll(/data-business-id="([a-z0-9]{20,40})"/g)].map((match) => match[1]!))].slice(0, 20);
    if (ids.length === 0) return [];
    const db = await this.database.client();
    const rows = await db.business.findMany({ where: { id: { in: ids }, status: 'published' }, select: { id: true, slug: true, name: true, primaryCategory: { select: { name: true } }, localArea: { select: { name: true } } } });
    return rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name, categoryName: row.primaryCategory?.name ?? null, areaName: row.localArea?.name ?? null }));
  }

  /**
   * The article behind a private preview link (SRS BLOG 003). Any state but
   * archived may be previewed, which is the point; the link must exist in Redis
   * and the editor who created it must still be signed in. Every failure is the
   * same 404, so a guessed or expired token learns nothing.
   */
  async previewByToken(token: string): Promise<PublicPostDto> {
    const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'This preview link has expired or does not exist' });
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw notFound();
    let stored: { postId?: unknown; sessionId?: unknown } | null = null;
    try {
      await this.redis.ensureConnected();
      const raw = await this.redis.client.get(`${PREVIEW_LINK_PREFIX}${token}`);
      stored = raw ? (JSON.parse(raw) as { postId?: unknown; sessionId?: unknown }) : null;
    } catch {
      throw notFound();
    }
    if (!stored || typeof stored.postId !== 'string' || typeof stored.sessionId !== 'string') throw notFound();
    const db = await this.database.client();
    const session = await db.adminSession.findFirst({ where: { id: stored.sessionId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
    if (!session) {
      await this.redis.client.del(`${PREVIEW_LINK_PREFIX}${token}`).catch(() => undefined);
      throw notFound();
    }
    const row = await db.post.findUnique({ where: { id: stored.postId }, include: cardInclude });
    if (!row || row.status === 'archived') throw notFound();
    return {
      ...this.toCard(row),
      body: sponsoredLinks(row.sanitizedBody, row.guestPost),
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      commentsEnabled: row.commentsEnabled,
      approvedCommentCount: 0,
      firstPublishedAt: (row.firstPublishedAt ?? row.publishedAt ?? new Date()).toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      related: [],
      businesses: await this.embeddedBusinesses(row.sanitizedBody),
    };
  }

  /**
   * A public author page (SRS 1.10 BLOG 005). It exists only for an active
   * author with at least one published article, so there is never an empty
   * archive; everything returned is already public on their articles.
   */
  async author(slug: string): Promise<PublicAuthorPageDto> {
    const db = await this.database.client();
    const row = await db.author.findFirst({
      where: { slug, active: true },
      select: { ...cardInclude.author.select, seoTitle: true, seoDescription: true, updatedAt: true, _count: { select: { posts: { where: { status: 'published' } } } } },
    });
    if (!row || row._count.posts === 0) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Author not found' });
    return { ...this.toAuthor(row), seoTitle: row.seoTitle, seoDescription: row.seoDescription, postCount: row._count.posts, updatedAt: row.updatedAt.toISOString() };
  }

  /** Same category first, then shared tags, never itself or unpublished content (SRS BLOG 004). */
  private async related(post: CardRow): Promise<PublicPostCardDto[]> {
    const db = await this.database.client();
    const tagIds = post.tags.map((t) => t.tagId);
    const candidates = await db.post.findMany({
      where: {
        status: 'published',
        id: { not: post.id },
        OR: [{ categoryId: post.categoryId }, ...(tagIds.length > 0 ? [{ tags: { some: { tagId: { in: tagIds } } } }] : [])],
      },
      include: cardInclude,
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      take: 25,
    });
    return candidates
      .map((candidate) => ({ candidate, score: relatedScore({ categoryId: candidate.categoryId, tagIds: candidate.tags.map((t) => t.tagId) }, { categoryId: post.categoryId, tagIds }) }))
      .sort((a, b) => b.score - a.score || (b.candidate.publishedAt?.getTime() ?? 0) - (a.candidate.publishedAt?.getTime() ?? 0) || a.candidate.id.localeCompare(b.candidate.id))
      .slice(0, RELATED_LIMIT)
      .map(({ candidate }) => this.toCard(candidate));
  }

  async terms(kind: 'category' | 'tag'): Promise<PublicBlogTermDto[]> {
    const db = await this.database.client();
    if (kind === 'category') {
      const categories = await db.blogCategory.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { posts: { where: { status: 'published' } } } }, ogImage: { include: { variants: true } } },
      });
      return categories.map((row) => ({
        name: row.name,
        slug: row.slug,
        landingContent: row.landingContent,
        postCount: row._count.posts,
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        seoKeywords: row.seoKeywords,
        shareImage: this.renditions(row.ogImage).at(-1) ?? null,
      }));
    }
    // Tags carry the same search appearance as categories (change log 1.15).
    const tags = await db.blogTag.findMany({
      where: { active: true },
      orderBy: [{ name: 'asc' }],
      include: { _count: { select: { posts: { where: { post: { status: 'published' } } } } }, ogImage: { include: { variants: true } } },
    });
    return tags.map((row) => ({
      name: row.name,
      slug: row.slug,
      landingContent: row.landingContent,
      postCount: row._count.posts,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoKeywords: row.seoKeywords,
      shareImage: this.renditions(row.ogImage).at(-1) ?? null,
    }));
  }

  /** Byline data only; nothing private and nothing an editor has not published. */
  private toAuthor(author: CardRow['author']): PublicPostCardDto['author'] {
    const variants = author.image && author.image.status === 'ready' ? author.image.variants.slice().sort((a, b) => a.width - b.width) : [];
    const chosen = variants.find((variant) => variant.kind === 'thumbnail') ?? variants[0];
    return {
      displayName: author.displayName,
      slug: author.slug,
      role: author.role,
      shortBio: author.shortBio,
      bio: author.bio,
      pronouns: author.pronouns,
      location: author.location,
      websiteUrl: author.websiteUrl,
      expertise: Array.isArray(author.expertise) ? (author.expertise as unknown[]).filter((value): value is string => typeof value === 'string') : [],
      links: author.links.map((link) => ({ kind: link.kind, url: link.url, label: link.label })),
      image: chosen ? { url: this.storage.publicUrl(chosen.objectKey), alt: author.image?.altText ?? '' } : null,
      // Shown with a published article, so an active author always has a page with at least that article on it.
      profilePath: author.active ? `/blog/author/${author.slug}` : null,
    };
  }

  private toCard(row: CardRow): PublicPostCardDto {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      category: { name: row.category.name, slug: row.category.slug },
      author: this.toAuthor(row.author),
      tags: row.tags.filter((t) => t.tag.active).map((t) => ({ name: t.tag.name, slug: t.tag.slug })),
      publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
      coverAlt: row.coverAlt ?? row.cover?.altText ?? null,
      cover: this.renditions(row.cover),
      // Published because a Creative Commons Attribution licence requires the
      // credit to appear wherever the image does. It is stored on the asset, so
      // one image credited once is credited everywhere it is used.
      coverCredit: row.cover?.credit ?? null,
      guestPost: row.guestPost,
      // The image used when the article is shared. An article that sets one
      // publishes that; otherwise the cover stands in, which is what readers
      // expect and what the editor is told on the screen.
      shareImage: this.renditions(row.ogImage).at(-1) ?? null,
    };
  }

  /** Published renditions of an asset, smallest first; empty unless it is ready. */
  private renditions(asset: { status: string; variants: { kind: MediaVariantKind; objectKey: string; width: number; height: number }[] } | null | undefined): PublicImageVariantDto[] {
    if (!asset || asset.status !== 'ready') return [];
    return asset.variants
      .slice()
      .sort((a, b) => a.width - b.width)
      .map((v) => ({ kind: v.kind, url: this.storage.publicUrl(v.objectKey), width: v.width, height: v.height }));
  }
}
