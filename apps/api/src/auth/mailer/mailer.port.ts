export interface OutboundMail {
  to: string;
  subject: string;
  text: string;
  /** HTML alternative from the shared email layout; the text part is always sent. */
  html?: string;
}

/**
 * Minimal outbound-mail boundary for authentication messages. The durable
 * enquiry pipeline (SRS ENQ 003+) is a separate outbox/worker design; this
 * port only needs "deliver or report that delivery is unavailable".
 */
export abstract class MailerPort {
  /** Resolves when accepted for delivery; rejects when delivery is impossible. */
  abstract send(mail: OutboundMail): Promise<void>;
  abstract readonly transportName: string;
}
