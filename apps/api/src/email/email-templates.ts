/**
 * The vocabulary of transactional messages (SRS 1.2 MAIL 005).
 *
 * Template keys and categories are declared in code, like permission codes and
 * setting keys: a caller cannot invent one, the admin log can filter on a
 * closed set, and a message with no declared template cannot be recorded.
 */
import { maskEmail } from '@adelaide-sphere/mail';

// The masking rule lives with the other address helpers so the worker uses the
// same one rather than a second copy.
export { maskEmail };

export const EMAIL_CATEGORIES = ['auth', 'enquiry', 'moderation', 'system'] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export interface EmailTemplate {
  category: EmailCategory;
  label: string;
  /**
   * Whether the subject may be kept on the delivery record. It is withheld for
   * anything that could carry a visitor's words (PRIV 001): an enquiry subject
   * is written by a member of the public.
   */
  retainSubject: boolean;
  /** Whether an administrator may resend it (MAIL 009). */
  resendable: boolean;
}

export const EMAIL_TEMPLATES = {
  'auth.password_reset': { category: 'auth', label: 'Password reset link', retainSubject: true, resendable: false },
  'auth.account_setup': { category: 'auth', label: 'Account set-up link', retainSubject: true, resendable: false },
  'enquiry.business': { category: 'enquiry', label: 'Business enquiry', retainSubject: false, resendable: true },
  'enquiry.site_contact': { category: 'enquiry', label: 'Site contact enquiry', retainSubject: false, resendable: true },
} as const satisfies Record<string, EmailTemplate>;

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATES;

export function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATES, value);
}

export function emailTemplate(key: EmailTemplateKey): EmailTemplate {
  return EMAIL_TEMPLATES[key] as EmailTemplate;
}

/**
 * Bounded failure classification (MAIL 006). Raw provider text never reaches
 * the record; this maps what we know into a code an operator can act on.
 */
export const EMAIL_FAILURE_CODES = ['transient_provider', 'permanent_provider', 'invalid_recipient', 'rate_limited', 'not_configured', 'unknown'] as const;
export type EmailFailureCode = (typeof EMAIL_FAILURE_CODES)[number];
