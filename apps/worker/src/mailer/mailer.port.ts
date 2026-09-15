export interface OutboundEnquiryMessage {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  /** HTML alternative from the shared email layout; the text part is always sent. */
  html?: string;
  /** Stable id so a provider that supports idempotency can deduplicate (SRS ENQ 004). */
  messageId: string;
}

export interface DeliveryResult {
  /** The provider accepted the message; that is not proof it was delivered. */
  providerMessageId: string | null;
}

/** Retryable provider failure (429, 5xx, timeout). */
export class TransientDeliveryError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'TransientDeliveryError';
  }
}

/** Permanent failure: retrying the same message cannot help (invalid address, rejected content). */
export class PermanentDeliveryError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'PermanentDeliveryError';
  }
}

/**
 * Outbound mail boundary for the worker (SRS MOD 002, ENQ 005). The SMTP
 * adapter (`@adelaide-sphere/mail`) is the production transport and works
 * with whichever provider decision D03 selects; the console transport makes
 * local delivery observable and is refused in production.
 */
export abstract class EnquiryMailerPort {
  abstract send(message: OutboundEnquiryMessage): Promise<DeliveryResult>;
  abstract readonly transportName: string;
  /** Start-up description safe to print (host and mode, never credentials). */
  describe?(): string;
  /** Releases sockets on shutdown. */
  close?(): void;
}
