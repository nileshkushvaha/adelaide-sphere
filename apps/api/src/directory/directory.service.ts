import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ObjectStoragePort } from '../media/storage.port.js';
import type { Business, BusinessAddress, BusinessLink, BusinessStatus, Category, LocalArea, Prisma } from '@adelaide-sphere/database';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { FieldEncryptionService } from '../common/field-encryption.service.js';
import { collectionMeta, skipFor } from '../common/pagination.js';
import { isReservedBusinessSlug, isValidSlug, slugify } from '../common/slug.js';
import { RedirectsService } from '../seo/redirects.service.js';
import { CacheService } from '../cache/cache.service.js';
import { CACHE_TAGS } from '@adelaide-sphere/domain';
import type { ChangeSlugDto } from '../seo/dto/redirect.dto.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { TaxonomyService } from '../taxonomy/taxonomy.service.js';
import { EstablishedYearError, normaliseAddressKey, normaliseBusinessName, normalisePhone, parseAustralianPhone, publicationBlockers, TRANSITIONS, validateEstablishedYear, validateLinks, validatePublicUrl } from './business-rules.js';
import type { BusinessDto, BusinessListItemDto, BusinessStateDto, CreateBusinessDto, DuplicateWarningDto, ListBusinessesQueryDto, UpdateBusinessDto, BusinessImagePreviewDto } from './dto/business.dto.js';

type BusinessRow = Business & {
  address: BusinessAddress | null;
  categories: { categoryId: string }[];
  services: { serviceId: string }[];
  links: BusinessLink[];
  primaryCategory: Pick<Category, 'id' | 'name' | 'active'>;
  localArea: Pick<LocalArea, 'id' | 'name' | 'active'>;
};

const include = {
  address: true,
  categories: { select: { categoryId: true } },
  services: { select: { serviceId: true } },
  links: { orderBy: { sortOrder: 'asc' } },
  primaryCategory: { select: { id: true, name: true, active: true } },
  localArea: { select: { id: true, name: true, active: true } },
} as const;

/** What the list screen needs; the detail view keeps the fuller `include`. */
const listInclude = {
  address: { select: { suburb: true, line1: true, postcode: true } },
  primaryCategory: { select: { id: true, name: true, active: true } },
  localArea: { select: { id: true, name: true, active: true } },
} as const;

/** A placement covering this instant: started, and not yet ended (SRS DIR 007). */
const currentPlacement = (now: Date) => ({ startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] });

/**
 * What an administrator's search matches: the name and address they can see, and
 * the phone when they type digits. `contains` is a scan; the directory is bounded
 * at 10,000 listings (SRS DIR 005) and the admin list is always paginated.
 */
function searchTerms(term: string): Prisma.BusinessWhereInput[] {
  const digits = term.replace(/\D/g, '');
  return [
    { name: { contains: term } },
    { slug: { contains: term } },
    { address: { suburb: { contains: term } } },
    ...(/^\d{4}$/.test(term) ? [{ address: { postcode: term } } as Prisma.BusinessWhereInput] : []),
    // A phone is stored normalised, so a search has to be normalised to match it.
    ...(digits.length >= 4 ? [{ normalizedPhone: { contains: digits } } as Prisma.BusinessWhereInput] : []),
  ];
}

/** The part of a listing the publication rule looks at (SRS BUS 002). */
type BlockerFields = Pick<Business, 'name' | 'slug' | 'description' | 'eligibilityVerifiedAt' | 'contentRightsReviewedAt' | 'publicPhone' | 'publicEmail' | 'publicUrl' | 'privateEnquiryEmailEncrypted'> & {
  primaryCategory: Pick<Category, 'active'>;
  localArea: Pick<LocalArea, 'active'>;
};

const stale = () => new ConflictException({ code: 'STALE_VERSION', message: 'This listing was changed by someone else. Reload and try again.' });
const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Listing not found' });
const validation = (field: string, message: string) => new HttpException({ code: 'VALIDATION_ERROR', message, fields: { [field]: [message] } }, HttpStatus.BAD_REQUEST);
const validationFields = (fields: Record<string, string[]>) => new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields }, HttpStatus.BAD_REQUEST);

