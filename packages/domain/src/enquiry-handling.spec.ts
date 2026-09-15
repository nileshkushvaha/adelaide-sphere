import { describe, expect, it } from 'vitest';
import { ENQUIRY_HANDLING_ACTIONS, ENQUIRY_HANDLING_STATUSES, canChangeEnquiryHandling } from './enquiry-handling.js';

describe('enquiry handling workflow (SRS ENQ 004/007)', () => {
  it('allows start, close and reopen, and nothing else', () => {
    const allowed = ENQUIRY_HANDLING_STATUSES.flatMap((from) => ENQUIRY_HANDLING_STATUSES.filter((to) => canChangeEnquiryHandling(from, to)).map((to) => `${from}->${to}`));
    expect(allowed.sort()).toEqual(['closed->inProgress', 'inProgress->closed', 'new->closed', 'new->inProgress']);
  });

  it('never returns an enquiry to new, and never records a change to the same status', () => {
    for (const from of ENQUIRY_HANDLING_STATUSES) {
      expect(canChangeEnquiryHandling(from, 'new')).toBe(false);
      expect(canChangeEnquiryHandling(from, from)).toBe(false);
    }
  });

  it('labels a closed enquiry’s action as Reopen, not Start', () => {
    expect(ENQUIRY_HANDLING_ACTIONS.closed.map((action) => action.label)).toEqual(['Reopen']);
    expect(ENQUIRY_HANDLING_ACTIONS.new.map((action) => action.label)).toEqual(['Start handling', 'Close']);
  });
});
