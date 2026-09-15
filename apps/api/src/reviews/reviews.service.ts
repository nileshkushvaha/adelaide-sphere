import { maskEmail } from '@adelaide-sphere/mail';
import { createHmac } from 'node:crypto';
import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, Review } from '@adelaide-sphere/database';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { CaptchaPort, CaptchaUnavailableError } from '../common/captcha/captcha.port.js';
import { FieldEncryptionService } from '../common/field-encryption.service.js';
import { collectionMeta, skipFor } from '../common/pagination.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { DatabaseService } from '../database/database.service.js';
import { PublicRateLimitService, RateLimiterUnavailableError } from '../directory/search/public-rate-limit.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { CacheService } from '../cache/cache.service.js';
import { CACHE_TAGS } from '@adelaide-sphere/domain';
import { MODERATION_ACTIONS, REPEAT_WINDOW_DAYS, aggregateDelta, isNoOpDecision, type ModerationAction } from './review-rules.js';
import type {
  AdminReviewDto,
  ListAdminReviewsQueryDto,
  ListPublicReviewsQueryDto,
  ModerateReviewDto,
  PublicReviewDto,
  RedactReviewDto,
  SubmissionReceiptDto,
  SubmitReviewDto,
} from './dto/review.dto.js';

/** SRS SEC 002 defaults for review submissions. */
const REVIEW_LIMITS = [
  { scope: 'review:15m', max: 5, windowSeconds: 900 },
  { scope: 'review:24h', max: 20, windowSeconds: 86_400 },
] as const;

const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Review not found' });
const stale = () => new ConflictException({ code: 'STALE_VERSION', message: 'This review was changed by someone else. Reload and try again.' });

/**
 * Visitor reviews and moderation (SRS REV 001–005). Submissions are always
 * pending, the approved aggregate is maintained inside the moderation
 * transaction, and the original text is never overwritten.
 */
