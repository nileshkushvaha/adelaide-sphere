import { createHash, randomBytes } from 'node:crypto';
import { CacheService } from '../cache/cache.service.js';
import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MediaAsset, MediaVariant, Prisma } from '@adelaide-sphere/database';
import { MEDIA_SETTING_REFERENCES, documentRejectionReason, extensionForMime, imageRejectionReason, maxBytesFor, mediaKindForMime, objectKeyFor, pdfPageCount, safeDownloadName, unusedMediaRelations, type ImageFacts, type MediaKind, CACHE_TAGS } from '@adelaide-sphere/domain';
import { fileTypeFromBuffer } from 'file-type';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { collectionMeta, skipFor } from '../common/pagination.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { EVENT_TYPES, OutboxService } from '../outbox/outbox.service.js';
import { ObjectStoragePort } from './storage.port.js';
import type { CompleteUploadDto, GalleryEntryDto, ListMediaQueryDto, MediaAssetDto, RequestUploadDto, SetGalleryDto, UpdateMediaDto, UploadTicketDto } from './dto/media.dto.js';
import { mediaEvents } from '../observability/metrics.registry.js';

const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Media not found' });
/** The upload permission each kind needs (change log 1.16). */
const UPLOAD_PERMISSION: Record<MediaKind, string> = { image: 'media.upload', document: 'media.documents.upload' };
const invalid = (field: string, message: string) => new HttpException({ code: 'VALIDATION_ERROR', message, fields: { [field]: [message] } }, HttpStatus.BAD_REQUEST);

const stale = () => new ConflictException({ code: 'STALE_VERSION', message: 'This asset was changed by someone else. Reload and try again.' });

type AssetRow = MediaAsset & { variants: MediaVariant[] };

/**
 * Everything that can show an image, loaded with the asset so "where is it used"
 * is answered in one query. The list of relations is `MEDIA_USAGE_RELATIONS` in
 * `@adelaide-sphere/domain`, shared with the worker's retention task.
 */
const USAGE_INCLUDE = {
  variants: true,
  businesses: { include: { business: { select: { name: true } } } },
  coverOf: { select: { id: true, title: true } },
  shareImageOf: { select: { id: true, title: true } },
  menuItemDocuments: { select: { id: true, menu: { select: { id: true, name: true } } } },
  pageShareImageOf: { select: { slug: true, title: true } },
  authorOf: { select: { id: true, displayName: true } },
  testimonials: { select: { id: true, displayName: true } },
  partners: { select: { id: true, name: true } },
  categoryImageOf: { select: { id: true, name: true } },
  categoryShareImageOf: { select: { id: true, name: true } },
  areaImageOf: { select: { id: true, name: true } },
  areaShareImageOf: { select: { id: true, name: true } },
  businessShareImageOf: { select: { id: true, name: true } },
  blogCategoryShareImageOf: { select: { id: true, name: true } },
  blogTagShareImageOf: { select: { id: true, name: true } },
  bodyReferences: { select: { resourceType: true, resourceId: true } },
} satisfies Prisma.MediaAssetInclude;

type UsageRow = Prisma.MediaAssetGetPayload<{ include: typeof USAGE_INCLUDE }>;

/** What each rich text owner is called on the media screens, and which kind of link reaches it. */
const BODY_USAGE: Record<string, { kind: MediaAssetDto['usages'][number]['kind']; suffix: string }> = {
  post: { kind: 'post', suffix: 'inside the article' },
  static_page: { kind: 'page', suffix: 'inside the page' },
  author: { kind: 'author', suffix: 'inside the bio' },
  faq: { kind: 'faq', suffix: 'inside the answer' },
  blog_category: { kind: 'blogCategory', suffix: 'inside the landing text' },
  blog_tag: { kind: 'blogTag', suffix: 'inside the landing text' },
};

/** Titles of the records whose text shows an image, keyed `type:id`. */
type BodyTitles = Map<string, { id: string; title: string }>;

