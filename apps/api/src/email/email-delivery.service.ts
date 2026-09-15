import { redactFailureSummary } from '@adelaide-sphere/domain';
import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { EmailDelivery, EmailDeliveryStatus, Prisma } from '@adelaide-sphere/database';
import { PermanentMailError } from '@adelaide-sphere/mail';
import { AuditService, type AuditWriteClient } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { FieldEncryptionService } from '../common/field-encryption.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { emailTemplate, isEmailTemplateKey, maskEmail, type EmailFailureCode, type EmailTemplateKey } from './email-templates.js';
import { emailDeliveries } from '../observability/metrics.registry.js';

/**
 * How meaningful a status is (SRS 1.2 MAIL 008). A late or replayed event may
 * add its own timestamp, but it can never move the record to a less meaningful
 * state: complained and suppressed outrank bounced, bounced outranks delivered,
 * delivered outranks sent, sent outranks queued.
 */
const STATUS_RANK: Record<EmailDeliveryStatus, number> = {
  queued: 0,
  delayed: 1,
  sent: 2,
  delivered: 3,
  failed: 4,
  bounced: 5,
  complained: 6,
  suppressed: 6,
};

/** Statuses that must not be resent without a separately approved recovery workflow (MAIL 009). */
const RESEND_REFUSED: EmailDeliveryStatus[] = ['delivered', 'complained', 'suppressed'];

const TIMESTAMP_FIELD: Partial<Record<EmailDeliveryStatus, keyof Prisma.EmailDeliveryUpdateInput>> = {
  sent: 'sentAt',
  delivered: 'deliveredAt',
  delayed: 'delayedAt',
  failed: 'failedAt',
  bounced: 'bouncedAt',
  complained: 'complainedAt',
  suppressed: 'suppressedAt',
};

export interface RecordDeliveryInput {
  templateKey: EmailTemplateKey;
  recipient: string;
  subject: string;
  provider: string;
  relatedType?: string | null;
  relatedId?: string | null;
  requestId?: string | null;
  resentFromId?: string | null;
}

export interface ProviderEventInput {
  providerEventId: string;
  providerMessageId: string;
  status: EmailDeliveryStatus;
  occurredAt: Date;
  /** Safe summary only: never a body, a raw payload or a header (MAIL 006). */
  detail?: Record<string, string | number | boolean | null>;
}

export type ProviderEventOutcome = 'applied' | 'duplicate' | 'unknown_message' | 'ignored';

/**
 * Delivery records for transactional email (SRS 1.2 MAIL 005–009).
 *
 * Operational metadata only: no rendered body is stored, the recipient is
 * encrypted with a masked form beside it, and failures are recorded as a
 * bounded code plus a redacted summary.
 */
@Injectable()
export class EmailDeliveryService {
  private readonly logger = new Logger(EmailDeliveryService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
    private readonly encryption: FieldEncryptionService,
  ) {}

  /** Creates the record for a message about to be dispatched. */
  async record(input: RecordDeliveryInput): Promise<EmailDelivery> {
    if (!isEmailTemplateKey(input.templateKey)) throw new Error(`unknown email template: ${input.templateKey}`);
    const template = emailTemplate(input.templateKey);
    const db = await this.database.client();
    return db.emailDelivery.create({
      data: {
        provider: input.provider.slice(0, 20),
        templateKey: input.templateKey,
        category: template.category,
        recipientMasked: maskEmail(input.recipient),
        recipientEncrypted: this.encryption.encrypt(input.recipient),
        // Withheld for anything that could carry a visitor's own words.
        subject: template.retainSubject ? input.subject.slice(0, 255) : null,
        relatedType: input.relatedType ?? null,
        relatedId: input.relatedId ?? null,
        requestId: input.requestId ?? null,
        resentFromId: input.resentFromId ?? null,
        status: 'queued',
      },
    });
  }

