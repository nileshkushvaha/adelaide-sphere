/**
 * The mail transports this system understands (SRS 1.2 MAIL 002, ENQ 005).
 *
 * One list, imported by the API's environment validation *and* the worker's
 * configuration loader. They drifted once: the API accepted `resend` while the
 * worker accepted only `smtp`, so under the provider the client chose the
 * worker refused to start and no accepted enquiry could have been delivered
 * (audit F-02). A shared constant is what makes that impossible to repeat —
 * adding a transport here is the only way to add one at all.
 */
export const MAIL_TRANSPORTS = ['none', 'console', 'smtp', 'resend'] as const;
export type MailTransport = (typeof MAIL_TRANSPORTS)[number];

/** Transports that may deliver in production: a real relay or a real provider. */
export const PRODUCTION_MAIL_TRANSPORTS: readonly MailTransport[] = ['smtp', 'resend'];

export function isMailTransport(value: unknown): value is MailTransport {
  return typeof value === 'string' && (MAIL_TRANSPORTS as readonly string[]).includes(value);
}

/** The message both sides use when a transport is not one of the four. */
export function mailTransportProblem(key = 'MAIL_TRANSPORT'): string {
  return `${key} must be one of: ${MAIL_TRANSPORTS.join(', ')}`;
}

/** The message both sides use when production is asked to run without a real transport. */
export function productionMailTransportProblem(key = 'MAIL_TRANSPORT'): string {
  return `${key}: must be ${PRODUCTION_MAIL_TRANSPORTS.join(' or ')} in production (decision D03/D09)`;
}
