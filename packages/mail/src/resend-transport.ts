import type { ResendConfig } from './resend-config.js';
import { PermanentMailError, TransientMailError, redactSensitive } from './errors.js';
import type { MailMessage, MailSendResult } from './transport.js';

/**
 * Resend implementation of the transactional mail boundary (SRS 1.2 MAIL 001).
 *
 * It speaks the provider's HTTP API directly with `fetch` rather than pulling in
 * a client library: one POST with a bearer token and an idempotency key is the
 * whole surface, and a dependency here would own our retry, timeout and error
 * classification without doing any of them the way EVT 002 requires.
 *
 * The same contract as `SmtpTransport`: it never logs, and the errors it throws
 * carry no body, subject, address or credential, so a caller may store and
 * display them (MAIL 006).
 */
export const RESEND_TIMEOUT_MS = 15_000;

export class ResendTransport {
  constructor(
    private readonly config: ResendConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Safe to print at start-up: sender and mode, never the key. */
  describe(): string {
    return `resend (${this.config.fromAddress}${this.config.webhookSecret ? ', webhook verified' : ', no webhook secret'})`;
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    const body = {
      from: message.from || this.config.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ?? this.config.replyTo ? { reply_to: message.replyTo ?? this.config.replyTo } : {}),
      // Our own identifier travels with the message so a provider event can be
      // matched back to the delivery record even before its id is stored.
      headers: { 'X-Entity-Ref-ID': message.messageId },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
          // A retry after an ambiguous timeout must not send a second copy
          // (MAIL 004): the provider collapses it onto the first attempt.
          'idempotency-key': message.messageId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      // Network failure, DNS, TLS or our own timeout: retryable by definition.
      throw new TransientMailError(summariseNetworkError(error), error);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) throw await classifyResponse(response);

    const payload = (await response.json().catch(() => ({}))) as { id?: unknown };
    return { providerMessageId: typeof payload.id === 'string' && payload.id.length > 0 ? payload.id : null };
  }
}

function summariseNetworkError(error: unknown): string {
  const name = error instanceof Error ? error.name : 'Error';
  if (name === 'AbortError' || name === 'TimeoutError') return `Resend request timed out after ${RESEND_TIMEOUT_MS} ms`;
  const code = (error as { cause?: { code?: string } } | null)?.cause?.code;
  return redactSensitive(`Resend request failed${code ? ` (${code})` : ''}`).slice(0, 300);
}

/**
 * 429 and 5xx are transient; every other 4xx is permanent, because repeating
 * the same request cannot change the outcome (MAIL 004). The provider's message
 * is kept only as a short redacted summary (MAIL 006).
 */
export async function classifyResponse(response: Response): Promise<TransientMailError | PermanentMailError> {
  let detail = '';
  try {
    const payload = (await response.json()) as { message?: unknown; name?: unknown; error?: unknown };
    const candidate = [payload.message, payload.name, payload.error].find((value) => typeof value === 'string' && value.length > 0);
    if (typeof candidate === 'string') detail = `: ${candidate}`;
  } catch {
    // A non-JSON error body tells us nothing worth keeping.
  }
  // The provider's own text can echo the request, including the key it was
  // authenticated with, so credentials are stripped as well as addresses.
  const summary = redactSensitive(`Resend responded ${response.status}${detail}`).slice(0, 300);
  if (response.status === 429 || response.status >= 500) return new TransientMailError(summary);
  return new PermanentMailError(summary);
}
