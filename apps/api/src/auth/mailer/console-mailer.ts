import { MailerPort, type OutboundMail } from './mailer.port.js';

/**
 * Development-only transport: prints the message to stdout so a developer can
 * copy a reset link. Configuration validation refuses it in production.
 */
export class ConsoleMailer extends MailerPort {
  readonly transportName = 'console';

  async send(mail: OutboundMail): Promise<void> {
    process.stdout.write(`\n=== DEV MAIL (not delivered) ===\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n=== END DEV MAIL ===\n\n`);
  }
}
