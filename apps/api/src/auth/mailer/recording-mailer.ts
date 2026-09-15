import { Logger } from '@nestjs/common';
import type { EmailDeliveryService } from '../../email/email-delivery.service.js';
import type { EmailTemplateKey } from '../../email/email-templates.js';
import { MailerPort, type OutboundMail } from './mailer.port.js';

/**
 * Records a delivery around whichever transport is configured (SRS 1.2 MAIL
 * 005). It wraps rather than reimplements, so console, SMTP and Resend all get
 * the same record without any of them knowing about the log.
 *
 * Recording never changes the outcome of sending: a delivery row that cannot be
 * written is logged and the message still goes, because losing the record of a
 * password reset is better than blocking the reset itself. The reverse — a sent
 * message with no record — is what the log is for, so it is reported.
 */
export class RecordingMailer extends MailerPort {
  private readonly logger = new Logger(RecordingMailer.name);

  constructor(
    private readonly inner: MailerPort,
    private readonly deliveries: EmailDeliveryService,
  ) {
    super();
  }

  get transportName(): string {
    return this.inner.transportName;
  }

  async send(mail: OutboundMail & { templateKey?: EmailTemplateKey; requestId?: string | null }): Promise<void> {
    const templateKey: EmailTemplateKey = mail.templateKey ?? 'auth.password_reset';
    let deliveryId: string | null = null;
    try {
      const record = await this.deliveries.record({
        templateKey,
        recipient: mail.to,
        subject: mail.subject,
        provider: this.inner.transportName,
        requestId: mail.requestId ?? null,
      });
      deliveryId = record.id;
    } catch (error) {
      this.logger.warn(`delivery record not written: ${(error as Error).name}`);
    }

    try {
      await this.inner.send(mail);
    } catch (error) {
      if (deliveryId) {
        await this.deliveries
          .markFailed(deliveryId, EmailDeliveryServiceFailureCode(error), (error as Error).message ?? 'delivery failed')
          .catch(() => this.logger.warn('delivery failure not recorded'));
      }
      throw error;
    }

    if (deliveryId) {
      // The transports for authentication mail do not return a provider id, so
      // the record says "accepted", never "delivered": only a provider event can
      // claim delivery (MAIL 008).
      await this.deliveries.markSent(deliveryId, null).catch(() => this.logger.warn('delivery acceptance not recorded'));
    }
  }
}

/** Indirection so the import stays type-only and no cycle is created. */
function EmailDeliveryServiceFailureCode(error: unknown): 'permanent_provider' | 'transient_provider' | 'unknown' {
  const name = (error as { cause?: { name?: string } })?.cause?.name ?? (error as Error)?.name;
  if (name === 'PermanentMailError') return 'permanent_provider';
  if (name === 'TransientMailError') return 'transient_provider';
  return 'unknown';
}