  /** The provider accepted the message; acceptance is not delivery (MAIL 008). */
  async markSent(id: string, providerMessageId: string | null): Promise<void> {
    const db = await this.database.client();
    await db.emailDelivery.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date(), attempts: { increment: 1 }, providerMessageId, failureCode: null, failureSummary: null },
    });
    // Provider and outcome only: never the recipient (MON 001).
    emailDeliveries.inc({ provider: 'api', outcome: 'sent' });
  }

  /**
   * The attempt failed. The summary is redacted here rather than by the caller:
   * every transport had been passing the driver's raw message, which carries
   * the recipient's address, the SMTP host and port, and sometimes credentials
   * — and it is shown on the email log screen (MAIL 006, MON 001).
   */
  async markFailed(id: string, code: EmailFailureCode, summary: string): Promise<void> {
    const db = await this.database.client();
    await db.emailDelivery.update({
      where: { id },
      data: { status: 'failed', failedAt: new Date(), attempts: { increment: 1 }, failureCode: code, failureSummary: redactFailureSummary(summary) },
    });
    // The failure code is itself a closed vocabulary, so it is a safe label and
    // says whether the failure was permanent without a second metric.
    emailDeliveries.inc({ provider: 'api', outcome: `failed_${code}` });
  }

  /**
   * Applies one verified provider event (MAIL 007/008). Idempotent by the
   * provider's own event id, tolerant of out-of-order delivery, and never
   * lowers a more meaningful status.
   */
  async applyProviderEvent(input: ProviderEventInput): Promise<ProviderEventOutcome> {
    const db = await this.database.client();
    const delivery = await db.emailDelivery.findUnique({ where: { providerMessageId: input.providerMessageId } });
    if (!delivery) return 'unknown_message';

    try {
      return await db.$transaction(async (tx) => {
        await tx.emailDeliveryEvent.create({
          data: {
            deliveryId: delivery.id,
            providerEventId: input.providerEventId,
            type: input.status,
            occurredAt: input.occurredAt,
            detail: (input.detail ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });

        const timestampField = TIMESTAMP_FIELD[input.status];
        const data: Prisma.EmailDeliveryUpdateInput = {};
        // The event's own timestamp is always recorded, even when the status
        // does not move, so the timeline stays complete.
        if (timestampField) (data as Record<string, unknown>)[timestampField] = input.occurredAt;
        if (STATUS_RANK[input.status] > STATUS_RANK[delivery.status]) data.status = input.status;
        await tx.emailDelivery.update({ where: { id: delivery.id }, data });
        // The provider's own verdict, by status name — a closed vocabulary.
        emailDeliveries.inc({ provider: delivery.provider.slice(0, 20), outcome: input.status });
        return 'applied' as const;
      });
    } catch (error) {
      // A repeated event id is the provider retrying: that is success, not failure.
      if ((error as { code?: string }).code === 'P2002') return 'duplicate';
      throw error;
    }
  }

  // ---- admin reads ----------------------------------------------------------

  async list(query: {
    page: number;
    pageSize: number;
    status?: EmailDeliveryStatus;
    category?: string;
    templateKey?: string;
    provider?: string;
    from?: Date;
    to?: Date;
    search?: string;
  }) {
    const db = await this.database.client();
    const where: Prisma.EmailDeliveryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.templateKey ? { templateKey: query.templateKey } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
      // Search is on identifiers only: a recipient is never searchable, because
      // that would make the encrypted column guessable one query at a time.
      ...(query.search ? { OR: [{ id: query.search }, { providerMessageId: query.search }, { relatedId: query.search }] } : {}),
    };
    const [rows, total] = await Promise.all([
      db.emailDelivery.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      db.emailDelivery.count({ where }),
    ]);
    return { rows, total };
  }

  async detail(id: string) {
    const db = await this.database.client();
    const delivery = await db.emailDelivery.findUnique({ where: { id }, include: { events: { orderBy: { occurredAt: 'asc' }, take: 50 } } });
    if (!delivery) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such delivery' });
    return delivery;
  }

  /**
   * Reveals the recipient address (MAIL 005). A permission distinct from
   * viewing the record is required by the route, and every reveal is recorded.
   */
  async revealRecipient(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<string> {
    const db = await this.database.client();
    const delivery = await db.emailDelivery.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such delivery' });
    await this.audit.record({
      action: 'email.recipient.reveal',
      actorAdminId: actor.id,
      targetType: 'email_delivery',
      targetId: id,
      metadata: { templateKey: delivery.templateKey, category: delivery.category },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return this.encryption.decrypt(delivery.recipientEncrypted);
  }

  // ---- resend ---------------------------------------------------------------

  /**
   * Prepares a resend (MAIL 009): refuses a delivered, complained about or
   * suppressed message and a template that is not resendable, then creates a
   * new attempt linked to the original. The caller dispatches it.
   */
  async prepareResend(id: string, actor: AdminPrincipal, ctx: RequestContext): Promise<{ original: EmailDelivery; replacement: EmailDelivery; recipient: string }> {
    const db = await this.database.client();
    const original = await db.emailDelivery.findUnique({ where: { id } });
    if (!original) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such delivery' });

    if (RESEND_REFUSED.includes(original.status)) {
      throw new HttpException(
        { code: 'RESEND_REFUSED', message: `A message that was ${original.status} is not resent. Contact the recipient another way.` },
        HttpStatus.CONFLICT,
      );
    }
    if (!isEmailTemplateKey(original.templateKey) || !emailTemplate(original.templateKey).resendable) {
      throw new ForbiddenException({ code: 'RESEND_NOT_SUPPORTED', message: 'This kind of message is not resent from the log.' });
    }

    const recipient = this.encryption.decrypt(original.recipientEncrypted);
    const replacement = await db.$transaction(async (tx) => {
      const created = await tx.emailDelivery.create({
        data: {
          provider: original.provider,
          templateKey: original.templateKey,
          category: original.category,
          recipientMasked: original.recipientMasked,
          recipientEncrypted: original.recipientEncrypted,
          subject: original.subject,
          relatedType: original.relatedType,
          relatedId: original.relatedId,
          requestId: ctx.requestId,
          resentFromId: original.id,
          status: 'queued',
        },
      });
      await this.audit.recordWith(tx as unknown as AuditWriteClient, {
        action: 'email.resend',
        actorAdminId: actor.id,
        targetType: 'email_delivery',
        targetId: original.id,
        metadata: { replacementId: created.id, templateKey: original.templateKey, previousStatus: original.status },
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return created;
    });

    return { original, replacement, recipient };
  }

  /** Maps a transport failure onto a bounded code (MAIL 006). */
  static failureCodeOf(error: unknown): EmailFailureCode {
    if (error instanceof PermanentMailError) return 'permanent_provider';
    if (error instanceof Error && /timed out|ECONN|ENOTFOUND|EAI_AGAIN/i.test(error.message)) return 'transient_provider';
    if (error instanceof Error && /429/.test(error.message)) return 'rate_limited';
    return 'unknown';
  }
}
