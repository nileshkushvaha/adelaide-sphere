import { maskEmail } from '@adelaide-sphere/mail';
import { CACHE_TAGS, STAFF_COMMENT_NAME, replyParentId } from '@adelaide-sphere/domain';
import { CacheService } from '../cache/cache.service.js';
import { createHmac } from 'node:crypto';
import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Comment, Prisma } from '@adelaide-sphere/database';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { FieldEncryptionService } from '../common/field-encryption.service.js';
import { collectionMeta, skipFor } from '../common/pagination.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { MODERATION_ACTIONS, isNoOpDecision, type ModerationAction } from '../reviews/review-rules.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import type {
  AdminCommentDto,
  ListAdminCommentsQueryDto,
  ListPublicCommentsQueryDto,
  ModerateCommentDto,
  PublicCommentDto,
  RedactCommentDto,
  SubmitCommentDto,
  CommentReceiptDto,
  StaffReplyDto,
} from './dto/comment.dto.js';

/** The most replies returned with one page of comments; far more than a page of conversation holds. */
const MAX_REPLIES_PER_PAGE = 500;

type ParentSummary = { displayName: string; originalText: string; publicText: string | null } | null;
const parentSelect = { select: { displayName: true, originalText: true, publicText: true } } as const;

/** Approved comments that are shown: top-level ones, and replies whose comment is shown too. */
export const visibleCommentsWhere = (postId: string): Prisma.CommentWhereInput => ({ postId, status: 'approved', OR: [{ parentId: null }, { parent: { status: 'approved' } }] });

/** SRS SEC 002: comment ceilings match reviews (five per 15 minutes, 20 per day per IP). */
const COMMENT_LIMITS = [
  { scope: 'comment:15m', max: 5, windowSeconds: 900 },
  { scope: 'comment:24h', max: 20, windowSeconds: 86_400 },
] as const;

const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Comment not found' });
const stale = () => new ConflictException({ code: 'STALE_VERSION', message: 'This comment was changed by someone else. Reload and try again.' });

/**
 * Article comments (SRS COM 001–002). They follow the review moderation rules:
 * every comment starts pending, only approved comments are public, and the
 * original text is always preserved.
 */
