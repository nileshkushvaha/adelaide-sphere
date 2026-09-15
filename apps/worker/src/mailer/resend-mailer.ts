import { PermanentMailError, ResendTransport, TransientMailError, type ResendConfig } from '@adelaide-sphere/mail';
import { EnquiryMailerPort, PermanentDeliveryError, TransientDeliveryError, type DeliveryResult, type OutboundEnquiryMessage } from './mailer.port.js';

/**
 * Enquiry delivery through Resend (SRS 1.2 MAIL 002, ENQ 004–005).
 *
 * The same adapter shape as the SMTP transport, for the same reason: retries
 * belong to the queue, so this makes exactly one attempt and reports whether
 * another can help. Without it the worker could not deliver an enquiry under
 * the provider the client chose — the API accepted `MAIL_TRANSPORT=resend`
 * while the worker refused to start on it (audit F-02).
 */
export class ResendEnquiryMailer extends EnquiryMailerPort {
  readonly transportName = 'resend';
  private readonly transport: ResendTransport;

  constructor(config: ResendConfig, transport?: ResendTransport) {
    super();
    this.transport = transport ?? new ResendTransport(config);
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
      // The transport has already removed addresses and the key from its message.
      if (error instanceof PermanentMailError) throw new PermanentDeliveryError(error.message, error);
      if (error instanceof TransientMailError) throw new TransientDeliveryError(error.message, error);
      throw new TransientDeliveryError('Resend delivery failed', error);
    }
  }
}
