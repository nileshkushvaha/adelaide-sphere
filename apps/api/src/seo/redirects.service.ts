import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, RedirectKind } from '@adelaide-sphere/database';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { CACHE_TAGS } from '@adelaide-sphere/domain';
import { CacheService } from '../cache/cache.service.js';
import { normalisePath, redirectEffect, RedirectRuleError, validateRedirect } from './redirect-rules.js';
import type { CreateRedirectDto, ListRedirectsQueryDto, RedirectDto, RedirectPreviewDto, RedirectResolutionDto } from './dto/redirect.dto.js';

type Tx = Prisma.TransactionClient;

interface RecordChangeInput {
  sourcePath: string;
  targetPath: string;
  /** What moved. Stored as a plain string column, so this list grows without a migration. */
  resourceType: 'business' | 'post' | 'category' | 'local_area' | 'blog_category' | 'blog_tag' | 'static_page';
  resourceId: string;
  actorAdminId: string;
  reason?: string | null;
}

const toDto = (row: {
  id: string;
  sourcePath: string;
  targetPath: string | null;
  kind: RedirectKind;
  reason: string | null;
  resourceType: string | null;
  resourceId: string | null;
  isActive: boolean;
  createdByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RedirectDto => ({
  id: row.id,
  sourcePath: row.sourcePath,
  targetPath: row.targetPath,
  kind: row.kind,
  isActive: row.isActive,
  reason: row.reason,
  resourceType: row.resourceType,
  resourceId: row.resourceId,
  createdByAdminId: row.createdByAdminId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Public path redirects (SRS SEO 004). Every write goes through
 * {@link writeRedirect}, which keeps three invariants:
 *  - one source resolves one way (unique column plus upsert);
 *  - no chains: aliases already pointing at the old path are repointed at the
 *    new target in the same transaction;
 *  - no cycles: a redirect whose source equals the new target is removed,
 *    because that path is now live content again.
 */
@Injectable()
export class RedirectsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Resolution for the web tier; unknown paths return null so the site can
   * render its own 404.
   *
   * An inactive rule returns null too, and is therefore indistinguishable from
   * no rule at all. That is deliberate: this route is public and cached, so a
   * 200 carrying "there is a rule here but it is switched off" would leak
   * administrative state, and it would leave the web tier deciding something the
   * server has already decided.
   */
  async resolve(path: string): Promise<RedirectResolutionDto | null> {
    const sourcePath = normalisePath(path);
    if (!sourcePath) return null;
    const db = await this.database.client();
    const row = await db.redirect.findUnique({ where: { sourcePath } });
    const effect = redirectEffect(row);
    if (!effect.applies) return null;
    return { kind: row!.kind, status: effect.status, targetPath: effect.targetPath };
  }

  /**
   * The same resolution, for an administrator, with the reason a path does
   * nothing. Both callers share `redirectEffect`, so the preview can know more
   * about *why* without ever disagreeing about *what happens*.
   */
  async preview(path: string): Promise<RedirectPreviewDto> {
    const normalised = normalisePath(path);
    if (!normalised) return { requestedPath: path, normalisedPath: null, rule: null, status: null, targetPath: null, outcome: 'invalid-path' };
    const db = await this.database.client();
    const row = await db.redirect.findUnique({ where: { sourcePath: normalised } });
    const effect = redirectEffect(row);
    return {
      requestedPath: path,
      normalisedPath: normalised,
      rule: row ? toDto(row) : null,
      status: effect.applies ? effect.status : null,
      targetPath: effect.applies ? effect.targetPath : null,
      outcome: effect.applies ? 'applies' : effect.because,
    };
  }

  /**
   * Switches a rule on or off. Absolute and idempotent, so two operators doing
   * it at once converge rather than conflict — which is why there is no version
   * check here, unlike the record editors.
   */
  async setActive(id: string, isActive: boolean, reason: string | null, actor: AdminPrincipal, ctx: RequestContext): Promise<RedirectDto> {
    const db = await this.database.client();
    const existing = await db.redirect.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such redirect' });
    const row = await db.$transaction(async (tx) => {
      const updated = await tx.redirect.update({ where: { id }, data: { isActive } });
      await this.cache.recordInvalidation(tx, { resourceType: 'redirect', resourceId: id, correlationId: ctx.requestId, tags: [CACHE_TAGS.redirects], urgent: true });
      await this.audit.recordWith(tx, {
        action: isActive ? 'seo.redirect.activate' : 'seo.redirect.deactivate',
        actorAdminId: actor.id,
        targetType: 'redirect',
        targetId: id,
        reason,
        metadata: { sourcePath: existing.sourcePath, kind: existing.kind },
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      });
      return updated;
    });
    return toDto(row);
  }

  async list(query: ListRedirectsQueryDto): Promise<{ data: RedirectDto[]; meta: { total: number; page: number; pageSize: number } }> {
    const db = await this.database.client();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.RedirectWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.q) {
      const q = query.q.trim().toLowerCase();
      where.OR = [{ sourcePath: { contains: q } }, { targetPath: { contains: q } }];
    }
    const [rows, total] = await Promise.all([
      db.redirect.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      db.redirect.count({ where }),
    ]);
    return { data: rows.map(toDto), meta: { total, page, pageSize } };
  }

  async create(input: CreateRedirectDto, actor: AdminPrincipal, ctx: RequestContext): Promise<RedirectDto> {
    const kind = input.kind ?? 'permanent';
    const pair = this.validate(input.sourcePath, input.targetPath ?? null, kind);
    const db = await this.database.client();
    const row = await db.$transaction((tx) =>
      this.writeRedirect(tx, { ...pair, kind, reason: input.reason ?? null, resourceType: input.resourceType ?? null, resourceId: input.resourceId ?? null, actorAdminId: actor.id }),
    );
    await this.audit.record({ action: 'seo.redirect.create', actorAdminId: actor.id, targetType: 'redirect', targetId: row.id, metadata: { sourcePath: row.sourcePath, targetPath: row.targetPath, kind }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return toDto(row);
  }

  async remove(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const db = await this.database.client();
    const row = await db.redirect.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Resource not found' });
    await db.redirect.delete({ where: { id } });
    await this.audit.record({ action: 'seo.redirect.delete', actorAdminId: actor.id, targetType: 'redirect', targetId: id, metadata: { sourcePath: row.sourcePath }, requestId: ctx.requestId, ipAddress: ctx.ip });
  }

  /**
   * Called inside the slug-change transaction of a published listing or
   * article. Returns nothing: failures throw so the slug change rolls back
   * with the redirect rather than leaving a dead URL.
   */
  async recordSlugChange(tx: Tx, input: RecordChangeInput): Promise<void> {
    const pair = this.validate(input.sourcePath, input.targetPath, 'permanent');
    await this.writeRedirect(tx, {
      ...pair,
      kind: 'permanent',
      reason: input.reason ?? null,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      actorAdminId: input.actorAdminId,
    });
  }

  private validate(source: string, target: string | null, kind: RedirectKind) {
    try {
      return validateRedirect(source, target, kind);
    } catch (error) {
      if (error instanceof RedirectRuleError) {
        throw new HttpException({ code: 'VALIDATION_ERROR', message: error.message, fields: { [error.field]: [error.message] } }, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  private async writeRedirect(
    tx: Tx,
    input: { sourcePath: string; targetPath: string | null; kind: RedirectKind; reason: string | null; resourceType: string | null; resourceId: string | null; actorAdminId: string },
  ) {
    const { sourcePath, targetPath, kind } = input;
    if (targetPath) {
      // The new target is live content: it must not itself redirect away (cycle).
      await tx.redirect.deleteMany({ where: { sourcePath: targetPath } });
      // Older aliases of the old path now point at the new target (no chains).
      // Inactive rows are repointed as well: where content lives is a fact,
      // independent of whether the rule is currently served, and leaving one
      // stale would produce a two-hop chain the moment it was switched back on.
      // Only `permanent` rows are repointed. A temporary redirect is an editorial
      // decision with an end in mind; silently changing its destination would be
      // making that decision on the administrator's behalf.
      await tx.redirect.updateMany({ where: { targetPath: sourcePath, kind: 'permanent' }, data: { targetPath } });
    }
    const existing = await tx.redirect.findUnique({ where: { sourcePath } });
    if (existing && existing.resourceType && input.resourceType && existing.resourceType !== input.resourceType) {
      throw new ConflictException({ code: 'REDIRECT_IN_USE', message: 'That path already redirects for a different resource', fields: { sourcePath: ['That path already redirects for a different resource'] } });
    }
    // Writing over a deactivated source switches it back on. Without this the
    // create succeeds, reports success, and produces a rule that does nothing —
    // the worst of the three possible outcomes.
    const data = { targetPath, kind, isActive: true, reason: input.reason, resourceType: input.resourceType, resourceId: input.resourceId, createdByAdminId: input.actorAdminId };
    return tx.redirect.upsert({ where: { sourcePath }, create: { sourcePath, ...data }, update: data });
  }
}
