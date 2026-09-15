/**
 * Outcome classes for one delivery attempt (SRS ENQ 004): the caller decides
 * whether to retry from the class, never from provider-specific strings.
 */

/** Retryable failure: the provider was unreachable, timed out, throttled us or answered 4xx. */
export class TransientMailError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'TransientMailError';
  }
}

/** Permanent failure: the same message can never be accepted (bad address, refused content, bad credentials, invalid headers). */
export class PermanentMailError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'PermanentMailError';
  }
}

const ADDRESS = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ANGLE_ADDRESS = /<[^>\s]+@[^>\s]+>/g;

/**
 * Removes email addresses from text that is going to be logged or stored as a
 * failure reason (SRS MON 001, ENQ 007). SMTP servers echo the recipient in
 * many rejections ("550 5.1.1 <someone@example.com>: user unknown").
 */
export function redactAddresses(text: string): string {
  return text.replace(ANGLE_ADDRESS, '<redacted>').replace(ADDRESS, '[redacted]');
}

/**
 * Credential shapes that must never survive into a message we store or log.
 *
 * A provider's own error text is not ours to trust: it can echo the request,
 * including the key it was authenticated with. Redacting *addresses* alone left
 * that open — an echoed key would have reached the delivery record and the
 * application log (found during post-audit remediation).
 */
const CREDENTIAL_PATTERNS = [
  /\bre_[A-Za-z0-9_-]{8,}/g, // Resend API keys
  /\bwhsec_[A-Za-z0-9_+/=-]{8,}/g, // Resend webhook secrets
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi,
  /\bsk_(?:live|test)_[A-Za-z0-9]{8,}/g,
];

export function redactCredentials(text: string): string {
  return CREDENTIAL_PATTERNS.reduce((out, pattern) => out.replace(pattern, '[redacted-credential]'), text);
}

/**
 * Everything a message may not carry out of the mail boundary: addresses and
 * credentials, in that order, so an address inside a credential-shaped token is
 * still removed.
 */
export function redactSensitive(text: string): string {
  return redactCredentials(redactAddresses(text));
}


/**
 * Display form of a recipient (SRS 1.2 MAIL 005, PRIV 001). Enough to recognise
 * an address you already know, not enough to learn one you do not: the first and
 * last character of the local part survive, and the domain is kept because it is
 * what an operator diagnoses with.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) return '\u2022\u2022\u2022';
  const local = address.slice(0, at);
  const domain = address.slice(at);
  if (local.length <= 2) return `${local[0] ?? '\u2022'}\u2022\u2022\u2022${domain}`;
  return `${local[0]}${'\u2022'.repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}${domain}`;
}