function relationUsages(row: UsageRow, bodyTitles: BodyTitles = new Map()): MediaAssetDto['usages'] {
  return [
    ...row.businesses.map((b) => ({ kind: 'business' as const, id: b.businessId, label: b.business.name })),
    ...row.coverOf.map((p) => ({ kind: 'post' as const, id: p.id, label: p.title })),
    // A share image is a separate use: removing the cover must not make an
    // image look unused while an article still shares it.
    ...row.shareImageOf.map((p) => ({ kind: 'post' as const, id: p.id, label: `${p.title} (share image)` })),
    // A page is addressed by its slug, not its id: that is what its editor
    // route takes, so this is what a link to it needs.
    ...row.pageShareImageOf.map((p) => ({ kind: 'page' as const, id: p.slug, label: `${p.title} (share image)` })),
    ...row.authorOf.map((a) => ({ kind: 'author' as const, id: a.id, label: a.displayName })),
    ...row.testimonials.map((t) => ({ kind: 'testimonial' as const, id: t.id, label: t.displayName })),
    ...row.partners.map((p) => ({ kind: 'partner' as const, id: p.id, label: p.name })),
    ...row.categoryImageOf.map((c) => ({ kind: 'category' as const, id: c.id, label: c.name })),
    ...row.categoryShareImageOf.map((c) => ({ kind: 'category' as const, id: c.id, label: `${c.name} (share image)` })),
    ...row.areaImageOf.map((a) => ({ kind: 'area' as const, id: a.id, label: a.name })),
    ...row.areaShareImageOf.map((a) => ({ kind: 'area' as const, id: a.id, label: `${a.name} (share image)` })),
    ...row.businessShareImageOf.map((b) => ({ kind: 'business' as const, id: b.id, label: `${b.name} (share image)` })),
    ...row.blogCategoryShareImageOf.map((c) => ({ kind: 'blogCategory' as const, id: c.id, label: `${c.name} (blog category share image)` })),
    ...row.menuItemDocuments.map((item) => ({ kind: 'menu' as const, id: item.menu.id, label: `${item.menu.name} (menu link)` })),
    ...row.blogTagShareImageOf.map((t) => ({ kind: 'blogTag' as const, id: t.id, label: `${t.name} (blog tag share image)` })),
    // An image placed inside a body is a use like any other (MED 004): without
    // it the library offered to delete a picture a published article shows.
    ...row.bodyReferences.map((ref) => {
      const usage = BODY_USAGE[ref.resourceType] ?? { kind: 'post' as const, suffix: 'inside the text' };
      const owner = bodyTitles.get(`${ref.resourceType}:${ref.resourceId}`);
      return { kind: usage.kind, id: owner?.id ?? ref.resourceId, label: `${owner?.title ?? 'Deleted record'} (${usage.suffix})` };
    }),
  ];
}

