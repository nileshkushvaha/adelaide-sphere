import { randomBytes } from 'node:crypto';
import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type StaticPage } from '@adelaide-sphere/database';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { renderSanitisedBody, toPlainText } from '../blog/sanitise.js';
import { clearContentMedia, syncContentMedia } from '../media/content-media.js';
import { MediaService } from '../media/media.service.js';
import { CacheService } from '../cache/cache.service.js';
import { RedirectsService } from '../seo/redirects.service.js';
import { RedisService } from '../redis/redis.service.js';
import {
  CACHE_TAGS,
  pagePublicationBlockers,
  scheduleBlockers,
  pageSectionBusinessIds,
  pageSectionDocumentIds,
  pageSectionImageIds,
  pageSectionsHtml,
  sectionsFromLegacyBody,
  validatePageSections,
  type PageSection,
  type PageSectionFieldErrors,
} from '@adelaide-sphere/domain';
import {
  CUSTOM_PAGE_PURPOSE,
  SYSTEM_PAGES,
  defaultPageLayout,
  isProductRoute,
  isSystemPage,
  normalisePageSlug,
  pageSlugProblem,
  staticPageBlockers,
  systemPageDefinition,
  type StaticPageDefinition,
} from './static-pages.js';
import type {
  CreateStaticPageDto,
  PublicStaticPageDto,
  PublicStaticPageSummaryDto,
  SaveStaticPageAutosaveDto,
  StaticPageAutosaveDto,
  StaticPageAutosaveReceiptDto,
  StaticPageDto,
  StaticPagePreviewLinkDto,
  StaticPageRevisionDetailDto,
  StaticPageRevisionDto,
  StaticPageStateDto,
  UpdateStaticPageDto,
  ChangeStaticPageAddressDto,
  DuplicateStaticPageDto,
  ScheduleStaticPageDto,
  UnpublishStaticPageDto,
} from './dto/static-page.dto.js';

const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Page not found' });
const slugRejected = (message: string) =>
  new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { slug: [message] } }, HttpStatus.BAD_REQUEST);
const invalidFields = (fields: PageSectionFieldErrors) => new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields }, HttpStatus.BAD_REQUEST);

/** Revisions kept per page; older ones are removed as new ones are written. */
const REVISIONS_KEPT = 50;

/** A preview link lasts ten minutes, and only while the editor who made it stays signed in. */
const PREVIEW_LINK_TTL_SECONDS = 600;
const PREVIEW_LINK_PREFIX = 'preview:page:';
const PREVIEW_TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** What a preview token stands for; read back from Redis, so every field is checked before use. */
interface PreviewEntry {
  pageId?: unknown;
  sessionId?: unknown;
  adminId?: unknown;
}

const notSavedYet = () => new ConflictException({ code: 'PAGE_NOT_SAVED', message: 'Save the page once first.' });

interface PreparedContent {
  sections: PageSection[] | null;
  sanitizedBody: string;
  bodySource: string;
  bodyFormat: 'html' | 'markdown';
}

const stale = () => new ConflictException({ code: 'STALE_VERSION', message: 'This page was changed by someone else. Reload and try again.' });

/**
 * Editable information pages (SRS CFG 002, as amended in 1.7).
 *
 * System pages come from the registry and always appear, whether or not anyone
 * has written them yet; custom pages are rows an administrator created. Both
 * carry the same content rules — sanitised rich text, a revision of the
 * previous published text on every edit, and a publication gate that refuses
 * stub or placeholder copy — and differ only in what may be done to the record
 * itself: a system page cannot be created, renamed or deleted, because the
 * product links to it by address.
 */
