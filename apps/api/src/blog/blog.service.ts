import { randomBytes } from 'node:crypto';
import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { BlogCategory, BlogTag, Prisma } from '@adelaide-sphere/database';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { collectionMeta, skipFor } from '../common/pagination.js';
import { isValidSlug, slugify } from '../common/slug.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { RedirectsService } from '../seo/redirects.service.js';
import type { ChangeSlugDto } from '../seo/dto/redirect.dto.js';
import { POST_TRANSITIONS, deriveExcerpt, postPublicationBlockers, scheduleBlockers, type PostAction } from './post-rules.js';
import { renderSanitisedBody, sanitiseHtmlFragment, toPlainText } from './sanitise.js';
import { syncContentMedia } from '../media/content-media.js';
import { bumpInventoryEpoch } from '@adelaide-sphere/database/automation';
import { aiPublicationDecision, closeAiHumanEdit, lockLinkedAiItem, openAiHumanEdit, recordPostRevision, syncAiItemWithPost } from '@adelaide-sphere/database/editorial';
import { validateAuthorLinks, validateExpertise, validatePublicEmail, type NormalisedAuthorLink } from './author-rules.js';
import { validatePublicUrl } from '../directory/business-rules.js';
import { MediaService } from '../media/media.service.js';
import { CacheService } from '../cache/cache.service.js';
import { RedisService } from '../redis/redis.service.js';
import type { PostPreviewLinkDto, RenderPostPreviewDto, RenderedPostPreviewDto } from './dto/post-preview.dto.js';
import type { PostAutosaveDto, PostAutosaveReceiptDto, PostRevisionDetailDto, SavePostAutosaveDto } from './dto/post-history.dto.js';
import { CACHE_TAGS, MAX_FEATURED_POSTS } from '@adelaide-sphere/domain';
import type {
  AuthorDto,
  AuthorInputDto,
  BlogTermDto,
  BlogTermInputDto,
  CreatePostDto,
  ListPostsQueryDto,
  PostDto,
  PostPreviewDto,
  PostRevisionDto,
  PostStateDto,
  PostSummaryDto,
  SchedulePostDto,
  UpdateAuthorDto,
  UpdateBlogTermDto,
  UpdatePostDto,
} from './dto/blog.dto.js';

const notFound = (what = 'Post') => new NotFoundException({ code: 'NOT_FOUND', message: `${what} not found` });
const stale = () => new ConflictException({ code: 'STALE_VERSION', message: 'This item was changed by someone else. Reload and try again.' });
/** How long a private on-site preview link works (SRS BLOG 003 "short lived"). */
const PREVIEW_LINK_TTL_SECONDS = 600;
export const PREVIEW_LINK_PREFIX = 'preview:post:';
/** Revisions kept per article; older ones are removed as new ones are recorded. */
const MAX_POST_REVISIONS = 50;

const slugTaken = (suggestion?: string) => {
  const message = suggestion ? `Another item already uses this web address. Try “${suggestion}”.` : 'Another item already uses this web address.';
  return new ConflictException({ code: 'SLUG_IN_USE', message, fields: { slug: [message] }, ...(suggestion ? { suggestion } : {}) });
};
const validation = (field: string, message: string) => new HttpException({ code: 'VALIDATION_ERROR', message, fields: { [field]: [message] } }, HttpStatus.BAD_REQUEST);

/** Author profile with its links, counts and published-article count. */
const authorInclude = {
  links: { orderBy: { sortOrder: 'asc' } },
  posts: { where: { status: 'published' }, select: { id: true } },
  _count: { select: { posts: true } },
} satisfies Prisma.AuthorInclude;

type AuthorRow = Prisma.AuthorGetPayload<{ include: typeof authorInclude }>;

/** Optional profile columns, shaped so the same object works for create and update. */
type AuthorProfileData = Partial<{
  role: string | null;
  shortBio: string | null;
  bio: string | null;
  pronouns: string | null;
  location: string | null;
  publicEmail: string | null;
  websiteUrl: string | null;
  expertise: string[];
  imageMediaId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}>;

const postInclude = {
  author: { select: { id: true, displayName: true, active: true } },
  category: { select: { id: true, name: true, active: true } },
  tags: { select: { tagId: true } },
} as const;

type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;
export type TermKind = 'category' | 'tag';

/**
 * Editorial content (SRS BLOG 001–003). Bodies are authored as Markdown and
 * stored with their sanitised HTML; publication is an explicit, gated,
 * transactional action that also writes the outbox event used for cache
 * invalidation.
 */
