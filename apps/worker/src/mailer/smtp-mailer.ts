import { PermanentMailError, SmtpTransport, TransientMailError, type SmtpConfig } from '@adelaide-sphere/mail';
import { EnquiryMailerPort, PermanentDeliveryError, TransientDeliveryError, type DeliveryResult, type OutboundEnquiryMessage } from './mailer.port.js';

/**
 * Production enquiry transport (SRS ENQ 004–005). Retries belong to the queue:
 * this adapter makes exactly one attempt and reports whether another can help.
 * The Message-ID is the enquiry's stable id, so a retry after an ambiguous
 * timeout is recognisable to the relay and to the recipient's mailbox.
 */
export class SmtpEnquiryMailer extends EnquiryMailerPort {
  readonly transportName = 'smtp';
  private readonly transport: SmtpTransport;

  constructor(config: SmtpConfig, transport?: SmtpTransport) {
    super();
    this.transport = transport ?? new SmtpTransport(config);
  }

  describe(): string {
    return this.transport.describe();
  }

  async send(message: OutboundEnquiryMessage): Promise<DeliveryResult> {
    try {
      const result = await this.transport.send({
        to: message.to,
        from: message.from,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
        messageId: message.messageId,
      });
      return { providerMessageId: result.providerMessageId };
    } catch (error) {
      // Messages from the transport are already redacted of addresses.
      if (error instanceof PermanentMailError) throw new PermanentDeliveryError(error.message, error);
      if (error instanceof TransientMailError) throw new TransientDeliveryError(error.message, error);
      throw new TransientDeliveryError('SMTP delivery failed', error);
    }
  }

  close(): void {
    this.transport.close();
  }
}