/** publicPhone must be a real Australian number so the public "Call" action is a valid tel link (SRS BUS 003). */
function phoneOrThrow(value: string | null | undefined): { publicPhone: string | null; normalizedPhone: string | null } {
  if (!value) return { publicPhone: null, normalizedPhone: null };
  const parsed = parseAustralianPhone(value);
  if (!parsed) throw validation('publicPhone', 'Enter an Australian phone number (landline, mobile, 13, 1300 or 1800)');
  return { publicPhone: parsed.display, normalizedPhone: normalisePhone(parsed.national) };
}

/** Field error rather than a 500 when the year is out of range. */
function establishedYearOrThrow(year: number | null | undefined): number | null {
  try {
    return validateEstablishedYear(year);
  } catch (error) {
    if (error instanceof EstablishedYearError) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { establishedYear: [error.message] } }, HttpStatus.BAD_REQUEST);
    }
    throw error;
  }
}

function websiteOrThrow(value: string | null | undefined): string | null {
  if (!value) return null;
  const url = validatePublicUrl(value);
  if (!url) throw validation('publicUrl', 'Website must be a full http(s) URL without credentials');
  return url;
}

function linksOrThrow(links: { kind: string; url: string; label?: string | null }[] | undefined) {
  const { errors, normalised } = validateLinks((links ?? []) as Parameters<typeof validateLinks>[0]);
  if (Object.keys(errors).length > 0) throw validationFields(errors);
  return normalised;
}

/**
 * DirectoryModule (SRS MOD 001): owns listing eligibility, publication and
 * versioned edits. Public projections come in Phase 14; this service is the
 * only writer of business rows.
 */
