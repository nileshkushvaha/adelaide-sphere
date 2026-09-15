import { describe, expect, it } from 'vitest';
import { MAIL_TRANSPORTS, PRODUCTION_MAIL_TRANSPORTS, isMailTransport, mailTransportProblem, productionMailTransportProblem } from './transports.js';

/**
 * The API and the worker must accept the same transports. They did not once:
 * the API accepted `resend` and the worker refused it, so under the provider
 * the client chose the worker could not start and no accepted enquiry would
 * have been delivered (audit F-02). Both now import this list.
 */
describe('mail transports', () => {
  it('declares the four transports the system understands', () => {
    expect([...MAIL_TRANSPORTS]).toEqual(['none', 'console', 'smtp', 'resend']);
  });

  it('names only the transports that can deliver as production-capable', () => {
    expect([...PRODUCTION_MAIL_TRANSPORTS]).toEqual(['smtp', 'resend']);
    // console and none exist for development and must never be production.
    for (const transport of ['none', 'console']) expect(PRODUCTION_MAIL_TRANSPORTS).not.toContain(transport);
  });

  it('recognises exactly the declared values', () => {
    for (const transport of MAIL_TRANSPORTS) expect(isMailTransport(transport)).toBe(true);
    for (const other of ['SMTP', 'sendgrid', '', null, undefined, 42]) expect(isMailTransport(other)).toBe(false);
  });

  it('gives both sides the same wording, so an operator sees one message', () => {
    expect(mailTransportProblem()).toContain('none, console, smtp, resend');
    expect(productionMailTransportProblem()).toContain('smtp or resend');
    expect(mailTransportProblem('WORKER_MAIL').startsWith('WORKER_MAIL')).toBe(true);
  });
});