@Injectable()
export class ReviewsService {
  private readonly secret: string;
  private readonly termsVersion: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly encryption: FieldEncryptionService,
    private readonly captcha: CaptchaPort,
    private readonly rateLimit: PublicRateLimitService,
    config: ConfigService<EnvironmentVariables, true>,
    private readonly cache: CacheService,
  ) {
    this.secret = config.get('APP_SECRET_KEY', { infer: true });
    this.termsVersion = config.get('SUBMISSION_TERMS_VERSION', { infer: true });
  }

  /** Keyed hash: Redis and the database never hold a readable email or IP (SRS DAT 002, PRIV 001). */
  private hash(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }

  /** Verifies the honeypot, Turnstile and both rate windows; failures are safe, never bypasses (SRS SEC 002/003). */
  async guardPublicWrite(input: { honeypot?: string; captchaToken?: string; action: string; limits: readonly { scope: string; max: number; windowSeconds: number }[] }, ctx: RequestContext): Promise<void> {
    if (input.honeypot && input.honeypot.trim().length > 0) {
      // Silent to bots, explicit to us: treated as a validation failure without naming the trap.
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Submission rejected', fields: {} }, HttpStatus.BAD_REQUEST);
    }
    for (const limit of input.limits) {
      let decision;
      try {
        decision = await this.rateLimit.consume(limit.scope, ctx.ip, limit.max, limit.windowSeconds);
      } catch (error) {
        if (error instanceof RateLimiterUnavailableError) throw new HttpException({ code: 'SERVICE_UNAVAILABLE', message: 'We cannot accept submissions right now. Please try again shortly.' }, HttpStatus.SERVICE_UNAVAILABLE);
        throw error;
      }
      if (!decision.allowed) {
        throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many submissions. Please try again later.', retryAfterSeconds: decision.retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    try {
      const result = await this.captcha.verify(input.captchaToken, input.action, ctx.ip);
      if (!result.ok) throw new HttpException({ code: 'CAPTCHA_FAILED', message: 'The human verification check did not pass. Please try again.', fields: { captchaToken: ['Verification failed'] } }, HttpStatus.BAD_REQUEST);
    } catch (error) {
      if (error instanceof CaptchaUnavailableError) throw new HttpException({ code: 'SERVICE_UNAVAILABLE', message: 'Submissions are temporarily unavailable. Please try again later.' }, HttpStatus.SERVICE_UNAVAILABLE);
      throw error;
    }
  }

  /** True when the site can accept public submissions at all (no verifier configured → closed, never open). */
  get submissionsEnabled(): boolean {
    return this.captcha.configured;
  }

  async submit(businessId: string, input: SubmitReviewDto, ctx: RequestContext): Promise<SubmissionReceiptDto> {
    const db = await this.database.client();
    const business = await db.business.findFirst({ where: { id: businessId, status: 'published' }, select: { id: true, name: true } });
    if (!business) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    if (!input.acknowledged) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Please accept the review guidelines and privacy notice', fields: { acknowledged: ['Acceptance is required'] } }, HttpStatus.BAD_REQUEST);
    }
    await this.guardPublicWrite({ honeypot: input.website, captchaToken: input.captchaToken, action: 'review', limits: REVIEW_LIMITS }, ctx);

    const email = input.email.toLowerCase();
    const emailHash = this.hash(email);
    const since = new Date(Date.now() - REPEAT_WINDOW_DAYS * 86_400_000);
    const repeatFlagged = (await db.review.count({ where: { businessId, emailHash, createdAt: { gte: since } } })) > 0;
    const review = await db.review.create({
      data: {
        businessId,
        displayName: input.displayName,
        privateEmailEncrypted: this.encryption.encrypt(email, businessId),
        emailHash,
        rating: input.rating,
        originalText: input.text,
        status: 'pending',
        repeatFlagged,
        acknowledgedVersion: this.termsVersion,
        acknowledgedAt: new Date(),
        submitterIpHash: this.hash(ctx.ip),
      },
      select: { id: true },
    });
    await this.audit.record({ action: 'review.submitted', targetType: 'review', targetId: review.id, metadata: { businessId, repeatFlagged }, requestId: ctx.requestId, ipAddress: ctx.ip });
    // Neutral receipt: no review id, no hint about moderation outcome (SRS REV 002).
    return { receiptId: review.id.slice(-12), status: 'pending', message: 'Submitted for moderation' };
  }

  async publicList(businessId: string, query: ListPublicReviewsQueryDto): Promise<{ data: PublicReviewDto[]; meta: ReturnType<typeof collectionMeta> }> {
    const db = await this.database.client();
    const business = await db.business.findFirst({ where: { id: businessId, status: 'published' }, select: { id: true } });
    if (!business) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
    const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
      query.sort === 'highest' ? [{ rating: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }] : query.sort === 'lowest' ? [{ rating: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }];
    const where: Prisma.ReviewWhereInput = { businessId, status: 'approved' };
    const [rows, total] = await Promise.all([
      db.review.findMany({ where, orderBy, skip: skipFor(query.page, query.pageSize), take: query.pageSize }),
      db.review.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({ id: r.id, displayName: r.displayName, rating: r.rating, text: r.publicText ?? r.originalText, redacted: r.publicText !== null, createdAt: r.createdAt.toISOString() })),
      meta: collectionMeta(query.page, query.pageSize, total),
    };
  }

  // ---- moderation ----------------------------------------------------------

  async adminList(query: ListAdminReviewsQueryDto): Promise<{ data: AdminReviewDto[]; meta: ReturnType<typeof collectionMeta> }> {
    const db = await this.database.client();
    const where: Prisma.ReviewWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.businessId ? { businessId: query.businessId } : {}),
      ...(query.id ? { id: query.id } : {}),
      ...(query.repeatFlagged ? { repeatFlagged: true } : {}),
      ...(query.reported ? { reports: { some: { status: { in: ['open', 'investigating'] } } } } : {}),
    };
    const [rows, total] = await Promise.all([
      db.review.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: skipFor(query.page, query.pageSize),
        take: query.pageSize,
        include: { business: { select: { name: true } }, _count: { select: { reports: { where: { status: { in: ['open', 'investigating'] } } } } } },
      }),
      db.review.count({ where }),
    ]);
    return { data: rows.map((row) => this.toAdminDto(row, row.business.name, row._count.reports)), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  async adminGet(id: string): Promise<AdminReviewDto> {
    const db = await this.database.client();
    const row = await db.review.findUnique({ where: { id }, include: { business: { select: { name: true } }, _count: { select: { reports: { where: { status: { in: ['open', 'investigating'] } } } } } } });
    if (!row) throw notFound();
    return this.toAdminDto(row, row.business.name, row._count.reports);
  }

  /**
   * Applies a moderation decision and the approved aggregate in one
   * transaction (SRS REV 003/004). A repeated decision is rejected rather than
   * silently re-applied, so totals can never drift.
   */
  async moderate(id: string, action: ModerationAction, input: ModerateReviewDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminReviewDto> {
    const db = await this.database.client();
    const current = await db.review.findUnique({ where: { id }, select: { id: true, businessId: true, status: true, rating: true, version: true } });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    if (isNoOpDecision(current.status, action)) throw new ConflictException({ code: 'INVALID_STATE', message: `This review is already ${current.status}` });
    if (action !== 'approve' && !input.reason) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'A reason is required', fields: { reason: ['Give a reason for this decision'] } }, HttpStatus.BAD_REQUEST);
    }
    const next = MODERATION_ACTIONS[action];
    const delta = aggregateDelta(current.status, next, current.rating);
    await db.$transaction(async (tx) => {
      const updated = await tx.review.updateMany({
        where: { id, version: input.expectedVersion },
        data: { status: next, moderationReason: input.reason ?? null, moderatorAdminId: actor.id, decidedAt: new Date(), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw stale();
      if (delta.count !== 0) {
        await tx.businessRating.upsert({
          where: { businessId: current.businessId },
          create: { businessId: current.businessId, approvedCount: Math.max(0, delta.count), ratingSum: Math.max(0, delta.sum) },
          update: { approvedCount: { increment: delta.count }, ratingSum: { increment: delta.sum } },
        });
      }
      // Removing an approved review is urgent: the text and the aggregate it
      // fed must stop being served quickly (SRS CACHE 002).
      await this.cache.recordInvalidation(tx, {
        resourceType: 'review',
        resourceId: id,
        urgent: next !== 'approved',
        correlationId: ctx.requestId,
        tags: [CACHE_TAGS.reviews, CACHE_TAGS.reviewsFor(current.businessId), CACHE_TAGS.businesses],
      });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: `review.${action}`, actorAdminId: actor.id, targetType: 'review', targetId: id, reason: input.reason ?? null, metadata: { businessId: current.businessId, from: current.status, to: next }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.adminGet(id);
  }

  /** Editorial redaction: the published text changes, the original and the rating never do (SRS REV 003). */
  async redact(id: string, input: RedactReviewDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminReviewDto> {
    const db = await this.database.client();
    const current = await db.review.findUnique({ where: { id }, select: { version: true, businessId: true } });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    await db.$transaction(async (tx) => {
      const updated = await tx.review.updateMany({
        where: { id, version: input.expectedVersion },
        data: { publicText: input.publicText ?? null, redactionReason: input.reason, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw stale();
      // The redacted text replaces the original on the public listing straight away.
      await this.cache.recordInvalidation(tx, { resourceType: 'review', resourceId: id, urgent: true, correlationId: ctx.requestId, tags: [CACHE_TAGS.reviews, CACHE_TAGS.reviewsFor(current.businessId), CACHE_TAGS.businesses] });
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'review.redact', actorAdminId: actor.id, targetType: 'review', targetId: id, reason: input.reason, metadata: { restored: input.publicText === null }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.adminGet(id);
  }

  private toAdminDto(row: Review, businessName: string, openReportCount: number): AdminReviewDto {
    return {
      id: row.id,
      businessId: row.businessId,
      businessName,
      displayName: row.displayName,
      // Masked; the address itself is a separate permissioned, recorded read.
      email: maskEmail(this.encryption.decrypt(row.privateEmailEncrypted, row.businessId)),
      rating: row.rating,
      originalText: row.originalText,
      publicText: row.publicText,
      redactionReason: row.redactionReason,
      status: row.status,
      moderationReason: row.moderationReason,
      moderatorAdminId: row.moderatorAdminId,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      repeatFlagged: row.repeatFlagged,
      openReportCount,
      acknowledgedVersion: row.acknowledgedVersion,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * The visitor's own address, for the one record being acted on. Kept out of
   * the list, permissioned separately and recorded, so that reading a queue
   * does not read everyone's contact details (SRS MON 001).
   */
  async revealEmail(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<string | null> {
    const db = await this.database.client();
    const row = await db.review.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such record' });
    await this.audit.record({
      action: 'review.email.reveal',
      actorAdminId: actor.id,
      targetType: 'review',
      targetId: id,
      metadata: { businessId: row.businessId },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return row.privateEmailEncrypted ? this.encryption.decrypt(row.privateEmailEncrypted, row.businessId) : null;
  }
}
