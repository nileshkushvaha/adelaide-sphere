import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from '../cache/cache.service.js';
import { CACHE_TAGS } from '@adelaide-sphere/domain';
import type { Category, LocalArea, Prisma, Service, ServiceSynonym } from '@adelaide-sphere/database';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { collectionMeta, skipFor } from '../common/pagination.js';
import { isValidSlug, slugify } from '../common/slug.js';
import { MediaService } from '../media/media.service.js';
import { RedirectsService } from '../seo/redirects.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import type {
  CategoryDto,
  CreateCategoryDto,
  CreateLocalAreaDto,
  CreateServiceDto,
  ListTermsQueryDto,
  LocalAreaDto,
  PublicCategoryDto,
  ServiceDto,
  UpdateCategoryDto,
  UpdateLocalAreaDto,
  UpdateServiceDto,
  PublicLocalAreaDto,
} from './dto/taxonomy.dto.js';

export type TermKind = 'category' | 'service' | 'localArea';

const stale = () => new ConflictException({ code: 'STALE_VERSION', message: 'This item was changed by someone else. Reload and try again.' });
const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Item not found' });
const slugTaken = () => new ConflictException({ code: 'SLUG_IN_USE', message: 'That slug is already used', fields: { slug: ['That slug is already used'] } });

export function toCategoryDto(c: Category, images: { image: CategoryDto['image']; ogImage: CategoryDto['ogImage'] } = { image: null, ogImage: null }): CategoryDto {
  return {
    id: c.id, name: c.name, slug: c.slug, description: c.description, parentId: c.parentId, sortOrder: c.sortOrder,
    imageMediaId: c.imageMediaId, seoTitle: c.seoTitle, seoDescription: c.seoDescription, seoKeywords: c.seoKeywords, ogImageMediaId: c.ogImageMediaId,
    image: images.image, ogImage: images.ogImage,
    active: c.active, version: c.version, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  };
}
export function toServiceDto(s: Service & { synonyms: ServiceSynonym[] }): ServiceDto {
  return { id: s.id, name: s.name, slug: s.slug, synonyms: s.synonyms.map((x) => x.term).sort(), icon: s.icon, active: s.active, version: s.version, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() };
}
export function toLocalAreaDto(a: LocalArea, images: { image: LocalAreaDto['image']; ogImage: LocalAreaDto['ogImage'] } = { image: null, ogImage: null }): LocalAreaDto {
  return {
    id: a.id, name: a.name, slug: a.slug, editorialIntro: a.editorialIntro, eligibilitySource: a.eligibilitySource, eligibilityVerifiedAt: a.eligibilityVerifiedAt?.toISOString() ?? null, sortOrder: a.sortOrder,
    imageMediaId: a.imageMediaId, seoTitle: a.seoTitle, seoDescription: a.seoDescription, seoKeywords: a.seoKeywords, ogImageMediaId: a.ogImageMediaId,
    image: images.image, ogImage: images.ogImage,
    active: a.active, version: a.version, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
  };
}

export function normaliseSynonyms(terms: string[] | undefined): string[] {
  if (!terms) return [];
  return [...new Set(terms.map((t) => t.trim().toLowerCase().replace(/\s+/g, ' ')).filter((t) => t.length >= 2))];
}

/**
 * TaxonomyModule (SRS MOD 001): categories (two levels), services with search
 * synonyms and the Adelaide local-area allowlist. Deactivation preserves rows
 * and historical links; deletion is not offered (SRS CFG 003, DAT 003).
 * `referencedByActiveListings` is the hook Phase 12 fills in so terms in use
 * cannot be deactivated silently.
 */
