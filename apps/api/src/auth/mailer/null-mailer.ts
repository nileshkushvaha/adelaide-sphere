import { Logger } from '@nestjs/common';
import { MailerPort, type OutboundMail } from './mailer.port.js';

/** Production default until an email provider is configured (SRS D03): nothing is sent, nothing is logged. */
export class NullMailer extends MailerPort {
  readonly transportName = 'none';
  private readonly logger = new Logger(NullMailer.name);

  async send(mail: OutboundMail): Promise<void> {
    this.logger.warn(`mail transport "none": message "${mail.subject}" not delivered`);
    throw new Error('Mail delivery is not configured');
  }
}
