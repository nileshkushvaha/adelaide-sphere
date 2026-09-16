/** Shared rules for the public review form (SRS REV 001, API 003). */
export const REVIEW_LIMITS = {
  name: { min: 2, max: 80 },
  text: { min: 20, max: 3000 },
  email: { max: 254 },
} as const;

export interface ReviewFormValues {
  rating: number | null;
  displayName: string;
  email: string;
  text: string;
  acknowledged: boolean;
}

export type FieldErrors = Record<string, string[]>;

/** Drops a stale security-check message once the visitor has completed the challenge. */
export function withoutCaptchaError(errors: FieldErrors): FieldErrors {
  if (!errors.captchaToken) return errors;
  const next = { ...errors };
  delete next.captchaToken;
  return next;
}

/** Client-side pre-check mirroring the API's rules; the API remains the authority. */
export function validateReviewForm(values: ReviewFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!Number.isInteger(values.rating) || (values.rating ?? 0) < 1 || (values.rating ?? 0) > 5) errors.rating = ['Choose a rating from 1 to 5'];
  const name = values.displayName.trim();
  if (name.length < REVIEW_LIMITS.name.min || name.length > REVIEW_LIMITS.name.max) errors.displayName = [`Name must be ${REVIEW_LIMITS.name.min}–${REVIEW_LIMITS.name.max} characters`];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()) || values.email.trim().length > REVIEW_LIMITS.email.max) errors.email = ['Enter a valid email address'];
  const text = values.text.trim();
  if (text.length < REVIEW_LIMITS.text.min || text.length > REVIEW_LIMITS.text.max) errors.text = [`Review must be ${REVIEW_LIMITS.text.min}–${REVIEW_LIMITS.text.max} characters`];
  if (!values.acknowledged) errors.acknowledged = ['Please accept the review guidelines and privacy notice'];
  return errors;
}