@Injectable()
export class StaticPagesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly media: MediaService,
    private readonly redis: RedisService,
    private readonly redirects: RedirectsService,
  ) {}

  /**
   * The system pages first, in registry order and including ones never edited
   * yet, then the administrator's own pages, newest first.
   */
  async list(query: { q?: string; status?: 'draft' | 'published' | 'scheduled' } = {}): Promise<StaticPageDto[]> {
    const db = await this.database.client();
    const rows = await db.staticPage.findMany({ orderBy: { updatedAt: 'desc' } });
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    const pages = [
      ...(await Promise.all(SYSTEM_PAGES.map((definition) => this.toDto(definition.slug, bySlug.get(definition.slug), { references: false })))),
      ...(await Promise.all(rows.filter((row) => !isSystemPage(row.slug) && !isProductRoute(row.slug)).map((row) => this.toDto(row.slug, row, { references: false })))),
    ];
    // Filtered here, not in the query: a system page that has never been edited
    // has no row to match, and it is the one most likely to be searched for.
    const term = query.q?.trim().toLowerCase();
    return pages.filter(
      (page) =>
        (!query.status || page.status === query.status) &&
        (!term || page.title.toLowerCase().includes(term) || page.slug.toLowerCase().includes(term)),
    );
  }

  async get(slug: string): Promise<StaticPageDto> {
    const db = await this.database.client();
    const row = await db.staticPage.findUnique({ where: { slug } });
    // A system page exists as soon as the registry names it; a custom page
    // exists only once someone created it.
    if (isProductRoute(slug) || (!row && !isSystemPage(slug))) throw notFound();
    return this.toDto(slug, row ?? undefined);
  }

  /**
   * Creates a page at an address the administrator chose (CFG 002, SRS 1.7).
   *
   * The address is validated here rather than trusted: the pattern, the
   * reserved list and the uniqueness check together are what replaced the old
   * closed slug set. It is created as a draft, like every other page — nothing
   * reaches the public site without the publication gate.
   */
  async create(input: CreateStaticPageDto, actor: AdminPrincipal, ctx: RequestContext): Promise<StaticPageDto> {
    const slug = normalisePageSlug(input.slug);
    const problem = pageSlugProblem(slug);
    if (problem) throw slugRejected(problem);

    const db = await this.database.client();
    if (await db.staticPage.findUnique({ where: { slug }, select: { id: true } })) {
      throw slugRejected('A page already uses that address');
    }

    const content = await this.prepareContent(slug, input);
    const row = await db.$transaction(async (tx) => {
      const created = await tx.staticPage.create({
        data: {
          slug,
          title: input.title,
          bodySource: content.bodySource,
          bodyFormat: content.bodyFormat,
          sanitizedBody: content.sanitizedBody,
          sections: content.sections ? (content.sections as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          noindex: input.noindex ?? false,
          seoTitle: input.seoTitle ?? null,
          seoKeywords: input.seoKeywords ?? null,
          ogImageMediaId: input.ogImageMediaId ?? null,
          seoDescription: input.seoDescription ?? null,
          layout: input.layout ?? defaultPageLayout(slug),
          updatedByAdminId: actor.id,
        },
      });
      await syncContentMedia(tx, 'static_page', created.id, created.sanitizedBody, sectionMediaMarkup(content.sections));
      return created;
    });
    await this.audit.record({
      action: 'settings.page.create',
      actorAdminId: actor.id,
      targetType: 'static_page',
      targetId: row.id,
      metadata: { slug },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return this.toDto(slug, row);
  }

  /**
   * Deletes a page an administrator created (SRS 1.7).
   *
   * Two refusals, for two different reasons: a system page is referred to by
   * the product itself, and a published page is an address somebody may have
   * linked to — unpublishing first turns that into a deliberate 404 the
   * administrator chose, rather than one they discovered later.
   */
  async remove(slug: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    if (isSystemPage(slug)) {
      throw new ConflictException({ code: 'PAGE_IS_SYSTEM', message: 'This page is part of the product and cannot be deleted. Unpublish it instead.' });
    }
    const db = await this.database.client();
    const row = await db.staticPage.findUnique({ where: { slug } });
    if (!row) throw notFound();
    if (row.status === 'published') {
      throw new ConflictException({ code: 'PAGE_PUBLISHED', message: 'Unpublish this page first, so its address stops being served before the content goes.' });
    }

    await db.$transaction(async (tx) => {
      // Revisions are the record of what was published; they go with the page
      // they describe rather than being left pointing at nothing.
      await tx.contentRevision.deleteMany({ where: { resourceType: 'static_page', resourceId: row.id } });
      await clearContentMedia(tx, 'static_page', row.id);
      await tx.staticPage.delete({ where: { slug } });
    });
    await this.audit.record({
      action: 'settings.page.delete',
      actorAdminId: actor.id,
      targetType: 'static_page',
      targetId: row.id,
      metadata: { slug, title: row.title },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
  }

  /** Published page for the public site; drafts are invisible (404). */
  async publicPage(slug: string): Promise<PublicStaticPageDto> {
    const db = await this.database.client();
    if (isProductRoute(slug)) throw notFound();
    const row = await db.staticPage.findFirst({ where: { slug, status: 'published' }, include: { ogImage: { select: { credit: true } } } });
    if (!row) throw notFound();
    return this.renderPublic(row, { title: row.title, sections: storedSections(row), body: row.sanitizedBody, updatedAt: row.updatedAt });
  }

  /**
   * The public render model, shared by the published page and its private
   * preview. Only what a visitor sees: hidden sections are left out, and the
   * images, documents and businesses they refer to are resolved here, so a
   * picture still processing or a listing since unpublished simply does not
   * appear.
   */
  private async renderPublic(
    row: StaticPage & { ogImage: { credit: string | null } | null },
    content: { title: string; sections: PageSection[] | null; body: string; updatedAt: Date },
  ): Promise<PublicStaticPageDto> {
    const sections = content.sections?.filter((section) => !section.hidden) ?? [];
    const [images, documents, businesses] = await Promise.all([this.publicImages(pageSectionImageIds(sections)), this.media.publicDocumentRefs(pageSectionDocumentIds(sections)), this.publicBusinesses(pageSectionBusinessIds(sections))]);
    return {
      sections: sections as unknown as Record<string, unknown>[],
      images,
      documents,
      businesses,
      noindex: row.noindex,
      slug: row.slug,
      title: content.title,
      body: content.body,
      seoTitle: row.seoTitle,
      seoKeywords: row.seoKeywords,
      ogImageMediaId: row.ogImageMediaId,
      ogImage: await this.media.publicImageRefOfKind(row.ogImageMediaId, 'hero'),
      // Stored on the asset, so a picture credited once is credited everywhere
      // it is used — the licences that ask for attribution ask for it wherever
      // the photograph appears, not once in the media library.
      ogImageCredit: row.ogImage?.credit ?? null,
      seoDescription: row.seoDescription,
      layout: row.layout,
      updatedAt: content.updatedAt.toISOString(),
    };
  }

  /**
   * A private link to see the page in the public site's design before it is
   * published or while it is being changed (change log 1.17). It shows the
   * editor's own unsaved changes when there are some, and the saved page
   * otherwise. The token is random, lives in Redis for ten minutes and is bound
   * to the editor's session, as article previews are (SRS BLOG 003).
   */
  async createPreviewLink(slug: string, sessionId: string, actor: AdminPrincipal): Promise<StaticPagePreviewLinkDto> {
    const row = await this.savedRow(slug);
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + PREVIEW_LINK_TTL_SECONDS * 1000);
    try {
      await this.redis.ensureConnected();
      await this.redis.client.set(`${PREVIEW_LINK_PREFIX}${token}`, JSON.stringify({ pageId: row.id, sessionId, adminId: actor.id }), 'EX', PREVIEW_LINK_TTL_SECONDS);
    } catch {
      throw new ServiceUnavailableException({ code: 'PREVIEW_UNAVAILABLE', message: 'Preview links are unavailable right now. Try again in a moment.' });
    }
    return { path: `/preview/page/${token}`, expiresAt: expiresAt.toISOString() };
  }

  /** The page behind a preview link. Every failure is the same 404, so a guessed or expired token learns nothing. */
  async previewByToken(token: string): Promise<PublicStaticPageDto> {
    const missing = () => new NotFoundException({ code: 'NOT_FOUND', message: 'This preview link has expired or does not exist' });
    if (!PREVIEW_TOKEN.test(token)) throw missing();
    const key = `${PREVIEW_LINK_PREFIX}${token}`;
    let stored: PreviewEntry | null;
    try {
      await this.redis.ensureConnected();
      const raw = await this.redis.client.get(key);
      stored = raw ? (JSON.parse(raw) as PreviewEntry) : null;
    } catch {
      throw missing();
    }
    if (!stored || typeof stored.pageId !== 'string' || typeof stored.sessionId !== 'string' || typeof stored.adminId !== 'string') throw missing();
    const db = await this.database.client();
    const session = await db.adminSession.findFirst({ where: { id: stored.sessionId, adminId: stored.adminId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
    if (!session) {
      await this.redis.client.del(key).catch(() => undefined);
      throw missing();
    }
    const row = await db.staticPage.findUnique({ where: { id: stored.pageId }, include: { ogImage: { select: { credit: true } } } });
    if (!row) throw missing();
    const draft = await db.pageAutosave.findUnique({ where: { pageId_adminId: { pageId: row.id, adminId: stored.adminId } } });
    if (!draft) return this.renderPublic(row, { title: row.title, sections: storedSections(row), body: row.sanitizedBody, updatedAt: row.updatedAt });
    const sections = draftSections(draft.sections, row.slug);
    return this.renderPublic(row, { title: draft.title || row.title, sections, body: renderSanitisedBody(pageSectionsHtml(sections), 'html'), updatedAt: draft.savedAt });
  }

  /** Earlier versions of a page, newest first. A system page never saved has none. */
  async revisions(slug: string): Promise<StaticPageRevisionDto[]> {
    const row = await this.rowOrNothing(slug);
    if (!row) return [];
    const db = await this.database.client();
    const rows = await db.contentRevision.findMany({ where: { resourceType: 'static_page', resourceId: row.id }, orderBy: { version: 'desc' }, take: REVISIONS_KEPT, include: { actor: { select: { displayName: true } } } });
    return rows.map((revision) => ({ id: revision.id, version: revision.version, title: revision.title, reason: revision.reason, actorName: revision.actor?.displayName ?? null, createdAt: revision.createdAt.toISOString() }));
  }

  async revisionDetail(slug: string, revisionId: string): Promise<StaticPageRevisionDetailDto> {
    const row = await this.savedRow(slug);
    const db = await this.database.client();
    const revision = await db.contentRevision.findFirst({ where: { id: revisionId, resourceType: 'static_page', resourceId: row.id }, include: { actor: { select: { displayName: true } } } });
    if (!revision) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That version no longer exists' });
    return {
      id: revision.id,
      version: revision.version,
      title: revision.title,
      reason: revision.reason,
      actorName: revision.actor?.displayName ?? null,
      createdAt: revision.createdAt.toISOString(),
      sections: revisionSections(revision) as unknown as Record<string, unknown>[],
      bodyHtml: revision.sanitizedSnapshot,
    };
  }

  /**
   * Brings back an earlier version's title and sections. It goes through the
   * ordinary save, so it is validated and sanitised again, keeps the current
   * content as a version (a restore can itself be undone), refreshes a live
   * page and is audited; the page's search settings stay as they are now.
   */
  async restoreRevision(slug: string, revisionId: string, expectedVersion: number, actor: AdminPrincipal, ctx: RequestContext): Promise<StaticPageDto> {
    const row = await this.savedRow(slug);
    if (row.version !== expectedVersion) throw stale();
    const db = await this.database.client();
    const revision = await db.contentRevision.findFirst({ where: { id: revisionId, resourceType: 'static_page', resourceId: row.id } });
    if (!revision) throw new NotFoundException({ code: 'NOT_FOUND', message: 'That version no longer exists' });
    const restored = await this.update(
      slug,
      {
        expectedVersion,
        title: revision.title ?? row.title,
        sections: revisionSections(revision) as unknown as Record<string, unknown>[],
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        seoKeywords: row.seoKeywords,
        ogImageMediaId: row.ogImageMediaId,
        layout: row.layout,
        noindex: row.noindex,
        revisionReason: `Before restoring version ${revision.version}`,
      },
      actor,
      ctx,
    );
    await this.audit.record({ action: 'settings.page.revision.restore', actorAdminId: actor.id, targetType: 'static_page', targetId: row.id, metadata: { slug, revisionVersion: revision.version }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return restored;
  }

  /** The editor's own copy of unsaved changes, if one was kept. Private to that administrator. */
  async getAutosave(slug: string, actor: AdminPrincipal): Promise<StaticPageAutosaveDto | null> {
    const row = await this.rowOrNothing(slug);
    if (!row) return null;
    const db = await this.database.client();
    const draft = await db.pageAutosave.findUnique({ where: { pageId_adminId: { pageId: row.id, adminId: actor.id } } });
    if (!draft) return null;
    return {
      title: draft.title,
      sections: draftSections(draft.sections, row.slug) as unknown as Record<string, unknown>[],
      baseVersion: draft.baseVersion,
      savedAt: draft.savedAt.toISOString(),
      stale: draft.baseVersion < row.version,
    };
  }

  /**
   * Keeps what an editor is typing. It never touches the page, its version or
   * its history, and is not an audited change; saving the page removes it. An
   * unfinished draft is kept as it is, but its rich text is sanitised on the
   * way in, because the preview shows it.
   */
  async saveAutosave(slug: string, input: SaveStaticPageAutosaveDto, actor: AdminPrincipal): Promise<StaticPageAutosaveReceiptDto> {
    const row = await this.savedRow(slug);
    const db = await this.database.client();
    const data = { title: input.title.trim().slice(0, 180), sections: draftSections(input.sections, row.slug) as unknown as Prisma.InputJsonValue, baseVersion: input.baseVersion };
    const saved = await db.pageAutosave.upsert({ where: { pageId_adminId: { pageId: row.id, adminId: actor.id } }, create: { pageId: row.id, adminId: actor.id, ...data }, update: data });
    return { savedAt: saved.savedAt.toISOString() };
  }

  async discardAutosave(slug: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const row = await this.rowOrNothing(slug);
    if (!row) return;
    const db = await this.database.client();
    const { count } = await db.pageAutosave.deleteMany({ where: { pageId: row.id, adminId: actor.id } });
    if (count > 0) await this.audit.record({ action: 'settings.page.autosave.discard', actorAdminId: actor.id, targetType: 'static_page', targetId: row.id, metadata: { slug }, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  /** The stored page; a system page that was never saved has no row yet. */
  private async rowOrNothing(slug: string): Promise<StaticPage | null> {
    if (isProductRoute(slug)) throw notFound();
    const db = await this.database.client();
    const row = await db.staticPage.findUnique({ where: { slug } });
    if (!row && !isSystemPage(slug)) throw notFound();
    return row;
  }

  private async savedRow(slug: string): Promise<StaticPage> {
    const row = await this.rowOrNothing(slug);
    if (!row) throw notSavedYet();
    return row;
  }

  /**
   * Publishes the page at a chosen time (change log 1.17). The same checks as
   * publishing now run here and again when the time comes; the worker's
   * `content.publish-scheduled` task publishes it, or returns it to draft with
   * the reason if it no longer qualifies.
   */
  async schedule(slug: string, input: ScheduleStaticPageDto, actor: AdminPrincipal, ctx: RequestContext, now = new Date()): Promise<StaticPageDto> {
    const row = await this.savedRow(slug);
    if (row.version !== input.expectedVersion) throw stale();
    if (row.status === 'published') throw new ConflictException({ code: 'INVALID_STATE', message: 'This page is already published.' });
    const scheduledAt = new Date(input.scheduledAt);
    const blockers = [...scheduleBlockers(scheduledAt, now), ...this.blockersFor(row)];
    if (blockers.length > 0) {
      throw new HttpException({ code: 'PUBLICATION_BLOCKED', message: 'This page cannot be scheduled yet', fields: { publication: blockers } }, HttpStatus.CONFLICT);
    }
    const db = await this.database.client();
    const updated = await db.staticPage.updateMany({
      where: { id: row.id, version: input.expectedVersion },
      data: { status: 'scheduled', scheduledAt, publishFailure: null, updatedByAdminId: actor.id, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw stale();
    await this.audit.record({ action: 'settings.page.schedule', actorAdminId: actor.id, targetType: 'static_page', targetId: row.id, reason: input.reason ?? null, metadata: { slug, scheduledAt: scheduledAt.toISOString() }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(slug, await db.staticPage.findUniqueOrThrow({ where: { id: row.id } }));
  }

  /** Cancels a schedule; the page goes back to draft, unchanged. */
  async unschedule(slug: string, input: StaticPageStateDto, actor: AdminPrincipal, ctx: RequestContext): Promise<StaticPageDto> {
    const row = await this.savedRow(slug);
    if (row.version !== input.expectedVersion) throw stale();
    if (row.status !== 'scheduled') throw new ConflictException({ code: 'INVALID_STATE', message: 'This page is not scheduled.' });
    const db = await this.database.client();
    const updated = await db.staticPage.updateMany({ where: { id: row.id, version: input.expectedVersion }, data: { status: 'draft', scheduledAt: null, updatedByAdminId: actor.id, version: { increment: 1 } } });
    if (updated.count !== 1) throw stale();
    await this.audit.record({ action: 'settings.page.unschedule', actorAdminId: actor.id, targetType: 'static_page', targetId: row.id, reason: input.reason ?? null, metadata: { slug }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(slug, await db.staticPage.findUniqueOrThrow({ where: { id: row.id } }));
  }

  /**
   * Moves a page to a new address (change log 1.17, SEO 004). A published page
   * leaves a permanent redirect from the old address in the same transaction,
   * so saved links and search results keep working; menus link pages by id and
   * follow on their own. System pages stay where the product links to them.
   */
  async changeAddress(slug: string, input: ChangeStaticPageAddressDto, actor: AdminPrincipal, ctx: RequestContext): Promise<StaticPageDto> {
    if (isSystemPage(slug)) throw new ConflictException({ code: 'PAGE_IS_SYSTEM', message: 'The site links to this page by its address, so it cannot move.' });
    const row = await this.savedRow(slug);
    if (row.version !== input.expectedVersion) throw stale();
    const next = normalisePageSlug(input.slug);
    const problem = pageSlugProblem(next);
    if (problem) throw slugRejected(problem);
    if (next === row.slug) throw slugRejected('That is already this page’s address');
    const db = await this.database.client();
    if (await db.staticPage.findUnique({ where: { slug: next }, select: { id: true } })) throw slugRejected('A page already uses that address');
    // A rule already sending that address elsewhere would hide the page from the
    // moment it moved; that decision belongs to whoever made the rule.
    const rule = await db.redirect.findUnique({ where: { sourcePath: `/${next}` }, select: { isActive: true } });
    if (rule?.isActive) throw slugRejected('A redirect already sends that address somewhere else. Remove it in Redirects first.');

    const live = row.status === 'published';
    const moved = await db.$transaction(async (tx) => {
      const updated = await tx.staticPage.updateMany({ where: { id: row.id, version: input.expectedVersion }, data: { slug: next, updatedByAdminId: actor.id, version: { increment: 1 } } });
      if (updated.count !== 1) throw stale();
      if (live) {
        await this.redirects.recordSlugChange(tx, { sourcePath: `/${row.slug}`, targetPath: `/${next}`, resourceType: 'static_page', resourceId: row.id, actorAdminId: actor.id, reason: input.reason ?? null });
        await this.cache.recordInvalidation(tx, {
          resourceType: 'static_page',
          resourceId: row.id,
          urgent: true,
          correlationId: ctx.requestId,
          tags: [CACHE_TAGS.pages, CACHE_TAGS.page(row.slug), CACHE_TAGS.page(next), CACHE_TAGS.sitemap, CACHE_TAGS.redirects, CACHE_TAGS.menus],
        });
      }
      return tx.staticPage.findUniqueOrThrow({ where: { id: row.id } });
    });
    if (live) await this.cache.bumpNamespace();
    await this.audit.record({ action: 'settings.page.address.change', actorAdminId: actor.id, targetType: 'static_page', targetId: row.id, reason: input.reason ?? null, metadata: { from: row.slug, to: next, redirect: live ? 'created' : 'none' }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(next, moved);
  }

  /** A new draft with this page's sections, layout and search settings, at its own address. */
  async duplicate(slug: string, input: DuplicateStaticPageDto, actor: AdminPrincipal, ctx: RequestContext): Promise<StaticPageDto> {
    const row = await this.savedRow(slug);
    const copy = await this.create(
      {
        slug: input.slug,
        title: input.title,
        sections: (storedSections(row) ?? sectionsFromLegacyBody(row.sanitizedBody)) as unknown as Record<string, unknown>[],
        // The search title names the original; the copy starts from its own title.
        seoTitle: null,
        seoDescription: row.seoDescription,
        seoKeywords: row.seoKeywords,
        ogImageMediaId: row.ogImageMediaId,
        layout: row.layout,
        noindex: row.noindex,
      },
      actor,
      ctx,
    );
    await this.audit.record({ action: 'settings.page.duplicate', actorAdminId: actor.id, targetType: 'static_page', targetId: row.id, metadata: { from: row.slug, to: copy.slug }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return copy;
  }

  /** Published pages only, for the footer; nothing that would link to a 404. */
  async publicList(): Promise<PublicStaticPageSummaryDto[]> {
    const db = await this.database.client();
    const rows = (await db.staticPage.findMany({ where: { status: 'published' }, select: { slug: true, title: true }, orderBy: { title: 'asc' } })).filter((row) => !isProductRoute(row.slug));
    // System pages in registry order first, then the administrator's own pages
    // alphabetically, so the footer has a stable shape as pages are added.
    const order = SYSTEM_PAGES.map((page) => page.slug);
    return [...rows.filter((row) => order.includes(row.slug)).sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug)), ...rows.filter((row) => !order.includes(row.slug))];
  }

  async update(slug: string, input: UpdateStaticPageDto, actor: AdminPrincipal, ctx: RequestContext): Promise<StaticPageDto> {
    const db = await this.database.client();
    const current = await db.staticPage.findUnique({ where: { slug } });
    // Writing a system page for the first time creates it; writing an address
    // nobody created is a 404 rather than a second way to create a page.
    if (isProductRoute(slug) || (!current && !isSystemPage(slug))) throw notFound();
    if ((current?.version ?? 0) !== input.expectedVersion) throw stale();

    const content = await this.prepareContent(slug, { ...input, bodyFormat: input.bodyFormat ?? current?.bodyFormat ?? 'html' });
    const sanitizedBody = content.sanitizedBody;
    const data = {
      title: input.title,
      bodySource: content.bodySource,
      bodyFormat: content.bodyFormat,
      sanitizedBody,
      sections: content.sections ? (content.sections as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      noindex: input.noindex ?? current?.noindex ?? false,
      seoTitle: input.seoTitle ?? null,
      seoKeywords: input.seoKeywords ?? null,
      ogImageMediaId: input.ogImageMediaId ?? null,
      seoDescription: input.seoDescription ?? null,
      // Left as it is when the editor's form did not send one, so a client that
      // does not know about layouts cannot silently reset somebody's choice.
      layout: input.layout ?? current?.layout ?? defaultPageLayout(slug),
      updatedByAdminId: actor.id,
    };

    const row = await db.$transaction(async (tx) => {
      if (!current) {
        const created = await tx.staticPage.create({ data: { slug, ...data } });
        await syncContentMedia(tx, 'static_page', created.id, sanitizedBody, sectionMediaMarkup(content.sections));
        return created;
      }
      const updated = await tx.staticPage.updateMany({ where: { slug, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (updated.count !== 1) throw stale();
      await syncContentMedia(tx, 'static_page', current.id, sanitizedBody, sectionMediaMarkup(content.sections));
      // Every save keeps the version it replaces, draft or published, so any
      // earlier state can be compared and restored (change log 1.17).
      await tx.contentRevision.upsert({
        where: { resourceType_resourceId_version: { resourceType: 'static_page', resourceId: current.id, version: current.version } },
        create: {
          resourceType: 'static_page',
          resourceId: current.id,
          version: current.version,
          sanitizedSnapshot: current.sanitizedBody,
          bodySource: current.bodySource,
          bodyFormat: current.bodyFormat,
          sectionsSnapshot: current.sections ?? Prisma.DbNull,
          title: current.title,
          reason: input.revisionReason ?? null,
          actorAdminId: actor.id,
        },
        update: {},
      });
      const older = await tx.contentRevision.findMany({ where: { resourceType: 'static_page', resourceId: current.id }, orderBy: { version: 'desc' }, skip: REVISIONS_KEPT, select: { id: true } });
      if (older.length > 0) await tx.contentRevision.deleteMany({ where: { id: { in: older.map((revision) => revision.id) } } });
      // Saved, so the editor's kept copy of unsaved changes has nothing left to offer.
      await tx.pageAutosave.deleteMany({ where: { pageId: current.id, adminId: actor.id } });
      if (current.status === 'published') {
        await this.cache.recordInvalidation(tx, { resourceType: 'static_page', resourceId: current.id, correlationId: ctx.requestId, tags: [CACHE_TAGS.pages, CACHE_TAGS.page(slug)] });
      }
      return tx.staticPage.findUniqueOrThrow({ where: { slug } });
    });
    await this.cache.bumpNamespace();

    await this.audit.record({ action: 'settings.page.update', actorAdminId: actor.id, targetType: 'static_page', targetId: row.id, reason: input.revisionReason ?? null, metadata: { slug }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(slug, row);
  }

  async setStatus(slug: string, status: 'published' | 'draft', input: StaticPageStateDto | UnpublishStaticPageDto, actor: AdminPrincipal, ctx: RequestContext): Promise<StaticPageDto> {
    const db = await this.database.client();
    const current = isProductRoute(slug) ? null : await db.staticPage.findUnique({ where: { slug } });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    if (status === 'published') {
      const blockers = this.blockersFor(current);
      if (blockers.length > 0) {
        throw new HttpException({ code: 'PUBLICATION_BLOCKED', message: 'This page is not ready to publish', fields: { publication: blockers } }, HttpStatus.CONFLICT);
      }
    }
    await db.$transaction(async (tx) => {
      const updated = await tx.staticPage.updateMany({
        where: { slug, version: input.expectedVersion },
        // Any deliberate publish or unpublish supersedes a schedule and a refused scheduled publication.
        data: { status, publishedAt: status === 'published' ? new Date() : null, scheduledAt: null, publishFailure: null, updatedByAdminId: actor.id, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw stale();
      await this.cache.recordInvalidation(tx, {
        resourceType: 'static_page',
        resourceId: current.id,
        urgent: status !== 'published',
        correlationId: ctx.requestId,
        tags: [CACHE_TAGS.pages, CACHE_TAGS.page(slug)],
      });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: status === 'published' ? 'settings.page.publish' : 'settings.page.unpublish', actorAdminId: actor.id, targetType: 'static_page', targetId: current.id, reason: input.reason ?? null, metadata: { slug }, requestId: ctx.requestId, ipAddress: ctx.ip });
    const row = await db.staticPage.findUniqueOrThrow({ where: { slug } });
    return this.toDto(slug, row);
  }

  private blockersFor(row: StaticPage): string[] {
    return pagePublicationBlockers({ title: row.title, plainBody: toPlainText(row.sanitizedBody), sections: storedSections(row) });
  }

  /**
   * Turns what the editor sent into what is stored (change log 1.17). With
   * sections: validated against the catalogue, every rich text sanitised with
   * the article allowlist, every image, document and business checked to exist
   * and be usable, and the page's words written to `sanitizedBody` so search,
   * the publication gate and an older build of the site keep working. Without
   * sections: the single body, exactly as before.
   */
  private async prepareContent(slug: string, input: { body?: string; sections?: unknown; bodyFormat?: 'html' | 'markdown' }): Promise<PreparedContent> {
    if (input.sections === undefined) {
      if (input.body === undefined) throw invalidFields({ sections: ['Add some content to the page'] });
      const bodyFormat = input.bodyFormat ?? 'html';
      return { sections: null, sanitizedBody: renderSanitisedBody(input.body, bodyFormat), bodySource: input.body, bodyFormat };
    }
    const { sections, fields } = validatePageSections(input.sections, { system: isSystemPage(slug) });
    if (Object.keys(fields).length > 0) throw invalidFields(fields);

    sanitiseSectionHtml(sections);

    const problems: PageSectionFieldErrors = {};
    const db = await this.database.client();
    const publishedBusinesses = new Set((await db.business.findMany({ where: { id: { in: pageSectionBusinessIds(sections) }, status: 'published' }, select: { id: true } })).map((row) => row.id));
    for (const [index, section] of sections.entries()) {
      const at = (field: string) => `sections[${index}].${field}`;
      if ((section.type === 'header' || section.type === 'imageText') && section.imageId) {
        await this.media.assertUsableImage(section.imageId).catch((error: unknown) => {
          problems[at('imageId')] = [fieldMessage(error, 'Choose a processed image with alt text')];
        });
      }
      const buttons: [string, { documentId: string | null } | null][] =
        section.type === 'callout' ? [['primary', section.primary], ['secondary', section.secondary]] : section.type === 'header' || section.type === 'imageText' ? [['button', section.button]] : [];
      for (const [name, button] of buttons) {
        if (!button?.documentId) continue;
        await this.media.assertUsableDocument(button.documentId, at(`${name}.documentId`)).catch((error: unknown) => {
          problems[at(`${name}.documentId`)] = [fieldMessage(error, 'Choose a document that has finished uploading')];
        });
      }
      if (section.type === 'businesses' && section.businessIds.some((id) => !publishedBusinesses.has(id))) {
        problems[at('businessIds')] = ['Only published businesses can be shown; remove the ones that are not'];
      }
    }
    if (Object.keys(problems).length > 0) throw invalidFields(problems);

    const sanitizedBody = renderSanitisedBody(pageSectionsHtml(sections), 'html');
    return { sections, sanitizedBody, bodySource: sanitizedBody, bodyFormat: 'html' };
  }

  /**
   * Ready pictures for the public page, with the credit stored on each: several
   * licences require the photographer to be named wherever the picture appears.
   */
  private async publicImages(ids: string[]): Promise<Record<string, { url: string; alt: string; width: number; height: number; credit: string | null }>> {
    if (ids.length === 0) return {};
    const db = await this.database.client();
    const [refs, credits] = await Promise.all([
      Promise.all(ids.map(async (id) => [id, await this.media.publicImageRefOfKind(id, 'hero')] as const)),
      db.mediaAsset.findMany({ where: { id: { in: ids } }, select: { id: true, credit: true } }),
    ]);
    const creditOf = new Map(credits.map((asset) => [asset.id, asset.credit?.trim() || null]));
    return Object.fromEntries(
      refs
        .filter((entry): entry is readonly [string, NonNullable<(typeof entry)[1]>] => entry[1] !== null)
        .map(([id, ref]) => [id, { url: ref.url, alt: ref.alt, width: ref.width, height: ref.height, credit: creditOf.get(id) ?? null }]),
    );
  }

  private async publicBusinesses(ids: string[]): Promise<Record<string, { id: string; slug: string; name: string; categoryName: string | null; areaName: string | null }>> {
    if (ids.length === 0) return {};
    const db = await this.database.client();
    const rows = await db.business.findMany({ where: { id: { in: ids }, status: 'published' }, select: { id: true, slug: true, name: true, primaryCategory: { select: { name: true } }, localArea: { select: { name: true } } } });
    return Object.fromEntries(rows.map((row) => [row.id, { id: row.id, slug: row.slug, name: row.name, categoryName: row.primaryCategory?.name ?? null, areaName: row.localArea?.name ?? null }]));
  }

  /** Names and previews for what the sections point at: the editor shows them, the public page never receives this. */
  private async referencesFor(sections: readonly PageSection[]): Promise<StaticPageDto['references']> {
    const imageIds = pageSectionImageIds(sections);
    const businessIds = pageSectionBusinessIds(sections);
    const db = await this.database.client();
    const [images, documents, businesses] = await Promise.all([
      Promise.all(imageIds.map(async (id) => [id, await this.media.publicImageRefOfKind(id, 'thumbnail')] as const)),
      this.media.publicDocumentRefs(pageSectionDocumentIds(sections)),
      businessIds.length ? db.business.findMany({ where: { id: { in: businessIds } }, select: { id: true, name: true, slug: true, status: true } }) : Promise.resolve([]),
    ]);
    return {
      images: Object.fromEntries(images.flatMap(([id, ref]) => (ref ? [[id, { url: ref.url, alt: ref.alt }]] : []))),
      documents: Object.fromEntries(Object.entries(documents).map(([id, document]) => [id, { title: document.title, url: document.url }])),
      businesses: Object.fromEntries(businesses.map((business) => [business.id, { name: business.name, slug: business.slug, status: business.status }])),
    };
  }

  private async toDto(slug: string, row?: StaticPage, options: { references?: boolean } = {}): Promise<StaticPageDto> {
    const definition: StaticPageDefinition = systemPageDefinition(slug) ?? { slug, defaultTitle: slug, purpose: CUSTOM_PAGE_PURPOSE, template: 'generic' };
    const system = isSystemPage(slug);
    if (!row) {
      return {
        slug,
        title: definition.defaultTitle,
        sanitizedBody: '',
        bodySource: '',
        bodyFormat: 'html',
        seoTitle: null,
        seoKeywords: null,
        ogImageMediaId: null,
        ogImage: null,
        seoDescription: null,
        sections: [],
        hasSections: false,
        references: { images: {}, documents: {}, businesses: {} },
        noindex: false,
        scheduledAt: null,
        publishFailure: null,
        status: 'draft',
        layout: defaultPageLayout(slug),
        publishedAt: null,
        publicationBlockers: staticPageBlockers({ title: definition.defaultTitle, plainBody: '' }),
        purpose: definition.purpose,
        template: definition.template,
        isSystem: system,
        canDelete: false,
        version: 0,
        updatedAt: new Date(0).toISOString(),
        updatedByAdminId: null,
      };
    }
    const sections = storedSections(row) ?? sectionsFromLegacyBody(row.sanitizedBody);
    return {
      slug: row.slug,
      title: row.title,
      sanitizedBody: row.sanitizedBody,
      bodySource: row.bodySource,
      bodyFormat: row.bodyFormat,
      seoTitle: row.seoTitle,
      seoKeywords: row.seoKeywords,
      ogImageMediaId: row.ogImageMediaId,
      ogImage: await this.media.publicImageRefOfKind(row.ogImageMediaId, 'hero'),
      seoDescription: row.seoDescription,
      sections: sections as unknown as Record<string, unknown>[],
      hasSections: Array.isArray(row.sections),
      references: options.references === false ? { images: {}, documents: {}, businesses: {} } : await this.referencesFor(sections),
      noindex: row.noindex,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      publishFailure: row.publishFailure,
      status: row.status,
      layout: row.layout,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      publicationBlockers: this.blockersFor(row),
      purpose: definition.purpose,
      template: definition.template,
      isSystem: system,
      // Deletable once it is nobody's live address any more (SRS 1.7).
      canDelete: !system && row.status !== 'published',
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
      updatedByAdminId: row.updatedByAdminId,
    };
  }
}

/** The stored sections, re-read through the validator so a hand-edited row cannot reach the page unchecked; null for a body-only page. */
function storedSections(row: Pick<StaticPage, 'sections'>): PageSection[] | null {
  return Array.isArray(row.sections) ? validatePageSections(row.sections).sections : null;
}

/** Marks the library images and documents the sections use, for media use tracking (MED 004). */
function sectionMediaMarkup(sections: PageSection[] | null): string {
  if (!sections) return '';
  return [...pageSectionImageIds(sections), ...pageSectionDocumentIds(sections)].map((id) => `<i data-media-id="${id}"></i>`).join('');
}

/** The first field message of a validation error thrown by another module, or a fallback. */
function fieldMessage(error: unknown, fallback: string): string {
  const response = error instanceof HttpException ? (error.getResponse() as { fields?: Record<string, string[]>; message?: string }) : null;
  const first = response?.fields ? Object.values(response.fields)[0]?.[0] : undefined;
  return first ?? response?.message ?? fallback;
}

/** Runs every rich text in the sections through the article allowlist (SRS SEC 001), in place. */
function sanitiseSectionHtml(sections: PageSection[]): PageSection[] {
  for (const section of sections) {
    if (section.type === 'text' || section.type === 'imageText') section.html = renderSanitisedBody(section.html, 'html');
    if (section.type === 'faq') for (const item of section.items) item.answerHtml = renderSanitisedBody(item.answerHtml, 'html');
  }
  return sections;
}

/** An unsaved copy: normalised to the catalogue and sanitised, but not held to publication rules. */
function draftSections(raw: unknown, slug: string): PageSection[] {
  return sanitiseSectionHtml(validatePageSections(raw, { system: isSystemPage(slug) }).sections);
}

/** A version's sections; one saved before sections existed reads as one text section of its HTML. */
function revisionSections(revision: { sectionsSnapshot: unknown; sanitizedSnapshot: string }): PageSection[] {
  return Array.isArray(revision.sectionsSnapshot) ? validatePageSections(revision.sectionsSnapshot).sections : sectionsFromLegacyBody(revision.sanitizedSnapshot);
}