@Injectable()
export class BlogService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly redirects: RedirectsService,
    private readonly media: MediaService,
    private readonly cache: CacheService,
    private readonly redis: RedisService,
  ) {}

  // ---- authors -------------------------------------------------------------

  async listAuthors(query: { q?: string; status?: 'active' | 'inactive' } = {}): Promise<AuthorDto[]> {
    const db = await this.database.client();
    // Narrowed in the query: the screen filtered the whole list in the browser,
    // which is fine for six authors and wrong for six hundred.
    const where = {
      ...(query.q ? { OR: [{ displayName: { contains: query.q } }, { role: { contains: query.q } }] } : {}),
      ...(query.status ? { active: query.status === 'active' } : {}),
    };
    const rows = await db.author.findMany({ where, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], include: authorInclude });
    return Promise.all(rows.map((row) => this.toAuthorDto(row)));
  }

  async getAuthor(id: string): Promise<AuthorDto> {
    const db = await this.database.client();
    const row = await db.author.findUnique({ where: { id }, include: authorInclude });
    if (!row) throw notFound('Author');
    return this.toAuthorDto(row);
  }

  async createAuthor(input: AuthorInputDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AuthorDto> {
    const db = await this.database.client();
    const slug = input.slug ?? slugify(input.displayName);
    if (!isValidSlug(slug)) throw validation('slug', 'Slug must be lowercase letters, numbers and single hyphens');
    if (await db.author.findUnique({ where: { slug } })) throw slugTaken();
    const profile = await this.authorProfileData(input);
    const row = await db.$transaction(async (tx) => {
      const created = await tx.author.create({ data: { displayName: input.displayName, slug, ...profile.data } });
      await syncContentMedia(tx, 'author', created.id, created.bio);
      if (profile.links.length > 0) await tx.authorLink.createMany({ data: profile.links.map((link) => ({ authorId: created.id, ...link })) });
      return tx.author.findUniqueOrThrow({ where: { id: created.id }, include: authorInclude });
    });
    await this.audit.record({ action: 'blog.author.create', actorAdminId: actor.id, targetType: 'author', targetId: row.id, metadata: { slug }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toAuthorDto(row);
  }

  async updateAuthor(id: string, input: UpdateAuthorDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AuthorDto> {
    const db = await this.database.client();
    const current = await db.author.findUnique({ where: { id } });
    if (!current) throw notFound('Author');
    if (current.version !== input.expectedVersion) throw stale();
    if (input.slug && input.slug !== current.slug) {
      if (!isValidSlug(input.slug)) throw validation('slug', 'Slug must be lowercase letters, numbers and single hyphens');
      if (await db.author.findUnique({ where: { slug: input.slug } })) throw slugTaken();
    }
    const profile = await this.authorProfileData(input);
    const row = await db.$transaction(async (tx) => {
      const updated = await tx.author.updateMany({
        where: { id, version: input.expectedVersion },
        data: { displayName: input.displayName, ...(input.slug ? { slug: input.slug } : {}), ...profile.data, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw stale();
      if (profile.data.bio !== undefined) await syncContentMedia(tx, 'author', id, profile.data.bio);
      if (input.links !== undefined) {
        await tx.authorLink.deleteMany({ where: { authorId: id } });
        if (profile.links.length > 0) await tx.authorLink.createMany({ data: profile.links.map((link) => ({ authorId: id, ...link })) });
      }
      // Bylines, author cards and the author page show this profile.
      await this.cache.recordInvalidation(tx, { resourceType: 'author', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.posts, CACHE_TAGS.sitemap, CACHE_TAGS.author(current.slug), ...(input.slug && input.slug !== current.slug ? [CACHE_TAGS.author(input.slug)] : [])] });
      return tx.author.findUniqueOrThrow({ where: { id }, include: authorInclude });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'blog.author.update', actorAdminId: actor.id, targetType: 'author', targetId: id, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toAuthorDto(row);
  }

  async setAuthorActive(id: string, active: boolean, expectedVersion: number, actor: AdminPrincipal, ctx: RequestContext): Promise<AuthorDto> {
    const db = await this.database.client();
    const current = await db.author.findUnique({ where: { id } });
    if (!current) throw notFound('Author');
    if (current.version !== expectedVersion) throw stale();
    if (!active) {
      const inUse = await db.post.count({ where: { authorId: id, status: { not: 'archived' } } });
      if (inUse > 0) throw new ConflictException({ code: 'TERM_IN_USE', message: `Cannot deactivate: ${inUse} live article(s) still credit this author.` });
    }
    await db.$transaction(async (tx) => {
      const updated = await tx.author.updateMany({ where: { id, version: expectedVersion }, data: { active, version: { increment: 1 } } });
      if (updated.count !== 1) throw stale();
      // An author page exists only while the author is active.
      await this.cache.recordInvalidation(tx, { resourceType: 'author', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.posts, CACHE_TAGS.sitemap, CACHE_TAGS.author(current.slug)] });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: active ? 'blog.author.activate' : 'blog.author.deactivate', actorAdminId: actor.id, targetType: 'author', targetId: id, requestId: ctx.requestId, ipAddress: ctx.ip });
    const row = await db.author.findUniqueOrThrow({ where: { id }, include: authorInclude });
    return this.toAuthorDto(row);
  }

  /** The signed-in administrator's default author, or null (SRS 1.10 BLOG 001). */
  async getDefaultAuthor(actor: AdminPrincipal): Promise<{ authorId: string | null; author: { id: string; displayName: string; active: boolean } | null }> {
    const db = await this.database.client();
    const row = await db.adminUser.findUnique({ where: { id: actor.id }, select: { defaultAuthor: { select: { id: true, displayName: true, active: true } } } });
    const author = row?.defaultAuthor ?? null;
    return { authorId: author?.id ?? null, author };
  }

  /**
   * Chooses the author new articles are credited to by default. Only the
   * administrator's own preference changes, so no one else's edit can conflict
   * with it and no version is asked for; the change is still recorded.
   */
  async setDefaultAuthor(authorId: string | null, actor: AdminPrincipal, ctx: RequestContext): Promise<{ authorId: string | null; author: { id: string; displayName: string; active: boolean } | null }> {
    const db = await this.database.client();
    if (authorId) {
      const author = await db.author.findUnique({ where: { id: authorId }, select: { active: true } });
      if (!author) throw validation('authorId', 'That author profile no longer exists');
      if (!author.active) throw validation('authorId', 'Choose an active author profile');
    }
    await db.adminUser.update({ where: { id: actor.id }, data: { defaultAuthorId: authorId } });
    await this.audit.record({ action: 'blog.author.default.set', actorAdminId: actor.id, targetType: 'author', targetId: authorId, metadata: { cleared: authorId === null }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.getDefaultAuthor(actor);
  }

  /**
   * Validates and normalises the optional profile fields. The long bio goes
   * through the editorial allowlist, so an author profile can never introduce
   * script or style content into a public page or an admin preview (SEC 001).
   */
  private async authorProfileData(input: AuthorInputDto): Promise<{ data: AuthorProfileData; links: NormalisedAuthorLink[] }> {
    const fields: Record<string, string[]> = {};
    const email = validatePublicEmail(input.publicEmail);
    if (!email.ok) fields.publicEmail = ['Enter a valid email address'];
    let websiteUrl: string | null = null;
    if (input.websiteUrl) {
      websiteUrl = validatePublicUrl(input.websiteUrl);
      if (!websiteUrl) fields.websiteUrl = ['Website must be a full http(s) URL without credentials'];
    }
    const expertise = validateExpertise(input.expertise);
    Object.assign(fields, expertise.errors);
    const links = validateAuthorLinks((input.links ?? []) as never);
    Object.assign(fields, links.errors);
    if (Object.keys(fields).length > 0) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields }, HttpStatus.BAD_REQUEST);
    if (input.imageMediaId) await this.media.assertUsableImage(input.imageMediaId);

    const data: AuthorProfileData = {};
    if (input.role !== undefined) data.role = input.role ?? null;
    if (input.shortBio !== undefined) data.shortBio = input.shortBio ?? null;
    if (input.bio !== undefined) data.bio = input.bio ? sanitiseHtmlFragment(input.bio) : null;
    if (input.pronouns !== undefined) data.pronouns = input.pronouns ?? null;
    if (input.location !== undefined) data.location = input.location ?? null;
    if (input.publicEmail !== undefined) data.publicEmail = email.normalised;
    if (input.websiteUrl !== undefined) data.websiteUrl = websiteUrl;
    if (input.expertise !== undefined) data.expertise = expertise.normalised;
    if (input.imageMediaId !== undefined) data.imageMediaId = input.imageMediaId ?? null;
    if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle ?? null;
    if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription ?? null;
    return { data, links: links.normalised };
  }

  // ---- categories and tags --------------------------------------------------

  async listTerms(kind: TermKind, query: { q?: string; status?: 'active' | 'inactive' } = {}): Promise<BlogTermDto[]> {
    const db = await this.database.client();
    // Narrowed in the query rather than after it, so the screen stays usable as
    // the tag list grows with the writing.
    const where = {
      ...(query.q ? { OR: [{ name: { contains: query.q } }, { slug: { contains: query.q } }] } : {}),
      ...(query.status ? { active: query.status === 'active' } : {}),
    };
    if (kind === 'category') {
      const rows = await db.blogCategory.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { posts: true } } } });
      return Promise.all(rows.map(async (row) => this.toTermDto(row, row._count.posts, await this.termImage(row.ogImageMediaId))));
    }
    const rows = await db.blogTag.findMany({ where, orderBy: [{ name: 'asc' }], include: { _count: { select: { posts: true } } } });
    return Promise.all(rows.map(async (row) => this.toTermDto(row, row._count.posts, await this.termImage(row.ogImageMediaId))));
  }

  async createTerm(kind: TermKind, input: BlogTermInputDto, actor: AdminPrincipal, ctx: RequestContext): Promise<BlogTermDto> {
    const db = await this.database.client();
    const slug = input.slug ?? slugify(input.name);
    if (!isValidSlug(slug)) throw validation('slug', 'Slug must be lowercase letters, numbers and single hyphens');
    const landingContent = input.landingContent ? renderSanitisedBody(input.landingContent) : null;
    await this.assertTermSeo(kind, input);
    if (kind === 'category') {
      if (await db.blogCategory.findUnique({ where: { slug } })) throw slugTaken();
      const row = await db.$transaction(async (tx) => {
        const created = await tx.blogCategory.create({
          data: { name: input.name, slug, landingContent, seoTitle: input.seoTitle ?? null, seoDescription: input.seoDescription ?? null, seoKeywords: input.seoKeywords ?? null, ogImageMediaId: input.ogImageMediaId ?? null },
        });
        await syncContentMedia(tx, 'blog_category', created.id, created.landingContent);
        return created;
      });
      await this.audit.record({ action: 'blog.category.create', actorAdminId: actor.id, targetType: 'blog_category', targetId: row.id, requestId: ctx.requestId, ipAddress: ctx.ip });
      return this.toTermDto(row, 0, await this.termImage(row.ogImageMediaId));
    }
    if (await db.blogTag.findUnique({ where: { slug } })) throw slugTaken();
    const row = await db.$transaction(async (tx) => {
      const created = await tx.blogTag.create({
        data: { name: input.name, slug, landingContent, seoTitle: input.seoTitle ?? null, seoDescription: input.seoDescription ?? null, seoKeywords: input.seoKeywords ?? null, ogImageMediaId: input.ogImageMediaId ?? null },
      });
      await syncContentMedia(tx, 'blog_tag', created.id, created.landingContent);
      return created;
    });
    await this.audit.record({ action: 'blog.tag.create', actorAdminId: actor.id, targetType: 'blog_tag', targetId: row.id, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toTermDto(row, 0, await this.termImage(row.ogImageMediaId));
  }

  async updateTerm(kind: TermKind, id: string, input: UpdateBlogTermDto, actor: AdminPrincipal, ctx: RequestContext): Promise<BlogTermDto> {
    const db = await this.database.client();
    const model = kind === 'category' ? db.blogCategory : db.blogTag;
    const current = await (model as typeof db.blogTag).findUnique({ where: { id } });
    if (!current) throw notFound(kind === 'category' ? 'Category' : 'Tag');
    if (current.version !== input.expectedVersion) throw stale();
    if (input.slug && input.slug !== current.slug) {
      if (!isValidSlug(input.slug)) throw validation('slug', 'Slug must be lowercase letters, numbers and single hyphens');
      const clash = await (model as typeof db.blogTag).findUnique({ where: { slug: input.slug } });
      if (clash) throw slugTaken();
    }
    await this.assertTermSeo(kind, input);
    // Categories and tags both have a search appearance (change log 1.15); a field left out keeps its stored value.
    const seo = {
      ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
      ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
      ...(input.seoKeywords !== undefined ? { seoKeywords: input.seoKeywords } : {}),
      ...(input.ogImageMediaId !== undefined ? { ogImageMediaId: input.ogImageMediaId } : {}),
    };
    // Landing content left out of the request keeps what is stored; an empty value clears it.
    const landingContent = input.landingContent === undefined ? undefined : input.landingContent ? renderSanitisedBody(input.landingContent) : null;
    const data = { name: input.name, ...(input.slug ? { slug: input.slug } : {}), ...(landingContent !== undefined ? { landingContent } : {}), ...seo, version: { increment: 1 } };
    const movedTo = input.slug && input.slug !== current.slug ? input.slug : null;
    await db.$transaction(async (tx) => {
      const table = kind === 'category' ? tx.blogCategory : tx.blogTag;
      const updated = await (table as typeof tx.blogTag).updateMany({ where: { id, version: input.expectedVersion }, data });
      if (updated.count !== 1) throw stale();
      if (landingContent !== undefined) await syncContentMedia(tx, kind === 'category' ? 'blog_category' : 'blog_tag', id, landingContent);
      // Term lists, landing pages, article chips and the sitemap show these fields.
      await this.cache.recordInvalidation(tx, { resourceType: kind === 'category' ? 'blog_category' : 'blog_tag', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.posts, CACHE_TAGS.taxonomy, CACHE_TAGS.sitemap, ...(movedTo ? [CACHE_TAGS.redirects, CACHE_TAGS.menus] : [])] });
      // A category and a tag both have a public landing page, so moving one
      // leaves saved links and search results pointing at nothing unless a
      // redirect goes with it — the same obligation a listing or an article
      // carries (SRS SEO 004). In the transaction, so a failed redirect takes
      // the rename back with it rather than producing a dead address.
      if (movedTo) {
        const base = kind === 'category' ? '/blog/category' : '/blog/tag';
        await this.redirects.recordSlugChange(tx, {
          sourcePath: `${base}/${current.slug}`,
          targetPath: `${base}/${movedTo}`,
          resourceType: kind === 'category' ? 'blog_category' : 'blog_tag',
          resourceId: id,
          actorAdminId: actor.id,
          reason: null,
        });
      }
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: `blog.${kind}.update`, actorAdminId: actor.id, targetType: `blog_${kind}`, targetId: id, requestId: ctx.requestId, ipAddress: ctx.ip, metadata: movedTo ? { movedFrom: current.slug, movedTo } : undefined });
    return (await this.listTerms(kind)).find((t) => t.id === id)!;
  }

  async setTermActive(kind: TermKind, id: string, active: boolean, expectedVersion: number, actor: AdminPrincipal, ctx: RequestContext): Promise<BlogTermDto> {
    const db = await this.database.client();
    const model = kind === 'category' ? db.blogCategory : db.blogTag;
    const current = await (model as typeof db.blogTag).findUnique({ where: { id } });
    if (!current) throw notFound(kind === 'category' ? 'Category' : 'Tag');
    if (current.version !== expectedVersion) throw stale();
    if (!active) {
      const inUse = kind === 'category'
        ? await db.post.count({ where: { categoryId: id, status: { not: 'archived' } } })
        : await db.postTag.count({ where: { tagId: id, post: { status: { not: 'archived' } } } });
      if (inUse > 0) throw new ConflictException({ code: 'TERM_IN_USE', message: `Cannot deactivate: ${inUse} live article(s) still use this term.` });
    }
    await db.$transaction(async (tx) => {
      const table = kind === 'category' ? tx.blogCategory : tx.blogTag;
      const updated = await (table as typeof tx.blogTag).updateMany({ where: { id, version: expectedVersion }, data: { active, version: { increment: 1 } } });
      if (updated.count !== 1) throw stale();
      await this.cache.recordInvalidation(tx, { resourceType: kind === 'category' ? 'blog_category' : 'blog_tag', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.posts, CACHE_TAGS.taxonomy, CACHE_TAGS.sitemap, CACHE_TAGS.menus] });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: `blog.${kind}.${active ? 'activate' : 'deactivate'}`, actorAdminId: actor.id, targetType: `blog_${kind}`, targetId: id, requestId: ctx.requestId, ipAddress: ctx.ip });
    return (await this.listTerms(kind)).find((t) => t.id === id)!;
  }

  // ---- posts ----------------------------------------------------------------

  async listPosts(query: ListPostsQueryDto): Promise<{ data: PostSummaryDto[]; meta: ReturnType<typeof collectionMeta> }> {
    const db = await this.database.client();
    const where: Prisma.PostWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.authorId ? { authorId: query.authorId } : {}),
      ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
      ...(query.q ? { OR: [{ title: { contains: query.q } }, { slug: { contains: query.q } }] } : {}),
    };
    const orderBy: Prisma.PostOrderByWithRelationInput[] = [{ [query.sort]: query.order } as Prisma.PostOrderByWithRelationInput, { id: 'asc' }];
    const [rows, total] = await Promise.all([
      db.post.findMany({ where, orderBy, skip: skipFor(query.page, query.pageSize), take: query.pageSize, include: postInclude }),
      db.post.count({ where }),
    ]);
    return { data: rows.map((row) => this.toSummary(row)), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  async getPost(id: string): Promise<PostDto> {
    const row = await this.load(id);
    return this.toDto(row);
  }

  async preview(id: string): Promise<PostPreviewDto> {
    const row = await this.load(id);
    return { id: row.id, title: row.title, excerpt: row.excerpt, sanitizedBody: row.sanitizedBody, authorName: row.author.displayName, categoryName: row.category.name, status: row.status, noindex: true };
  }

  /**
   * Renders what the editor has typed, saved or not, exactly as a save would
   * store it — through the same sanitiser and summary rule — without storing
   * anything (SRS BLOG 003). The result is for the signed-in editor only.
   */
  async renderPreview(input: RenderPostPreviewDto): Promise<RenderedPostPreviewDto> {
    const db = await this.database.client();
    const sanitizedBody = renderSanitisedBody(input.bodyMarkdown ?? '', input.bodyFormat ?? 'html');
    const plain = toPlainText(sanitizedBody);
    const typedExcerpt = input.excerpt?.trim() ?? '';
    const derived = typedExcerpt ? '' : deriveExcerpt(plain);
    const [author, category, cover] = await Promise.all([
      input.authorId ? db.author.findUnique({ where: { id: input.authorId }, select: { displayName: true } }) : null,
      input.categoryId ? db.blogCategory.findUnique({ where: { id: input.categoryId }, select: { name: true } }) : null,
      input.coverMediaId ? this.media.publicImageRefOfKind(input.coverMediaId, 'hero') : null,
    ]);
    const words = plain ? plain.split(/\s+/).length : 0;
    return {
      title: input.title?.trim() || 'Untitled article',
      excerpt: typedExcerpt || derived,
      excerptGenerated: Boolean(derived),
      sanitizedBody,
      authorName: author?.displayName ?? null,
      categoryName: category?.name ?? null,
      cover: cover ? { url: cover.url, alt: cover.alt } : null,
      readingMinutes: Math.max(1, Math.round(words / 200)),
      noindex: true,
    };
  }

  /**
   * A private link to see the saved article in the public site's own design
   * before it is published (SRS BLOG 003: authenticated, short-lived, noindex).
   * The token is random, lives in Redis for ten minutes, and is bound to the
   * editor's session: signing out, or the session ending, stops it working.
   */
  async createPreviewLink(id: string, sessionId: string): Promise<PostPreviewLinkDto> {
    const current = await this.load(id);
    // The preview page answers 404 for an archived article, so no link is issued for one.
    if (current.status === 'archived') throw new ConflictException({ code: 'INVALID_STATE', message: 'Restore the article before previewing it' });
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + PREVIEW_LINK_TTL_SECONDS * 1000);
    try {
      await this.redis.ensureConnected();
      await this.redis.client.set(`${PREVIEW_LINK_PREFIX}${token}`, JSON.stringify({ postId: id, sessionId }), 'EX', PREVIEW_LINK_TTL_SECONDS);
    } catch {
      throw new ServiceUnavailableException({ code: 'PREVIEW_UNAVAILABLE', message: 'Preview links are unavailable right now. Try again in a moment.' });
    }
    return { path: `/preview/article/${token}`, expiresAt: expiresAt.toISOString() };
  }

  /** Snapshots the article as it stands before a change, and keeps the newest MAX_POST_REVISIONS. */
  private async recordRevision(tx: Prisma.TransactionClient, current: PostRow, reason: string | null, actorAdminId: string): Promise<void> {
    await recordPostRevision(tx, current, reason, actorAdminId);
  }

  async revisionDetail(id: string, revisionId: string): Promise<PostRevisionDetailDto> {
    const db = await this.database.client();
    const row = await db.contentRevision.findFirst({ where: { id: revisionId, resourceType: 'post', resourceId: id }, include: { actor: { select: { displayName: true } } } });
    if (!row) throw notFound('Revision');
    return {
      id: row.id,
      version: row.version,
      title: row.title,
      excerpt: row.excerpt,
      bodySource: row.bodySource ?? row.sanitizedSnapshot,
      bodyFormat: row.bodySource ? (row.bodyFormat ?? 'html') : 'html',
      sanitizedSnapshot: row.sanitizedSnapshot,
      reason: row.reason,
      actorName: row.actor?.displayName ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Brings back an earlier version (SRS BLOG 003). The current text is kept as
   * a revision first, so a restore can itself be undone; the restored text goes
   * through the sanitiser again, and a published article's pages are refreshed.
   */
  async restoreRevision(id: string, revisionId: string, expectedVersion: number, actor: AdminPrincipal, ctx: RequestContext): Promise<PostDto> {
    const db = await this.database.client();
    const current = await this.load(id);
    if (current.version !== expectedVersion) throw stale();
    if (current.status === 'archived') throw new ConflictException({ code: 'INVALID_STATE', message: 'Restore the article before bringing back an earlier version' });
    const revision = await db.contentRevision.findFirst({ where: { id: revisionId, resourceType: 'post', resourceId: id } });
    if (!revision) throw notFound('Revision');
    const bodyFormat = revision.bodySource ? (revision.bodyFormat ?? 'html') : 'html';
    const bodyMarkdown = revision.bodySource ?? revision.sanitizedSnapshot;
    const sanitizedBody = renderSanitisedBody(bodyMarkdown, bodyFormat);
    const published = current.status === 'published';

    const row = await db.$transaction(async (tx) => {
      // An AI-linked article records the human change (AI-210); ordinary articles are unaffected.
      const aiEdit = await openAiHumanEdit(tx, id);
      // The version guard runs first, so a concurrent change is a 409 rather than a duplicate revision.
      const updated = await tx.post.updateMany({
        where: { id, version: expectedVersion },
        data: { title: revision.title ?? current.title, excerpt: revision.excerpt ?? current.excerpt, bodyMarkdown, bodyFormat, sanitizedBody, searchText: toPlainText(sanitizedBody), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw stale();
      await this.recordRevision(tx, current, `Before restoring version ${revision.version}`, actor.id);
      await syncContentMedia(tx, 'post', id, sanitizedBody);
      if (aiEdit) await closeAiHumanEdit(tx, aiEdit, id, { actorAdminId: actor.id, requestId: ctx.requestId });
      await bumpInventoryEpoch(tx);
      await tx.postAutosave.deleteMany({ where: { postId: id, adminId: actor.id } });
      if (published) {
        await this.outbox.write(tx, { type: 'post.updated', resourceType: 'post', resourceId: id, resourceVersion: current.version + 1, correlationId: ctx.requestId, payload: { postId: id, slug: current.slug } });
        await this.cache.recordInvalidation(tx, { resourceType: 'post', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.posts, CACHE_TAGS.post(current.slug)] });
      }
      return tx.post.findUniqueOrThrow({ where: { id }, include: postInclude });
    });
    if (published) await this.cache.bumpNamespace();
    await this.audit.record({ action: 'blog.post.revision.restore', actorAdminId: actor.id, targetType: 'post', targetId: id, metadata: { revisionVersion: revision.version, published }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row);
  }

  /**
   * Keeps what an editor is typing (SRS 1.10 BLOG 003). One copy per article
   * per administrator, private to them. It never touches the article, its
   * version or its revisions, and is not an audited change — restoring or
   * discarding it is.
   */
  async saveAutosave(id: string, input: SavePostAutosaveDto, actor: AdminPrincipal): Promise<PostAutosaveReceiptDto> {
    const db = await this.database.client();
    const post = await db.post.findUnique({ where: { id }, select: { status: true } });
    if (!post) throw notFound('Post');
    if (post.status === 'archived') throw new ConflictException({ code: 'INVALID_STATE', message: 'Archived articles are read-only' });
    const data = { title: input.title, excerpt: input.excerpt, bodySource: input.bodyMarkdown, bodyFormat: input.bodyFormat, baseVersion: input.baseVersion };
    const row = await db.postAutosave.upsert({ where: { postId_adminId: { postId: id, adminId: actor.id } }, create: { postId: id, adminId: actor.id, ...data }, update: data });
    return { savedAt: row.savedAt.toISOString() };
  }

  async getAutosave(id: string, actor: AdminPrincipal): Promise<PostAutosaveDto | null> {
    const db = await this.database.client();
    const row = await db.postAutosave.findUnique({ where: { postId_adminId: { postId: id, adminId: actor.id } }, include: { post: { select: { version: true } } } });
    if (!row) return null;
    return { title: row.title, excerpt: row.excerpt, bodyMarkdown: row.bodySource, bodyFormat: row.bodyFormat, baseVersion: row.baseVersion, savedAt: row.savedAt.toISOString(), stale: row.baseVersion < row.post.version };
  }

  async discardAutosave(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const db = await this.database.client();
    const { count } = await db.postAutosave.deleteMany({ where: { postId: id, adminId: actor.id } });
    if (count > 0) await this.audit.record({ action: 'blog.post.autosave.discard', actorAdminId: actor.id, targetType: 'post', targetId: id, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  async revisions(id: string): Promise<PostRevisionDto[]> {
    const db = await this.database.client();
    const rows = await db.contentRevision.findMany({ where: { resourceType: 'post', resourceId: id }, orderBy: { version: 'desc' }, take: MAX_POST_REVISIONS, include: { actor: { select: { displayName: true } } } });
    return rows.map((r) => ({ id: r.id, version: r.version, title: r.title, reason: r.reason, actorAdminId: r.actorAdminId, actorName: r.actor?.displayName ?? null, createdAt: r.createdAt.toISOString() }));
  }

  async createPost(input: CreatePostDto, actor: AdminPrincipal, ctx: RequestContext): Promise<PostDto> {
    const db = await this.database.client();
    const slug = input.slug ?? slugify(input.title);
    if (!isValidSlug(slug)) throw validation('slug', 'Slug must be lowercase letters, numbers and single hyphens');
    if (await db.post.findUnique({ where: { slug } })) {
      // Two articles with the same title are common ("Best coffee in Norwood");
      // offer the next free address rather than a bare refusal.
      let suggestion: string | undefined;
      for (let n = 2; n <= 20 && !suggestion; n += 1) {
        const candidate = `${slug.slice(0, 150)}-${n}`;
        if (!(await db.post.findUnique({ where: { slug: candidate }, select: { id: true } }))) suggestion = candidate;
      }
      throw slugTaken(suggestion);
    }
    await this.assertReferences(input.authorId, input.categoryId, input.tagIds ?? []);
    if (input.coverMediaId) await this.media.assertUsableImage(input.coverMediaId);
    if (input.ogImageMediaId) await this.media.assertUsableImage(input.ogImageMediaId);
    const bodyMarkdown = input.bodyMarkdown ?? '';
    // Markdown stays the default so an API client that omits the field keeps the
    // original behaviour; the admin editor always sends 'html' explicitly.
    const bodyFormat = input.bodyFormat ?? 'markdown';
    const sanitizedBody = renderSanitisedBody(bodyMarkdown, bodyFormat);
    // A writer who leaves the summary empty gets one written from the opening
    // text (shown to them in the editor, never hidden), rather than a blocker.
    const excerpt = input.excerpt?.trim() ? input.excerpt : deriveExcerpt(toPlainText(sanitizedBody));
    const row = await db.$transaction(async (tx) => {
      // A new article changes the inventory AI topics are compared with (AI plan §E step 6).
      await bumpInventoryEpoch(tx);
      const created = await tx.post.create({
        data: {
          title: input.title,
          slug,
          excerpt,
          bodyMarkdown,
          bodyFormat,
          sanitizedBody,
          searchText: toPlainText(sanitizedBody),
          authorId: input.authorId,
          categoryId: input.categoryId,
          coverAlt: input.coverAlt ?? null,
          coverMediaId: input.coverMediaId ?? null,
          ogImageMediaId: input.ogImageMediaId ?? null,
          seoKeywords: input.seoKeywords ?? null,
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
          commentsEnabled: input.commentsEnabled ?? true,
          guestPost: input.guestPost ?? false,
          tags: { create: [...new Set(input.tagIds ?? [])].map((tagId) => ({ tagId })) },
        },
        include: postInclude,
      });
      // Images inside the body are uses too (MED 004); recorded with the body.
      await syncContentMedia(tx, 'post', created.id, created.sanitizedBody);
      return created;
    });
    await this.audit.record({ action: 'blog.post.create', actorAdminId: actor.id, targetType: 'post', targetId: row.id, metadata: { slug }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row);
  }

  async updatePost(id: string, input: UpdatePostDto, actor: AdminPrincipal, ctx: RequestContext): Promise<PostDto> {
    const db = await this.database.client();
    const current = await this.load(id);
    if (current.version !== input.expectedVersion) throw stale();
    if (current.status === 'archived') throw new ConflictException({ code: 'INVALID_STATE', message: 'Restore the article before editing it' });
    if (input.slug && input.slug !== current.slug) {
      if (!isValidSlug(input.slug)) throw validation('slug', 'Slug must be lowercase letters, numbers and single hyphens');
      // A published URL only changes through a reviewed redirect (SRS SEO 004, UX 003).
      if (current.firstPublishedAt) throw new ConflictException({ code: 'SLUG_LOCKED', message: 'The slug of a published article changes through the slug-change endpoint, which creates a redirect' });
      if (await db.post.findUnique({ where: { slug: input.slug } })) throw slugTaken();
    }
    if (input.authorId || input.categoryId || input.tagIds) {
      await this.assertReferences(input.authorId ?? current.authorId, input.categoryId ?? current.categoryId, input.tagIds ?? current.tags.map((t) => t.tagId));
    }
    if (input.coverMediaId) await this.media.assertUsableImage(input.coverMediaId);
    if (input.ogImageMediaId) await this.media.assertUsableImage(input.ogImageMediaId);
    const data: Prisma.PostUncheckedUpdateInput = { version: { increment: 1 } };
    if (input.title !== undefined) data.title = input.title;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.excerpt !== undefined) data.excerpt = input.excerpt;
    if (input.bodyMarkdown !== undefined) {
      data.bodyMarkdown = input.bodyMarkdown;
      data.bodyFormat = input.bodyFormat ?? current.bodyFormat;
      const rendered = renderSanitisedBody(input.bodyMarkdown, data.bodyFormat);
      data.sanitizedBody = rendered;
      data.searchText = toPlainText(rendered);
    }
    // An emptied summary is rewritten from the article's opening text, the same rule as on create.
    const excerptAfter = input.excerpt !== undefined ? input.excerpt : current.excerpt;
    if (!excerptAfter.trim()) {
      const derived = deriveExcerpt(toPlainText(typeof data.sanitizedBody === 'string' ? data.sanitizedBody : current.sanitizedBody));
      if (derived) data.excerpt = derived;
    }
    if (input.authorId !== undefined) data.authorId = input.authorId;
    if (input.categoryId !== undefined) data.categoryId = input.categoryId;
    if (input.coverAlt !== undefined) data.coverAlt = input.coverAlt;
    if (input.coverMediaId !== undefined) data.coverMediaId = input.coverMediaId ?? null;
    if (input.ogImageMediaId !== undefined) data.ogImageMediaId = input.ogImageMediaId ?? null;
    if (input.seoKeywords !== undefined) data.seoKeywords = input.seoKeywords ?? null;
    if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;
    if (input.commentsEnabled !== undefined) data.commentsEnabled = input.commentsEnabled;
    if (input.guestPost !== undefined) data.guestPost = input.guestPost;

    const row = await db.$transaction(async (tx) => {
      const aiEdit = await openAiHumanEdit(tx, id);
      const updated = await tx.post.updateMany({ where: { id, version: input.expectedVersion }, data });
      if (updated.count !== 1) throw stale();
      if (typeof data.sanitizedBody === 'string') await syncContentMedia(tx, 'post', id, data.sanitizedBody);
      if (input.tagIds !== undefined) {
        await tx.postTag.deleteMany({ where: { postId: id } });
        if (input.tagIds.length > 0) await tx.postTag.createMany({ data: [...new Set(input.tagIds)].map((tagId) => ({ postId: id, tagId })) });
      }
      // The version being replaced is kept (SRS BLOG 003): always once the article
      // has been published, and for a draft whenever its text or title changes,
      // so work can be compared and brought back before it ever goes live.
      const bodyChanged = input.bodyMarkdown !== undefined && (input.bodyMarkdown !== current.bodyMarkdown || (input.bodyFormat ?? current.bodyFormat) !== current.bodyFormat);
      const titleChanged = input.title !== undefined && input.title !== current.title;
      if (current.firstPublishedAt || bodyChanged || titleChanged) await this.recordRevision(tx, current, input.revisionReason ?? null, actor.id);
      if (bodyChanged || titleChanged || (input.slug !== undefined && input.slug !== current.slug)) await bumpInventoryEpoch(tx);
      // An explicit save supersedes this writer's autosaved copy.
      await tx.postAutosave.deleteMany({ where: { postId: id, adminId: actor.id } });
      if (aiEdit) await closeAiHumanEdit(tx, aiEdit, id, { actorAdminId: actor.id, requestId: ctx.requestId });
      if (current.firstPublishedAt) {
        await this.outbox.write(tx, { type: 'post.updated', resourceType: 'post', resourceId: id, resourceVersion: current.version + 1, correlationId: ctx.requestId, payload: { postId: id, slug: current.slug } });
      }
      // A live article's pages refresh as soon as the edit is saved.
      if (current.status === 'published') await this.cache.recordInvalidation(tx, { resourceType: 'post', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.posts, CACHE_TAGS.post(current.slug)] });
      return tx.post.findUniqueOrThrow({ where: { id }, include: postInclude });
    });
    if (current.status === 'published') await this.cache.bumpNamespace();
    await this.audit.record({ action: 'blog.post.update', actorAdminId: actor.id, targetType: 'post', targetId: id, reason: input.revisionReason ?? null, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row);
  }

  /**
   * Changes the public slug of an article and, once it has been published,
   * leaves a 301 from the old path in the same transaction (SRS SEO 004).
   */
  async changeSlug(id: string, input: ChangeSlugDto, actor: AdminPrincipal, ctx: RequestContext): Promise<PostDto> {
    const db = await this.database.client();
    const current = await this.load(id);
    if (current.version !== input.expectedVersion) throw stale();
    if (current.status === 'archived') throw new ConflictException({ code: 'INVALID_STATE', message: 'Restore the article before changing its slug' });
    const slug = input.slug.trim().toLowerCase();
    if (!isValidSlug(slug)) throw validation('slug', 'Slug must be lowercase letters, numbers and single hyphens');
    if (slug === current.slug) throw validation('slug', 'That is already the slug of this article');
    if (await db.post.findUnique({ where: { slug } })) throw slugTaken();
    const row = await db.$transaction(async (tx) => {
      const aiEdit = await openAiHumanEdit(tx, id);
      const updated = await tx.post.updateMany({ where: { id, version: input.expectedVersion }, data: { slug, version: { increment: 1 } } });
      if (updated.count !== 1) throw stale();
      if (aiEdit) await closeAiHumanEdit(tx, aiEdit, id, { actorAdminId: actor.id, requestId: ctx.requestId });
      await bumpInventoryEpoch(tx);
      // Only a published article has an indexed URL worth preserving.
      if (current.firstPublishedAt) {
        await this.redirects.recordSlugChange(tx, { sourcePath: `/blog/${current.slug}`, targetPath: `/blog/${slug}`, resourceType: 'post', resourceId: id, actorAdminId: actor.id, reason: input.reason ?? null });
        await this.cache.recordInvalidation(tx, {
          resourceType: 'post',
          resourceId: id,
          urgent: true,
          correlationId: ctx.requestId,
          tags: [CACHE_TAGS.posts, CACHE_TAGS.post(current.slug), CACHE_TAGS.post(slug), CACHE_TAGS.sitemap, CACHE_TAGS.redirects],
        });
        await this.outbox.write(tx, { type: 'post.updated', resourceType: 'post', resourceId: id, resourceVersion: current.version + 1, correlationId: ctx.requestId, payload: { postId: id, slug } });
      }
      return tx.post.findUniqueOrThrow({ where: { id }, include: postInclude });
    });
    await this.audit.record({ action: 'blog.post.slug.change', actorAdminId: actor.id, targetType: 'post', targetId: id, reason: input.reason ?? null, metadata: { from: current.slug, to: slug, redirect: current.firstPublishedAt ? 'created' : 'none' }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row);
  }

  /** Explicit state changes with the BLOG 002 gates; publication is transactional with its outbox event. */
  async transition(id: string, action: PostAction, input: PostStateDto | SchedulePostDto, actor: AdminPrincipal, ctx: RequestContext, now = new Date()): Promise<PostDto> {
    const db = await this.database.client();
    const current = await this.load(id);
    if (current.version !== input.expectedVersion) throw stale();
    const transition = POST_TRANSITIONS[action];
    if (!transition.from.includes(current.status)) {
      throw new ConflictException({ code: 'INVALID_STATE', message: `Cannot ${action} an article that is ${current.status}` });
    }
    let scheduledAt: Date | null = current.scheduledAt;
    if (action === 'publish' || action === 'schedule') {
      const blockers = postPublicationBlockers({
        title: current.title,
        slug: current.slug,
        excerpt: current.excerpt,
        sanitizedBody: current.sanitizedBody,
        authorActive: current.author.active,
        categoryActive: current.category.active,
      });
      if (action === 'schedule') {
        scheduledAt = new Date((input as SchedulePostDto).scheduledAt);
        blockers.push(...scheduleBlockers(scheduledAt, now));
      }
      if (blockers.length > 0) {
        throw new HttpException({ code: 'PUBLICATION_BLOCKED', message: 'The article does not meet the publication requirements', fields: { publication: blockers } }, HttpStatus.CONFLICT);
      }
    }
    // Any deliberate state change supersedes a refused scheduled publication.
    const data: Prisma.PostUncheckedUpdateInput = { status: transition.to, publishFailure: null, version: { increment: 1 } };
    if (action === 'publish') {
      data.publishedAt = now;
      data.scheduledAt = null;
      data.firstPublishedAt = current.firstPublishedAt ?? now;
      data.archivedAt = null;
    }
    if (action === 'schedule') data.scheduledAt = scheduledAt;
    if (action === 'unpublish') {
      data.publishedAt = null;
      data.scheduledAt = null;
    }
    if (action === 'archive') data.archivedAt = now;
    // An article that leaves the blog stops being featured, so it cannot come back featured by surprise.
    if (action === 'unpublish' || action === 'archive') data.featuredAt = null;
    if (action === 'restore') {
      data.archivedAt = null;
      data.publishedAt = null;
      data.scheduledAt = null;
    }

    const row = await db.$transaction(async (tx) => {
      // The AI eligibility policy the scheduled publisher also applies, checked
      // under the article's lock in the committing transaction (AI-054, AI-094).
      const ai = action === 'publish' || action === 'schedule'
        ? await aiPublicationDecision(tx, { postId: id, action, path: 'manual' })
        : await lockLinkedAiItem(tx, id).then((item) => (item ? { linked: true as const, item, eligible: true, reasons: [] } : { linked: false as const }));
      if (ai.linked && !ai.eligible) {
        throw new HttpException({ code: 'PUBLICATION_BLOCKED', message: 'The article does not meet the publication requirements', fields: { publication: ai.reasons } }, HttpStatus.CONFLICT);
      }
      const updated = await tx.post.updateMany({ where: { id, version: input.expectedVersion }, data });
      if (updated.count !== 1) throw stale();
      if (ai.linked) await syncAiItemWithPost(tx, ai.item, { postId: id, action, fromPostStatus: current.status, path: 'manual' }, { actorAdminId: actor.id, requestId: ctx.requestId });
      if (action === 'publish' || action === 'unpublish' || action === 'archive') {
        await this.outbox.write(tx, {
          type: action === 'publish' ? 'post.published' : 'post.removed',
          resourceType: 'post',
          resourceId: id,
          resourceVersion: current.version + 1,
          correlationId: ctx.requestId,
          payload: { postId: id, slug: current.slug, action },
        });
        await this.cache.recordInvalidation(tx, {
          resourceType: 'post',
          resourceId: id,
          urgent: action !== 'publish',
          correlationId: ctx.requestId,
          tags: [CACHE_TAGS.posts, CACHE_TAGS.post(current.slug), CACHE_TAGS.sitemap, CACHE_TAGS.taxonomy],
        });
      }
      return tx.post.findUniqueOrThrow({ where: { id }, include: postInclude });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: `blog.post.${action}`, actorAdminId: actor.id, targetType: 'post', targetId: id, reason: input.reason ?? null, metadata: { from: current.status, to: transition.to }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row);
  }

  /**
   * Features a published article on the home page and the blog index, or stops
   * featuring it (SRS 1.10 BLOG 005). At most MAX_FEATURED_POSTS are featured at
   * once; the featured rows are locked while that is checked, so two editors
   * cannot both take the last place. Asking for the state the article is
   * already in changes nothing.
   */
  async setFeatured(id: string, featured: boolean, input: PostStateDto, actor: AdminPrincipal, ctx: RequestContext, now = new Date()): Promise<PostDto> {
    const db = await this.database.client();
    const current = await this.load(id);
    if (current.version !== input.expectedVersion) throw stale();
    if (featured && current.status !== 'published') throw new ConflictException({ code: 'INVALID_STATE', message: 'Only a published article can be featured' });
    if (featured === (current.featuredAt !== null)) return this.toDto(current);

    const row = await db.$transaction(async (tx) => {
      if (featured) {
        const others = await tx.$queryRaw<{ id: string; title: string }[]>`SELECT id, title FROM posts WHERE featuredAt IS NOT NULL AND id <> ${id} ORDER BY featuredAt ASC FOR UPDATE`;
        if (others.length >= MAX_FEATURED_POSTS) {
          throw new ConflictException({
            code: 'FEATURED_LIMIT',
            message: `Up to ${MAX_FEATURED_POSTS} articles can be featured at once. Stop featuring one of these first: ${others.map((other) => `“${other.title}”`).join(', ')}.`,
          });
        }
      }
      const updated = await tx.post.updateMany({ where: { id, version: input.expectedVersion, ...(featured ? { status: 'published' as const } : {}) }, data: { featuredAt: featured ? now : null, version: { increment: 1 } } });
      if (updated.count !== 1) throw stale();
      await this.cache.recordInvalidation(tx, { resourceType: 'post', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.posts, CACHE_TAGS.post(current.slug)] });
      return tx.post.findUniqueOrThrow({ where: { id }, include: postInclude });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: featured ? 'blog.post.feature' : 'blog.post.unfeature', actorAdminId: actor.id, targetType: 'post', targetId: id, reason: input.reason ?? null, metadata: { featured }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row);
  }

  // ---- helpers --------------------------------------------------------------

  private async load(id: string): Promise<PostRow> {
    const db = await this.database.client();
    const row = await db.post.findUnique({ where: { id }, include: postInclude });
    if (!row) throw notFound();
    return row;
  }

  private async assertReferences(authorId: string, categoryId: string, tagIds: string[]): Promise<void> {
    const db = await this.database.client();
    const [author, category, tags] = await Promise.all([
      db.author.findUnique({ where: { id: authorId }, select: { active: true } }),
      db.blogCategory.findUnique({ where: { id: categoryId }, select: { active: true } }),
      tagIds.length > 0 ? db.blogTag.findMany({ where: { id: { in: tagIds } }, select: { id: true, active: true } }) : Promise.resolve([]),
    ]);
    if (!author?.active) throw validation('authorId', 'Choose an active author');
    if (!category?.active) throw validation('categoryId', 'Choose an active category');
    const found = new Set(tags.filter((t) => t.active).map((t) => t.id));
    if (tagIds.some((id) => !found.has(id))) throw validation('tagIds', 'One or more tags are unknown or inactive');
  }

  private async toAuthorDto(row: AuthorRow): Promise<AuthorDto> {
    return {
      id: row.id,
      displayName: row.displayName,
      slug: row.slug,
      role: row.role,
      shortBio: row.shortBio,
      bio: row.bio,
      pronouns: row.pronouns,
      location: row.location,
      publicEmail: row.publicEmail,
      websiteUrl: row.websiteUrl,
      expertise: Array.isArray(row.expertise) ? (row.expertise as unknown[]).filter((value): value is string => typeof value === 'string') : [],
      links: row.links.map((link) => ({ kind: link.kind, url: link.url, label: link.label })),
      image: await this.media.publicImageRef(row.imageMediaId),
      imageMediaId: row.imageMediaId,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      active: row.active,
      postCount: row._count.posts,
      publishedPostCount: row.posts.length,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toTermDto(row: BlogCategory | BlogTag, postCount: number, ogImage: BlogTermDto['ogImage'] = null): BlogTermDto {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      landingContent: row.landingContent,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoKeywords: row.seoKeywords,
      ogImageMediaId: row.ogImageMediaId,
      ogImage,
      active: row.active,
      postCount,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** The share image preview for the editor; null when unset or not processed. */
  private async termImage(mediaId: string | null): Promise<BlogTermDto['ogImage']> {
    const ref = await this.media.publicImageRefOfKind(mediaId, 'hero');
    return ref ? { id: ref.id, url: ref.url, alt: ref.alt } : null;
  }

  /**
   * A category's or tag's share image must exist and be processed, or the page
   * would advertise a broken image when shared (change log 1.15: tags have a
   * search appearance too).
   */
  private async assertTermSeo(_kind: TermKind, input: BlogTermInputDto): Promise<void> {
    if (input.ogImageMediaId && !(await this.media.publicImageRefOfKind(input.ogImageMediaId, 'hero'))) {
      throw validation('ogImageMediaId', 'Choose a processed image from the media library');
    }
  }

  private toSummary(row: PostRow): PostSummaryDto {
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      authorId: row.authorId,
      authorName: row.author.displayName,
      categoryId: row.categoryId,
      categoryName: row.category.name,
      tagIds: row.tags.map((t) => t.tagId).sort(),
      commentsEnabled: row.commentsEnabled,
      guestPost: row.guestPost,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      firstPublishedAt: row.firstPublishedAt?.toISOString() ?? null,
      featuredAt: row.featuredAt?.toISOString() ?? null,
      publishFailure: row.publishFailure,
      publicationBlockers: postPublicationBlockers({ title: row.title, slug: row.slug, excerpt: row.excerpt, sanitizedBody: row.sanitizedBody, authorActive: row.author.active, categoryActive: row.category.active }),
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async toDto(row: PostRow): Promise<PostDto> {
    return {
      ...this.toSummary(row),
      excerpt: row.excerpt,
      bodyMarkdown: row.bodyMarkdown,
      bodyFormat: row.bodyFormat,
      sanitizedBody: row.sanitizedBody,
      coverAlt: row.coverAlt,
      coverMediaId: row.coverMediaId,
      cover: await this.media.publicImageRef(row.coverMediaId),
      ogImageMediaId: row.ogImageMediaId,
      ogImage: await this.media.publicImageRef(row.ogImageMediaId),
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoKeywords: row.seoKeywords,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
