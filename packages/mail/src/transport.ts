import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import type { SmtpConfig } from './config.js';
import { PermanentMailError, TransientMailError, redactSensitive } from './errors.js';

/** One transactional message. Everything that becomes a header is validated before it reaches the transport. */
export interface MailMessage {
  to: string;
  from: string;
  replyTo?: string | undefined;
  subject: string;
  /** Plain-text body; always sent (SRS ENQ 005 requires one). */
  text: string;
  /** Optional HTML alternative, already escaped by the layout that built it. */
  html?: string | undefined;
  /**
   * Stable, caller-owned identifier (for example the enquiry id). It becomes the
   * Message-ID header, so a retry after an ambiguous timeout carries the same id
   * and providers that deduplicate on it do so (SRS ENQ 004).
   */
  messageId: string;
}

export interface MailSendResult {
  /** The id the provider or the transport reported; acceptance is not proof of delivery. */
  providerMessageId: string | null;
}

/** Bounded per-attempt limits; the queue owns the retry count and backoff (SRS ENQ 004, EVT 002). */
export const SMTP_TIMEOUTS_MS = Object.freeze({ dns: 5_000, connection: 10_000, greeting: 10_000, socket: 30_000 });

/** Enquiry bodies are at most 5,000 characters (SRS ENQ 001); this bound only stops a runaway caller. */
export const MAX_TEXT_BYTES = 256 * 1024;
const HEADER_INJECTION = /[\r\n\0]/;
const ADDRESS_SHAPE = /^[^\s@<>,;"()[\]\\]+@[^\s@<>,;"()[\]\\]+\.[A-Za-z0-9-]{2,}$/;
const MESSAGE_ID_SHAPE = /^[A-Za-z0-9._+-]{1,120}@[A-Za-z0-9.-]{1,120}$/;
const TRANSIENT_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ETLS', 'EPROTOCOL', 'ESTREAM', 'EMAXLIMIT', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', 'EPIPE']);
const PERMANENT_CODES = new Set(['EAUTH', 'ENOAUTH', 'EENVELOPE', 'EMESSAGE', 'EREQUIRETLS', 'ECONFIG', 'EMAXRECIPIENTS']);

interface TransportErrorShape {
  code?: string;
  responseCode?: number;
  message?: string;
}

export type TransporterFactory = (options: Parameters<typeof nodemailer.createTransport>[0]) => Transporter;

/**
 * SMTP implementation of the transactional mail boundary. It never logs, and
 * the errors it throws never contain a body, a subject or an address: the
 * caller may store and log them (SRS ENQ 007, MON 001).
 */
export class SmtpTransport {
  private readonly transporter: Transporter;

  constructor(
    private readonly config: SmtpConfig,
    createTransport: TransporterFactory = (options) => nodemailer.createTransport(options),
  ) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: config.requireTls,
      ...(config.auth ? { auth: { user: config.auth.user, pass: config.auth.pass } } : {}),
      dnsTimeout: SMTP_TIMEOUTS_MS.dns,
      connectionTimeout: SMTP_TIMEOUTS_MS.connection,
      greetingTimeout: SMTP_TIMEOUTS_MS.greeting,
      socketTimeout: SMTP_TIMEOUTS_MS.socket,
      // One connection per message: no pool to leak, no idle sockets to time out mid-retry.
      pool: false,
      logger: false,
      debug: false,
      tls: { minVersion: 'TLSv1.2' },
      // The message is composed in memory; nothing may be read from disk or fetched by URL.
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  /** Description safe to print at start-up: host, port and mode, never credentials. */
  describe(): string {
    const mode = this.config.secure ? 'tls' : this.config.requireTls ? 'starttls' : 'plaintext';
    return `smtp ${this.config.host}:${this.config.port} (${mode}${this.config.auth ? ', authenticated' : ', no auth'})`;
  }