@Injectable()
export class TaxonomyService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly redirects: RedirectsService,
    private readonly media: MediaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Categories, services and areas appear in public navigation, filters,
   * listing cards and the sitemap, so every change refreshes those pages
   * (SRS CACHE 002). A slug change or an activation also changes menu links.
   */
  private async purge(tx: Prisma.TransactionClient | null, resourceType: string, resourceId: string, ctx: RequestContext, options: { menus?: boolean } = {}): Promise<void> {
    const tags = [CACHE_TAGS.taxonomy, CACHE_TAGS.businesses, CACHE_TAGS.sitemap, ...(options.menus ? [CACHE_TAGS.menus] : [])];
    const record = (client: Prisma.TransactionClient) => this.cache.recordInvalidation(client, { resourceType, resourceId, correlationId: ctx.requestId, tags });
    if (tx) await record(tx);
    else {
      const db = await this.database.client();
      await db.$transaction(record);
    }
  }

  /** The two pictures a category or an area can carry, resolved to public addresses. */
  private async categoryImages(c: { imageMediaId: string | null; ogImageMediaId: string | null }) {
    const [image, ogImage] = await Promise.all([this.media.publicImageRef(c.imageMediaId), this.media.publicImageRefOfKind(c.ogImageMediaId, 'hero')]);
    return { image, ogImage: ogImage ? { id: ogImage.id, url: ogImage.url, alt: ogImage.alt } : null };
  }

  /**
   * Where a term lives on the public site, or null when it has no page of its
   * own. Services are search facets and have no route, so changing a service's
   * address breaks nothing and leaves no redirect behind.
   */
  private publicPath(kind: 'category' | 'localArea', slug: string): string {
    return kind === 'category' ? `/business/category/${slug}` : `/business/area/${slug}`;
  }

  // ---- public reads ---------------------------------------------------------

  async publicCategoryTree(): Promise<PublicCategoryDto[]> {
    const db = await this.database.client();
    const rows = await db.category.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
    const roots = rows.filter((c) => c.parentId === null);
    const byParent = new Map<string, Category[]>();
    for (const c of rows) if (c.parentId) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
    // A child whose parent is inactive is not exposed (the parent is the public path).
    const publicTerm = async (c: Category, children: PublicCategoryDto[]): Promise<PublicCategoryDto> => {
      const { image, ogImage } = await this.categoryImages(c);
      return { id: c.id, name: c.name, slug: c.slug, description: c.description, image, seoTitle: c.seoTitle, seoDescription: c.seoDescription, seoKeywords: c.seoKeywords, shareImage: ogImage, children };
    };
    return Promise.all(roots.map(async (r) => publicTerm(r, await Promise.all((byParent.get(r.id) ?? []).map((c) => publicTerm(c, []))))));
  }

  async publicServices(): Promise<Pick<ServiceDto, 'id' | 'name' | 'slug' | 'synonyms'>[]> {
    const db = await this.database.client();
    const rows = await db.service.findMany({ where: { active: true }, include: { synonyms: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    return rows.map((s) => ({ id: s.id, name: s.name, slug: s.slug, synonyms: s.synonyms.map((x) => x.term).sort() }));
  }

  async publicAreas(): Promise<PublicLocalAreaDto[]> {
    const db = await this.database.client();
    const rows = await db.localArea.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
    return Promise.all(
      rows.map(async (a) => {
        const { image, ogImage } = await this.categoryImages(a);
        return { id: a.id, name: a.name, slug: a.slug, editorialIntro: a.editorialIntro, image, seoTitle: a.seoTitle, seoDescription: a.seoDescription, seoKeywords: a.seoKeywords, shareImage: ogImage };
      }),
    );
  }

  // ---- admin lists ----------------------------------------------------------

  private listWhere(q: ListTermsQueryDto) {
    return {
      ...(q.status ? { active: q.status === 'active' } : {}),
      ...(q.ids?.length ? { id: { in: q.ids } } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q } }, { slug: { contains: q.q } }] } : {}),
    };
  }
  private listOrder(q: ListTermsQueryDto) {
    return [{ [q.sort]: q.order }, { id: 'asc' as const }];
  }

  async listCategories(q: ListTermsQueryDto) {
    const db = await this.database.client();
    const where: Prisma.CategoryWhereInput = { ...this.listWhere(q), ...(q.topLevel ? { parentId: null } : {}) };
    const [total, rows] = await Promise.all([
      db.category.count({ where }),
      db.category.findMany({ where, include: { parent: { select: { name: true } } }, orderBy: this.listOrder(q), skip: skipFor(q.page, q.pageSize), take: q.pageSize }),
    ]);
    const counts = await this.referenceCounts('category', rows.map((r) => r.id));
    return {
      data: rows.map((row) => ({ ...toCategoryDto(row), listingCount: counts.get(row.id) ?? 0, parentName: row.parent?.name ?? null })),
      meta: collectionMeta(q.page, q.pageSize, total),
    };
  }
  async listServices(q: ListTermsQueryDto) {
    const db = await this.database.client();
    const where: Prisma.ServiceWhereInput = this.listWhere(q);
    const [total, rows] = await Promise.all([db.service.count({ where }), db.service.findMany({ where, include: { synonyms: true }, orderBy: this.listOrder(q), skip: skipFor(q.page, q.pageSize), take: q.pageSize })]);
    const counts = await this.referenceCounts('service', rows.map((r) => r.id));
    return { data: rows.map((row) => ({ ...toServiceDto(row), listingCount: counts.get(row.id) ?? 0 })), meta: collectionMeta(q.page, q.pageSize, total) };
  }
  async listLocalAreas(q: ListTermsQueryDto) {
    const db = await this.database.client();
    const where: Prisma.LocalAreaWhereInput = this.listWhere(q);
    const [total, rows] = await Promise.all([db.localArea.count({ where }), db.localArea.findMany({ where, orderBy: this.listOrder(q), skip: skipFor(q.page, q.pageSize), take: q.pageSize })]);
    const counts = await this.referenceCounts('localArea', rows.map((r) => r.id));
    return { data: rows.map((row) => ({ ...toLocalAreaDto(row), listingCount: counts.get(row.id) ?? 0 })), meta: collectionMeta(q.page, q.pageSize, total) };
  }

  async getCategory(id: string): Promise<CategoryDto> {
    const db = await this.database.client();
    const row = await db.category.findUnique({ where: { id } });
    if (!row) throw notFound();
    return toCategoryDto(row, await this.categoryImages(row));
  }
  async getService(id: string): Promise<ServiceDto> {
    const db = await this.database.client();
    const row = await db.service.findUnique({ where: { id }, include: { synonyms: true } });
    if (!row) throw notFound();
    return toServiceDto(row);
  }
  async getLocalArea(id: string): Promise<LocalAreaDto> {
    const db = await this.database.client();
    const row = await db.localArea.findUnique({ where: { id } });
    if (!row) throw notFound();
    return toLocalAreaDto(row, await this.categoryImages(row));
  }

  // ---- categories ------------------------------------------------------------

  async createCategory(input: CreateCategoryDto, actor: AdminPrincipal, ctx: RequestContext): Promise<CategoryDto> {
    const db = await this.database.client();
    const slug = this.resolveSlug(input.name, input.slug);
    if (await db.category.findUnique({ where: { slug } })) throw slugTaken();
    if (input.parentId) await this.assertValidParent(input.parentId);
    await this.assertUsableImages(input);
    const row = await db.category.create({
      data: {
        name: input.name, slug, description: input.description ?? null, parentId: input.parentId ?? null, sortOrder: input.sortOrder ?? 0,
        imageMediaId: input.imageMediaId ?? null, seoTitle: input.seoTitle ?? null, seoDescription: input.seoDescription ?? null, seoKeywords: input.seoKeywords ?? null, ogImageMediaId: input.ogImageMediaId ?? null,
      },
    });
    await this.purge(null, 'category', row.id, ctx, { menus: true });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'taxonomy.category.create', actorAdminId: actor.id, targetType: 'category', targetId: row.id, metadata: { slug, parentId: row.parentId }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return toCategoryDto(row);
  }

  async updateCategory(id: string, input: UpdateCategoryDto, actor: AdminPrincipal, ctx: RequestContext): Promise<CategoryDto> {
    const db = await this.database.client();
    const current = await db.category.findUnique({ where: { id }, include: { children: { select: { id: true } } } });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    const data: Prisma.CategoryUncheckedUpdateManyInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined && input.slug !== current.slug) {
      if (!isValidSlug(input.slug)) throw this.invalidSlug();
      if (await db.category.findUnique({ where: { slug: input.slug } })) throw slugTaken();
      data.slug = input.slug;
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    await this.assertUsableImages(input);
    if (input.imageMediaId !== undefined) data.imageMediaId = input.imageMediaId;
    if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;
    if (input.seoKeywords !== undefined) data.seoKeywords = input.seoKeywords;
    if (input.ogImageMediaId !== undefined) data.ogImageMediaId = input.ogImageMediaId;
    if (input.parentId !== undefined && input.parentId !== current.parentId) {
      if (input.parentId === id) throw new ConflictException({ code: 'CATEGORY_CYCLE', message: 'A category cannot be its own parent' });
      if (input.parentId !== null) {
        if (current.children.length > 0) throw new ConflictException({ code: 'CATEGORY_DEPTH', message: 'A category with children cannot be nested (two levels only)' });
        await this.assertValidParent(input.parentId);
      }
      data.parentId = input.parentId;
    }
    await db.$transaction(async (tx) => {
      const result = await tx.category.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (result.count !== 1) throw stale();
      // A category has a public page, so moving it leaves a 301 behind rather
      // than a dead URL (SRS SEO 004) — the same rule business listings follow.
      if (data.slug) await this.redirects.recordSlugChange(tx, { sourcePath: this.publicPath('category', current.slug), targetPath: this.publicPath('category', String(data.slug)), resourceType: 'category', resourceId: id, actorAdminId: actor.id, reason: null });
      await this.purge(tx, 'category', id, ctx, { menus: Boolean(data.slug) || data.parentId !== undefined });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'taxonomy.category.update', actorAdminId: actor.id, targetType: 'category', targetId: id, metadata: { fields: Object.keys(data).join(',') }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.getCategory(id);
  }

  /** A picture must exist and be processed before a category can show it. */
  private async assertUsableImages(input: { imageMediaId?: string | null; ogImageMediaId?: string | null }): Promise<void> {
    const db = await this.database.client();
    for (const [field, id] of [['imageMediaId', input.imageMediaId], ['ogImageMediaId', input.ogImageMediaId]] as const) {
      if (!id) continue;
      const asset = await db.mediaAsset.findUnique({ where: { id }, select: { status: true } });
      if (!asset || asset.status !== 'ready') {
        throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { [field]: [asset ? 'That image is still being processed' : 'Choose an image from the media library'] } }, HttpStatus.BAD_REQUEST);
      }
    }
  }

  private async assertValidParent(parentId: string): Promise<void> {
    const db = await this.database.client();
    const parent = await db.category.findUnique({ where: { id: parentId } });
    if (!parent) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Unknown parent category', fields: { parentId: ['Unknown parent category'] } }, HttpStatus.BAD_REQUEST);
    if (parent.parentId !== null) throw new ConflictException({ code: 'CATEGORY_DEPTH', message: 'Categories nest at most two levels; choose a top-level parent' });
  }

  // ---- services --------------------------------------------------------------

  async createService(input: CreateServiceDto, actor: AdminPrincipal, ctx: RequestContext): Promise<ServiceDto> {
    const db = await this.database.client();
    const slug = this.resolveSlug(input.name, input.slug);
    if (await db.service.findUnique({ where: { slug } })) throw slugTaken();
    const synonyms = normaliseSynonyms(input.synonyms);
    const row = await db.service.create({ data: { name: input.name, slug, icon: input.icon ?? null, synonyms: { create: synonyms.map((term) => ({ term })) } }, include: { synonyms: true } });
    await this.purge(null, 'service', row.id, ctx);
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'taxonomy.service.create', actorAdminId: actor.id, targetType: 'service', targetId: row.id, metadata: { slug, synonyms: synonyms.length }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return toServiceDto(row);
  }

  async updateService(id: string, input: UpdateServiceDto, actor: AdminPrincipal, ctx: RequestContext): Promise<ServiceDto> {
    const db = await this.database.client();
    const current = await db.service.findUnique({ where: { id } });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    const data: Prisma.ServiceUpdateManyMutationInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.icon !== undefined) data.icon = input.icon;
    if (input.slug !== undefined && input.slug !== current.slug) {
      if (!isValidSlug(input.slug)) throw this.invalidSlug();
      if (await db.service.findUnique({ where: { slug: input.slug } })) throw slugTaken();
      data.slug = input.slug;
    }
    await db.$transaction(async (tx) => {
      const result = await tx.service.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (result.count !== 1) throw stale();
      if (input.synonyms !== undefined) {
        await tx.serviceSynonym.deleteMany({ where: { serviceId: id } });
        await tx.serviceSynonym.createMany({ data: normaliseSynonyms(input.synonyms).map((term) => ({ serviceId: id, term })) });
      }
      await this.purge(tx, 'service', id, ctx);
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'taxonomy.service.update', actorAdminId: actor.id, targetType: 'service', targetId: id, metadata: { fields: [...Object.keys(data), ...(input.synonyms !== undefined ? ['synonyms'] : [])].join(',') }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.getService(id);
  }

  // ---- local areas -----------------------------------------------------------

  async createLocalArea(input: CreateLocalAreaDto, actor: AdminPrincipal, ctx: RequestContext): Promise<LocalAreaDto> {
    const db = await this.database.client();
    const slug = this.resolveSlug(input.name, input.slug);
    if (await db.localArea.findUnique({ where: { slug } })) throw slugTaken();
    await this.assertUsableImages(input);
    const row = await db.localArea.create({
      data: {
        name: input.name, slug, editorialIntro: input.editorialIntro ?? null, eligibilitySource: input.eligibilitySource ?? null, eligibilityVerifiedAt: input.eligibilitySource ? new Date() : null, sortOrder: input.sortOrder ?? 0,
        imageMediaId: input.imageMediaId ?? null, seoTitle: input.seoTitle ?? null, seoDescription: input.seoDescription ?? null, seoKeywords: input.seoKeywords ?? null, ogImageMediaId: input.ogImageMediaId ?? null,
      },
    });
    await this.purge(null, 'local_area', row.id, ctx, { menus: true });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'taxonomy.area.create', actorAdminId: actor.id, targetType: 'local_area', targetId: row.id, metadata: { slug, verified: !!input.eligibilitySource }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return toLocalAreaDto(row);
  }

  async updateLocalArea(id: string, input: UpdateLocalAreaDto, actor: AdminPrincipal, ctx: RequestContext): Promise<LocalAreaDto> {
    const db = await this.database.client();
    const current = await db.localArea.findUnique({ where: { id } });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    const data: Prisma.LocalAreaUncheckedUpdateManyInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined && input.slug !== current.slug) {
      if (!isValidSlug(input.slug)) throw this.invalidSlug();
      if (await db.localArea.findUnique({ where: { slug: input.slug } })) throw slugTaken();
      data.slug = input.slug;
    }
    if (input.editorialIntro !== undefined) data.editorialIntro = input.editorialIntro;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    await this.assertUsableImages(input);
    if (input.imageMediaId !== undefined) data.imageMediaId = input.imageMediaId;
    if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;
    if (input.seoKeywords !== undefined) data.seoKeywords = input.seoKeywords;
    if (input.ogImageMediaId !== undefined) data.ogImageMediaId = input.ogImageMediaId;
    if (input.eligibilitySource !== undefined) {
      data.eligibilitySource = input.eligibilitySource;
      // Re-verification is recorded with the actor's timestamp (SRS BUS 008).
      data.eligibilityVerifiedAt = input.eligibilitySource ? new Date() : null;
    }
    await db.$transaction(async (tx) => {
      const result = await tx.localArea.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (result.count !== 1) throw stale();
      if (data.slug) await this.redirects.recordSlugChange(tx, { sourcePath: this.publicPath('localArea', current.slug), targetPath: this.publicPath('localArea', String(data.slug)), resourceType: 'local_area', resourceId: id, actorAdminId: actor.id, reason: null });
      await this.purge(tx, 'local_area', id, ctx, { menus: Boolean(data.slug) });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'taxonomy.area.update', actorAdminId: actor.id, targetType: 'local_area', targetId: id, metadata: { fields: Object.keys(data).join(',') }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.getLocalArea(id);
  }

  // ---- activation ----------------------------------------------------------

  async setActive(kind: TermKind, id: string, active: boolean, expectedVersion: number, reason: string | undefined, actor: AdminPrincipal, ctx: RequestContext) {
    const db = await this.database.client();
    const delegate = kind === 'category' ? db.category : kind === 'service' ? db.service : db.localArea;
    const current = await (delegate as typeof db.category).findUnique({ where: { id } });
    if (!current) throw notFound();
    if (current.version !== expectedVersion) throw stale();
    if (current.active === active) throw new ConflictException({ code: 'INVALID_STATE', message: active ? 'Already active' : 'Already inactive' });
    if (!active) {
      const references = await this.referencedByActiveListings(kind, id);
      if (references > 0) {
        throw new ConflictException({ code: 'TERM_IN_USE', message: `Cannot deactivate: ${references} active listing(s) still use this term. Reassign them first.` });
      }
      if (kind === 'category') {
        const activeChildren = await db.category.count({ where: { parentId: id, active: true } });
        if (activeChildren > 0) throw new ConflictException({ code: 'TERM_IN_USE', message: `Cannot deactivate: ${activeChildren} active sub-categor${activeChildren === 1 ? 'y' : 'ies'} depend on it.` });
      }
    } else if (kind === 'category' && current.parentId) {
      const parent = await db.category.findUnique({ where: { id: current.parentId } });
      if (!parent?.active) throw new ConflictException({ code: 'PARENT_INACTIVE', message: 'Activate the parent category first' });
    }
    await db.$transaction(async (tx) => {
      const table = kind === 'category' ? tx.category : kind === 'service' ? tx.service : tx.localArea;
      const result = await (table as typeof tx.category).updateMany({ where: { id, version: expectedVersion }, data: { active, version: { increment: 1 } } });
      if (result.count !== 1) throw stale();
      await this.purge(tx, kind === 'localArea' ? 'local_area' : kind, id, ctx, { menus: true });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: `taxonomy.${kind === 'localArea' ? 'area' : kind}.${active ? 'activate' : 'deactivate'}`, actorAdminId: actor.id, targetType: kind === 'localArea' ? 'local_area' : kind, targetId: id, reason: reason ?? null, requestId: ctx.requestId, ipAddress: ctx.ip });
    return kind === 'category' ? this.getCategory(id) : kind === 'service' ? this.getService(id) : this.getLocalArea(id);
  }

  /**
   * Overridden by DirectoryService, which owns Business rows, to count the
   * active listings referencing each term. Batched by id so a list of twenty
   * terms costs one query rather than twenty.
   */
  referenceCounts: (kind: TermKind, ids: string[]) => Promise<Map<string, number>> = async () => new Map();

  /** The single-term form of the same rule, used when deactivating (SRS BUS 007). */
  async referencedByActiveListings(kind: TermKind, id: string): Promise<number> {
    return (await this.referenceCounts(kind, [id])).get(id) ?? 0;
  }

  private resolveSlug(name: string, explicit: string | undefined): string {
    const slug = explicit ?? slugify(name);
    if (!isValidSlug(slug)) throw this.invalidSlug();
    return slug;
  }

  private invalidSlug() {
    return new HttpException({ code: 'VALIDATION_ERROR', message: 'Slug must be lowercase letters, numbers and single hyphens', fields: { slug: ['Slug must be lowercase letters, numbers and single hyphens'] } }, HttpStatus.BAD_REQUEST);
  }
}
