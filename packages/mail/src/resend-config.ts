/**
 * Resend configuration parsed from the environment (SRS 1.2 MAIL 001–002, SEC 004).
 *
 * The API key and the webhook signing secret are environment-managed and never
 * become settings, never appear in an API response and never reach a log line
 * (SET 004). Nothing in this module prints a value; problems name the variable
 * only.
 *
 * Production is strict on purpose: a missing key, an unverified-looking sender
 * or a development transport selected outside development must stop start-up
 * rather than silently discard mail (MAIL 002).
 */
export interface ResendConfig {
  apiKey: string;
  /** Envelope sender, e.g. `Adelaide Sphere <no-reply@mail.adelaidesphere.com>`. */
  from: string;
  fromAddress: string;
  fromName: string | null;
  replyTo: string | null;
  /** Svix-style signing secret for the provider webhook; absent means webhook ingestion is disabled. */
  webhookSecret: string | null;
  /** API base, overridable only so tests can point at a local stub. */
  baseUrl: string;
}

export interface ResendEnv {
  RESEND_API_KEY?: string | undefined;
  MAIL_FROM_ADDRESS?: string | undefined;
  MAIL_FROM_NAME?: string | undefined;
  MAIL_REPLY_TO_ADDRESS?: string | undefined;
  RESEND_WEBHOOK_SECRET?: string | undefined;
  RESEND_API_BASE_URL?: string | undefined;
}

export interface ResendConfigResult {
  config: ResendConfig | null;
  /** Human-readable problems, one per line, naming variables but never values. */
  problems: string[];
}

const trim = (value: string | undefined): string => (value ?? '').trim();

const ADDRESS = /^[^\s@<>,;"()[\]\\]+@[^\s@<>,;"()[\]\\]+\.[A-Za-z0-9-]{2,}$/;
const HEADER_UNSAFE = /[\r\n\0]/;

/** Domains that can never be a verified production sender. */
const NON_ROUTABLE_SENDER = /\.(local|localhost|internal|test|invalid|example)$|^(localhost|example\.(com|org|net))$/i;

export function resendConfigFromEnv(env: ResendEnv, options: { production: boolean }): ResendConfigResult {
  const problems: string[] = [];

  const apiKey = trim(env.RESEND_API_KEY);
  if (!apiKey) problems.push('RESEND_API_KEY: required when MAIL_PROVIDER=resend');
  else if (HEADER_UNSAFE.test(apiKey)) problems.push('RESEND_API_KEY: must not contain whitespace or control characters');
  else if (options.production && !apiKey.startsWith('re_')) problems.push('RESEND_API_KEY: does not look like a Resend API key');

  const fromAddress = trim(env.MAIL_FROM_ADDRESS).toLowerCase();
  if (!fromAddress) problems.push('MAIL_FROM_ADDRESS: required when MAIL_PROVIDER=resend');
  else if (!ADDRESS.test(fromAddress)) problems.push('MAIL_FROM_ADDRESS: must be a single valid email address');
  else if (options.production && NON_ROUTABLE_SENDER.test(fromAddress.split('@')[1] ?? '')) {
    problems.push('MAIL_FROM_ADDRESS: a development or reserved domain cannot be a verified production sender');
  }

  const fromName = trim(env.MAIL_FROM_NAME);
  if (fromName && (HEADER_UNSAFE.test(fromName) || fromName.length > 78)) {
    problems.push('MAIL_FROM_NAME: must be a single short line with no control characters');
  }

  const replyTo = trim(env.MAIL_REPLY_TO_ADDRESS).toLowerCase();
  if (replyTo && !ADDRESS.test(replyTo)) problems.push('MAIL_REPLY_TO_ADDRESS: must be a single valid email address when set');

  const webhookSecret = trim(env.RESEND_WEBHOOK_SECRET);
  if (webhookSecret && HEADER_UNSAFE.test(webhookSecret)) problems.push('RESEND_WEBHOOK_SECRET: must not contain whitespace or control characters');
  if (options.production && !webhookSecret) {
    // Without it, delivered/bounced/complained can never be recorded, and the
    // log would show "sent" forever while messages bounce (MAIL 007/011).
    problems.push('RESEND_WEBHOOK_SECRET: required in production so delivery events can be verified and recorded');
  }

  const baseUrl = trim(env.RESEND_API_BASE_URL) || 'https://api.resend.com';
  if (options.production && !baseUrl.startsWith('https://api.resend.com')) {
    problems.push('RESEND_API_BASE_URL: must not be overridden in production');
  }

  if (problems.length > 0) return { config: null, problems };
  return {
    config: {
      apiKey,
      from: fromName ? `${sanitiseDisplayName(fromName)} <${fromAddress}>` : fromAddress,
      fromAddress,
      fromName: fromName || null,
      replyTo: replyTo || null,
      webhookSecret: webhookSecret || null,
      baseUrl: baseUrl.replace(/\/+$/, ''),
    },
    problems: [],
  };
}

/**
 * Quotes a display name so a comma or angle bracket cannot split the header
 * into two addresses. Control characters were already refused above.
 */
export function sanitiseDisplayName(name: string): string {
  const escaped = name.replace(/["\\]/g, '');
  return /[,<>:;@"[\]]/.test(escaped) ? `"${escaped}"` : escaped;
}
