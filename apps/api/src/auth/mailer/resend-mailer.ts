import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PermanentMailError, ResendTransport, resendConfigFromEnv } from '@adelaide-sphere/mail';
import { randomUUID } from 'node:crypto';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { MailerPort, type OutboundMail } from './mailer.port.js';

/**
 * Authentication mail through the Resend provider (SRS 1.2 MAIL 001). Same
 * contract as `SmtpMailer`: one attempt per request, because these messages are
 * re-requested by the person rather than retried by a queue, and a failure is
 * reported as "delivery unavailable" with nothing logged beyond the class.
 */
export class ResendMailer extends MailerPort {
  readonly transportName = 'resend';
  private readonly logger = new Logger(ResendMailer.name);

  constructor(
    private readonly transport: ResendTransport,
    private readonly from: string,
    private readonly messageDomain: string,
  ) {
    super();
    this.logger.log(`authentication mail via ${transport.describe()}`);
  }

  static fromConfig(config: ConfigService<EnvironmentVariables, true>): ResendMailer {
    const { config: resend, problems } = resendConfigFromEnv(
      {
        RESEND_API_KEY: config.get('RESEND_API_KEY', { infer: true }),
        MAIL_FROM_ADDRESS: config.get('MAIL_FROM_ADDRESS', { infer: true }),
        MAIL_FROM_NAME: config.get('MAIL_FROM_NAME', { infer: true }),
        MAIL_REPLY_TO_ADDRESS: config.get('MAIL_REPLY_TO_ADDRESS', { infer: true }),
        RESEND_WEBHOOK_SECRET: config.get('RESEND_WEBHOOK_SECRET', { infer: true }),
        RESEND_API_BASE_URL: config.get('RESEND_API_BASE_URL', { infer: true }),
      },
      { production: config.get('NODE_ENV', { infer: true }) === 'production' },
    );
    // validateEnv has already refused these; the check keeps the type honest.
    if (!resend) throw new Error(`Invalid mail configuration:\n${problems.join('\n')}`);
    return new ResendMailer(new ResendTransport(resend), resend.from, resend.fromAddress.slice(resend.fromAddress.indexOf('@') + 1));
  }

  async send(mail: OutboundMail): Promise<void> {
    try {
      await this.transport.send({
        to: mail.to,
        from: this.from,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        messageId: `${randomUUID()}@${this.messageDomain}`,
      });
    } catch (error) {
      // Class only: never the recipient, subject, body or key (SRS MON 001, MAIL 006).
      this.logger.warn(`authentication mail not delivered: ${error instanceof PermanentMailError ? 'permanent' : 'transient'} failure`);
      throw new Error('Mail delivery is unavailable', { cause: error });
    }
  }
}
