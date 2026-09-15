import { maskEmail } from '@adelaide-sphere/mail';
import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import type { AbuseReport, Prisma } from '@adelaide-sphere/database';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { FieldEncryptionService } from '../common/field-encryption.service.js';
import { collectionMeta, skipFor } from '../common/pagination.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { ReviewsService } from './reviews.service.js';
import type { AdminReportDto, InvestigateReportDto, ListAdminReportsQueryDto, ReportReceiptDto, ResolveReportDto, SubmitReportDto } from './dto/review.dto.js';

/** SRS SEC 002: five reports per hour per trusted IP. */
const REPORT_LIMITS = [{ scope: 'report:1h', max: 5, windowSeconds: 3_600 }] as const;

const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Report not found' });
const stale = () => new ConflictException({ code: 'STALE_VERSION', message: 'This report was changed by someone else. Reload and try again.' });

/**
 * Abuse reports (SRS REP 001–002). A report records the target and a snapshot
 * of the published content so it stays auditable after removal; it never
 * removes anything by itself and never reveals the reporter.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly encryption: FieldEncryptionService,
    private readonly reviews: ReviewsService,
  ) {}

  async submit(input: SubmitReportDto, ctx: RequestContext): Promise<ReportReceiptDto> {
    // Exactly one target (SRS REP 001); MySQL cannot express this as a check
    // constraint on foreign-key columns, so the rule lives here.
    if ((input.reviewId ? 1 : 0) + (input.commentId ? 1 : 0) !== 1) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Report exactly one review or comment', fields: { reviewId: ['Provide either a review or a comment, not both'] } }, HttpStatus.BAD_REQUEST);
    }
    await this.reviews.guardPublicWrite({ honeypot: input.website, captchaToken: input.captchaToken, action: 'report', limits: REPORT_LIMITS }, ctx);
    const db = await this.database.client();
    // Unpublished or unknown targets get the same neutral answer, so nothing is disclosed (SRS REP 002).
    const neutral: ReportReceiptDto = { receiptId: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, status: 'received', message: 'Thank you. Our moderators will review this.' };
    const target = input.reviewId
      ? await db.review.findFirst({ where: { id: input.reviewId, status: 'approved' }, select: { id: true, businessId: true, originalText: true, publicText: true } })
      : await db.comment.findFirst({ where: { id: input.commentId, status: 'approved', post: { status: 'published' } }, select: { id: true, postId: true, originalText: true, publicText: true } });
    if (!target) return neutral;
    const isReview = Boolean(input.reviewId);
    const report = await db.abuseReport.create({
      data: {
        reviewId: isReview ? target.id : null,
        commentId: isReview ? null : target.id,
        reason: input.reason,
        details: input.details ?? null,
        reporterEmailEncrypted: input.email ? this.encryption.encrypt(input.email.toLowerCase(), target.id) : null,
        targetSnapshot: target.publicText ?? target.originalText,
        status: 'open',
      },
      select: { id: true },
    });
    await this.audit.record({ action: 'report.submitted', targetType: 'abuse_report', targetId: report.id, metadata: { targetType: isReview ? 'review' : 'comment', targetId: target.id, reason: input.reason }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return { ...neutral, receiptId: report.id.slice(-12) };
  }

  async list(query: ListAdminReportsQueryDto): Promise<{ data: AdminReportDto[]; meta: ReturnType<typeof collectionMeta> }> {
    const db = await this.database.client();
    const where: Prisma.AbuseReportWhereInput = query.status ? { status: query.status } : {};
    const [rows, total] = await Promise.all([
      db.abuseReport.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: skipFor(query.page, query.pageSize),
        take: query.pageSize,
        include: { review: { select: { businessId: true, status: true } }, comment: { select: { postId: true, status: true } } },
      }),
      db.abuseReport.count({ where }),
    ]);
    return { data: rows.map((row) => this.toDto(row, row.review, row.comment)), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  async get(id: string): Promise<AdminReportDto> {
    const db = await this.database.client();
    const row = await db.abuseReport.findUnique({ where: { id }, include: { review: { select: { businessId: true, status: true } }, comment: { select: { postId: true, status: true } } } });
    if (!row) throw notFound();
    return this.toDto(row, row.review, row.comment);
  }

  async investigate(id: string, input: InvestigateReportDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminReportDto> {
    const current = await this.load(id, input.expectedVersion);
    if (current.status !== 'open') throw new ConflictException({ code: 'INVALID_STATE', message: `This report is already ${current.status}` });
    const db = await this.database.client();
    const updated = await db.abuseReport.updateMany({ where: { id, version: input.expectedVersion }, data: { status: 'investigating', moderatorAdminId: actor.id, version: { increment: 1 } } });
    if (updated.count !== 1) throw stale();
    await this.audit.record({ action: 'report.investigate', actorAdminId: actor.id, targetType: 'abuse_report', targetId: id, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.get(id);
  }

  /** Records the decision only; removing the review stays a separate, audited moderation action (SRS REP 002). */
  async resolve(id: string, input: ResolveReportDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminReportDto> {
    const current = await this.load(id, input.expectedVersion);
    if (current.status === 'resolved') throw new ConflictException({ code: 'INVALID_STATE', message: 'This report is already resolved' });
    const db = await this.database.client();
    const updated = await db.abuseReport.updateMany({
      where: { id, version: input.expectedVersion },
      data: { status: 'resolved', outcome: input.outcome, resolutionNote: input.note ?? null, moderatorAdminId: actor.id, resolvedAt: new Date(), version: { increment: 1 } },
    });
    if (updated.count !== 1) throw stale();
    await this.audit.record({ action: 'report.resolve', actorAdminId: actor.id, targetType: 'abuse_report', targetId: id, reason: input.note ?? null, metadata: { outcome: input.outcome }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.get(id);
  }

  private async load(id: string, expectedVersion: number) {
    const db = await this.database.client();
    const row = await db.abuseReport.findUnique({ where: { id }, select: { id: true, status: true, version: true } });
    if (!row) throw notFound();
    if (row.version !== expectedVersion) throw stale();
    return row;
  }

  private toDto(row: AbuseReport, review: { businessId: string; status: AdminReportDto['targetStatus'] } | null, comment: { postId: string; status: AdminReportDto['targetStatus'] } | null): AdminReportDto {
    return {
      id: row.id,
      targetType: row.reviewId ? 'review' : 'comment',
      reviewId: row.reviewId,
      commentId: row.commentId,
      parentId: review?.businessId ?? comment?.postId ?? '',
      reason: row.reason,
      details: row.details,
      // Masked; the address itself is a separate permissioned, recorded read.
      reporterEmail: row.reporterEmailEncrypted ? maskEmail(this.encryption.decrypt(row.reporterEmailEncrypted, row.reviewId ?? row.commentId ?? '')) : null,
      targetSnapshot: row.targetSnapshot,
      status: row.status,
      outcome: row.outcome,
      resolutionNote: row.resolutionNote,
      moderatorAdminId: row.moderatorAdminId,
      targetStatus: review?.status ?? comment?.status ?? 'rejected',
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    };
  }

  /**
   * The visitor's own address, for the one record being acted on. Kept out of
   * the list, permissioned separately and recorded, so that reading a queue
   * does not read everyone's contact details (SRS MON 001).
   */
  async revealReporterEmail(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<string | null> {
    const db = await this.database.client();
    const row = await db.abuseReport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such record' });
    await this.audit.record({
      action: 'report.email.reveal',
      actorAdminId: actor.id,
      targetType: 'abuse_report',
      targetId: id,
      metadata: { reason: row.reason },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return row.reporterEmailEncrypted ? this.encryption.decrypt(row.reporterEmailEncrypted, row.reviewId ?? row.commentId ?? '') : null;
  }
}
