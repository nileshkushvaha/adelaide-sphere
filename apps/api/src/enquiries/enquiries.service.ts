import { canChangeEnquiryHandling } from '@adelaide-sphere/domain';
import { maskEmail } from '@adelaide-sphere/mail';
import { createHmac } from 'node:crypto';
import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Enquiry, Prisma } from '@adelaide-sphere/database';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import { FieldEncryptionService } from '../common/field-encryption.service.js';
import { collectionMeta, skipFor } from '../common/pagination.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { DatabaseService } from '../database/database.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { EVENT_TYPES, OutboxService } from '../outbox/outbox.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import type { AdminEnquiryDto, ListEnquiriesQueryDto, RetryEnquiryDto, SubmitEnquiryDto, UpdateEnquiryDto, EnquiryReceiptDto } from './dto/enquiry.dto.js';
import { enquiryEvents } from '../observability/metrics.registry.js';

/** SRS SEC 002: three enquiries per 15 minutes and ten per day per trusted IP. */
const ENQUIRY_LIMITS = [
  { scope: 'enquiry:15m', max: 3, windowSeconds: 900 },
  { scope: 'enquiry:24h', max: 10, windowSeconds: 86_400 },
] as const;

const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Enquiry not found' });
const stale = () => new ConflictException({ code: 'STALE_VERSION', message: 'This enquiry was changed by someone else. Reload and try again.' });

/**
 * Visitor enquiries (SRS ENQ 001\u2013007). The enquiry row and its outbox event
 * commit together, so an accepted request is never lost; delivery itself is the
 * worker's job and the receipt never claims it happened.
 */

/**
 * A phone number with only its last digits left, for a list that must show
 * which enquiry is which without putting the number on screen.
 */
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length <= 3 ? '\u2022\u2022\u2022' : `\u2022\u2022\u2022 ${digits.slice(-3)}`;
}

