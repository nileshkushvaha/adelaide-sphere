import { describe, expect, it, vi } from 'vitest';
import { ResendTransport, type ResendConfig } from '@adelaide-sphere/mail';
import { PermanentDeliveryError, TransientDeliveryError } from './mailer.port.js';
import { ResendEnquiryMailer } from './resend-mailer.js';

/**
 * The worker's half of the production email path (SRS 1.2 MAIL 002, ENQ 004–005).
 *
 * The API could send through Resend and the worker could not, so an accepted
 * enquiry would never have been delivered under the provider the client chose
 * (audit F-02). What is asserted here is the adapter contract the queue relies
 * on: one attempt per job, a failure classified so the queue knows whether
 * retrying can help, and nothing sensitive in what it reports.
 */
describe('ResendEnquiryMailer', () => {
  const config: ResendConfig = {
    apiKey: 're_test_key_never_real_0123456789',
    fromAddress: 'no-reply@mail.adelaidesphere.example',
    fromHeader: 'Adelaide Sphere <no-reply@mail.adelaidesphere.example>',
    replyToAddress: undefined,
    webhookSecret: undefined,
    apiBaseUrl: 'https://api.resend.example',
  } as unknown as ResendConfig;

  const message = {
    to: 'owner@business.example',
    from: config.fromAddress,
    replyTo: 'visitor@example.com',
    subject: 'Enquiry from Adelaide Sphere',
    text: 'Do you open on Sundays?',
    messageId: 'enq-0123456789',
  };

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('makes exactly one attempt and returns the provider id, because retries belong to the queue', async () => {
    const fetchMock = vi.fn(async () => json({ id: 'resend-message-1' }));
    const mailer = new ResendEnquiryMailer(config, new ResendTransport(config, fetchMock as unknown as typeof fetch));
    expect(await mailer.send(message)).toEqual({ providerMessageId: 'resend-message-1' });
    expect(fetchMock, 'the adapter must not retry inside a job').toHaveBeenCalledTimes(1);
  });

  it('classifies a provider outage as retryable and a rejection as permanent', async () => {
    const transient = new ResendEnquiryMailer(config, new ResendTransport(config, (async () => json({ message: 'upstream busy' }, 503)) as unknown as typeof fetch));
    await expect(transient.send(message)).rejects.toBeInstanceOf(TransientDeliveryError);

    const permanent = new ResendEnquiryMailer(config, new ResendTransport(config, (async () => json({ message: 'invalid recipient' }, 422)) as unknown as typeof fetch));
    await expect(permanent.send(message)).rejects.toBeInstanceOf(PermanentDeliveryError);
  });

  it('treats a network failure as retryable rather than losing the enquiry', async () => {
    const mailer = new ResendEnquiryMailer(
      config,
      new ResendTransport(config, (async () => {
        throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
      }) as unknown as typeof fetch),
    );
    await expect(mailer.send(message)).rejects.toBeInstanceOf(TransientDeliveryError);
  });

  it('never puts the recipient, the visitor, the message or the key in an error', async () => {
    const mailer = new ResendEnquiryMailer(
      config,
      new ResendTransport(config, (async () => json({ message: `rejected ${message.to} using ${config.apiKey}` }, 422)) as unknown as typeof fetch),
    );
    const error = await mailer.send(message).then(
      () => null,
      (thrown: unknown) => thrown as Error,
    );
    expect(error).toBeInstanceOf(PermanentDeliveryError);
    for (const secret of [message.to, message.replyTo, message.text, config.apiKey]) {
      expect(error!.message, secret).not.toContain(secret);
    }
  });

  it('describes itself for the start-up log without the key', () => {
    const description = new ResendEnquiryMailer(config).describe();
    expect(description).toContain('resend');
    expect(description).not.toContain(config.apiKey);
  });
});
