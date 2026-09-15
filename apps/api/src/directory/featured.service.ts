import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import type { CreateFeaturedPlacementDto, FeaturedPlacementDto, UpdateFeaturedPlacementDto } from './dto/featured.dto.js';
import { CacheService } from '../cache/cache.service.js';
import { CACHE_TAGS } from '@adelaide-sphere/domain';
import type { Prisma } from '@adelaide-sphere/database';

/** SRS DIR 007: at most three featured entries are ever shown for a query. */
export const FEATURED_LIMIT = 3;

const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Placement not found' });
const validation = (field: string, message: string) => new HttpException({ code: 'VALIDATION_ERROR', message, fields: { [field]: [message] } }, HttpStatus.BAD_REQUEST);

interface Row {
  id: string;
  businessId: string;
  position: number;
  startsAt: Date;
  endsAt: Date | null;
  note: string | null;
  createdByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
  business: { name: string; slug: string; status: string };
}

/**
 * Manual editorial featuring (SRS DIR 007). Placements never bypass matching,
 * geography or publication rules — the search query applies them on top of the
 * ordinary filters — and there are no payment fields anywhere (FUT 002).
 */
@Injectable()
export class FeaturedService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  async list(now = new Date()): Promise<FeaturedPlacementDto[]> {
    const db = await this.database.client();
    const rows = await db.featuredPlacement.findMany({
      orderBy: [{ position: 'asc' }, { startsAt: 'asc' }],
      include: { business: { select: { name: true, slug: true, status: true } } },
    });
    return rows.map((row) => this.toDto(row as Row, now));
  }

  async create(input: CreateFeaturedPlacementDto, actor: AdminPrincipal, ctx: RequestContext, now = new Date()): Promise<FeaturedPlacementDto> {
    const db = await this.database.client();
    const business = await db.business.findUnique({ where: { id: input.businessId }, select: { id: true, status: true, name: true } });
    if (!business) throw validation('businessId', 'That listing does not exist');
    // A draft or archived listing can be scheduled, but the block only ever
    // shows published, matching listings; make that explicit to the editor.
    if (business.status === 'archived') throw validation('businessId', 'An archived listing cannot be featured');
    const { startsAt, endsAt } = this.interval(input.startsAt, input.endsAt ?? null);

    // Featuring changes what the directory shows, so the cached results retire
    // with the change itself (SRS CACHE 001: feature events).
    const row = await db.$transaction(async (tx) => {
      await this.assertNoOverlap(tx, input.businessId, startsAt, endsAt);
      const created = await tx.featuredPlacement.create({
        data: { businessId: input.businessId, position: input.position ?? 0, startsAt, endsAt, note: input.note ?? null, createdByAdminId: actor.id },
        include: { business: { select: { name: true, slug: true, status: true } } },
      });
      await this.cache.recordInvalidation(tx, { resourceType: 'business', resourceId: input.businessId, correlationId: ctx.requestId, tags: [CACHE_TAGS.businesses, CACHE_TAGS.business(created.business.slug)] });
      return created;
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'listing.feature.create', actorAdminId: actor.id, targetType: 'business', targetId: input.businessId, reason: input.note ?? null, metadata: { placementId: row.id, startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row as Row, now);
  }

  async update(id: string, input: UpdateFeaturedPlacementDto, actor: AdminPrincipal, ctx: RequestContext, now = new Date()): Promise<FeaturedPlacementDto> {
    const db = await this.database.client();
    const current = await db.featuredPlacement.findUnique({ where: { id } });
    if (!current) throw notFound();
    const { startsAt, endsAt } = this.interval(input.startsAt ?? current.startsAt.toISOString(), input.endsAt === undefined ? (current.endsAt?.toISOString() ?? null) : input.endsAt);
    const row = await db.$transaction(async (tx) => {
      // The same check `create` runs. Without it a PATCH could produce exactly
      // the overlap a POST refuses, which is a rule that only half exists.
      await this.assertNoOverlap(tx, current.businessId, startsAt, endsAt, id);
      const updated = await tx.featuredPlacement.update({
        where: { id },
        data: { position: input.position ?? current.position, startsAt, endsAt, note: input.note === undefined ? current.note : (input.note ?? null) },
        include: { business: { select: { name: true, slug: true, status: true } } },
      });
      await this.cache.recordInvalidation(tx, { resourceType: 'business', resourceId: current.businessId, correlationId: ctx.requestId, tags: [CACHE_TAGS.businesses, CACHE_TAGS.business(updated.business.slug)] });
      return updated;
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'listing.feature.update', actorAdminId: actor.id, targetType: 'business', targetId: current.businessId, metadata: { placementId: id }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.toDto(row as Row, now);
  }

  /**
   * Two windows overlap when each starts before the other ends; an open-ended
   * window has no end, so it overlaps anything starting after it. `exceptId`
   * lets a placement be edited without colliding with itself.
   *
   * **Must run inside the transaction that writes the placement.** No index can
   * express "no two windows overlap", so the rule is a read followed by a write,
   * and two requests arriving together would each read "no overlap" and both
   * write. Locking the listing's own row first makes every placement write for
   * that listing wait its turn: the second request reads after the first has
   * committed, and is refused.
   */
  private async assertNoOverlap(tx: Prisma.TransactionClient, businessId: string, startsAt: Date, endsAt: Date | null, exceptId?: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`;
    const overlapping = await tx.featuredPlacement.findFirst({
      where: {
        businessId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
        AND: [endsAt ? { startsAt: { lt: endsAt } } : {}, { OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }] }],
      },
    });
    if (overlapping) {
      throw new ConflictException({
        code: 'PLACEMENT_OVERLAP',
        message: 'This listing already has a placement covering that period',
        fields: { startsAt: ['This listing already has a placement covering that period'] },
      });
    }
  }

  async remove(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const db = await this.database.client();
    const current = await db.featuredPlacement.findUnique({ where: { id } });
    if (!current) throw notFound();
    await db.$transaction(async (tx) => {
      await tx.featuredPlacement.delete({ where: { id } });
      await this.cache.recordInvalidation(tx, { resourceType: 'business', resourceId: current.businessId, urgent: true, correlationId: ctx.requestId, tags: [CACHE_TAGS.businesses] });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'listing.feature.delete', actorAdminId: actor.id, targetType: 'business', targetId: current.businessId, metadata: { placementId: id }, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  private interval(start: string | Date, end: string | Date | null): { startsAt: Date; endsAt: Date | null } {
    const startsAt = new Date(start);
    if (Number.isNaN(startsAt.getTime())) throw validation('startsAt', 'Enter a valid start date and time');
    if (end === null || end === undefined) return { startsAt, endsAt: null };
    const endsAt = new Date(end);
    if (Number.isNaN(endsAt.getTime())) throw validation('endsAt', 'Enter a valid end date and time');
    if (endsAt.getTime() <= startsAt.getTime()) throw validation('endsAt', 'The end must be after the start');
    return { startsAt, endsAt };
  }

  private toDto(row: Row, now: Date): FeaturedPlacementDto {
    const started = row.startsAt.getTime() <= now.getTime();
    const ended = row.endsAt !== null && row.endsAt.getTime() <= now.getTime();
    return {
      id: row.id,
      businessId: row.businessId,
      businessName: row.business.name,
      businessSlug: row.business.slug,
      businessStatus: row.business.status,
      position: row.position,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      note: row.note,
      // "Live" means the window is open now and the listing is published; the
      // block still applies the visitor's own filters on top (DIR 007).
      state: ended ? 'ended' : started ? (row.business.status === 'published' ? 'live' : 'not-published') : 'scheduled',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
