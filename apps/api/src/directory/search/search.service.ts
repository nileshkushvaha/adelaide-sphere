import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type BusinessAddress, type DatabaseClient, type BusinessLink, type Category, type HoursException, type LocalArea, type OpeningInterval } from '@adelaide-sphere/database';
import { CacheService } from '../../cache/cache.service.js';
import { DatabaseService } from '../../database/database.service.js';
import { ObjectStoragePort } from '../../media/storage.port.js';
import { parseAustralianPhone } from '../business-rules.js';
import { evaluateHours } from '../hours/hours-rules.js';
import { localDateKey, adelaideMinuteKey, toLocal } from '../hours/adelaide-time.js';
import { scheduleFromRows } from '../hours/hours.service.js';
import { MAX_RESULT_WINDOW, type PublicBusinessCardDto, type PublicBusinessDetailDto, type PublicRatingBucketDto, type SearchBusinessesQueryDto, type SearchFacetDto, type SearchMetaDto } from '../dto/public-business.dto.js';
import { directionsUrl, effectiveSort, escapeLike, normaliseQuery, ratingAverage } from './search-rules.js';
import { HOURS_COVERAGE_SQL, openNowAvailable, openNowSql, type OpenNowAvailability } from '../hours/open-now.js';

const cardInclude = {
  primaryCategory: { select: { name: true, slug: true } },
  localArea: { select: { name: true, slug: true } },
  rating: { select: { approvedCount: true, ratingSum: true } },
  // Ordered in `galleryOf` below: cover first, then gallery order.
  media: { include: { media: { include: { variants: true } } } },
} as const;

type CardRow = Prisma.BusinessGetPayload<{ include: typeof cardInclude }>;

const detailInclude = {
  ...cardInclude,
  categories: { include: { category: { select: { name: true, slug: true, active: true } } } },
  services: { include: { service: { select: { name: true, slug: true, active: true, icon: true } } } },
  address: true,
  links: { orderBy: { sortOrder: 'asc' } },
  openingHours: true,
  hoursExceptions: true,
} as const;

type DetailRow = Prisma.BusinessGetPayload<{ include: typeof detailInclude }>;

const RELATED_LIMIT = 4;

/** SRS DIR 007: at most three featured entries per query. */
const FEATURED_LIMIT = 3;

/** SRS CACHE 001: search results stay fresh within 30 seconds. */
const SEARCH_CACHE_SECONDS = 30;

/** SRS CACHE 001: listing detail stays fresh within five minutes. */
const DETAIL_CACHE_SECONDS = 300;