/** Idempotency key for one form session; regenerated only after a successful submission (SRS API 003). */
export function newIdempotencyKey(): string {
  return `as-${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

/** Mirrors `SubmitCommentDto` in the API; the API remains the authority (SRS COM 001). */
export const COMMENT_LIMITS = {
  name: { min: 2, max: 80 },
  text: { min: 2, max: 2000 },
  email: { max: 254 },
} as const;

export interface CommentFormValues {
  displayName: string;
  email: string;
  text: string;
  acknowledged: boolean;
}

/**
 * Client-side pre-check for a comment. The wording tells the visitor what to do
 * rather than restating a constraint, and an empty field is distinguished from
 * one that is merely too short — "Enter your name" and "Your name is too short"
 * are different problems.
 */
export function validateCommentForm(values: CommentFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const name = values.displayName.trim();
  if (name.length === 0) errors.displayName = ['Enter your name.'];
  else if (name.length < COMMENT_LIMITS.name.min) errors.displayName = [`Your name must be at least ${COMMENT_LIMITS.name.min} characters.`];
  else if (name.length > COMMENT_LIMITS.name.max) errors.displayName = [`Your name must be ${COMMENT_LIMITS.name.max} characters or fewer.`];

  const email = values.email.trim();
  if (email.length === 0) errors.email = ['Enter your email address.'];
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > COMMENT_LIMITS.email.max) errors.email = ['Enter a valid email address.'];

  const text = values.text.trim();
  if (text.length === 0) errors.text = ['Write a comment before submitting.'];
  else if (text.length < COMMENT_LIMITS.text.min) errors.text = ['Your comment is too short.'];
  else if (text.length > COMMENT_LIMITS.text.max) errors.text = [`Your comment must be ${COMMENT_LIMITS.text.max} characters or fewer.`];

  if (!values.acknowledged) errors.acknowledged = ['Please confirm you have read the comment guidelines and privacy notice.'];
  return errors;
}

/**
 * What to tell a visitor when a public submission fails, chosen from the HTTP
 * status and the API's own error code (SRS API 002 envelope).
 *
 * The API's message is deliberately not shown. It is written for the caller, can
 * name internal constraints, and on an unexpected failure is the filter's
 * generic text anyway — so every case gets copy written for a reader, and an
 * unrecognised one gets a safe sentence rather than a raw payload.
 */
export function submissionFailureMessage(status: number, code?: string): string {
  if (status === 0 || code === 'NETWORK') return 'We could not reach the server. Check your connection and try again.';
  if (code === 'IDEMPOTENCY_KEY_REUSED') return 'We’ve already received this comment, so there’s no need to send it again.';
  if (status === 429 || code === 'RATE_LIMITED') return 'You’re submitting comments too quickly. Please wait a moment and try again.';
  if (status === 503) return 'Comments are temporarily unavailable. Please try again shortly.';
  if (status === 404) return 'This article is no longer available, so the comment was not submitted.';
  if (status === 400 || status === 422) return 'Please check the highlighted fields and try again.';
  if (status >= 500) return 'Something went wrong at our end and your comment was not saved. Please try again.';
  return 'Your comment could not be submitted. Please try again.';
}

/**
 * Site contact form (SRS ENQ 002: the general enquiry goes through the same
 * durable pipeline as a business enquiry, with `POST /api/v1/contact`). The
 * topic becomes the enquiry subject, so visitors do not have to invent one and
 * the editors' queue stays sortable.
 */
export const CONTACT_TOPICS = [
  'Business listing plan',
  'Guest post',
  'Add or update a business listing',
  'Correct a published listing',
  'Report a review or comment',
  'Editorial or media enquiry',
  'Something else',
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number];

/**
 * What the visitor reads in the topic list. The stored values above stay as
 * they are — they are the subjects already in the editors' queue — and only
 * the wording offered to the visitor is shortened.
 */
export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  'Business listing plan': 'Business Listing plan',
  'Guest post': 'Guest post',
  'Add or update a business listing': 'Add or update a business',
  'Correct a published listing': 'Correct listing information',
  'Report a review or comment': 'Report a review or comment',
  'Editorial or media enquiry': 'Editorial or media enquiry',
  'Something else': 'General enquiry',
};

/** Mirrors `SubmitEnquiryDto` in the API (SRS ENQ 001); the API remains the authority. */
export const CONTACT_LIMITS = {
  name: { min: 2, max: 80 },
  message: { min: 20, max: 5000 },
  email: { max: 254 },
} as const;

export interface ContactFormValues {
  name: string;
  email: string;
  topic: string;
  message: string;
  acknowledged: boolean;
}

export const CONTACT_FIELD_MESSAGES = {
  subject: 'Choose what your message is about.',
  acknowledged: 'Please confirm that we can use these details to respond.',
  captchaToken: 'Complete the security check.',
  captchaRejected: 'The security check didn’t pass. Please complete it again.',
} as const;

/** Client-side pre-check mirroring the API's rules; the API remains the authority. */
export function validateContactForm(values: ContactFormValues): FieldErrors {
  const errors: FieldErrors = {};
  const name = values.name.trim();
  if (name.length === 0) errors.name = ['Enter your name.'];
  else if (name.length < CONTACT_LIMITS.name.min || name.length > CONTACT_LIMITS.name.max) errors.name = [`Name must be ${CONTACT_LIMITS.name.min}–${CONTACT_LIMITS.name.max} characters.`];
  const email = values.email.trim();
  if (email.length === 0) errors.email = ['Enter your email address.'];
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > CONTACT_LIMITS.email.max) errors.email = ['Enter a valid email address.'];
  if (!(CONTACT_TOPICS as readonly string[]).includes(values.topic)) errors.subject = [CONTACT_FIELD_MESSAGES.subject];
  const message = values.message.trim();
  if (message.length === 0) errors.message = ['Enter your message.'];
  else if (message.length < CONTACT_LIMITS.message.min) errors.message = [`Message must be at least ${CONTACT_LIMITS.message.min} characters.`];
  else if (message.length > CONTACT_LIMITS.message.max) errors.message = [`Message must be ${CONTACT_LIMITS.message.max} characters or fewer.`];
  if (!values.acknowledged) errors.acknowledged = [CONTACT_FIELD_MESSAGES.acknowledged];
  return errors;
}

/**
 * The API's field errors for the contact form, in reader's words where the
 * API's own text is written for a developer (a class-validator length message
 * on `subject`, the bare "Verification failed" on the token).
 */
export function contactFieldErrors(fields: FieldErrors | undefined): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, messages] of Object.entries(fields ?? {})) {
    if (!Array.isArray(messages) || messages.length === 0) continue;
    if (key === 'subject') out.subject = [CONTACT_FIELD_MESSAGES.subject];
    else if (key === 'acknowledged') out.acknowledged = [CONTACT_FIELD_MESSAGES.acknowledged];
    else if (key === 'captchaToken') out.captchaToken = [CONTACT_FIELD_MESSAGES.captchaRejected];
    else if (['name', 'email', 'message'].includes(key)) out[key] = messages.map(String);
  }
  return out;
}

/** Status `-1` stands for a request the browser abandoned after its timeout. */
export const CONTACT_TIMEOUT_STATUS = -1;

/**
 * Form-level copy for a failed contact submission. As with
 * `submissionFailureMessage`, the API's message is never shown; every failure
 * except invalid fields also says the message is still on the page, because
 * the form keeps what was typed.
 */
export function contactFailureMessage(status: number, code?: string): string {
  if (status === CONTACT_TIMEOUT_STATUS) return 'This is taking longer than it should. Your message is still on this page, so you can try again.';
  if (status === 0) return 'We couldn’t reach the server. Check your connection — your message is still on this page, so you can try again.';
  // The key is only remembered after a success, so a reuse means an earlier
  // attempt — typically one whose response never arrived — was received.
  if (code === 'IDEMPOTENCY_KEY_REUSED') return 'We’ve already received this message, so there’s no need to send it again.';
  if (code === 'CAPTCHA_FAILED') return 'The security check didn’t pass. Please complete it again and resend your message.';
  if (status === 429 || code === 'RATE_LIMITED') return 'Too many messages have been sent from this connection. Please wait a little and try again.';
  if (code === 'NO_ENQUIRY_ROUTE') return 'The contact form isn’t accepting messages right now. Please email us instead.';
  if (status === 400 || status === 422) return 'We couldn’t send your message. Check the highlighted fields below.';
  if (status === 503) return 'We can’t accept messages right now. Your message is still on this page, so please try again shortly.';
  return 'We couldn’t send your message right now. Your message is still on this page, so you can try again.';
}

/**
 * The API's field errors in reader's words (SRS API 002). Only the fields a form
 * actually shows are kept, and each gets copy written here, so a validator's
 * developer-facing sentence never reaches a visitor.
 */
export function readerFieldErrors(fields: FieldErrors | undefined, copy: Record<string, string>): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, messages] of Object.entries(fields ?? {})) {
    if (Array.isArray(messages) && messages.length > 0 && copy[key]) out[key] = [copy[key]];
  }
  return out;
}

const SECURITY_CHECK_AGAIN = 'The security check didn’t pass. Please complete it again.';

export const REVIEW_FIELD_COPY: Record<string, string> = {
  rating: 'Choose a rating from 1 to 5.',
  displayName: `Enter your name (${REVIEW_LIMITS.name.min}–${REVIEW_LIMITS.name.max} characters).`,
  email: 'Enter a valid email address.',
  text: `Your review must be ${REVIEW_LIMITS.text.min}–${REVIEW_LIMITS.text.max} characters.`,
  acknowledged: 'Please accept the review guidelines and privacy notice.',
  captchaToken: SECURITY_CHECK_AGAIN,
};

export const COMMENT_FIELD_COPY: Record<string, string> = {
  displayName: `Enter your name (${COMMENT_LIMITS.name.min}–${COMMENT_LIMITS.name.max} characters).`,
  email: 'Enter a valid email address.',
  text: `Your comment must be ${COMMENT_LIMITS.text.min}–${COMMENT_LIMITS.text.max} characters.`,
  acknowledged: 'Please confirm you have read the comment guidelines and privacy notice.',
  captchaToken: SECURITY_CHECK_AGAIN,
};

export const ENQUIRY_FIELD_COPY: Record<string, string> = {
  name: 'Enter your name (2–80 characters).',
  email: 'Enter a valid email address.',
  phone: 'Enter a valid phone number, or leave it blank.',
  subject: 'Enter a subject (3–150 characters).',
  message: 'Your message must be 20–5000 characters.',
  acknowledged: 'Please confirm your details may be shared with the business.',
  captchaToken: SECURITY_CHECK_AGAIN,
};

/** Form-level copy for a failed review; the API's message is never shown. */
export function reviewFailureMessage(status: number, code?: string): string {
  if (status === 0) return 'We could not reach the server. Check your connection and try again.';
  if (code === 'IDEMPOTENCY_KEY_REUSED') return 'We’ve already received this review, so there’s no need to send it again.';
  if (code === 'CAPTCHA_FAILED') return 'The security check didn’t pass. Please complete it again and resubmit.';
  if (status === 429 || code === 'RATE_LIMITED') return 'Too many reviews have been sent from this connection. Please wait a little and try again.';
  if (status === 404) return 'This business is no longer listed, so the review was not submitted.';
  if (status === 400 || status === 422) return 'Please check the highlighted fields and try again.';
  if (status === 503) return 'Reviews are temporarily unavailable. Please try again shortly.';
  return 'Your review could not be submitted right now. Please try again.';
}

/** Form-level copy for a failed business enquiry; the API's message is never shown. */
export function enquiryFailureMessage(status: number, code?: string): string {
  if (status === 0) return 'We could not reach the server. Check your connection and try again.';
  if (code === 'IDEMPOTENCY_KEY_REUSED') return 'We’ve already received this message, so there’s no need to send it again.';
  if (code === 'CAPTCHA_FAILED') return 'The security check didn’t pass. Please complete it again and resend your message.';
  if (status === 429 || code === 'RATE_LIMITED') return 'Too many messages have been sent from this connection. Please wait a little and try again.';
  if (status === 404) return 'This business is no longer listed, so the message was not sent.';
  if (status === 409 || code === 'NO_ENQUIRY_ROUTE') return 'This business isn’t accepting messages here right now. Please use its phone number or website instead.';
  if (status === 400 || status === 422) return 'Please check the highlighted fields and try again.';
  if (status === 503) return 'Messages can’t be sent right now. Please try again shortly.';
  return 'Your message could not be sent right now. Please try again.';
}
