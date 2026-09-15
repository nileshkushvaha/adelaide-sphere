import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Testimonial } from '@adelaide-sphere/database';
import { CACHE_TAGS } from '@adelaide-sphere/domain';
import { AuditService } from '../audit/audit.service.js';
import { CacheService } from '../cache/cache.service.js';
import { DatabaseService } from '../database/database.service.js';
import { MediaService } from '../media/media.service.js';
import { toPlainText } from '../blog/sanitise.js';
import type { RequestContext } from '../auth/auth.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { assertVersion, publicVisibilityChanged, recordContentActivity } from './content-support.js';

export const TESTIMONIAL_LIMITS = { displayName: 120, relationship: 160, quote: 1000 } as const;

export interface TestimonialInput {
  displayName: string;
  relationship?: string | null;
  quote: string;
  rating?: number | null;
  businessId?: string | null;
  mediaId?: string | null;
  displayOrder?: number;
}

export interface PublicTestimonial {
  id: string;
  displayName: string;
  relationship: string | null;
  quote: string;
  rating: number | null;
  business: { name: string; slug: string } | null;
  image: { url: string; alt: string; width: number; height: number } | null;
}

/**
 * Testimonials (SRS 1.2 TSTM 001–005).
 *
 * Approval is an optional record of consent: which administrator confirmed the
 * quote may be used, when, and how it was obtained. At the client's instruction
 * (8 Sep 2026) it no longer gates publication — testimonials are entered by
 * administrators, who take that decision themselves — but the field remains,
 * because a quote published over somebody's objection is a legal problem and the
 * note is the only evidence that it was not.
 *
 * There is deliberately no star rating: the product's ratings are the moderated
 * reviews of section 7, and a second, unmoderated rating display beside them
 * would misrepresent both.
 */