@Injectable()
export class DirectoryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly encryption: FieldEncryptionService,
    private readonly taxonomy: TaxonomyService,
    private readonly redirects: RedirectsService,
    private readonly cache: CacheService,
    private readonly storage: ObjectStoragePort,
  ) {
    // Taxonomy terms in use by active (non-archived) listings cannot be
    // deactivated (SRS BUS 007), and the admin lists show the same number. One
    // implementation answers both, grouped so a page of terms costs a fixed
    // number of queries.
    this.taxonomy.referenceCounts = async (kind, ids) => {
      const counts = new Map<string, number>();
      if (ids.length === 0) return counts;
      const db = await this.database.client();
      const active: BusinessStatus[] = ['draft', 'published'];
      const add = (id: string | null, n: number) => {
        if (id) counts.set(id, (counts.get(id) ?? 0) + n);
      };
      if (kind === 'category') {
        // A listing has one primary category and any number of additional
        // ones; both count as using the term.
        const [primary, secondary] = await Promise.all([
          db.business.groupBy({ by: ['primaryCategoryId'], where: { primaryCategoryId: { in: ids }, status: { in: active } }, _count: { _all: true } }),
          db.businessCategory.groupBy({ by: ['categoryId'], where: { categoryId: { in: ids }, business: { status: { in: active } } }, _count: { _all: true } }),
        ]);
        for (const row of primary) add(row.primaryCategoryId, row._count._all);
        for (const row of secondary) add(row.categoryId, row._count._all);
        return counts;
      }
      if (kind === 'service') {
        const rows = await db.businessService.groupBy({ by: ['serviceId'], where: { serviceId: { in: ids }, business: { status: { in: active } } }, _count: { _all: true } });
        for (const row of rows) add(row.serviceId, row._count._all);
        return counts;
      }
      const rows = await db.business.groupBy({ by: ['localAreaId'], where: { localAreaId: { in: ids }, status: { in: active } }, _count: { _all: true } });
      for (const row of rows) add(row.localAreaId, row._count._all);
      return counts;
    };
  }

  // ---- projections ----------------------------------------------------------

  /** A share image must exist and be processed before a listing can use it (SRS MED 004). */
  private async assertShareImage(id: string | null | undefined): Promise<void> {
    if (!id) return;
    const db = await this.database.client();
    const asset = await db.mediaAsset.findUnique({ where: { id }, select: { status: true } });
    if (!asset || asset.status !== 'ready') throw validation('ogImageMediaId', asset ? 'That image is still being processed' : 'Choose an image from the media library');
  }

  /** What the editor shows for the chosen share image. */
  private async shareImagePreview(id: string | null): Promise<BusinessImagePreviewDto | null> {
    if (!id) return null;
    const db = await this.database.client();
    const asset = await db.mediaAsset.findUnique({ where: { id }, include: { variants: true } });
    const variant = asset?.variants.find((v) => v.kind === 'card') ?? asset?.variants[0];
    return asset && variant ? { id: asset.id, url: this.storage.publicUrl(variant.objectKey), alt: asset.altText ?? '' } : null;
  }

  private async toDto(row: BusinessRow, includePrivate: boolean): Promise<BusinessDto> {
    const duplicateWarnings = await this.findDuplicates(row.id, row.normalizedName, row.normalizedPhone, row.address);
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      status: row.status,
      primaryCategoryId: row.primaryCategoryId,
      secondaryCategoryIds: row.categories.map((c) => c.categoryId).sort(),
      serviceIds: row.services.map((s) => s.serviceId).sort(),
      localAreaId: row.localAreaId,
      publicPhone: row.publicPhone,
      publicEmail: row.publicEmail,
      publicUrl: row.publicUrl,
      telHref: parseAustralianPhone(row.publicPhone ?? '')?.telHref ?? null,
      links: row.links.map((l) => ({ kind: l.kind, url: l.url, label: l.label })),
      hoursMode: row.hoursMode,
      addressVisibility: row.addressVisibility,
      address: row.address ? { line1: row.address.line1, line2: row.address.line2, suburb: row.address.suburb, postcode: row.address.postcode, latitude: row.address.latitude === null ? null : Number(row.address.latitude), longitude: row.address.longitude === null ? null : Number(row.address.longitude) } : null,
      ...(includePrivate ? { privateEnquiryEmail: row.privateEnquiryEmailEncrypted ? this.encryption.decrypt(row.privateEnquiryEmailEncrypted, row.id) : null } : {}),
      hasPrivateEnquiryEmail: row.privateEnquiryEmailEncrypted !== null,
      establishedYear: row.establishedYear,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoKeywords: row.seoKeywords,
      ogImageMediaId: row.ogImageMediaId,
      ogImage: await this.shareImagePreview(row.ogImageMediaId),
      eligibilitySource: row.eligibilitySource,
      eligibilityVerifiedAt: row.eligibilityVerifiedAt?.toISOString() ?? null,
      contentRightsReviewedAt: row.contentRightsReviewedAt?.toISOString() ?? null,
      contentRightsNote: row.contentRightsNote,
      duplicateOverrideReason: row.duplicateOverrideReason,
      duplicateWarnings,
      publicationBlockers: this.blockersFor(row),
      firstPublishedAt: row.firstPublishedAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Takes only the fields the rule reads, so the list can ask without loading a full record. */
  private blockersFor(row: BlockerFields): string[] {
    return publicationBlockers({
      name: row.name,
      slug: row.slug,
      description: row.description,
      primaryCategoryActive: row.primaryCategory.active,
      localAreaActive: row.localArea.active,
      eligibilityVerifiedAt: row.eligibilityVerifiedAt,
      contentRightsReviewedAt: row.contentRightsReviewedAt,
      publicPhone: row.publicPhone,
      publicEmail: row.publicEmail,
      publicUrl: row.publicUrl,
      hasPrivateEnquiryEmail: row.privateEnquiryEmailEncrypted !== null,
    });
  }

  async findDuplicates(selfId: string | null, normalizedName: string, normalizedPhone: string | null, address: Pick<BusinessAddress, 'line1' | 'postcode'> | null): Promise<DuplicateWarningDto[]> {
    const db = await this.database.client();
    const candidates = await db.business.findMany({
      where: { normalizedName, status: { not: 'archived' }, ...(selfId ? { id: { not: selfId } } : {}) },
      include: { address: true },
      take: 10,
    });
    const myAddress = normaliseAddressKey(address);
    return candidates.map((c) => {
      const match: DuplicateWarningDto['match'] =
        myAddress && normaliseAddressKey(c.address) === myAddress ? 'name_and_address' : normalizedPhone && c.normalizedPhone === normalizedPhone ? 'name_and_phone' : 'name';
      return { businessId: c.id, name: c.name, slug: c.slug, match };
    });
  }

  // ---- list / get -----------------------------------------------------------

  async list(q: ListBusinessesQueryDto): Promise<{ data: BusinessListItemDto[]; meta: ReturnType<typeof collectionMeta> }> {
    const db = await this.database.client();
    const now = new Date();
    const where: Prisma.BusinessWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.categoryId ? { OR: [{ primaryCategoryId: q.categoryId }, { categories: { some: { categoryId: q.categoryId } } }] } : {}),
      ...(q.localAreaId ? { localAreaId: q.localAreaId } : {}),
      ...(q.q ? { AND: [{ OR: searchTerms(q.q) }] } : {}),
      // "Featured" means a placement covering this moment, the same window the
      // public block uses (SRS DIR 007) — not merely "has ever been featured".
      ...(q.featured ? { featuredPlacements: { [q.featured === 'yes' ? 'some' : 'none']: currentPlacement(now) } } : {}),
    };
    const [total, rows] = await Promise.all([
      db.business.count({ where }),
      // Only what the list shows or computes from: the gallery, links, services
      // and secondary categories are a detail-screen concern.
      db.business.findMany({
        where,
        include: listInclude,
        orderBy: [{ [q.sort]: q.order }, { id: 'asc' }],
        skip: skipFor(q.page, q.pageSize),
        take: q.pageSize,
      }),
    ]);

    // Two queries for the whole page rather than two per row: a page of 20 used
    // to cost 20 duplicate lookups on its own.
    const [duplicateNames, featuredIds] = await Promise.all([this.duplicateNamesAmong(rows), this.featuredNow(rows.map((row) => row.id), now)]);

    const data = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      primaryCategoryId: row.primaryCategoryId,
      primaryCategoryName: row.primaryCategory.name,
      localAreaId: row.localAreaId,
      localAreaName: row.localArea.name,
      suburb: row.address?.suburb ?? null,
      featuredNow: featuredIds.has(row.id),
      publishable: this.blockersFor(row).length === 0,
      duplicateFlagged: row.status !== 'archived' && duplicateNames.has(row.normalizedName),
      firstPublishedAt: row.firstPublishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
    }));
    return { data, meta: collectionMeta(q.page, q.pageSize, total) };
  }

  /** Normalised names that more than one live listing uses, for the page's rows. */
  private async duplicateNamesAmong(rows: { normalizedName: string; status: string }[]): Promise<Set<string>> {
    const names = [...new Set(rows.filter((row) => row.status !== 'archived').map((row) => row.normalizedName))];
    if (names.length === 0) return new Set();
    const db = await this.database.client();
    const counts = await db.business.groupBy({ by: ['normalizedName'], where: { normalizedName: { in: names }, status: { not: 'archived' } }, _count: { _all: true } });
    return new Set(counts.filter((row) => row._count._all > 1).map((row) => row.normalizedName));
  }

  /** Which of these listings have a featured placement in force right now. */
  private async featuredNow(ids: string[], now: Date): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const db = await this.database.client();
    const placements = await db.featuredPlacement.findMany({ where: { businessId: { in: ids }, ...currentPlacement(now) }, select: { businessId: true } });
    return new Set(placements.map((placement) => placement.businessId));
  }

  async get(id: string, actor: AdminPrincipal): Promise<BusinessDto> {
    const db = await this.database.client();
    const row = await db.business.findUnique({ where: { id }, include });
    if (!row) throw notFound();
    return this.toDto(row, actor.permissions.includes('listings.update'));
  }

  // ---- create / update -----------------------------------------------------

  async create(input: CreateBusinessDto, actor: AdminPrincipal, ctx: RequestContext): Promise<BusinessDto> {
    const db = await this.database.client();
    const slug = input.slug ?? slugify(input.name);
    if (!isValidSlug(slug)) throw validation('slug', 'Slug must be lowercase letters, numbers and single hyphens');
    if (isReservedBusinessSlug(slug)) throw validation('slug', 'That slug is reserved by a curated page address');
    if (await db.business.findUnique({ where: { slug } })) throw new ConflictException({ code: 'SLUG_IN_USE', message: 'That slug is already used', fields: { slug: ['That slug is already used'] } });
    await this.assertTaxonomy(input.primaryCategoryId, input.secondaryCategoryIds ?? [], input.serviceIds ?? [], input.localAreaId);
    const phone = phoneOrThrow(input.publicPhone);
    const publicUrl = websiteOrThrow(input.publicUrl);
    const links = linksOrThrow(input.links);
    await this.assertShareImage(input.ogImageMediaId);
    const now = new Date();
    const row = await db.$transaction(async (tx) => {
      const created = await tx.business.create({
        data: {
          name: input.name,
          normalizedName: normaliseBusinessName(input.name),
          slug,
          description: input.description,
          primaryCategoryId: input.primaryCategoryId,
          localAreaId: input.localAreaId,
          ...phone,
          publicEmail: input.publicEmail?.toLowerCase() ?? null,
          publicUrl,
          links: { create: links },
          addressVisibility: input.addressVisibility ?? 'full',
          establishedYear: establishedYearOrThrow(input.establishedYear),
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
          seoKeywords: input.seoKeywords ?? null,
          ogImageMediaId: input.ogImageMediaId ?? null,
          eligibilitySource: input.eligibilitySource ?? null,
          eligibilityVerifiedAt: input.eligibilitySource ? now : null,
          contentRightsReviewedAt: input.contentRightsReviewed ? now : null,
          contentRightsNote: input.contentRightsNote ?? null,
          categories: { create: (input.secondaryCategoryIds ?? []).filter((c) => c !== input.primaryCategoryId).map((categoryId) => ({ categoryId })) },
          services: { create: (input.serviceIds ?? []).map((serviceId) => ({ serviceId })) },
          rating: { create: {} },
          ...(input.address ? { address: { create: this.addressData(input.address) } } : {}),
        },
      });
      if (input.privateEnquiryEmail) {
        await tx.business.update({ where: { id: created.id }, data: { privateEnquiryEmailEncrypted: this.encryption.encrypt(input.privateEnquiryEmail.toLowerCase(), created.id) } });
      }
      return tx.business.findUniqueOrThrow({ where: { id: created.id }, include });
    });
    await this.audit.record({ action: 'listing.create', actorAdminId: actor.id, targetType: 'business', targetId: row.id, metadata: { slug }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row, true);
  }

  async update(id: string, input: UpdateBusinessDto, actor: AdminPrincipal, ctx: RequestContext): Promise<BusinessDto> {
    const db = await this.database.client();
    const current = await db.business.findUnique({ where: { id }, include });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    if (current.status === 'archived') throw new ConflictException({ code: 'INVALID_STATE', message: 'Restore the listing before editing it' });
    const data: Prisma.BusinessUncheckedUpdateInput = {};
    const changed: string[] = [];
    if (input.name !== undefined && input.name !== current.name) {
      data.name = input.name;
      data.normalizedName = normaliseBusinessName(input.name);
      changed.push('name');
    }
    if (input.slug !== undefined && input.slug !== current.slug) {
      if (!isValidSlug(input.slug)) throw validation('slug', 'Slug must be lowercase letters, numbers and single hyphens');
      if (isReservedBusinessSlug(input.slug)) throw validation('slug', 'That slug is reserved by a curated page address');
      if (current.firstPublishedAt) throw new ConflictException({ code: 'SLUG_LOCKED', message: 'The slug of a published listing changes through the slug-change endpoint, which creates a redirect' });
      if (await db.business.findUnique({ where: { slug: input.slug } })) throw new ConflictException({ code: 'SLUG_IN_USE', message: 'That slug is already used', fields: { slug: ['That slug is already used'] } });
      data.slug = input.slug;
      changed.push('slug');
    }
    if (input.description !== undefined) { data.description = input.description; changed.push('description'); }
    if (input.primaryCategoryId !== undefined || input.secondaryCategoryIds !== undefined || input.serviceIds !== undefined || input.localAreaId !== undefined) {
      await this.assertTaxonomy(input.primaryCategoryId ?? current.primaryCategoryId, input.secondaryCategoryIds ?? current.categories.map((c) => c.categoryId), input.serviceIds ?? current.services.map((s) => s.serviceId), input.localAreaId ?? current.localAreaId);
    }
    if (input.primaryCategoryId !== undefined) { data.primaryCategoryId = input.primaryCategoryId; changed.push('primaryCategoryId'); }
    if (input.localAreaId !== undefined) { data.localAreaId = input.localAreaId; changed.push('localAreaId'); }
    if (input.publicPhone !== undefined) { Object.assign(data, phoneOrThrow(input.publicPhone)); changed.push('publicPhone'); }
    if (input.publicEmail !== undefined) { data.publicEmail = input.publicEmail?.toLowerCase() ?? null; changed.push('publicEmail'); }
    if (input.publicUrl !== undefined) { data.publicUrl = websiteOrThrow(input.publicUrl); changed.push('publicUrl'); }
    const links = input.links !== undefined ? linksOrThrow(input.links) : undefined;
    if (input.addressVisibility !== undefined) { data.addressVisibility = input.addressVisibility; changed.push('addressVisibility'); }
    if (input.privateEnquiryEmail !== undefined) { data.privateEnquiryEmailEncrypted = input.privateEnquiryEmail ? this.encryption.encrypt(input.privateEnquiryEmail.toLowerCase(), id) : null; changed.push('privateEnquiryEmail'); }
    if (input.establishedYear !== undefined) { data.establishedYear = establishedYearOrThrow(input.establishedYear); changed.push('establishedYear'); }
    if (input.seoTitle !== undefined) { data.seoTitle = input.seoTitle; changed.push('seoTitle'); }
    if (input.seoDescription !== undefined) { data.seoDescription = input.seoDescription; changed.push('seoDescription'); }
    if (input.seoKeywords !== undefined) { data.seoKeywords = input.seoKeywords; changed.push('seoKeywords'); }
    if (input.ogImageMediaId !== undefined) { await this.assertShareImage(input.ogImageMediaId); data.ogImageMediaId = input.ogImageMediaId; changed.push('ogImageMediaId'); }
    if (input.eligibilitySource !== undefined) { data.eligibilitySource = input.eligibilitySource; data.eligibilityVerifiedAt = input.eligibilitySource ? new Date() : null; changed.push('eligibility'); }
    if (input.contentRightsReviewed !== undefined) { data.contentRightsReviewedAt = input.contentRightsReviewed ? (current.contentRightsReviewedAt ?? new Date()) : null; changed.push('contentRights'); }
    if (input.contentRightsNote !== undefined) { data.contentRightsNote = input.contentRightsNote; changed.push('contentRightsNote'); }

    const primaryId = input.primaryCategoryId ?? current.primaryCategoryId;
    const row = await db.$transaction(async (tx) => {
      const result = await tx.business.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (result.count !== 1) throw stale();
      if (input.secondaryCategoryIds !== undefined) {
        await tx.businessCategory.deleteMany({ where: { businessId: id } });
        await tx.businessCategory.createMany({ data: [...new Set(input.secondaryCategoryIds)].filter((c) => c !== primaryId).map((categoryId) => ({ businessId: id, categoryId })) });
        changed.push('secondaryCategories');
      } else if (input.primaryCategoryId !== undefined) {
        await tx.businessCategory.deleteMany({ where: { businessId: id, categoryId: primaryId } });
      }
      if (input.serviceIds !== undefined) {
        await tx.businessService.deleteMany({ where: { businessId: id } });
        await tx.businessService.createMany({ data: [...new Set(input.serviceIds)].map((serviceId) => ({ businessId: id, serviceId })) });
        changed.push('services');
      }
      if (links !== undefined) {
        await tx.businessLink.deleteMany({ where: { businessId: id } });
        if (links.length > 0) await tx.businessLink.createMany({ data: links.map((l) => ({ businessId: id, ...l })) });
        changed.push('links');
      }
      if (input.address !== undefined) {
        if (input.address === null) await tx.businessAddress.deleteMany({ where: { businessId: id } });
        else await tx.businessAddress.upsert({ where: { businessId: id }, create: { businessId: id, ...this.addressData(input.address) }, update: this.addressData(input.address) });
        changed.push('address');
      }
      // A published listing's page, cards and search results show these fields.
      if (current.status === 'published') {
        await this.cache.recordInvalidation(tx, { resourceType: 'business', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.businesses, CACHE_TAGS.business(current.slug), CACHE_TAGS.sitemap] });
      }
      return tx.business.findUniqueOrThrow({ where: { id }, include });
    });
    if (current.status === 'published') await this.cache.bumpNamespace();
    await this.audit.record({ action: 'listing.update', actorAdminId: actor.id, targetType: 'business', targetId: id, metadata: { fields: changed.join(',') }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row, true);
  }

  /**
   * Changes the public slug of a listing and, when it has been published,
   * leaves a 301 from the old path in the same transaction (SRS SEO 004).
   */
  async changeSlug(id: string, input: ChangeSlugDto, actor: AdminPrincipal, ctx: RequestContext): Promise<BusinessDto> {
    const db = await this.database.client();
    const current = await db.business.findUnique({ where: { id }, include });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    if (current.status === 'archived') throw new ConflictException({ code: 'INVALID_STATE', message: 'Restore the listing before changing its slug' });
    const slug = input.slug.trim().toLowerCase();
    if (!isValidSlug(slug)) throw validation('slug', 'Slug must be lowercase letters, numbers and single hyphens');
    if (isReservedBusinessSlug(slug)) throw validation('slug', 'That slug is reserved by a curated page address');
    if (slug === current.slug) throw validation('slug', 'That is already the slug of this listing');
    if (await db.business.findUnique({ where: { slug } })) throw new ConflictException({ code: 'SLUG_IN_USE', message: 'That slug is already used', fields: { slug: ['That slug is already used'] } });
    const row = await db.$transaction(async (tx) => {
      const result = await tx.business.updateMany({ where: { id, version: input.expectedVersion }, data: { slug, version: { increment: 1 } } });
      if (result.count !== 1) throw stale();
      // A listing that was never public has no indexed URL to preserve.
      if (current.firstPublishedAt) {
        await this.redirects.recordSlugChange(tx, { sourcePath: `/business/${current.slug}`, targetPath: `/business/${slug}`, resourceType: 'business', resourceId: id, actorAdminId: actor.id, reason: input.reason ?? null });
      }
      await this.cache.recordInvalidation(tx, {
        resourceType: 'business',
        resourceId: id,
        urgent: true,
        correlationId: ctx.requestId,
        tags: [CACHE_TAGS.businesses, CACHE_TAGS.business(current.slug), CACHE_TAGS.business(slug), CACHE_TAGS.sitemap, CACHE_TAGS.redirects],
      });
      return tx.business.findUniqueOrThrow({ where: { id }, include });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'listing.slug.change', actorAdminId: actor.id, targetType: 'business', targetId: id, reason: input.reason ?? null, metadata: { from: current.slug, to: slug, redirect: current.firstPublishedAt ? 'created' : 'none' }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row, true);
  }

  // ---- explicit state transitions (SRS BUS 006) ------------------------------

  async transition(id: string, action: keyof typeof TRANSITIONS, input: BusinessStateDto, actor: AdminPrincipal, ctx: RequestContext): Promise<BusinessDto> {
    const db = await this.database.client();
    const current = await db.business.findUnique({ where: { id }, include });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    const rule = TRANSITIONS[action];
    if (!rule.from.includes(current.status)) throw new ConflictException({ code: 'INVALID_STATE', message: `Cannot ${action} a ${current.status} listing` });
    const data: Prisma.BusinessUncheckedUpdateInput = { status: rule.to };
    const now = new Date();
    if (action === 'publish') {
      const blockers = this.blockersFor(current);
      if (blockers.length > 0) throw new HttpException({ code: 'PUBLICATION_BLOCKED', message: 'The listing does not meet the publication requirements', fields: { publication: blockers } }, HttpStatus.CONFLICT);
      const duplicates = await this.findDuplicates(current.id, current.normalizedName, current.normalizedPhone, current.address);
      if (duplicates.length > 0 && !input.duplicateOverrideReason) {
        throw new HttpException({ code: 'DUPLICATE_SUSPECTED', message: 'This listing looks like a duplicate; provide an override reason to publish it anyway', fields: { duplicateOverrideReason: duplicates.map((d) => `${d.name} (${d.slug}): ${d.match.replace(/_/g, ' ')}`) } }, HttpStatus.CONFLICT);
      }
      if (duplicates.length > 0) data.duplicateOverrideReason = input.duplicateOverrideReason;
      data.publishedAt = now;
      if (!current.firstPublishedAt) data.firstPublishedAt = now;
    }
    if (action === 'unpublish') data.publishedAt = null;
    if (action === 'archive') { data.archivedAt = now; data.publishedAt = null; }
    if (action === 'restore') data.archivedAt = null;
    await db.$transaction(async (tx) => {
      const result = await tx.business.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (result.count !== 1) throw stale();
      // Publication changes are urgent purges: an unpublished listing must stop
      // being served within the CACHE 002 window, not when a TTL expires.
      await this.cache.recordInvalidation(tx, {
        resourceType: 'business',
        resourceId: id,
        urgent: action !== 'publish',
        correlationId: ctx.requestId,
        tags: [CACHE_TAGS.businesses, CACHE_TAGS.business(current.slug), CACHE_TAGS.sitemap, CACHE_TAGS.taxonomy],
      });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: `listing.${action}`, actorAdminId: actor.id, targetType: 'business', targetId: id, reason: input.reason ?? input.duplicateOverrideReason ?? null, metadata: { from: current.status, to: rule.to }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.get(id, actor);
  }

  // ---- helpers --------------------------------------------------------------

  private addressData(a: NonNullable<CreateBusinessDto['address']>) {
    return { line1: a.line1, line2: a.line2 ?? null, suburb: a.suburb, postcode: a.postcode, latitude: a.latitude ?? null, longitude: a.longitude ?? null };
  }

  private async assertTaxonomy(primaryCategoryId: string, secondaryCategoryIds: string[], serviceIds: string[], localAreaId: string): Promise<void> {
    const db = await this.database.client();
    const primary = await db.category.findUnique({ where: { id: primaryCategoryId } });
    if (!primary || !primary.active) throw validation('primaryCategoryId', 'Choose an active category');
    const secondary = [...new Set(secondaryCategoryIds)].filter((c) => c !== primaryCategoryId);
    if (secondary.length) {
      const found = await db.category.count({ where: { id: { in: secondary }, active: true } });
      if (found !== secondary.length) throw validation('secondaryCategoryIds', 'All secondary categories must exist and be active');
    }
    const services = [...new Set(serviceIds)];
    if (services.length) {
      const found = await db.service.count({ where: { id: { in: services }, active: true } });
      if (found !== services.length) throw validation('serviceIds', 'All services must exist and be active');
    }
    const area = await db.localArea.findUnique({ where: { id: localAreaId } });
    if (!area || !area.active) throw validation('localAreaId', 'Choose an approved, active local area');
  }

  /** Guard helper used by the controller for write actions. */
  static assertCan(actor: AdminPrincipal, permission: 'listings.update' | 'listings.publish'): void {
    if (!actor.permissions.includes(permission)) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have permission to do that' });
  }
}
