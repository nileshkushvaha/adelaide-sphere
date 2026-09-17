import { Logger, type OnModuleDestroy } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { PermanentMailError, SmtpTransport, smtpConfigFromEnv } from '@adelaide-sphere/mail';
import { randomUUID } from 'node:crypto';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { MailerPort, type OutboundMail } from './mailer.port.js';

/**
 * Production transport for authentication mail (password reset, account
 * set-up). One attempt per request: these messages are re-requested by the
 * person, not retried by a queue, so a failure is reported as "delivery
 * unavailable" and nothing is logged beyond the redacted error class.
 */
export class SmtpMailer extends MailerPort implements OnModuleDestroy {
  readonly transportName = 'smtp';
  private readonly logger = new Logger(SmtpMailer.name);

  constructor(
    private readonly transport: SmtpTransport,
    private readonly fromAddress: string,
    private readonly messageDomain: string,
  ) {
    super();
    this.logger.log(`authentication mail via ${transport.describe()}`);
  }

  static fromConfig(config: ConfigService<EnvironmentVariables, true>): SmtpMailer {
    const { config: smtp, problems } = smtpConfigFromEnv(
      {
        SMTP_HOST: config.get('SMTP_HOST', { infer: true }),
        SMTP_PORT: config.get('SMTP_PORT', { infer: true }),
        SMTP_SECURE: config.get('SMTP_SECURE', { infer: true }),
        SMTP_USER: config.get('SMTP_USER', { infer: true }),
        SMTP_PASSWORD: config.get('SMTP_PASSWORD', { infer: true }),
        MAIL_FROM_NAME: config.get('MAIL_FROM_NAME', { infer: true }),
      },
      { production: config.get('NODE_ENV', { infer: true }) === 'production' },
    );
    const from = config.get('MAIL_FROM_ADDRESS', { infer: true });
    // validateEnv has already refused these; the check keeps the type honest.
    if (!smtp || !from) throw new Error(`Invalid mail configuration:\n${problems.join('\n')}`);
    return new SmtpMailer(new SmtpTransport(smtp), from, from.slice(from.indexOf('@') + 1));
  }

  async send(mail: OutboundMail): Promise<void> {
    try {
      await this.transport.send({
        to: mail.to,
        from: this.fromAddress,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        messageId: `${randomUUID()}@${this.messageDomain}`,
      });
    } catch (error) {
      // Class and code only: never the recipient, subject or body (SRS MON 001).
      this.logger.warn(`authentication mail not delivered: ${error instanceof PermanentMailError ? 'permanent' : 'transient'} failure`);
      throw new Error('Mail delivery is unavailable', { cause: error });
    }
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