@Injectable()
export class CommentsService {
  private readonly secret: string;
  private readonly termsVersion: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly encryption: FieldEncryptionService,
    private readonly reviews: ReviewsService,
    private readonly cache: CacheService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secret = config.get('APP_SECRET_KEY', { infer: true });
    this.termsVersion = config.get('SUBMISSION_TERMS_VERSION', { infer: true });
  }

  private hash(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }

  async submit(postId: string, input: SubmitCommentDto, ctx: RequestContext): Promise<CommentReceiptDto> {
    const db = await this.database.client();
    // Publication and commentsEnabled are rechecked here, not trusted from the page (SRS COM 002).
    const post = await db.post.findUnique({ where: { id: postId }, select: { id: true, status: true, commentsEnabled: true } });
    if (!post || post.status !== 'published') throw new NotFoundException({ code: 'NOT_FOUND', message: 'Article not found' });
    if (!post.commentsEnabled) throw new ConflictException({ code: 'COMMENTS_CLOSED', message: 'Comments are closed on this article.' });
    if (!input.acknowledged) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'Please accept the comment guidelines and privacy notice', fields: { acknowledged: ['Acceptance is required'] } }, HttpStatus.BAD_REQUEST);
    }
    await this.reviews.guardPublicWrite({ honeypot: input.website, captchaToken: input.captchaToken, action: 'comment', limits: COMMENT_LIMITS }, ctx);

    // A reply must answer an approved comment on the same article; a reply to a reply joins that thread (two levels).
    let parentId: string | null = null;
    if (input.parentId) {
      const target = await db.comment.findFirst({ where: { id: input.parentId, postId, status: 'approved' }, select: { id: true, parentId: true, parent: { select: { status: true } } } });
      // A reply to a reply also needs its thread to be shown, or it would be stored where nobody sees it.
      if (!target || (target.parent && target.parent.status !== 'approved')) {
        throw new HttpException({ code: 'VALIDATION_ERROR', message: 'The comment you replied to is no longer available', fields: { parentId: ['The comment you replied to is no longer available'] } }, HttpStatus.BAD_REQUEST);
      }
      parentId = replyParentId(target);
    }

    const email = input.email.toLowerCase();
    const comment = await db.comment.create({
      data: {
        postId,
        parentId,
        displayName: input.displayName,
        privateEmailEncrypted: this.encryption.encrypt(email, 'comment'),
        emailHash: this.hash(email),
        originalText: input.text,
        status: 'pending',
        acknowledgedVersion: this.termsVersion,
        acknowledgedAt: new Date(),
        submitterIpHash: this.hash(ctx.ip),
      },
      select: { id: true },
    });
    await this.audit.record({ action: 'comment.submitted', targetType: 'comment', targetId: comment.id, metadata: { postId, parentId }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return { receiptId: comment.id.slice(-12), status: 'pending', message: 'Submitted for moderation' };
  }

  async publicList(postId: string, query: ListPublicCommentsQueryDto): Promise<{ data: PublicCommentDto[]; meta: ReturnType<typeof collectionMeta> }> {
    const db = await this.database.client();
    const post = await db.post.findFirst({ where: { id: postId, status: 'published' }, select: { id: true } });
    if (!post) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Article not found' });
    // Pages are of top-level comments (SRS COM 002: 20 per page, oldest first); each carries its approved replies.
    const where: Prisma.CommentWhereInput = { postId, status: 'approved', parentId: null };
    const [rows, total] = await Promise.all([
      db.comment.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: skipFor(query.page, query.pageSize), take: query.pageSize }),
      db.comment.count({ where }),
    ]);
    const replies = rows.length > 0 ? await db.comment.findMany({ where: { postId, status: 'approved', parentId: { in: rows.map((row) => row.id) } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: MAX_REPLIES_PER_PAGE }) : [];
    const byParent = new Map<string, Comment[]>();
    for (const reply of replies) byParent.set(reply.parentId!, [...(byParent.get(reply.parentId!) ?? []), reply]);
    return {
      data: rows.map((row) => ({ ...this.toPublic(row), replies: (byParent.get(row.id) ?? []).map((reply) => ({ ...this.toPublic(reply), replies: [] })) })),
      meta: collectionMeta(query.page, query.pageSize, total),
    };
  }

  private toPublic(row: Comment): Omit<PublicCommentDto, 'replies'> {
    return { id: row.id, displayName: row.displayName, text: row.publicText ?? row.originalText, redacted: row.publicText !== null, createdAt: row.createdAt.toISOString(), parentId: row.parentId, staff: row.staff };
  }

  // ---- moderation ----------------------------------------------------------

  /** Comments render on the article page and in its comment count; both refresh after a public change. */
  private async purge(tx: Prisma.TransactionClient, postId: string, slug: string, commentId: string, ctx: RequestContext): Promise<void> {
    await this.cache.recordInvalidation(tx, { resourceType: 'comment', resourceId: commentId, correlationId: ctx.requestId, tags: [CACHE_TAGS.comments, CACHE_TAGS.commentsFor(postId), CACHE_TAGS.post(slug)] });
  }

  async adminList(query: ListAdminCommentsQueryDto): Promise<{ data: AdminCommentDto[]; meta: ReturnType<typeof collectionMeta> }> {
    const db = await this.database.client();
    const where: Prisma.CommentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.id ? { id: query.id } : {}),
      ...(query.postId ? { postId: query.postId } : {}),
      ...(query.reported ? { reports: { some: { status: { in: ['open', 'investigating'] } } } } : {}),
    };
    const [rows, total] = await Promise.all([
      db.comment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: skipFor(query.page, query.pageSize),
        take: query.pageSize,
        include: { post: { select: { title: true, slug: true } }, parent: parentSelect, _count: { select: { reports: { where: { status: { in: ['open', 'investigating'] } } } } } },
      }),
      db.comment.count({ where }),
    ]);
    return { data: rows.map((row) => this.toAdminDto(row, row.post.title, row._count.reports)), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  async adminGet(id: string): Promise<AdminCommentDto> {
    const db = await this.database.client();
    const row = await db.comment.findUnique({ where: { id }, include: { post: { select: { title: true } }, parent: parentSelect, _count: { select: { reports: { where: { status: { in: ['open', 'investigating'] } } } } } } });
    if (!row) throw notFound();
    return this.toAdminDto(row, row.post.title, row._count.reports);
  }

  async moderate(id: string, action: ModerationAction, input: ModerateCommentDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminCommentDto> {
    const db = await this.database.client();
    const current = await db.comment.findUnique({ where: { id }, select: { id: true, postId: true, status: true, version: true, post: { select: { slug: true } } } });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    if (isNoOpDecision(current.status, action)) throw new ConflictException({ code: 'INVALID_STATE', message: `This comment is already ${current.status}` });
    if (action !== 'approve' && !input.reason) {
      throw new HttpException({ code: 'VALIDATION_ERROR', message: 'A reason is required', fields: { reason: ['Give a reason for this decision'] } }, HttpStatus.BAD_REQUEST);
    }
    const next = MODERATION_ACTIONS[action];
    await db.$transaction(async (tx) => {
      const updated = await tx.comment.updateMany({
        where: { id, version: input.expectedVersion },
        data: { status: next, moderationReason: input.reason ?? null, moderatorAdminId: actor.id, decidedAt: new Date(), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw stale();
      await this.purge(tx, current.postId, current.post.slug, id, ctx);
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: `comment.${action}`, actorAdminId: actor.id, targetType: 'comment', targetId: id, reason: input.reason ?? null, metadata: { postId: current.postId, from: current.status, to: next }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.adminGet(id);
  }

  async redact(id: string, input: RedactCommentDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminCommentDto> {
    const db = await this.database.client();
    const current = await db.comment.findUnique({ where: { id }, select: { version: true, postId: true, post: { select: { slug: true } } } });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    await db.$transaction(async (tx) => {
      const updated = await tx.comment.updateMany({ where: { id, version: input.expectedVersion }, data: { publicText: input.publicText ?? null, redactionReason: input.reason, version: { increment: 1 } } });
      if (updated.count !== 1) throw stale();
      await this.purge(tx, current.postId, current.post.slug, id, ctx);
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'comment.redact', actorAdminId: actor.id, targetType: 'comment', targetId: id, reason: input.reason, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.adminGet(id);
  }

  /**
   * A reply from the Adelaide Sphere team (SRS 1.10 COM 001): written by a
   * moderator, published at once under the team's name, and recorded with who
   * wrote it. Only an approved comment on a published article that is open for
   * comments can be answered; a reply to a reply joins the same thread.
   */
  async staffReply(id: string, input: StaffReplyDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminCommentDto> {
    const db = await this.database.client();
    const target = await db.comment.findUnique({ where: { id }, select: { id: true, parentId: true, postId: true, status: true, parent: { select: { status: true } }, post: { select: { status: true, commentsEnabled: true, slug: true } } } });
    if (!target) throw notFound();
    if (target.status !== 'approved') throw new ConflictException({ code: 'INVALID_STATE', message: 'Publish this comment before replying to it.' });
    if (target.parent && target.parent.status !== 'approved') throw new ConflictException({ code: 'INVALID_STATE', message: 'Publish the comment this thread starts with before replying in it.' });
    if (target.post.status !== 'published') throw new ConflictException({ code: 'INVALID_STATE', message: 'The article is not published, so replies would not be seen.' });
    if (!target.post.commentsEnabled) throw new ConflictException({ code: 'COMMENTS_CLOSED', message: 'Comments are closed on this article.' });
    const now = new Date();
    const reply = await db.$transaction(async (tx) => {
      const created = await tx.comment.create({
      data: { postId: target.postId, parentId: replyParentId(target), displayName: STAFF_COMMENT_NAME, originalText: input.text, status: 'approved', staff: true, authorAdminId: actor.id, moderatorAdminId: actor.id, decidedAt: now },
      select: { id: true },
      });
      await this.purge(tx, target.postId, target.post.slug, created.id, ctx);
      return created;
    });
    await this.cache.bumpNamespace();
    await this.audit.record({ action: 'comment.staff_reply', actorAdminId: actor.id, targetType: 'comment', targetId: reply.id, metadata: { postId: target.postId, repliedTo: id }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.adminGet(reply.id);
  }

  private toAdminDto(row: Comment & { parent: ParentSummary }, postTitle: string, openReportCount: number): AdminCommentDto {
    return {
      id: row.id,
      postId: row.postId,
      postTitle,
      parentId: row.parentId,
      parentDisplayName: row.parent?.displayName ?? null,
      parentExcerpt: row.parent ? (row.parent.publicText ?? row.parent.originalText).replace(/\s+/g, ' ').slice(0, 140) : null,
      staff: row.staff,
      displayName: row.displayName,
      // Masked; the address itself is a separate permissioned, recorded read.
      email: row.privateEmailEncrypted ? maskEmail(this.encryption.decrypt(row.privateEmailEncrypted, 'comment')) : null,
      originalText: row.originalText,
      publicText: row.publicText,
      redactionReason: row.redactionReason,
      status: row.status,
      moderationReason: row.moderationReason,
      moderatorAdminId: row.moderatorAdminId,
      decidedAt: row.decidedAt?.toISOString() ?? null,
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
    const row = await db.comment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such record' });
    await this.audit.record({
      action: 'comment.email.reveal',
      actorAdminId: actor.id,
      targetType: 'comment',
      targetId: id,
      metadata: { postId: row.postId },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return row.privateEmailEncrypted ? this.encryption.decrypt(row.privateEmailEncrypted, 'comment') : null;
  }
}