@Injectable()
export class TestimonialService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly media: MediaService,
  ) {}

  private async validate(input: TestimonialInput): Promise<{
    displayName: string;
    relationship: string | null;
    quote: string;
    rating: number | null;
    businessId: string | null;
    mediaId: string | null;
    displayOrder: number;
  }> {
    const fields: Record<string, string[]> = {};
    const displayName = (input.displayName ?? '').trim();
    const relationship = (input.relationship ?? '')?.trim() || null;
    // Plain text only: a quote is somebody's words, not a formatting exercise.
    const quote = toPlainText((input.quote ?? '').trim()).trim();
    const displayOrder = input.displayOrder ?? 0;
    const businessId = (input.businessId ?? '')?.trim() || null;
    const mediaId = (input.mediaId ?? '')?.trim() || null;
    // Null, not zero or five: a testimonial without a rating shows no stars
    // rather than a score the person never gave.
    const rating = input.rating === null || input.rating === undefined ? null : input.rating;

    if (displayName.length < 2) fields.displayName = ['A name needs at least 2 characters'];
    else if (displayName.length > TESTIMONIAL_LIMITS.displayName) fields.displayName = [`A name is at most ${TESTIMONIAL_LIMITS.displayName} characters`];
    if (relationship && relationship.length > TESTIMONIAL_LIMITS.relationship) fields.relationship = [`At most ${TESTIMONIAL_LIMITS.relationship} characters`];
    if (quote.length < 20) fields.quote = ['A quote needs at least 20 characters'];
    else if (quote.length > TESTIMONIAL_LIMITS.quote) fields.quote = [`A quote is at most ${TESTIMONIAL_LIMITS.quote} characters`];
    if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) fields.displayOrder = ['Display order is a whole number between 0 and 9999'];
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) fields.rating = ['A rating is a whole number of stars from 1 to 5'];

    const db = await this.database.client();
    if (businessId && !(await db.business.findUnique({ where: { id: businessId }, select: { id: true } }))) {
      fields.businessId = ['That listing does not exist'];
    }
    // The image must be an asset the media pipeline has actually processed.
    if (mediaId && !(await this.media.publicImageRefOfKind(mediaId, 'thumbnail'))) {
      fields.mediaId = ['That image does not exist or is still being processed'];
    }

    if (Object.keys(fields).length > 0) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields }, HttpStatus.BAD_REQUEST);
    return { displayName, relationship, quote, rating, businessId, mediaId, displayOrder };
  }

  private async purge(tx: Prisma.TransactionClient, ctx: RequestContext, id: string): Promise<void> {
    await this.cache.recordInvalidation(tx, { resourceType: 'testimonial', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.testimonials] });
  }

  // ---- admin ---------------------------------------------------------------

  async list(query: { page: number; pageSize: number; status?: 'draft' | 'published'; q?: string }) {
    const db = await this.database.client();
    const where: Prisma.TestimonialWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      // Both halves of a testimonial are worth searching: an editor looks for
      // the person, or for the words they remember.
      ...(query.q ? { OR: [{ displayName: { contains: query.q } }, { quote: { contains: query.q } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      db.testimonial.findMany({ where, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      db.testimonial.count({ where }),
    ]);
    return { rows, total };
  }

  async get(id: string): Promise<Testimonial> {
    const db = await this.database.client();
    const row = await db.testimonial.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such testimonial' });
    return row;
  }

  async create(input: TestimonialInput, actor: AdminPrincipal, ctx: RequestContext): Promise<Testimonial> {
    const value = await this.validate(input);
    const db = await this.database.client();
    return db.$transaction(async (tx) => {
      const created = await tx.testimonial.create({ data: { ...value, createdByAdminId: actor.id, updatedByAdminId: actor.id } });
      await recordContentActivity(tx, this.audit, {
        action: 'website.testimonial.create',
        targetType: 'testimonial',
        targetId: created.id,
        actor,
        ctx,
        metadata: { displayName: created.displayName },
      });
      return created;
    });
  }

  async update(id: string, input: TestimonialInput & { expectedVersion: number }, actor: AdminPrincipal, ctx: RequestContext): Promise<Testimonial> {
    const value = await this.validate(input);
    const current = await this.get(id);
    assertVersion(current.version, input.expectedVersion);

    // Changing the words invalidates any consent recorded for them, so the note
    // is cleared. It no longer unpublishes the testimonial: publication is the
    // administrator's own decision (client instruction, 8 Sep 2026).
    const quoteChanged = current.quote !== value.quote;

    const db = await this.database.client();
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.testimonial.update({
        where: { id },
        data: {
          ...value,
          version: { increment: 1 },
          updatedByAdminId: actor.id,
        },
      });
      await recordContentActivity(tx, this.audit, {
        action: 'website.testimonial.update',
        targetType: 'testimonial',
        targetId: id,
        actor,
        ctx,
        metadata: { displayName: row.displayName, quoteChanged },
      });
      if (publicVisibilityChanged(current, row) || quoteChanged) await this.purge(tx, ctx, id);
      return row;
    });
    if (publicVisibilityChanged(current, updated) || quoteChanged) await this.cache.bumpNamespace();
    return updated;
  }

  /** Records consent (TSTM 002). Distinct from publication, and from the permission to publish. */

  async setPublished(id: string, published: boolean, expectedVersion: number, actor: AdminPrincipal, ctx: RequestContext): Promise<Testimonial> {
    const current = await this.get(id);
    assertVersion(current.version, expectedVersion);
    if ((current.status === 'published') === published) {
      throw new HttpException({ code: 'INVALID_STATE', message: published ? 'This testimonial is already published' : 'This testimonial is not published' }, HttpStatus.CONFLICT);
    }
    const db = await this.database.client();
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.testimonial.update({
        where: { id },
        data: {
          status: published ? 'published' : 'draft',
          publishedAt: published ? (current.publishedAt ?? new Date()) : current.publishedAt,
          version: { increment: 1 },
          updatedByAdminId: actor.id,
        },
      });
      await recordContentActivity(tx, this.audit, {
        action: published ? 'website.testimonial.publish' : 'website.testimonial.unpublish',
        targetType: 'testimonial',
        targetId: id,
        actor,
        ctx,
        metadata: { displayName: row.displayName },
      });
      await this.purge(tx, ctx, id);
      return row;
    });
    await this.cache.bumpNamespace();
    return updated;
  }

  async remove(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const current = await this.get(id);
    const db = await this.database.client();
    await db.$transaction(async (tx) => {
      await tx.testimonial.delete({ where: { id } });
      await recordContentActivity(tx, this.audit, {
        action: 'website.testimonial.delete',
        targetType: 'testimonial',
        targetId: id,
        actor,
        ctx,
        metadata: { displayName: current.displayName, wasPublished: current.status === 'published' },
      });
      if (current.status === 'published') await this.purge(tx, ctx, id);
    });
    if (current.status === 'published') await this.cache.bumpNamespace();
  }

  // ---- public --------------------------------------------------------------

  /** Published only, filtered in the backend (TSTM 004). */
  async publicList(): Promise<PublicTestimonial[]> {
    const db = await this.database.client();
    const rows = await db.testimonial.findMany({
      where: { status: 'published' },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: { business: { select: { name: true, slug: true, status: true } } },
      take: 12,
    });
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        displayName: row.displayName,
        relationship: row.relationship,
        quote: row.quote,
        rating: row.rating,
        // A listing that is no longer published is not linked from a quote.
        business: row.business && row.business.status === 'published' ? { name: row.business.name, slug: row.business.slug } : null,
        image: await this.media.publicImageRefOfKind(row.mediaId, 'thumbnail'),
      })),
    );
  }
}
