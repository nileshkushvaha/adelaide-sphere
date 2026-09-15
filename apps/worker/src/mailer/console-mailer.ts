import { EnquiryMailerPort, type DeliveryResult, type OutboundEnquiryMessage } from './mailer.port.js';

/**
 * Development transport: prints the message instead of sending it. Startup
 * validation refuses it in production, so nothing can silently "deliver" to
 * stdout in a live environment.
 */
export class ConsoleEnquiryMailer extends EnquiryMailerPort {
  readonly transportName = 'console';

  async send(message: OutboundEnquiryMessage): Promise<DeliveryResult> {
    process.stdout.write(
      [
        '',
        '=== DEV ENQUIRY MAIL (not delivered) ===',
        `To: ${message.to}`,
        `From: ${message.from}`,
        message.replyTo ? `Reply-To: ${message.replyTo}` : 'Reply-To: (not set)',
        `Subject: ${message.subject}`,
        `Message-Id: ${message.messageId}`,
        '',
        message.text,
        '=== END DEV ENQUIRY MAIL ===',
        '',
      ].join('\n'),
    );
    return { providerMessageId: `console-${message.messageId}` };
  }
}
