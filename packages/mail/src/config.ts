/**
 * SMTP configuration parsed from the environment (SRS ENQ 005, SEC 004).
 *
 * SMTP is the provider-independent boundary: every transactional email
 * provider under consideration for decision D03 (Amazon SES, Postmark,
 * Mailgun, SendGrid, Resend, Brevo, a self-hosted relay) exposes an
 * authenticated SMTP endpoint, so choosing or changing the provider is a
 * credential change, not a code change. A provider's HTTP API and webhook
 * ingestion (ENQ 006) can be added as a second adapter later without
 * touching the callers.
 */
export interface SmtpConfig {
  host: string;
  port: number;
  /** Implicit TLS from the first byte (usually port 465). */
  secure: boolean;
  /** Refuse to continue when the server does not offer STARTTLS (always true in production unless `secure`). */
  requireTls: boolean;
  auth: { user: string; pass: string } | null;
}

export interface SmtpEnv {
  SMTP_HOST?: string | undefined;
  SMTP_PORT?: string | undefined;
  SMTP_SECURE?: string | undefined;
  SMTP_USER?: string | undefined;
  SMTP_PASSWORD?: string | undefined;
}

export interface SmtpConfigResult {
  config: SmtpConfig | null;
  /** Human-readable problems, one per line, naming variables but never values. */
  problems: string[];
}

const trim = (value: string | undefined): string => (value ?? '').trim();

/**
 * Validates the SMTP_* variables. Outside production a plaintext connection to
 * a loopback catcher (Mailpit) is allowed; in production authentication and
 * transport encryption are required so credentials and visitor content never
 * cross the network in clear.
 */
export function smtpConfigFromEnv(env: SmtpEnv, options: { production: boolean }): SmtpConfigResult {
  const problems: string[] = [];
  const host = trim(env.SMTP_HOST);
  if (!host) problems.push('SMTP_HOST: required when MAIL_TRANSPORT=smtp');
  else if (/[\s/@:]/.test(host)) problems.push('SMTP_HOST: must be a bare host name or IP address (no scheme, port, credentials or spaces)');

  const portRaw = trim(env.SMTP_PORT) || '587';
  const port = /^\d+$/.test(portRaw) ? Number(portRaw) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('SMTP_PORT: must be an integer 1-65535 (default 587)');

  const secureRaw = trim(env.SMTP_SECURE).toLowerCase() || 'false';
  if (!['true', 'false', '1', '0'].includes(secureRaw)) problems.push('SMTP_SECURE: must be true or false');
  const secure = secureRaw === 'true' || secureRaw === '1';

  const user = trim(env.SMTP_USER);
  const pass = trim(env.SMTP_PASSWORD);
  if ((user === '') !== (pass === '')) problems.push('SMTP_USER / SMTP_PASSWORD: set both or neither');
  if (options.production && (!user || !pass)) problems.push('SMTP_USER / SMTP_PASSWORD: required in production (authenticated relay only)');

  const loopback = /^(127\.\d+\.\d+\.\d+|localhost|::1)$/i.test(host);
  if (options.production && loopback) problems.push('SMTP_HOST: a loopback host is not a production mail relay');

  if (problems.length > 0) return { config: null, problems };
  return {
    config: {
      host,
      port,
      secure,
      // STARTTLS is mandatory in production; locally Mailpit speaks plaintext on 1025.
      requireTls: options.production && !secure,
      auth: user && pass ? { user, pass } : null,
    },
    problems: [],
  };
}
