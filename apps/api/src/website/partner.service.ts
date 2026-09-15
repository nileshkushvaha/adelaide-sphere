import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { PartnerOrganisation, Prisma } from '@adelaide-sphere/database';
import { CACHE_TAGS } from '@adelaide-sphere/domain';
import { AuditService } from '../audit/audit.service.js';
import { CacheService } from '../cache/cache.service.js';
import { DatabaseService } from '../database/database.service.js';
import { MediaService } from '../media/media.service.js';
import { validatePublicUrl } from '../directory/business-rules.js';
import type { RequestContext } from '../auth/auth.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { assertVersion, publicVisibilityChanged, recordContentActivity } from './content-support.js';

export const PARTNER_LIMITS = { name: 150, relationship: 120, logoAlt: 200, websiteUrl: 300, note: 300 } as const;

export interface PartnerInput {
  name: string;
  relationshipLabel?: string | null;
  mediaId?: string | null;
  logoAlt?: string | null;
  websiteUrl?: string | null;
  displayOrder?: number;
}

export interface PublicPartner {
  id: string;
  name: string;
  relationshipLabel: string | null;
  websiteUrl: string | null;
  logo: { url: string; width: number; height: number };
  logoAlt: string;
}

/**
 * Client and partner organisations displayed on the public site (SRS 1.2
 * PTNR 001–005).
 *
 * This is marketing content and nothing else. It is not an account, it holds no
 * credentials and it grants nobody access to anything — the reference project
 * this module was modelled on let exactly that boundary blur, growing a logo
 * strip into a customer account with API tokens, which is why the requirement
 * states the boundary and this comment repeats it.
 *
 * Publication requires a logo and alternative text — without them the strip is
 * broken and unreadable — but no longer requires a recorded authorisation
 * (client instruction, 8 Sep 2026). The authorisation note remains available as
 * evidence that permission to display a mark was obtained.
 */
