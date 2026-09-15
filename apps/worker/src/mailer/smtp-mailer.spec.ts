import { PermanentMailError, SmtpTransport, TransientMailError } from '@adelaide-sphere/mail';
import { PermanentDeliveryError, TransientDeliveryError } from './mailer.port.js';
import { SmtpEnquiryMailer } from './smtp-mailer.js';

const CONFIG = { host: '127.0.0.1', port: 1025, secure: false, requireTls: false, auth: null };
const MESSAGE = { to: 'owner@example.com', from: 'no-reply@example.com', replyTo: 'visitor@example.org', subject: 'Enquiry', text: 'Hello', messageId: 'enq_1@adelaide-sphere' };

function mailerWith(send: SmtpTransport['send']): SmtpEnquiryMailer {
  const transport = { send, describe: () => 'smtp 127.0.0.1:1025 (plaintext, no auth)', close: () => undefined } as unknown as SmtpTransport;
  return new SmtpEnquiryMailer(CONFIG, transport);
}

describe('SmtpEnquiryMailer (SRS ENQ 004)', () => {
  it('passes the stable message id through and returns the accepted id', async () => {
    const calls: unknown[] = [];
    const mailer = mailerWith(async (message) => {
      calls.push(message);
      return { providerMessageId: '<enq_1@adelaide-sphere>' };
    });
    await expect(mailer.send(MESSAGE)).resolves.toEqual({ providerMessageId: '<enq_1@adelaide-sphere>' });
    expect(calls[0]).toEqual(MESSAGE);
    expect(mailer.describe()).not.toContain('secret');
  });

  it('maps transient and permanent transport failures onto the delivery error classes', async () => {
    await expect(mailerWith(async () => { throw new TransientMailError('SMTP ETIMEDOUT: timeout'); }).send(MESSAGE)).rejects.toBeInstanceOf(TransientDeliveryError);
    await expect(mailerWith(async () => { throw new PermanentMailError('SMTP EENVELOPE 550: rejected'); }).send(MESSAGE)).rejects.toBeInstanceOf(PermanentDeliveryError);
    await expect(mailerWith(async () => { throw new Error('unexpected'); }).send(MESSAGE)).rejects.toBeInstanceOf(TransientDeliveryError);
  });
});