@Injectable()
export class EnquiriesService {
  private readonly secret: string;
  private readonly termsVersion: string;
  private readonly siteRecipient: string | undefined;

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly encryption: FieldEncryptionService,
    private readonly outbox: OutboxService,
    private readonly reviews: ReviewsService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secret = config.get('APP_SECRET_KEY', { infer: true });
    this.termsVersion = config.get('SUBMISSION_TERMS_VERSION', { infer: true });
    this.siteRecipient = config.get('SITE_ENQUIRY_RECIPIENT', { infer: true });
  }

  /** Whether a listing can accept enquiries at all (SRS ENQ 002). */
  async routableRecipient(businessId: string): Promise<string | null> {
    const db = await this.database.client();
    const business = await db.business.findFirst({ where: { id: businessId, status: 'published' }, select: { id: true, privateEnquiryEmailEncrypted: true } });
    if (!business?.privateEnquiryEmailEncrypted) return null;
    return this.encryption.decrypt(business.privateEnquiryEmailEncrypted, business.id);
  }

  async submit(businessId: string | null, input: SubmitEnquiryDto, ctx: RequestContext): Promise<EnquiryReceiptDto> {
    const db = await this.database.client();
    let business: { id: string; name: string } | null = null;
    if (businessId) {
      const row = await db.business.findFirst({ where: { id: businessId, status: 'published' }, select: { id: true, name: true, privateEnquiryEmailEncrypted: true } });
      if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Business not found' });
      // A listing without a destination cannot accept a form at all (SRS ENQ 002).
      if (!row.privateEnquiryEmailEncrypted) throw new ConflictException({ code: 'NO_ENQUIRY_ROUTE', message: 'This business does not accept enquiries through the site. Please use its phone number or website.' });
      business = { id: row.id, name: row.name };
    } else if (!this.siteRecipient) {
      throw new ConflictException({ code: 'NO_ENQUIRY_ROUTE', message: 'General enquiries are not available right now.' });
    }
    if (!input.acknowledged) {
      const message = business ? 'Please confirm your details may be shared with the business to respond' : 'Please confirm your details may be used to respond to this enquiry';
      throw new HttpException({ code: 'VALIDATION_ERROR', message, fields: { acknowledged: ['Acceptance is required'] } }, HttpStatus.BAD_REQUEST);
    }
    // The Turnstile action is part of what the token proves (SRS SEC 002): the
    // listing form renders its widget as `enquiry` and the site contact form as
    // `contact`, so each route checks the token against its own form. Checking
    // both against `enquiry` rejected every genuine contact-form token.
    await this.reviews.guardPublicWrite({ honeypot: input.website, captchaToken: input.captchaToken, action: business ? 'enquiry' : 'contact', limits: ENQUIRY_LIMITS }, ctx);

    // The enquiry and its outbound event commit together (SRS ENQ 003, EVT 001).
    const enquiry = await db.$transaction(async (tx) => {
      const created = await tx.enquiry.create({
        data: {
          kind: business ? 'business' : 'site',
          businessId: business?.id ?? null,
          name: input.name,
          emailEncrypted: this.encryption.encrypt(input.email.toLowerCase(), 'enquiry'),
          phoneEncrypted: input.phone ? this.encryption.encrypt(input.phone, 'enquiry') : null,
          subject: input.subject,
          message: input.message,
          acknowledgedVersion: this.termsVersion,
          acknowledgedAt: new Date(),
          submitterIpHash: createHmac('sha256', this.secret).update(ctx.ip).digest('hex'),
          deliveryStatus: 'queued',
        },
        select: { id: true, version: true },
      });
      await this.outbox.write(tx, {
        type: EVENT_TYPES.enquiryAccepted,
        resourceType: 'enquiry',
        resourceId: created.id,
        resourceVersion: created.version,
        correlationId: ctx.requestId,
        // Identifiers only: the message body never enters the queue (SRS EVT 001).
        payload: { enquiryId: created.id, businessId: business?.id ?? null, kind: business ? 'business' : 'site' },
      });
      return created;
    });
    // Counted by event only. A recipient, a message or a visitor's name in a
    // label would put personal data in a metrics store (MON 001).
    enquiryEvents.inc({ event: 'accepted' });
    await this.audit.record({ action: 'enquiry.accepted', targetType: 'enquiry', targetId: enquiry.id, metadata: { businessId: business?.id ?? null }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return {
      receiptId: enquiry.id.slice(-12),
      status: 'accepted',
      message: business ? 'Your message has been accepted and is on its way to the business.' : 'Your message has been accepted and is on its way to the editors.',
    };
  }

  // ---- admin ---------------------------------------------------------------

  async list(query: ListEnquiriesQueryDto): Promise<{ data: AdminEnquiryDto[]; meta: ReturnType<typeof collectionMeta> }> {
    const db = await this.database.client();
    const where: Prisma.EnquiryWhereInput = {
      ...(query.handlingStatus ? { handlingStatus: query.handlingStatus } : {}),
      ...(query.deliveryStatus ? { deliveryStatus: query.deliveryStatus } : {}),
      ...(query.businessId ? { businessId: query.businessId } : {}),
    };
    const [rows, total] = await Promise.all([
      db.enquiry.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: skipFor(query.page, query.pageSize), take: query.pageSize, include: { business: { select: { name: true } } } }),
      db.enquiry.count({ where }),
    ]);
    return { data: rows.map((row) => this.toDto(row, row.business?.name ?? null)), meta: collectionMeta(query.page, query.pageSize, total) };
  }

  async get(id: string): Promise<AdminEnquiryDto> {
    const db = await this.database.client();
    const row = await db.enquiry.findUnique({ where: { id }, include: { business: { select: { name: true } } } });
    if (!row) throw notFound();
    return this.toDto(row, row.business?.name ?? null);
  }

  /** Handling state only; it says nothing about delivery (SRS ENQ 004). */
  async updateHandling(id: string, input: UpdateEnquiryDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminEnquiryDto> {
    const db = await this.database.client();
    const current = await db.enquiry.findUnique({ where: { id }, select: { version: true, handlingStatus: true } });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    // Start, close and reopen only: never back to `new`, never to the same status (ENQ 004).
    if (!canChangeEnquiryHandling(current.handlingStatus, input.handlingStatus)) {
      throw new ConflictException({ code: 'INVALID_TRANSITION', message: `An enquiry that is ${current.handlingStatus === 'inProgress' ? 'in progress' : current.handlingStatus} cannot be marked ${input.handlingStatus === 'inProgress' ? 'in progress' : input.handlingStatus}.` });
    }
    const updated = await db.enquiry.updateMany({ where: { id, version: input.expectedVersion }, data: { handlingStatus: input.handlingStatus, handledByAdminId: actor.id, version: { increment: 1 } } });
    if (updated.count !== 1) throw stale();
    await this.audit.record({ action: 'enquiry.handling', actorAdminId: actor.id, targetType: 'enquiry', targetId: id, metadata: { from: current.handlingStatus, to: input.handlingStatus }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.get(id);
  }

  /** Re-queues a failed or suppressed delivery through a fresh outbox event (SRS ENQ 006). */
  async retryDelivery(id: string, input: RetryEnquiryDto, actor: AdminPrincipal, ctx: RequestContext): Promise<AdminEnquiryDto> {
    const db = await this.database.client();
    const current = await db.enquiry.findUnique({ where: { id }, select: { id: true, version: true, businessId: true, kind: true, deliveryStatus: true } });
    if (!current) throw notFound();
    if (current.version !== input.expectedVersion) throw stale();
    if (current.deliveryStatus !== 'failed' && current.deliveryStatus !== 'suppressed') {
      throw new ConflictException({ code: 'INVALID_STATE', message: `Only failed or suppressed deliveries can be retried (this one is ${current.deliveryStatus})` });
    }
    await db.$transaction(async (tx) => {
      const updated = await tx.enquiry.updateMany({ where: { id, version: input.expectedVersion }, data: { deliveryStatus: 'queued', lastError: null, suppressionReason: null, version: { increment: 1 } } });
      if (updated.count !== 1) throw stale();
      await this.outbox.write(tx, {
        type: EVENT_TYPES.enquiryAccepted,
        resourceType: 'enquiry',
        resourceId: id,
        resourceVersion: current.version + 1,
        correlationId: ctx.requestId,
        payload: { enquiryId: id, businessId: current.businessId, kind: current.kind, retry: true },
      });
    });
    enquiryEvents.inc({ event: 'retry_requested' });
    await this.audit.record({ action: 'enquiry.retry', actorAdminId: actor.id, targetType: 'enquiry', targetId: id, reason: input.reason, metadata: { from: current.deliveryStatus }, requestId: ctx.requestId, ipAddress: ctx.ip });
    return this.get(id);
  }

  private toDto(row: Enquiry, businessName: string | null): AdminEnquiryDto {
    return {
      id: row.id,
      kind: row.kind,
      businessId: row.businessId,
      businessName,
      name: row.name,
      // Masked, not decrypted: a list of twenty enquiries used to put twenty
      // visitors' addresses on screen whether or not anyone needed one, and
      // materialise them in plaintext whether or not anyone looked. The whole
      // address is a separate, permissioned, recorded request (SRS ENQ 007).
      email: maskEmail(this.encryption.decrypt(row.emailEncrypted, 'enquiry')),
      phone: row.phoneEncrypted ? maskPhone(this.encryption.decrypt(row.phoneEncrypted, 'enquiry')) : null,
      subject: row.subject,
      message: row.message,
      handlingStatus: row.handlingStatus,
      deliveryStatus: row.deliveryStatus,
      deliveryAttempts: row.deliveryAttempts,
      lastError: row.lastError,
      suppressionReason: row.suppressionReason,
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      handledByAdminId: row.handledByAdminId,
      acknowledgedVersion: row.acknowledgedVersion,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * The whole contact detail, for the one record being acted on.
   *
   * Separate from the list because a moderator reading a queue does not need
   * anyone's address, and the recording is the point: without it there is no
   * answer to "who looked at this person's email" (SRS ENQ 007, MON 001).
   */
  async revealContact(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<{ email: string; phone: string | null }> {
    const db = await this.database.client();
    const row = await db.enquiry.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such enquiry' });
    await this.audit.record({
      action: 'enquiry.contact.reveal',
      actorAdminId: actor.id,
      targetType: 'enquiry',
      targetId: id,
      metadata: { businessId: row.businessId },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return {
      email: this.encryption.decrypt(row.emailEncrypted, 'enquiry'),
      phone: row.phoneEncrypted ? this.encryption.decrypt(row.phoneEncrypted, 'enquiry') : null,
    };
  }
}
