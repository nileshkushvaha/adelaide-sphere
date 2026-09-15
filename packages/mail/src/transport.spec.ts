import type { Transporter } from 'nodemailer';
import { PermanentMailError, TransientMailError, redactAddresses } from './errors.js';
import { MAX_TEXT_BYTES, SMTP_TIMEOUTS_MS, SmtpTransport, classify, toSendOptions } from './transport.js';

const MESSAGE = { to: 'owner@example.com', from: 'no-reply@example.com', replyTo: 'visitor@example.org', subject: 'Enquiry', text: 'Hello', messageId: 'enq_123@adelaide-sphere' };

function fakeTransporter(sendMail: (options: unknown) => Promise<unknown>) {
  const created: unknown[] = [];
  const factory = (options: unknown): Transporter => {
    created.push(options);
    return { sendMail, verify: async () => true, close: () => undefined } as unknown as Transporter;
  };
  return { created, factory };
}

describe('SmtpTransport', () => {
  it('configures bounded timeouts, no pooling and STARTTLS when required', () => {
    const { created, factory } = fakeTransporter(async () => ({ messageId: '<x@y>' }));
    const transport = new SmtpTransport({ host: 'relay.example.net', port: 587, secure: false, requireTls: true, auth: { user: 'relay-user', pass: 'relay-secret-value' } }, factory);
    expect(created[0]).toMatchObject({
      host: 'relay.example.net',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'relay-user', pass: 'relay-secret-value' },
      pool: false,
      logger: false,
      dnsTimeout: SMTP_TIMEOUTS_MS.dns,
      connectionTimeout: SMTP_TIMEOUTS_MS.connection,
      greetingTimeout: SMTP_TIMEOUTS_MS.greeting,
      socketTimeout: SMTP_TIMEOUTS_MS.socket,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(transport.describe()).toBe('smtp relay.example.net:587 (starttls, authenticated)');
    expect(transport.describe()).not.toContain('relay-secret-value');
  });

  it('sends a plain-text message with a stable Message-ID and returns the accepted id', async () => {
    const calls: unknown[] = [];
    const { factory } = fakeTransporter(async (options) => {
      calls.push(options);
      return { messageId: '<enq_123@adelaide-sphere>', accepted: ['owner@example.com'], rejected: [] };
    });
    const transport = new SmtpTransport({ host: '127.0.0.1', port: 1025, secure: false, requireTls: false, auth: null }, factory);
    await expect(transport.send(MESSAGE)).resolves.toEqual({ providerMessageId: '<enq_123@adelaide-sphere>' });
    expect(calls[0]).toEqual({ ...MESSAGE, messageId: '<enq_123@adelaide-sphere>', disableFileAccess: true, disableUrlAccess: true });
  });

  it('refuses header injection and malformed addresses before contacting the relay (ENQ 005)', () => {
    expect(() => toSendOptions({ ...MESSAGE, subject: 'Hi\r\nBcc: x@example.com' })).toThrow(PermanentMailError);
    expect(() => toSendOptions({ ...MESSAGE, to: 'not-an-address' })).toThrow(/recipient address/);
    expect(() => toSendOptions({ ...MESSAGE, replyTo: 'visitor@example.org\n' })).toThrow(PermanentMailError);
    expect(() => toSendOptions({ ...MESSAGE, messageId: '<spoof>' })).toThrow(/message id/);
    expect(toSendOptions({ ...MESSAGE, replyTo: undefined })).not.toHaveProperty('replyTo');
  });

  it('sends an HTML alternative beside the plain text, never instead of it, and bounds its size', () => {
    const withHtml = toSendOptions({ ...MESSAGE, html: '<p>Hello</p>' });
    expect(withHtml).toMatchObject({ text: MESSAGE.text, html: '<p>Hello</p>', disableUrlAccess: true, disableFileAccess: true });
    expect(toSendOptions({ ...MESSAGE, html: undefined })).not.toHaveProperty('html');
    expect(() => toSendOptions({ ...MESSAGE, html: 'x'.repeat(MAX_TEXT_BYTES + 1) })).toThrow(/HTML body exceeds/);
  });

  it('classifies failures without leaking addresses', () => {
    expect(classify({ code: 'ETIMEDOUT', message: 'Connection timeout' })).toBeInstanceOf(TransientMailError);
    expect(classify({ code: 'EENVELOPE', responseCode: 421, message: 'Try again later' })).toBeInstanceOf(TransientMailError);
    const permanent = classify({ code: 'EENVELOPE', responseCode: 550, message: "550 5.1.1 <someone@example.com>: Recipient address rejected", recipient: 'someone@example.com' });
    expect(permanent).toBeInstanceOf(PermanentMailError);
    expect(permanent.message).toBe('SMTP EENVELOPE 550: 550 5.1.1 <redacted>: Recipient address rejected');
    expect(classify({ code: 'EAUTH', message: 'Invalid login' })).toBeInstanceOf(PermanentMailError);
    expect(classify(new Error('something odd'))).toBeInstanceOf(TransientMailError);
  });

  it('treats a relay that rejected every recipient as permanent', async () => {
    const { factory } = fakeTransporter(async () => ({ messageId: '<a@b>', accepted: [], rejected: ['owner@example.com'] }));
    const transport = new SmtpTransport({ host: '127.0.0.1', port: 1025, secure: false, requireTls: false, auth: null }, factory);
    await expect(transport.send(MESSAGE)).rejects.toBeInstanceOf(PermanentMailError);
  });
});

describe('redactAddresses', () => {
  it('replaces bare and bracketed addresses', () => {
    expect(redactAddresses("user unknown: a.b+c@example.com and <d@example.org>")).toBe('user unknown: [redacted] and <redacted>');
  });
});

describe('SmtpTransport security audit (SRS ENQ 005, SEC 004, MON 001)', () => {
  const LOCAL = { host: '127.0.0.1', port: 1025, secure: false, requireTls: false, auth: null };

  it('never disables certificate verification and pins TLS 1.2 or newer', () => {
    const { created, factory } = fakeTransporter(async () => ({ messageId: '<x@y>' }));
    new SmtpTransport({ host: 'relay.example.net', port: 465, secure: true, requireTls: false, auth: { user: 'u', pass: 'p' } }, factory);
    const options = created[0] as { tls?: { rejectUnauthorized?: boolean; minVersion?: string }; secure?: boolean; requireTLS?: boolean; ignoreTLS?: boolean };
    expect(options.tls?.minVersion).toBe('TLSv1.2');
    expect(options.tls?.rejectUnauthorized).not.toBe(false);
    expect(options.ignoreTLS).toBeUndefined();
    expect(options.secure).toBe(true);
  });

  it('refuses multi-recipient, display-name and bracketed addresses so a caller cannot widen the envelope', () => {
    for (const to of ['owner@example.com, other@example.com', 'owner@example.com; other@example.com', 'Owner <owner@example.com>', 'owner@example.com\tother@example.com']) {
      expect(() => toSendOptions({ ...MESSAGE, to }), to).toThrow(/recipient address/);
    }
    expect(() => toSendOptions({ ...MESSAGE, from: 'Adelaide Sphere <no-reply@example.com>' })).toThrow(/sender address/);
    expect(() => toSendOptions({ ...MESSAGE, replyTo: 'a@example.org, b@example.org' })).toThrow(/reply-to address/);
  });

  it('bounds the subject and the body and passes text through as plain UTF-8 only', () => {
    expect(() => toSendOptions({ ...MESSAGE, subject: 'x'.repeat(999) })).toThrow(/subject/);
    expect(() => toSendOptions({ ...MESSAGE, subject: '   ' })).toThrow(/subject/);
    expect(() => toSendOptions({ ...MESSAGE, text: '' })).toThrow(/body is empty/);
    expect(() => toSendOptions({ ...MESSAGE, text: 'é'.repeat(MAX_TEXT_BYTES) })).toThrow(/size limit/);
    const options = toSendOptions({ ...MESSAGE, text: 'Ünïcödé — <b>not html</b> & entities' });
    expect(options.text).toBe('Ünïcödé — <b>not html</b> & entities');
    expect(options).not.toHaveProperty('html');
    expect(options).not.toHaveProperty('attachments');
  });

  it('classifies verify() failures and releases the transport on close()', async () => {
    let closed = 0;
    const factory = (): Transporter =>
      ({
        sendMail: async () => ({ messageId: '<a@b>' }),
        verify: async () => {
          throw Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 });
        },
        close: () => {
          closed += 1;
        },
      }) as unknown as Transporter;
    const transport = new SmtpTransport(LOCAL, factory);
    await expect(transport.verify()).rejects.toBeInstanceOf(PermanentMailError);
    transport.close();
    expect(closed).toBe(1);
  });

  it('keeps the same Message-ID across a retry of the same message and never invents one', async () => {
    const ids: unknown[] = [];
    const { factory } = fakeTransporter(async (options) => {
      ids.push((options as { messageId: string }).messageId);
      throw Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' });
    });
    const transport = new SmtpTransport(LOCAL, factory);
    await expect(transport.send(MESSAGE)).rejects.toBeInstanceOf(TransientMailError);
    await expect(transport.send(MESSAGE)).rejects.toBeInstanceOf(TransientMailError);
    expect(ids).toEqual(['<enq_123@adelaide-sphere>', '<enq_123@adelaide-sphere>']);
  });

  it('thrown errors carry no body, subject, address or credential', () => {
    const error = classify({ code: 'EENVELOPE', responseCode: 550, message: 'Mailbox <visitor@example.org> unavailable; auth user relay-user pass relay-secret' });
    expect(error.message).not.toContain('visitor@example.org');
    expect(error.message).not.toContain(MESSAGE.text);
    expect(error.message).not.toContain(MESSAGE.subject);
    expect(error.message.length).toBeLessThanOrEqual(300);
  });
});