@Injectable()
export class PartnerService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly media: MediaService,
  ) {}

  private async validate(input: PartnerInput) {
    const fields: Record<string, string[]> = {};
    const name = (input.name ?? '').trim();
    const relationshipLabel = (input.relationshipLabel ?? '')?.trim() || null;
    const logoAlt = (input.logoAlt ?? '')?.trim() || null;
    const rawUrl = (input.websiteUrl ?? '')?.trim() || null;
    const mediaId = (input.mediaId ?? '')?.trim() || null;
    const displayOrder = input.displayOrder ?? 0;

    if (name.length < 2) fields.name = ['A name needs at least 2 characters'];
    else if (name.length > PARTNER_LIMITS.name) fields.name = [`A name is at most ${PARTNER_LIMITS.name} characters`];
    if (relationshipLabel && relationshipLabel.length > PARTNER_LIMITS.relationship) fields.relationshipLabel = [`At most ${PARTNER_LIMITS.relationship} characters`];
    if (logoAlt && logoAlt.length > PARTNER_LIMITS.logoAlt) fields.logoAlt = [`At most ${PARTNER_LIMITS.logoAlt} characters`];
    if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 9999) fields.displayOrder = ['Display order is a whole number between 0 and 9999'];

    let websiteUrl: string | null = null;
    if (rawUrl) {
      const valid = validatePublicUrl(rawUrl);
      if (!valid) fields.websiteUrl = ['Use a full http or https address'];
      else websiteUrl = valid;
    }
    if (mediaId && !(await this.media.publicImageRefOfKind(mediaId, 'card'))) {
      fields.mediaId = ['That image does not exist or is still being processed'];
    }

    if (Object.keys(fields).length > 0) throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields }, HttpStatus.BAD_REQUEST);
    return { name, relationshipLabel, logoAlt, websiteUrl, mediaId, displayOrder };
  }

  private async purge(tx: Prisma.TransactionClient, ctx: RequestContext, id: string): Promise<void> {
    await this.cache.recordInvalidation(tx, { resourceType: 'partner_organisation', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.partners] });
  }

  // ---- admin ---------------------------------------------------------------

  async list(query: { page: number; pageSize: number; status?: 'draft' | 'published'; q?: string }) {
    const db = await this.database.client();
    const where: Prisma.PartnerOrganisationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      // The name, and how the relationship is described: an editor looking for
      // "our insurance partner" remembers one or the other.
      ...(query.q ? { OR: [{ name: { contains: query.q } }, { relationshipLabel: { contains: query.q } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      db.partnerOrganisation.findMany({ where, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      db.partnerOrganisation.count({ where }),
    ]);
    return { rows, total };
  }

  async get(id: string): Promise<PartnerOrganisation> {
    const db = await this.database.client();
    const row = await db.partnerOrganisation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such organisation' });
    return row;
  }

  async create(input: PartnerInput, actor: AdminPrincipal, ctx: RequestContext): Promise<PartnerOrganisation> {
    const value = await this.validate(input);
    const db = await this.database.client();
    return db.$transaction(async (tx) => {
      const created = await tx.partnerOrganisation.create({ data: { ...value, createdByAdminId: actor.id, updatedByAdminId: actor.id } });
      await recordContentActivity(tx, this.audit, {
        action: 'website.partner.create',
        targetType: 'partner_organisation',
        targetId: created.id,
        actor,
        ctx,
        metadata: { name: created.name },
      });
      return created;
    });
  }

  async update(id: string, input: PartnerInput & { expectedVersion: number }, actor: AdminPrincipal, ctx: RequestContext): Promise<PartnerOrganisation> {
    const value = await this.validate(input);
    const current = await this.get(id);
    assertVersion(current.version, input.expectedVersion);

    // A different logo is a different mark, so a note recorded for the previous
    // one is cleared. It no longer unpublishes the record.
    const logoChanged = current.mediaId !== value.mediaId;

    const db = await this.database.client();
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.partnerOrganisation.update({
        where: { id },
        data: {
          ...value,
          version: { increment: 1 },
          updatedByAdminId: actor.id,
          ...(logoChanged ? { authorisedAt: null, authorisedByAdminId: null, authorisationNote: null } : {}),
        },
      });
      await recordContentActivity(tx, this.audit, {
        action: 'website.partner.update',
        targetType: 'partner_organisation',
        targetId: id,
        actor,
        ctx,
        metadata: { name: row.name, logoChanged, authorisationCleared: logoChanged },
      });
      if (publicVisibilityChanged(current, row) || logoChanged) await this.purge(tx, ctx, id);
      return row;
    });
    if (publicVisibilityChanged(current, updated) || logoChanged) await this.cache.bumpNamespace();
    return updated;
  }

  /** Records written authorisation to display the organisation's mark (PTNR 003). */
  async authorise(id: string, note: string | null, expectedVersion: number, actor: AdminPrincipal, ctx: RequestContext): Promise<PartnerOrganisation> {
    const current = await this.get(id);
    assertVersion(current.version, expectedVersion);
    if (current.authorisedAt) throw new HttpException({ code: 'INVALID_STATE', message: 'This organisation is already authorised' }, HttpStatus.CONFLICT);
    if (!current.mediaId) {
      throw new HttpException({ code: 'LOGO_REQUIRED', message: 'Add the approved logo before recording the authorisation to display it.' }, HttpStatus.CONFLICT);
    }
    const trimmed = note?.trim() || null;
    if (trimmed && trimmed.length > PARTNER_LIMITS.note) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { note: [`At most ${PARTNER_LIMITS.note} characters`] } }, HttpStatus.BAD_REQUEST);
    }

    const db = await this.database.client();
    return db.$transaction(async (tx) => {
      const row = await tx.partnerOrganisation.update({
        where: { id },
        data: { authorisedAt: new Date(), authorisedByAdminId: actor.id, authorisationNote: trimmed, version: { increment: 1 }, updatedByAdminId: actor.id },
      });
      await recordContentActivity(tx, this.audit, {
        action: 'website.partner.authorise',
        targetType: 'partner_organisation',
        targetId: id,
        actor,
        ctx,
        metadata: { name: row.name, hasNote: trimmed !== null },
      });
      return row;
    });
  }

  async setPublished(id: string, published: boolean, expectedVersion: number, actor: AdminPrincipal, ctx: RequestContext): Promise<PartnerOrganisation> {
    const current = await this.get(id);
    assertVersion(current.version, expectedVersion);
    if ((current.status === 'published') === published) {
      throw new HttpException({ code: 'INVALID_STATE', message: published ? 'This organisation is already published' : 'This organisation is not published' }, HttpStatus.CONFLICT);
    }
    if (published) {
      // Two refusals, each a different mistake, and both about the page being
      // renderable and accessible rather than about permission: a logo strip
      // with a missing image or an unnamed logo is broken for everyone
      // (SRS MED 003, NFR 006). Recording the authorisation is no longer a gate
      // (client instruction, 8 Sep 2026) but remains available as evidence.
      if (!current.mediaId) throw new HttpException({ code: 'LOGO_REQUIRED', message: 'Add the logo before publishing.' }, HttpStatus.CONFLICT);
      if (!current.logoAlt) throw new HttpException({ code: 'ALT_TEXT_REQUIRED', message: 'Add alternative text naming the organisation before publishing.' }, HttpStatus.CONFLICT);
    }

    const db = await this.database.client();
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.partnerOrganisation.update({
        where: { id },
        data: {
          status: published ? 'published' : 'draft',
          publishedAt: published ? (current.publishedAt ?? new Date()) : current.publishedAt,
          version: { increment: 1 },
          updatedByAdminId: actor.id,
        },
      });
      await recordContentActivity(tx, this.audit, {
        action: published ? 'website.partner.publish' : 'website.partner.unpublish',
        targetType: 'partner_organisation',
        targetId: id,
        actor,
        ctx,
        metadata: { name: row.name },
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
      await tx.partnerOrganisation.delete({ where: { id } });
      await recordContentActivity(tx, this.audit, {
        action: 'website.partner.delete',
        targetType: 'partner_organisation',
        targetId: id,
        actor,
        ctx,
        metadata: { name: current.name, wasPublished: current.status === 'published' },
      });
      if (current.status === 'published') await this.purge(tx, ctx, id);
    });
    if (current.status === 'published') await this.cache.bumpNamespace();
  }

  // ---- public --------------------------------------------------------------

  /**
   * Published organisations whose logo is still processed (PTNR 005).
   * A record whose asset has since gone is dropped rather than rendered as a
   * broken image; the publication gates keep that rare.
   */
  async publicList(): Promise<PublicPartner[]> {
    const db = await this.database.client();
    const rows = await db.partnerOrganisation.findMany({
      where: { status: 'published', mediaId: { not: null } },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      take: 24,
    });
    const resolved = await Promise.all(
      rows.map(async (row) => {
        const logo = await this.media.publicImageRefOfKind(row.mediaId, 'card');
        if (!logo || !row.logoAlt) return null;
        return {
          id: row.id,
          name: row.name,
          relationshipLabel: row.relationshipLabel,
          websiteUrl: row.websiteUrl,
          logo: { url: logo.url, width: logo.width, height: logo.height },
          logoAlt: row.logoAlt,
        } satisfies PublicPartner;
      }),
    );
    return resolved.filter((row): row is PublicPartner => row !== null);
  }
}
