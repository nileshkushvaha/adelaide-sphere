/**
 * How an enquiry moves through the editors' own workflow (SRS ENQ 004/007).
 *
 * Handling status is not delivery status. It records what the team has done
 * about a message — nothing yet, someone is on it, or it is finished — and
 * says nothing about whether the email reached the business: a closed enquiry
 * does not imply delivery succeeded (ENQ 006).
 *
 *   new ──Start handling──▶ inProgress ──Close──▶ closed
 *    └──────────Close──────────────────────────────▲  │
 *                         inProgress ◀──Reopen──────┘
 *
 * An enquiry never returns to `new`: once someone has looked at it, "nobody
 * has" is no longer true. Setting the status it already has is refused rather
 * than recorded as a change that did not happen. The API enforces these rules;
 * the admin reads the same table so it only offers what the API will accept.
 */

export const ENQUIRY_HANDLING_STATUSES = ['new', 'inProgress', 'closed'] as const;
export type EnquiryHandlingStatus = (typeof ENQUIRY_HANDLING_STATUSES)[number];

export interface EnquiryHandlingAction {
  to: EnquiryHandlingStatus;
  /** The button text. */
  label: string;
  /** What pressing it does, in a sentence; shown as the button's description. */
  description: string;
}

export const ENQUIRY_HANDLING_ACTIONS: Readonly<Record<EnquiryHandlingStatus, readonly EnquiryHandlingAction[]>> = {
  new: [
    { to: 'inProgress', label: 'Start handling', description: 'Mark that someone is working on this enquiry.' },
    { to: 'closed', label: 'Close', description: 'Mark this enquiry as finished. It does not change or confirm delivery.' },
  ],
  inProgress: [{ to: 'closed', label: 'Close', description: 'Mark this enquiry as finished. It does not change or confirm delivery.' }],
  closed: [{ to: 'inProgress', label: 'Reopen', description: 'Move this enquiry back to in progress.' }],
};

/** Whether `from → to` is a change the workflow allows. */
export function canChangeEnquiryHandling(from: EnquiryHandlingStatus, to: EnquiryHandlingStatus): boolean {
  return ENQUIRY_HANDLING_ACTIONS[from].some((action) => action.to === to);
}
