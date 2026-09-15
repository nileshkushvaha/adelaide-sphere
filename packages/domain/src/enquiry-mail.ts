/** Building the outbound enquiry message (SRS ENQ 005). */
import { renderEmail } from './email-layout.js';

export interface EnquiryMailInput {
  businessName: string | null;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string | null;
  subject: string;
  message: string;
  receiptId: string;
  submittedAt: Date;
}

export interface OutboundEnquiryMail {
  subject: string;
  replyTo: string;
  text: string;
  /** The same message as HTML, with every visitor-supplied value escaped. */
  html: string;
}

// Control characters are exactly what must be stripped from headers (SRS ENQ 005).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

/** Header injection prevention: CR/LF and other control characters can never reach a header. */
export function sanitiseHeaderValue(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(CONTROL_CHARACTERS, '').replace(/\s{2,}/g, ' ').trim().slice(0, 200);
}

/** A syntactically valid single address, or null. Reply-To is only set after this check (SRS ENQ 005). */
export function safeReplyTo(email: string): string | null {
  const cleaned = sanitiseHeaderValue(email);
  return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(cleaned) ? cleaned : null;
}

const formatter = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Adelaide', dateStyle: 'medium', timeStyle: 'short' });

/**
 * The enquiry as a plain-text and an HTML part from the shared layout (SRS ENQ
 * 005). Visitor content never reaches a header, is escaped in the HTML, and is
 * set apart — delimited in the text part, in its own panel in the HTML — so the
 * recipient can see exactly where the visitor's words begin and end.
 */
export function buildEnquiryMail(input: EnquiryMailInput): OutboundEnquiryMail {
  const subject = sanitiseHeaderValue(`Enquiry: ${input.subject}`);
  const intro = input.businessName ? `A visitor sent an enquiry about ${input.businessName} on Adelaide Sphere.` : 'A visitor sent a general enquiry through Adelaide Sphere.';
  const message = input.message.replace(/\r\n/g, '\n').replace(CONTROL_CHARACTERS, (c) => (c === '\n' ? c : '')).trim();
  const { html, text } = renderEmail({
    preheader: `${sanitiseHeaderValue(input.visitorName)}: ${sanitiseHeaderValue(input.subject)}`,
    heading: input.businessName ? `New enquiry for ${input.businessName}` : 'New enquiry',
    paragraphs: [intro],
    details: [
      { label: 'Name', value: sanitiseHeaderValue(input.visitorName) },
      { label: 'Email', value: sanitiseHeaderValue(input.visitorEmail) },
      ...(input.visitorPhone ? [{ label: 'Phone', value: sanitiseHeaderValue(input.visitorPhone) }] : []),
      { label: 'Received', value: `${formatter.format(input.submittedAt)} (Adelaide time)` },
      { label: 'Reference', value: input.receiptId },
    ],
    quote: { label: 'Message', text: message },
    closing: ['Reply directly to this email to answer the visitor. Adelaide Sphere does not see your reply.'],
    footer: 'You received this because your business is listed on Adelaide Sphere, or you are its contact address.',
  });
  return { subject, replyTo: safeReplyTo(input.visitorEmail) ?? '', text, html };
}