/**
 * Media lifecycle (SRS MED 001–004). Uploads land in a private quarantine
 * bucket under a random server-generated key, are validated from their bytes,
 * and only re-encoded variants are ever published.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly storage: ObjectStoragePort,
    private readonly outbox: OutboxService,
    private readonly cache: CacheService,
  ) {}

  async requestUpload(input: RequestUploadDto, actor: AdminPrincipal, ctx: RequestContext): Promise<UploadTicketDto> {
    const kind = mediaKindForMime(input.contentType);
    if (!kind) throw invalid('contentType', 'That file type is not accepted');
    this.assertMayUpload(actor, kind);
    if (input.bytes > maxBytesFor(kind)) {
      const limit = `${Math.round(maxBytesFor(kind) / (1024 * 1024))} MB`;
      throw invalid('bytes', kind === 'document' ? `Documents must be ${limit} or smaller` : `Images must be ${limit} or smaller`);
    }
    const title = input.title?.trim() ?? '';
    if (kind === 'document' && title === '') throw invalid('title', 'Give the document a title');
    const db = await this.database.client();
    const asset = await db.mediaAsset.create({
      data: {
        sourceName: input.fileName,
        mimeType: input.contentType,
        kind,
        title: kind === 'document' ? title : null,
        bytes: input.bytes,
        objectKey: 'pending',
        status: 'quarantined',
        uploadedByAdminId: actor.id,
      },
      select: { id: true },
    });
    // The key is generated here, never accepted from the client (SRS MED 002).
    const objectKey = objectKeyFor('quarantine', asset.id, extensionForMime(input.contentType), randomBytes(12).toString('hex'));
    await db.mediaAsset.update({ where: { id: asset.id }, data: { objectKey } });
    const presigned = await this.storage.presignUpload('quarantine', objectKey, input.contentType, input.bytes);
    mediaEvents.inc({ event: 'upload_requested' });
    await this.audit.record({ action: 'media.upload.requested', actorAdminId: actor.id, targetType: 'media_asset', targetId: asset.id, metadata: { bytes: input.bytes, contentType: input.contentType, kind }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return { assetId: asset.id, uploadUrl: presigned.url, headers: presigned.headers, expiresInSeconds: presigned.expiresInSeconds };
  }

  /**
   * Validates the uploaded object from its own bytes and queues variant
   * processing. A rejected asset stays quarantined and never becomes public.
   */
  async completeUpload(id: string, input: CompleteUploadDto, actor: AdminPrincipal, ctx: RequestContext): Promise<MediaAssetDto> {
    const db = await this.database.client();
    const asset = await db.mediaAsset.findUnique({ where: { id }, include: { variants: true } });
    if (!asset) throw notFound();
    this.assertMayUpload(actor, asset.kind);
    if (asset.status !== 'quarantined') throw new ConflictException({ code: 'INVALID_STATE', message: `This upload is already ${asset.status}` });
    // A completed image upload is already queued for processing; completing again
    // would queue a second job for the same bytes. A document is never queued, so
    // one completed before the API published documents itself can be completed again.
    if (asset.checksum && asset.kind !== 'document') throw new ConflictException({ code: 'INVALID_STATE', message: 'This upload has already been submitted for processing' });

    const head = await this.storage.head('quarantine', asset.objectKey);
    if (!head) throw new HttpException({ code: 'UPLOAD_MISSING', message: 'The uploaded file was not found. Please upload it again.' }, HttpStatus.CONFLICT);
    const bytes = await this.storage.getBytes('quarantine', asset.objectKey);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    if (input.checksum && input.checksum.toLowerCase() !== checksum) {
      return this.reject(asset, 'The uploaded file did not match its checksum', actor, ctx);
    }
    const detected = await fileTypeFromBuffer(bytes);
    if (asset.kind === 'document') return this.publishDocument(asset, bytes, checksum, detected?.mime ?? null, actor, ctx);
    const facts: ImageFacts = {
      detectedMime: detected?.mime ?? null,
      // Dimensions come from the header; the worker re-decodes fully when it processes variants.
      ...readImageSize(bytes, detected?.mime ?? null),
      bytes: bytes.byteLength,
    };
    const reason = imageRejectionReason(facts, asset.mimeType);
    if (reason) return this.reject(asset, reason, actor, ctx);

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.mediaAsset.update({
        where: { id },
        data: { bytes: facts.bytes, width: facts.width, height: facts.height, checksum, altText: input.altText ?? asset.altText, version: { increment: 1 } },
        include: { variants: true },
      });
      await this.outbox.write(tx, { type: EVENT_TYPES.mediaUploaded, resourceType: 'media_asset', resourceId: id, resourceVersion: row.version, correlationId: ctx.requestId, payload: { mediaId: id } });
      return row;
    });
    await this.audit.record({ action: 'media.upload.completed', actorAdminId: actor.id, targetType: 'media_asset', targetId: id, metadata: { bytes: facts.bytes, width: facts.width, height: facts.height }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(updated, []);
  }

  private async reject(asset: AssetRow, reason: string, actor: AdminPrincipal, ctx: RequestContext): Promise<MediaAssetDto> {
    const db = await this.database.client();
    const row = await db.mediaAsset.update({ where: { id: asset.id }, data: { status: 'rejected', rejectionReason: reason, version: { increment: 1 } }, include: { variants: true } });
    // The rejected original is removed immediately; nothing is left addressable.
    await this.storage.delete('quarantine', asset.objectKey).catch(() => undefined);
    mediaEvents.inc({ event: 'upload_rejected' });
    await this.audit.record({ action: 'media.upload.rejected', actorAdminId: actor.id, targetType: 'media_asset', targetId: asset.id, reason, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row, []);
  }

  async list(query: ListMediaQueryDto): Promise<{ data: MediaAssetDto[]; meta: ReturnType<typeof collectionMeta> }> {
    const db = await this.database.client();
    const settings = await this.settingUsages();
    const where: Prisma.MediaAssetWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.q ? { OR: [{ sourceName: { contains: query.q } }, { title: { contains: query.q } }] } : {}),
      // "Unused" means no relation uses it and no settings document names it;
      // the settings ids are few, so they are excluded by id.
      ...(query.unused ? { ...unusedMediaRelations(), ...(settings.size > 0 ? { id: { notIn: [...settings.keys()] } } : {}) } : {}),
    };
    const [rows, total] = await Promise.all([
      db.mediaAsset.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: skipFor(query.page, query.pageSize), take: query.pageSize, include: USAGE_INCLUDE }),
      db.mediaAsset.count({ where }),
    ]);
    return {
      data: await this.withBodyTitles(rows, (titles) => rows.map((row) => this.toDto(row, [...relationUsages(row, titles), ...(settings.get(row.id) ?? [])]))),
      meta: collectionMeta(query.page, query.pageSize, total),
    };
  }

  async get(id: string): Promise<MediaAssetDto> {
    const db = await this.database.client();
    const row = await db.mediaAsset.findUnique({ where: { id }, include: USAGE_INCLUDE });
    if (!row) throw notFound();
    const settings = await this.settingUsages();
    return this.withBodyTitles([row], (titles) => this.toDto(row, [...relationUsages(row, titles), ...(settings.get(row.id) ?? [])]));
  }

  async update(id: string, input: UpdateMediaDto, actor: AdminPrincipal, ctx: RequestContext): Promise<MediaAssetDto> {
    const db = await this.database.client();
    const current = await db.mediaAsset.findUnique({ where: { id }, select: { version: true, kind: true } });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    // A document has a title and no picture to describe; an image the reverse.
    if (current.kind === 'document' && (input.altText !== undefined || input.focalX !== undefined || input.focalY !== undefined)) throw invalid('altText', 'A document has a title rather than alt text or a focal point');
    if (current.kind === 'image' && input.title !== undefined) throw invalid('title', 'An image is described by its alt text');
    // Alt text, title and credit are shown wherever the file is used, so pages using it are refreshed.
    const inUse = (await this.get(id)).usages.length > 0;
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.mediaAsset.updateMany({
      where: { id, version: input.expectedVersion },
      data: {
        ...(input.altText !== undefined ? { altText: input.altText } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.credit !== undefined ? { credit: input.credit } : {}),
        ...(input.rightsNote !== undefined ? { rightsNote: input.rightsNote } : {}),
        ...(input.focalX !== undefined ? { focalX: input.focalX } : {}),
        ...(input.focalY !== undefined ? { focalY: input.focalY } : {}),
        version: { increment: 1 },
      },
      });
      if (result.count === 1 && inUse) {
        await this.cache.recordInvalidation(tx, { resourceType: 'media_asset', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.businesses, CACHE_TAGS.posts, CACHE_TAGS.pages, CACHE_TAGS.taxonomy, CACHE_TAGS.settings] });
      }
      return result;
    });
    if (updated.count !== 1) throw stale();
    if (inUse) await this.cache.bumpNamespace();
    await this.audit.record({ action: 'media.update', actorAdminId: actor.id, targetType: 'media_asset', targetId: id, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.get(id);
  }

  /** Deletion is refused while any usage exists (SRS MED 004, DAT 003). */
  async remove(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const db = await this.database.client();
    const asset = await db.mediaAsset.findUnique({ where: { id }, include: USAGE_INCLUDE });
    if (!asset) throw notFound();
    // Every place in the shared list, including the two whose foreign key is
    // SET NULL (testimonials, partners) and the settings documents that have no
    // foreign key at all: for those, the database would have let the delete
    // through and the page would simply have lost its picture.
    const relations = await this.withBodyTitles([asset], (titles) => relationUsages(asset, titles));
    const usages = [...relations, ...((await this.settingUsages()).get(id) ?? [])];
    if (usages.length > 0) {
      throw new ConflictException({
        code: 'MEDIA_IN_USE',
        message: `This ${asset.kind === 'document' ? 'document' : 'image'} is used in ${usages.length} place${usages.length === 1 ? '' : 's'}: ${usages.map((usage) => usage.label).join(', ')}. Remove it from ${usages.length === 1 ? 'there' : 'those'} first.`,
      });
    }
    for (const variant of asset.variants) await this.storage.delete('public', variant.objectKey).catch(() => undefined);
    if (asset.publicObjectKey) await this.storage.delete('public', asset.publicObjectKey).catch(() => undefined);
    await this.storage.delete('quarantine', asset.objectKey).catch(() => undefined);
    await db.mediaAsset.delete({ where: { id } });
    await this.audit.record({ action: 'media.delete', actorAdminId: actor.id, targetType: 'media_asset', targetId: id, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  /**
   * Looks up the titles of the records whose text shows these images, in one
   * query per resource type, and hands them to `build`. A page is linked by its
   * slug, as its editor route expects.
   */
  private async withBodyTitles<T>(rows: readonly UsageRow[], build: (titles: BodyTitles) => T): Promise<T> {
    const refs = rows.flatMap((row) => row.bodyReferences);
    const titles: BodyTitles = new Map();
    if (refs.length === 0) return build(titles);
    const idsOf = (type: string) => [...new Set(refs.filter((ref) => ref.resourceType === type).map((ref) => ref.resourceId))];
    const db = await this.database.client();
    const put = (type: string, entries: { key: string; id: string; title: string }[]) => entries.forEach((entry) => titles.set(`${type}:${entry.key}`, { id: entry.id, title: entry.title }));
    const [posts, pages, authors, faqs, categories, tags] = await Promise.all([
      idsOf('post').length ? db.post.findMany({ where: { id: { in: idsOf('post') } }, select: { id: true, title: true } }) : [],
      idsOf('static_page').length ? db.staticPage.findMany({ where: { id: { in: idsOf('static_page') } }, select: { id: true, slug: true, title: true } }) : [],
      idsOf('author').length ? db.author.findMany({ where: { id: { in: idsOf('author') } }, select: { id: true, displayName: true } }) : [],
      idsOf('faq').length ? db.faq.findMany({ where: { id: { in: idsOf('faq') } }, select: { id: true, question: true } }) : [],
      idsOf('blog_category').length ? db.blogCategory.findMany({ where: { id: { in: idsOf('blog_category') } }, select: { id: true, name: true } }) : [],
      idsOf('blog_tag').length ? db.blogTag.findMany({ where: { id: { in: idsOf('blog_tag') } }, select: { id: true, name: true } }) : [],
    ]);
    put('post', posts.map((row) => ({ key: row.id, id: row.id, title: row.title })));
    put('static_page', pages.map((row) => ({ key: row.id, id: row.slug, title: row.title })));
    put('author', authors.map((row) => ({ key: row.id, id: row.id, title: row.displayName })));
    put('faq', faqs.map((row) => ({ key: row.id, id: row.id, title: row.question.slice(0, 80) })));
    put('blog_category', categories.map((row) => ({ key: row.id, id: row.id, title: row.name })));
    put('blog_tag', tags.map((row) => ({ key: row.id, id: row.id, title: row.name })));
    return build(titles);
  }

  /**
   * Images referred to from settings documents, by asset id. There are two such
   * documents and they are small, so they are read whole rather than searched.
   */
  private async settingUsages(): Promise<Map<string, MediaAssetDto['usages']>> {
    const db = await this.database.client();
    const rows = await db.setting.findMany({
      where: { OR: MEDIA_SETTING_REFERENCES.map((ref) => ({ group: ref.group, key: ref.key })) },
      select: { group: true, key: true, data: true },
    });
    const byAsset = new Map<string, MediaAssetDto['usages']>();
    for (const row of rows) {
      const ref = MEDIA_SETTING_REFERENCES.find((candidate) => candidate.group === row.group && candidate.key === row.key);
      if (!ref) continue;
      for (const mediaId of new Set(ref.mediaIds(row.data))) {
        const list = byAsset.get(mediaId) ?? [];
        list.push({ kind: 'setting', id: `${ref.group}.${ref.key}`, label: ref.label });
        byAsset.set(mediaId, list);
      }
    }
    return byAsset;
  }

  // ---- gallery usage --------------------------------------------------------

  async setGallery(businessId: string, input: SetGalleryDto, actor: AdminPrincipal, ctx: RequestContext): Promise<GalleryEntryDto[]> {
    const db = await this.database.client();
    const business = await db.business.findUnique({ where: { id: businessId }, select: { id: true, version: true, status: true } });
    if (!business) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Listing not found' });
    if (business.version !== input.expectedVersion) throw stale();
    if (business.status === 'archived') throw new ConflictException({ code: 'INVALID_STATE', message: 'Restore the listing before changing its gallery' });
    const mediaIds = input.items.map((item) => item.mediaId);
    if (new Set(mediaIds).size !== mediaIds.length) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'An image can only appear once in a gallery', fields: { items: ['Duplicate image'] } }, HttpStatus.BAD_REQUEST);
    if (input.items.filter((item) => item.isCover).length > 1) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Only one image can be the cover', fields: { items: ['Choose a single cover image'] } }, HttpStatus.BAD_REQUEST);
    if (mediaIds.length > 0) {
      const assets = await db.mediaAsset.findMany({ where: { id: { in: mediaIds }, kind: 'image' }, select: { id: true, status: true, altText: true } });
      const byId = new Map(assets.map((a) => [a.id, a]));
      for (const item of input.items) {
        const asset = byId.get(item.mediaId);
        // Only fully processed assets can appear publicly (SRS MED 002).
        if (!asset || asset.status !== 'ready') throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Only processed images can be added to a gallery', fields: { items: ['One or more images are not ready'] } }, HttpStatus.BAD_REQUEST);
        if (!(item.altOverride ?? asset.altText)) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Every gallery image needs alt text', fields: { items: ['Add alt text for each image'] } }, HttpStatus.BAD_REQUEST);
      }
    }
    const owner = await db.business.findUnique({ where: { id: businessId }, select: { slug: true, status: true } });
    await db.$transaction(async (tx) => {
      const updated = await tx.business.updateMany({ where: { id: businessId, version: input.expectedVersion }, data: { version: { increment: 1 } } });
      if (updated.count !== 1) throw stale();
      // The cover and gallery appear on the listing page and its cards.
      if (owner?.status === 'published') {
        await this.cache.recordInvalidation(tx, { resourceType: 'business', resourceId: businessId, correlationId: ctx.requestId, tags: [CACHE_TAGS.businesses, CACHE_TAGS.business(owner.slug)] });
      }
      await tx.businessMedia.deleteMany({ where: { businessId } });
      if (input.items.length > 0) {
        await tx.businessMedia.createMany({
          data: input.items.map((item, index) => ({ businessId, mediaId: item.mediaId, sortOrder: index, caption: item.caption ?? null, altOverride: item.altOverride ?? null, isCover: item.isCover ?? index === 0 })),
        });
      }
    });
    if (owner?.status === 'published') await this.cache.bumpNamespace();
    await this.audit.record({ action: 'listing.gallery.update', actorAdminId: actor.id, targetType: 'business', targetId: businessId, metadata: { images: input.items.length }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.gallery(businessId);
  }

  async gallery(businessId: string): Promise<GalleryEntryDto[]> {
    const db = await this.database.client();
    const rows = await db.businessMedia.findMany({ where: { businessId }, orderBy: [{ sortOrder: 'asc' }, { mediaId: 'asc' }], include: { media: { include: { variants: true } } } });
    return rows.map((row) => ({
      mediaId: row.mediaId,
      sortOrder: row.sortOrder,
      caption: row.caption,
      alt: row.altOverride ?? row.media.altText ?? '',
      isCover: row.isCover,
      variants: this.variantDtos(row.media.variants),
    }));
  }

  /**
   * Single-image reference (author photo, cover) for another module. Returns
   * null unless the asset is ready, so an unprocessed or quarantined upload can
   * never be rendered publicly (SRS MED 002/003).
   */
  async publicImageRef(assetId: string | null | undefined): Promise<{ id: string; url: string; alt: string } | null> {
    return this.publicImageRefOfKind(assetId, 'card');
  }

  /**
   * The same reference at a chosen rendition: a favicon wants the smallest
   * variant, a share card the largest. Falls back to the nearest processed
   * variant, and still returns null unless the asset is ready.
   */
  async publicImageRefOfKind(assetId: string | null | undefined, preferred: 'thumbnail' | 'card' | 'hero'): Promise<{ id: string; url: string; alt: string; width: number; height: number } | null> {
    if (!assetId) return null;
    const db = await this.database.client();
    const asset = await db.mediaAsset.findUnique({ where: { id: assetId }, include: { variants: true } });
    if (!asset || asset.status !== 'ready' || asset.kind !== 'image') return null;
    const variants = this.variantDtos(asset.variants);
    const chosen = variants.find((variant) => variant.kind === preferred) ?? variants[0];
    return chosen ? { id: asset.id, url: chosen.url, alt: asset.altText ?? '', width: chosen.width, height: chosen.height } : null;
  }

  /**
   * Hero rendition for the home banner (SRS HERO 001): the largest processed
   * variant plus a smaller one for narrow screens. Returns null unless the
   * asset is ready, so an unprocessed upload can never reach the page.
   */
  async heroRendition(assetId: string): Promise<{ url: string; previewUrl: string; alt: string; width: number; height: number } | null> {
    const db = await this.database.client();
    const asset = await db.mediaAsset.findUnique({ where: { id: assetId }, include: { variants: true } });
    if (!asset || asset.status !== 'ready' || asset.kind !== 'image') return null;
    const variants = this.variantDtos(asset.variants);
    const hero = variants.find((variant) => variant.kind === 'hero') ?? variants.at(-1);
    const preview = variants.find((variant) => variant.kind === 'card') ?? variants[0];
    if (!hero || !preview) return null;
    return { url: hero.url, previewUrl: preview.url, alt: asset.altText ?? '', width: hero.width, height: hero.height };
  }

  /** Throws unless the asset exists, is ready and carries alt text (SRS MED 003). */
  async assertUsableImage(assetId: string): Promise<void> {
    const db = await this.database.client();
    const asset = await db.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.kind !== 'image') throw new HttpException({ code: 'VALIDATION_ERROR', message: 'That image does not exist', fields: { imageMediaId: ['That image does not exist'] } }, HttpStatus.BAD_REQUEST);
    if (asset.status !== 'ready') throw new HttpException({ code: 'VALIDATION_ERROR', message: 'That image is still being processed', fields: { imageMediaId: ['That image is still being processed'] } }, HttpStatus.BAD_REQUEST);
    if (!asset.altText || asset.altText.trim() === '') throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Add alt text to the image before using it', fields: { imageMediaId: ['Add alt text to the image before using it'] } }, HttpStatus.BAD_REQUEST);
  }

  /**
   * A PDF (change log 1.16) is checked from its own bytes and, when it passes,
   * published at once: one copy under a random key that downloads rather than
   * renders, with the quarantined original then removed. There are no
   * renditions to make, so nothing is queued for the worker.
   *
   * There is no virus scanner (client decision of 15 Sep 2026). What protects a
   * reader is the refusal of scripts, launch actions, attachments, rich media,
   * XML forms and encryption; delivery as a download from the media host; that
   * host's `nosniff` and sandbox headers; and uploads being limited to
   * administrators given this one permission, every upload recorded.
   */
  private async publishDocument(asset: AssetRow, bytes: Buffer, checksum: string, detectedMime: string | null, actor: AdminPrincipal, ctx: RequestContext): Promise<MediaAssetDto> {
    const text = bytes.toString('latin1');
    const reason = documentRejectionReason({ detectedMime, bytes: bytes.byteLength, text }, asset.mimeType);
    if (reason) return this.reject(asset, reason, actor, ctx);
    const db = await this.database.client();
    const publicObjectKey = objectKeyFor('media', asset.id, 'pdf', randomBytes(12).toString('hex'));
    await this.storage.put('public', publicObjectKey, bytes, 'application/pdf', { contentDisposition: `attachment; filename="${safeDownloadName(asset.sourceName)}"` });
    let row: AssetRow;
    try {
      row = await db.mediaAsset.update({
        where: { id: asset.id },
        data: { status: 'ready', readyAt: new Date(), bytes: bytes.byteLength, checksum, publicObjectKey, pageCount: pdfPageCount(text), rejectionReason: null, version: { increment: 1 } },
        include: { variants: true },
      });
    } catch (error) {
      await this.storage.delete('public', publicObjectKey).catch(() => undefined);
      throw error;
    }
    await this.storage.delete('quarantine', asset.objectKey).catch(() => undefined);
    mediaEvents.inc({ event: 'document_published' });
    await this.audit.record({ action: 'media.upload.completed', actorAdminId: actor.id, targetType: 'media_asset', targetId: asset.id, metadata: { bytes: bytes.byteLength, kind: 'document', pages: row.pageCount ?? 0 }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row, []);
  }

  /** A published document for a public page (change log 1.17); null unless it is ready. */
  async publicDocumentRefs(ids: readonly string[]): Promise<Record<string, { url: string; title: string; bytes: number }>> {
    if (ids.length === 0) return {};
    const db = await this.database.client();
    const rows = await db.mediaAsset.findMany({ where: { id: { in: [...ids] }, kind: 'document', status: 'ready', publicObjectKey: { not: null } }, select: { id: true, title: true, sourceName: true, bytes: true, publicObjectKey: true } });
    return Object.fromEntries(rows.map((row) => [row.id, { url: this.storage.publicUrl(row.publicObjectKey!), title: row.title ?? row.sourceName, bytes: row.bytes }]));
  }

  /** Throws unless the asset is a published document with a title (change log 1.16). */
  async assertUsableDocument(assetId: string, field = 'documentId'): Promise<void> {
    const db = await this.database.client();
    const asset = await db.mediaAsset.findUnique({ where: { id: assetId }, select: { kind: true, status: true, title: true } });
    if (!asset || asset.kind !== 'document') throw invalid(field, 'That document does not exist');
    if (asset.status !== 'ready') throw invalid(field, 'That document has not finished uploading');
    if (!asset.title?.trim()) throw invalid(field, 'Give the document a title before linking it');
  }

  /** Refuses an upload of a kind the administrator may not upload (change log 1.16). */
  private assertMayUpload(actor: AdminPrincipal, kind: MediaKind): void {
    if (!actor.permissions.includes(UPLOAD_PERMISSION[kind])) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have permission to do that' });
  }

  // ---- retention ------------------------------------------------------------
  //
  // MED 004 retention runs in the worker, as the `media.retention` scheduled
  // task: it deletes stored objects as well as rows, and every other scheduled
  // job already runs there under a lock. The windows it applies are declared
  // once in `packages/domain/src/scheduled-tasks.ts`; the copy that used to sit
  // here was never called by anything, which is exactly the way a retention
  // policy silently stops being applied.

  private variantDtos(variants: MediaVariant[]): MediaAssetDto['variants'] {
    return variants
      .slice()
      .sort((a, b) => a.width - b.width)
      .map((variant) => ({ kind: variant.kind, url: this.storage.publicUrl(variant.objectKey), width: variant.width, height: variant.height }));
  }

  private toDto(row: AssetRow, usages: MediaAssetDto['usages']): MediaAssetDto {
    return {
      id: row.id,
      sourceName: row.sourceName,
      kind: row.kind,
      title: row.title,
      // Only a published document has an address (change log 1.16).
      documentUrl: row.kind === 'document' && row.status === 'ready' && row.publicObjectKey ? this.storage.publicUrl(row.publicObjectKey) : null,
      pageCount: row.pageCount,
      mimeType: row.mimeType,
      bytes: row.bytes,
      width: row.width,
      height: row.height,
      status: row.status,
      rejectionReason: row.rejectionReason,
      altText: row.altText,
      credit: row.credit,
      rightsNote: row.rightsNote,
      focalX: row.focalX === null ? null : Number(row.focalX),
      focalY: row.focalY === null ? null : Number(row.focalY),
      // A quarantined or rejected asset has no public URL at all (SRS MED 002).
      variants: row.status === 'ready' ? this.variantDtos(row.variants) : [],
      usages,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/** Reads dimensions from the file header for the three accepted formats. */
function readImageSize(buffer: Buffer, mime: string | null): { width: number | null; height: number | null; animated: boolean } {
  try {
    if (mime === 'image/png') {
      // IHDR is always the first chunk: width and height are big-endian at 16 and 20.
      const animated = buffer.includes(Buffer.from('acTL'));
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), animated };
    }
    if (mime === 'image/jpeg') {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1]!;
        const length = buffer.readUInt16BE(offset + 2);
        // SOF0..SOF15, excluding the non-frame markers.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7), animated: false };
        }
        offset += 2 + length;
      }
      return { width: null, height: null, animated: false };
    }
    if (mime === 'image/webp') {
      const animated = buffer.subarray(0, 64).includes(Buffer.from('ANIM')) || buffer.subarray(0, 64).includes(Buffer.from('ANMF'));
      const format = buffer.toString('ascii', 12, 16);
      if (format === 'VP8X') return { width: (buffer.readUIntLE(24, 3) & 0xffffff) + 1, height: (buffer.readUIntLE(27, 3) & 0xffffff) + 1, animated };
      if (format === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, animated };
      }
      if (format === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff, animated };
      return { width: null, height: null, animated };
    }
  } catch {
    // A malformed header is a rejection, not a crash.
  }
  return { width: null, height: null, animated: false };
}