/**
 * SearchService (SRS DIR 002–005, ARC 002): the only reader of published
 * listings for the public surface. Keyword matching uses indexed name prefix
 * and bounded LIKE fallbacks over public fields only (name, category, service
 * and synonym labels, description); private fields are never searched.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStoragePort,
    private readonly cache: CacheService,
  ) {}

  async search(query: SearchBusinessesQueryDto): Promise<{ data: PublicBusinessCardDto[]; meta: SearchMetaDto }> {
    // Query results are cached for 30 s under the publication namespace, and the
    // key carries every input that changes the answer (SRS CACHE 001/003).
    // "Open now" answers change with the clock, so its key carries the Adelaide
    // minute the answer is for; without that a cached page would claim a shop is
    // open after it has closed (SRS DIR 008, CACHE 001).
    const minuteStamp = query.openNow ? adelaideMinuteKey(new Date()) : '';
    const key = `search:${JSON.stringify([query.q ?? '', query.category ?? '', query.area ?? '', query.minRating ?? '', query.sort ?? '', query.page, query.pageSize, query.openNow ? 'open' : '', minuteStamp])}`;
    return this.cache.getOrSet(key, SEARCH_CACHE_SECONDS, () => this.runSearch(query));
  }

  private async runSearch(query: SearchBusinessesQueryDto): Promise<{ data: PublicBusinessCardDto[]; meta: SearchMetaDto }> {
    const db = await this.database.client();
    const { page, pageSize } = query;
    if (page * pageSize > MAX_RESULT_WINDOW) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: `Results are limited to the first ${MAX_RESULT_WINDOW}`, fields: { page: [`page × pageSize must not exceed ${MAX_RESULT_WINDOW}`] } }, HttpStatus.BAD_REQUEST);
    }
    const q = normaliseQuery(query.q);
    const sort = effectiveSort(query.sort, q);
    const emptyMeta = (): SearchMetaDto => ({
      page,
      pageSize,
      total: 0,
      pageCount: 1,
      sort,
      facets: { categories: [], areas: [] },
      featured: [],
      // An unknown slug matches nothing; it says nothing about hours coverage.
      openNow: { available: false, applied: false, withHours: 0, published: 0 },
    });

    // Unknown slugs are valid input that matches nothing (DIR 005).
    let categoryIds: string[] | null = null;
    if (query.category) {
      const category = await db.category.findFirst({ where: { slug: query.category, active: true }, select: { id: true } });
      if (!category) return { data: [], meta: emptyMeta() };
      const children = await db.category.findMany({ where: { parentId: category.id, active: true }, select: { id: true } });
      categoryIds = [category.id, ...children.map((c) => c.id)];
    }
    let areaId: string | null = null;
    if (query.area) {
      const area = await db.localArea.findFirst({ where: { slug: query.area, active: true }, select: { id: true } });
      if (!area) return { data: [], meta: emptyMeta() };
      areaId = area.id;
    }

    const like = q ? `%${escapeLike(q)}%` : null;
    const prefix = q ? `${escapeLike(q)}%` : null;
    const labelMatch = like
      ? Prisma.sql`(c.name LIKE ${like}
          OR EXISTS (SELECT 1 FROM business_categories bc JOIN categories c2 ON c2.id = bc.categoryId WHERE bc.businessId = b.id AND c2.active = 1 AND c2.name LIKE ${like})
          OR EXISTS (SELECT 1 FROM business_services bs JOIN services s ON s.id = bs.serviceId LEFT JOIN service_synonyms ss ON ss.serviceId = s.id WHERE bs.businessId = b.id AND s.active = 1 AND (s.name LIKE ${like} OR ss.term LIKE ${like})))`
      : Prisma.sql`0`;
    const keywordWhere = like ? Prisma.sql`AND (b.name LIKE ${like} OR ${labelMatch} OR b.description LIKE ${like})` : Prisma.empty;
    const categoryWhere = (ids: string[] | null) =>
      ids ? Prisma.sql`AND (b.primaryCategoryId IN (${Prisma.join(ids)}) OR EXISTS (SELECT 1 FROM business_categories bcf WHERE bcf.businessId = b.id AND bcf.categoryId IN (${Prisma.join(ids)})))` : Prisma.empty;
    const areaWhere = (id: string | null) => (id ? Prisma.sql`AND b.localAreaId = ${id}` : Prisma.empty);
    const ratingWhere = query.minRating ? Prisma.sql`AND r.approvedCount > 0 AND r.ratingSum >= ${query.minRating} * r.approvedCount` : Prisma.empty;
    // "Open now" is conditional (SRS DIR 008): it is applied only when published
    // hours coverage supports it. Below the threshold the request is answered
    // unfiltered and `meta.openNow.available` says why, rather than returning a
    // short list that looks like "nothing is open".
    const coverage = await this.openNowCoverage(db);
    const openNowApplied = query.openNow === true && coverage.available;
    const openNowWhere = openNowApplied ? openNowSql(new Date()) : Prisma.empty;
    const from = Prisma.sql`FROM businesses b JOIN categories c ON c.id = b.primaryCategoryId LEFT JOIN business_ratings r ON r.businessId = b.id WHERE b.status = 'published'`;
    const whereAll = Prisma.sql`${from} ${keywordWhere} ${categoryWhere(categoryIds)} ${areaWhere(areaId)} ${ratingWhere} ${openNowWhere}`;

    const rank = like ? Prisma.sql`CASE WHEN b.name = ${q} THEN 0 WHEN b.name LIKE ${prefix} THEN 1 WHEN b.name LIKE ${like} THEN 2 WHEN ${labelMatch} THEN 3 ELSE 4 END` : Prisma.sql`0`;
    const orderBy = {
      relevance: Prisma.sql`ORDER BY ${rank} ASC, b.name ASC, b.id ASC`,
      rating: Prisma.sql`ORDER BY (COALESCE(r.approvedCount, 0) > 0) DESC, (r.ratingSum / NULLIF(r.approvedCount, 0)) DESC, r.approvedCount DESC, b.id ASC`,
      newest: Prisma.sql`ORDER BY b.firstPublishedAt DESC, b.id ASC`,
      name: Prisma.sql`ORDER BY b.name ASC, b.id ASC`,
    }[sort];

    // Featured block (SRS DIR 007): at most three eligible, matching listings,
    // chosen deterministically and identically on every page of this query.
    const now = new Date();
    const featuredRows = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT b.id ${whereAll} AND EXISTS (
          SELECT 1 FROM featured_placements fp
          WHERE fp.businessId = b.id AND fp.startsAt <= ${now} AND (fp.endsAt IS NULL OR fp.endsAt > ${now})
        )
        ORDER BY (SELECT MIN(fp2.position) FROM featured_placements fp2 WHERE fp2.businessId = b.id AND fp2.startsAt <= ${now} AND (fp2.endsAt IS NULL OR fp2.endsAt > ${now})) ASC, b.id ASC
        LIMIT ${FEATURED_LIMIT}`,
    );
    const featuredIds = featuredRows.map((row) => row.id);
    // Featured entries are removed from the organic set, its count and its pages.
    const organicWhere = featuredIds.length > 0 ? Prisma.sql`${whereAll} AND b.id NOT IN (${Prisma.join(featuredIds)})` : whereAll;

    const [idRows, countRows, categoryFacets, areaFacets] = await Promise.all([
      db.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT b.id ${organicWhere} ${orderBy} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
      db.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total ${organicWhere}`),
      // A business counts under its primary and every secondary category, the same
      // rule the category filter applies, so a facet's number is what clicking it shows.
      db.$queryRaw<{ id: string; count: bigint }[]>(
        Prisma.sql`SELECT x.categoryId AS id, COUNT(DISTINCT x.businessId) AS count FROM (
            SELECT b.id AS businessId, b.primaryCategoryId AS categoryId ${from} ${keywordWhere} ${areaWhere(areaId)} ${ratingWhere} ${openNowWhere}
            UNION ALL
            SELECT b.id AS businessId, bcx.categoryId AS categoryId FROM businesses b JOIN categories c ON c.id = b.primaryCategoryId LEFT JOIN business_ratings r ON r.businessId = b.id JOIN business_categories bcx ON bcx.businessId = b.id
            WHERE b.status = 'published' ${keywordWhere} ${areaWhere(areaId)} ${ratingWhere} ${openNowWhere}
          ) x GROUP BY x.categoryId`,
      ),
      db.$queryRaw<{ id: string; count: bigint }[]>(Prisma.sql`SELECT b.localAreaId AS id, COUNT(*) AS count ${from} ${keywordWhere} ${categoryWhere(categoryIds)} ${ratingWhere} ${openNowWhere} GROUP BY b.localAreaId`),
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    const ids = idRows.map((r) => r.id);
    const wanted = [...ids, ...featuredIds];
    const rows = wanted.length > 0 ? await db.business.findMany({ where: { id: { in: wanted } }, include: cardInclude }) : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const cardsFor = (list: string[]) => list.map((id) => byId.get(id)).filter((r): r is CardRow => r !== undefined).map((r) => this.toCard(r));
    const data = cardsFor(ids);
    const facets = { categories: await this.facetTerms('category', categoryFacets, db), areas: await this.facetTerms('area', areaFacets, db) };
    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        sort,
        facets,
        featured: cardsFor(featuredIds),
        openNow: { available: coverage.available, applied: openNowApplied, withHours: coverage.withHours, published: coverage.published },
      },
    };
  }

  /**
   * Hours coverage across published listings, which decides whether the
   * conditional "open now" filter is offered at all (SRS DIR 008). Cached for a
   * minute: it changes only when listings are published or their hours edited,
   * and it is read on every search.
   */
  private async openNowCoverage(db: DatabaseClient): Promise<OpenNowAvailability & { available: boolean }> {
    return this.cache.getOrSet('search:open-now-coverage', 60, async () => {
      const rows = await db.$queryRaw<{ published: bigint; withHours: bigint }[]>(
        Prisma.sql`SELECT COUNT(*) AS published, SUM(CASE WHEN ${HOURS_COVERAGE_SQL} THEN 1 ELSE 0 END) AS withHours
                   FROM businesses b WHERE b.status = 'published'`,
      );
      const published = Number(rows[0]?.published ?? 0);
      const withHours = Number(rows[0]?.withHours ?? 0);
      return { published, withHours, available: openNowAvailable(withHours, published) };
    });
  }

  async detailBySlug(slug: string, now = new Date()): Promise<PublicBusinessDetailDto> {
    // Detail pages have a five-minute freshness bound (SRS CACHE 001) and the
    // namespace retires them the moment publication state changes. Whether the
    // business is open is worked out again on every request from the cached
    // schedule, so a shop never shows "Open" for minutes after it has closed.
    const detail = await this.cache.getOrSet(`business:${slug}`, DETAIL_CACHE_SECONDS, () => this.loadDetail(slug, now));
    const schedule = { mode: detail.hours.mode, weekly: detail.hours.weekly, exceptions: detail.hours.exceptions } as unknown as Parameters<typeof evaluateHours>[0];
    return { ...detail, hours: { ...detail.hours, status: evaluateHours(schedule, now), evaluatedAt: now.toISOString() } };
  }

  private async loadDetail(slug: string, now: Date): Promise<PublicBusinessDetailDto> {
    const db = await this.database.client();
    const row = await db.business.findFirst({ where: { slug, status: 'published' }, include: detailInclude });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    const related = await this.related(row.id, row.primaryCategoryId, row.localAreaId);
    const [ratingBreakdown, shareImage] = await Promise.all([this.ratingBreakdown(row.id, db), this.shareImage(row.ogImageMediaId, db)]);
    return this.toDetail(row, related, now, ratingBreakdown, shareImage);
  }

  async relatedById(id: string): Promise<PublicBusinessCardDto[]> {
    const db = await this.database.client();
    const row = await db.business.findFirst({ where: { id, status: 'published' }, select: { id: true, primaryCategoryId: true, localAreaId: true } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    return this.related(row.id, row.primaryCategoryId, row.localAreaId);
  }

  /** BUS 005: same primary category, same area first, stable id order, at most four, never padded. */
  private async related(selfId: string, primaryCategoryId: string, localAreaId: string): Promise<PublicBusinessCardDto[]> {
    const db = await this.database.client();
    const base = { status: 'published' as const, primaryCategoryId, id: { not: selfId } };
    const sameArea = await db.business.findMany({ where: { ...base, localAreaId }, include: cardInclude, orderBy: { id: 'asc' }, take: RELATED_LIMIT });
    const remaining = RELATED_LIMIT - sameArea.length;
    const others = remaining > 0 ? await db.business.findMany({ where: { ...base, localAreaId: { not: localAreaId } }, include: cardInclude, orderBy: { id: 'asc' }, take: remaining }) : [];
    return [...sameArea, ...others].map((r) => this.toCard(r));
  }

  private async facetTerms(kind: 'category' | 'area', rows: { id: string; count: bigint }[], db: Awaited<ReturnType<DatabaseService['client']>>): Promise<SearchFacetDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const terms: Pick<Category | LocalArea, 'id' | 'name' | 'slug'>[] =
      kind === 'category'
        ? await db.category.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, name: true, slug: true } })
        : await db.localArea.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, name: true, slug: true } });
    const counts = new Map(rows.map((r) => [r.id, Number(r.count)]));
    return terms
      .map((t) => ({ slug: t.slug, name: t.name, count: counts.get(t.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'en-AU'));
  }

  /** Published gallery usages in display order: the cover first, then the stored order. */
  private galleryOf(row: CardRow) {
    return row.media
      .filter((usage) => usage.media.status === 'ready' && usage.media.variants.length > 0)
      .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder || a.mediaId.localeCompare(b.mediaId));
  }

  private toCard(row: CardRow): PublicBusinessCardDto {
    const average = row.rating ? ratingAverage(row.rating.ratingSum, row.rating.approvedCount) : null;
    const cover = this.galleryOf(row)[0];
    const card = cover?.media.variants.find((v) => v.kind === 'card') ?? cover?.media.variants[0];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      primaryCategory: { name: row.primaryCategory.name, slug: row.primaryCategory.slug },
      localArea: { name: row.localArea.name, slug: row.localArea.slug },
      rating: average === null || !row.rating ? null : { average, count: row.rating.approvedCount },
      image: card && cover ? { url: this.storage.publicUrl(card.objectKey), alt: cover.altOverride ?? cover.media.altText ?? '' } : null,
    };
  }

  /**
   * Approved-review counts per star (SRS REV 004). It is a grouped read rather
   * than a stored aggregate: the page of reviews a client renders is not the
   * whole set, so a distribution must never be inferred from it. Every bucket
   * is returned, zeros included, and an unrated listing gets an empty array.
   */
  private async ratingBreakdown(businessId: string, db: Awaited<ReturnType<DatabaseService['client']>>): Promise<PublicRatingBucketDto[]> {
    const rows = await db.review.groupBy({ by: ['rating'], where: { businessId, status: 'approved' }, _count: { _all: true } });
    if (rows.length === 0) return [];
    const counts = new Map(rows.map((row) => [row.rating, row._count._all]));
    return [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts.get(stars) ?? 0 }));
  }

  /** The share image an editor chose, at the largest processed size, for search and social cards (SRS SEO 001). */
  private async shareImage(id: string | null, db: Awaited<ReturnType<DatabaseService['client']>>): Promise<PublicBusinessDetailDto['shareImage']> {
    if (!id) return null;
    const asset = await db.mediaAsset.findUnique({ where: { id }, include: { variants: true } });
    if (!asset || asset.status !== 'ready') return null;
    const variant = asset.variants.find((v) => v.kind === 'hero') ?? asset.variants.find((v) => v.kind === 'card') ?? asset.variants[0];
    return variant ? { url: this.storage.publicUrl(variant.objectKey), alt: asset.altText ?? '', width: variant.width, height: variant.height } : null;
  }

  private toDetail(row: DetailRow, related: PublicBusinessCardDto[], now: Date, ratingBreakdown: PublicRatingBucketDto[], shareImage: PublicBusinessDetailDto['shareImage']): PublicBusinessDetailDto {
    const phone = row.publicPhone ? parseAustralianPhone(row.publicPhone) : null;
    const schedule = scheduleFromRows(row.hoursMode, row.openingHours as OpeningInterval[], row.hoursExceptions as HoursException[]);
    const todayKey = localDateKey(toLocal(now));
    const address: BusinessAddress | null = row.address;
    return {
      ...this.toCard(row),
      description: row.description,
      establishedYear: row.establishedYear,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      seoKeywords: row.seoKeywords,
      shareImage,
      secondaryCategories: row.categories.filter((c) => c.category.active).map((c) => ({ name: c.category.name, slug: c.category.slug })),
      services: row.services.filter((s) => s.service.active).map((s) => ({ name: s.service.name, slug: s.service.slug, icon: s.service.icon })),
      contact: { phone: phone ? { display: phone.display, telHref: phone.telHref } : null, email: row.publicEmail, website: row.publicUrl },
      links: (row.links as BusinessLink[]).map((l) => ({ kind: l.kind, url: l.url, label: l.label })),
      addressVisibility: row.addressVisibility,
      address:
        address && row.addressVisibility === 'full'
          ? (() => {
              const latitude = address.latitude === null ? null : Number(address.latitude);
              const longitude = address.longitude === null ? null : Number(address.longitude);
              return { line1: address.line1, line2: address.line2, suburb: address.suburb, postcode: address.postcode, latitude, longitude, directionsUrl: directionsUrl({ line1: address.line1, suburb: address.suburb, postcode: address.postcode, latitude, longitude }) };
            })()
          : null,
      ratingBreakdown,
      gallery: this.galleryOf(row)
        .map((usage) => ({
          alt: usage.altOverride ?? usage.media.altText ?? '',
          caption: usage.caption,
          isCover: usage.isCover,
          variants: usage.media.variants.slice().sort((a, b) => a.width - b.width).map((v) => ({ kind: v.kind, url: this.storage.publicUrl(v.objectKey), width: v.width, height: v.height })),
        })),
      hours: { mode: schedule.mode, weekly: schedule.weekly as PublicBusinessDetailDto['hours']['weekly'], exceptions: schedule.exceptions.filter((e) => e.date >= todayKey) as PublicBusinessDetailDto['hours']['exceptions'], status: evaluateHours(schedule, now), evaluatedAt: now.toISOString() },
      acceptsEnquiries: row.privateEnquiryEmailEncrypted !== null,
      firstPublishedAt: (row.firstPublishedAt ?? row.publishedAt ?? row.createdAt).toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      related,
    };
  }
}