  /** Opens and closes one connection (EHLO/AUTH) to prove the relay accepts us; used by readiness checks, never by request handlers. */
  async verify(): Promise<void> {
    try {
      await this.transporter.verify();
    } catch (error) {
      throw classify(error);
    }
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    const options = toSendOptions(message);
    let info: { messageId?: string; accepted?: unknown[]; rejected?: unknown[] };
    try {
      info = (await this.transporter.sendMail(options)) as typeof info;
    } catch (error) {
      throw classify(error);
    }
    if (Array.isArray(info.rejected) && info.rejected.length > 0 && (!Array.isArray(info.accepted) || info.accepted.length === 0)) {
      throw new PermanentMailError('SMTP relay rejected the recipient');
    }
    return { providerMessageId: info.messageId ?? null };
  }

  close(): void {
    this.transporter.close();
  }
}

/** Builds the nodemailer options, refusing anything that could inject a header (SRS ENQ 005). */
export function toSendOptions(message: MailMessage): SendMailOptions {
  for (const [name, value] of [
    ['to', message.to],
    ['from', message.from],
    ['replyTo', message.replyTo ?? ''],
    ['subject', message.subject],
    ['messageId', message.messageId],
  ] as const) {
    if (HEADER_INJECTION.test(value)) throw new PermanentMailError(`Refusing to send: ${name} contains a line break`);
  }
  if (!ADDRESS_SHAPE.test(message.to)) throw new PermanentMailError('Refusing to send: recipient address is not valid');
  if (!ADDRESS_SHAPE.test(message.from)) throw new PermanentMailError('Refusing to send: sender address is not valid');
  if (message.replyTo !== undefined && message.replyTo !== '' && !ADDRESS_SHAPE.test(message.replyTo)) throw new PermanentMailError('Refusing to send: reply-to address is not valid');
  if (!MESSAGE_ID_SHAPE.test(message.messageId)) throw new PermanentMailError('Refusing to send: message id must look like local-part@domain');
  if (message.subject.trim().length === 0 || message.subject.length > 998) throw new PermanentMailError('Refusing to send: subject is empty or too long');
  if (typeof message.text !== 'string' || message.text.length === 0) throw new PermanentMailError('Refusing to send: body is empty');
  if (Buffer.byteLength(message.text, 'utf8') > MAX_TEXT_BYTES) throw new PermanentMailError('Refusing to send: body exceeds the size limit');
  if (message.html !== undefined && Buffer.byteLength(message.html, 'utf8') > MAX_TEXT_BYTES) throw new PermanentMailError('Refusing to send: HTML body exceeds the size limit');
  return {
    to: message.to,
    from: message.from,
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    subject: message.subject,
    text: message.text,
    // The HTML part is optional and is built by the shared layout, which escapes
    // everything; the plain-text part is always present (SRS ENQ 005).
    ...(message.html ? { html: message.html } : {}),
    messageId: `<${message.messageId}>`,
    // Nothing in a message may make the transport read a file or fetch a URL,
    // whichever part it appears in.
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}

/**
 * Maps a transport failure onto retryable/permanent without leaking what was
 * being sent: 4xx and network-level errors are transient; 5xx, authentication
 * and envelope errors are permanent.
 */
export function classify(error: unknown): TransientMailError | PermanentMailError {
  if (error instanceof TransientMailError || error instanceof PermanentMailError) return error;
  const shape = (typeof error === 'object' && error !== null ? error : {}) as TransportErrorShape;
  const code = shape.code ?? 'UNKNOWN';
  const status = typeof shape.responseCode === 'number' ? shape.responseCode : null;
  // A relay can echo the credential it rejected, so the same redaction applies
  // here as on the HTTP provider.
  const summary = redactSensitive(`SMTP ${code}${status !== null ? ` ${status}` : ''}: ${shape.message ?? 'delivery failed'}`).slice(0, 300);
  if (status !== null) return status >= 500 ? new PermanentMailError(summary, error) : new TransientMailError(summary, error);
  if (PERMANENT_CODES.has(code)) return new PermanentMailError(summary, error);
  if (TRANSIENT_CODES.has(code)) return new TransientMailError(summary, error);
  // Unknown failures are retried: the queue bounds the attempts, and a wrongly
  // permanent classification would silently drop an accepted enquiry.
  return new TransientMailError(summary, error);
}
