import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verification for Resend's delivery webhooks (SRS 1.2 MAIL 007).
 *
 * Resend signs with Svix: three headers (`svix-id`, `svix-timestamp`,
 * `svix-signature`) over the exact raw body, with a secret of the form
 * `whsec_<base64>`. The signed content is `id.timestamp.body`, the signature is
 * base64 HMAC-SHA256, and the signature header may carry several
 * space-separated `v1,<sig>` values while a secret is being rotated.
 *
 * The rules that matter here are security rules, not parsing conveniences:
 * the raw body is verified before anything is parsed, comparison is
 * constant-time, an old or future timestamp is refused so a captured request
 * cannot be replayed, and every failure returns the same opaque reason so the
 * endpoint discloses nothing about why it refused.
 */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface WebhookHeaders {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
}

export type WebhookVerification = { ok: true; id: string } | { ok: false; reason: WebhookFailure };

/** Kept for server-side logging and metrics only; the response body never names it. */
export type WebhookFailure = 'missing_headers' | 'bad_timestamp' | 'expired' | 'bad_signature' | 'not_configured';

export function verifyResendWebhook(rawBody: string, headers: WebhookHeaders, secret: string | null, now: Date = new Date()): WebhookVerification {
  if (!secret) return { ok: false, reason: 'not_configured' };
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing_headers' };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || !/^\d{1,15}$/.test(timestamp)) return { ok: false, reason: 'bad_timestamp' };
  const driftSeconds = Math.abs(Math.floor(now.getTime() / 1000) - sentAt);
  if (driftSeconds > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: 'expired' };

  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64');
  if (key.length === 0) return { ok: false, reason: 'not_configured' };

  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  // Several versioned signatures may be present during a secret rotation; any
  // one matching is acceptance, and all are compared in constant time.
  for (const part of signature.split(' ')) {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) continue;
    const candidate = Buffer.from(value, 'base64');
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return { ok: true, id };
  }
  return { ok: false, reason: 'bad_signature' };
}

/** Test helper and the reference for what the provider signs; not used at runtime. */
export function signResendWebhook(rawBody: string, id: string, timestamp: number, secret: string): string {
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')}`;
}
