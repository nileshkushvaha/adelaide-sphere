import { PermanentMailError, TransientMailError } from './errors.js';
import { resendConfigFromEnv } from './resend-config.js';
import { ResendTransport } from './resend-transport.js';
import { signResendWebhook, verifyResendWebhook, WEBHOOK_TOLERANCE_SECONDS } from './resend-webhook.js';
import type { MailMessage } from './transport.js';

const SECRET = `whsec_${Buffer.from('a-test-signing-secret-value').toString('base64')}`;

const validEnv = {
  RESEND_API_KEY: 're_test_key',
  MAIL_FROM_ADDRESS: 'no-reply@mail.adelaidesphere.com',
  MAIL_FROM_NAME: 'Adelaide Sphere',
  RESEND_WEBHOOK_SECRET: SECRET,
};

const message: MailMessage = {
  to: 'visitor@example.com',
  from: 'Adelaide Sphere <no-reply@mail.adelaidesphere.com>',
  subject: 'Reset your password',
  text: 'Follow the link.',
  messageId: 'abc123@adelaidesphere.com',
};

describe('resendConfigFromEnv (SRS 1.2 MAIL 002, SET 004)', () => {
  it('accepts a complete configuration and composes a quoted sender', () => {
    const { config, problems } = resendConfigFromEnv(validEnv, { production: true });
    expect(problems).toEqual([]);
    expect(config?.from).toBe('Adelaide Sphere <no-reply@mail.adelaidesphere.com>');
    expect(config?.baseUrl).toBe('https://api.resend.com');
  });

  it('refuses production start-up when required configuration is missing or unsafe', () => {
    const cases: [Partial<typeof validEnv>, RegExp][] = [
      [{ RESEND_API_KEY: '' }, /RESEND_API_KEY/],
      [{ RESEND_API_KEY: 'not-a-resend-key' }, /RESEND_API_KEY/],
      [{ MAIL_FROM_ADDRESS: '' }, /MAIL_FROM_ADDRESS/],
      [{ MAIL_FROM_ADDRESS: 'no-reply@adelaidesphere.local' }, /verified production sender/],
      [{ MAIL_FROM_ADDRESS: 'no-reply@example.com' }, /verified production sender/],
      [{ RESEND_WEBHOOK_SECRET: '' }, /RESEND_WEBHOOK_SECRET/],
    ];
    for (const [override, expected] of cases) {
      const { config, problems } = resendConfigFromEnv({ ...validEnv, ...override }, { production: true });
      expect(config, JSON.stringify(override)).toBeNull();
      expect(problems.join('\n'), JSON.stringify(override)).toMatch(expected);
    }
  });

  it('never puts a value in a problem message', () => {
    const { problems } = resendConfigFromEnv({ ...validEnv, RESEND_API_KEY: 'sk_live_super_secret_value' }, { production: true });
    expect(problems.join('\n')).not.toContain('sk_live_super_secret_value');
  });

  it('refuses an API base override in production but allows one for tests', () => {
    expect(resendConfigFromEnv({ ...validEnv, RESEND_API_BASE_URL: 'http://127.0.0.1:9999' }, { production: true }).problems.join()).toMatch(/RESEND_API_BASE_URL/);
    expect(resendConfigFromEnv({ ...validEnv, RESEND_API_BASE_URL: 'http://127.0.0.1:9999' }, { production: false }).config?.baseUrl).toBe('http://127.0.0.1:9999');
  });

  it('refuses a sender name or reply-to that could split the header', () => {
    expect(resendConfigFromEnv({ ...validEnv, MAIL_FROM_NAME: 'Sphere\r\nBcc: evil@example.com' }, { production: false }).config).toBeNull();
    expect(resendConfigFromEnv({ ...validEnv, MAIL_REPLY_TO_ADDRESS: 'a@b.com, c@d.com' }, { production: false }).config).toBeNull();
  });
});

describe('ResendTransport (SRS 1.2 MAIL 004/006)', () => {
  const config = resendConfigFromEnv(validEnv, { production: false }).config!;

  it('sends one request with a bearer token and a stable idempotency key, and returns the provider id', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'provider-123' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    const result = await new ResendTransport(config, fetchImpl).send(message);

    expect(result.providerMessageId).toBe('provider-123');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_test_key');
    expect(headers['idempotency-key']).toBe(message.messageId);
    const body = JSON.parse(String(calls[0]!.init.body)) as { to: string[]; subject: string; headers: Record<string, string> };
    expect(body.to).toEqual(['visitor@example.com']);
    expect(body.headers['X-Entity-Ref-ID']).toBe(message.messageId);
  });

  it('treats 429 and 5xx as retryable and every other 4xx as permanent', async () => {
    const withStatus = (status: number, payload: unknown = { message: 'nope' }) =>
      new ResendTransport(config, (async () => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch);

    await expect(withStatus(429).send(message)).rejects.toBeInstanceOf(TransientMailError);
    await expect(withStatus(500).send(message)).rejects.toBeInstanceOf(TransientMailError);
    await expect(withStatus(503).send(message)).rejects.toBeInstanceOf(TransientMailError);
    await expect(withStatus(422).send(message)).rejects.toBeInstanceOf(PermanentMailError);
    await expect(withStatus(401).send(message)).rejects.toBeInstanceOf(PermanentMailError);
    await expect(withStatus(400).send(message)).rejects.toBeInstanceOf(PermanentMailError);
  });

  it('treats a network failure as retryable rather than dropping the message', async () => {
    const transport = new ResendTransport(config, (async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }) as unknown as typeof fetch);
    await expect(transport.send(message)).rejects.toBeInstanceOf(TransientMailError);
  });

  it('never puts the recipient, the body or the key in an error', async () => {
    const transport = new ResendTransport(
      config,
      (async () => new Response(JSON.stringify({ message: 'Invalid recipient visitor@example.com' }), { status: 422, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch,
    );
    const error = await transport.send(message).then(
      () => null,
      (thrown: unknown) => thrown as Error,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error!.message).not.toContain('visitor@example.com');
    expect(error!.message).not.toContain('re_test_key');
    expect(error!.message).not.toContain('Follow the link.');
  });

  it('describes itself without the key', () => {
    expect(new ResendTransport(config).describe()).toBe('resend (no-reply@mail.adelaidesphere.com, webhook verified)');
  });
});

describe('verifyResendWebhook (SRS 1.2 MAIL 007)', () => {
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'provider-123' } });
  const now = new Date('2026-09-07T10:00:00Z');
  const timestamp = Math.floor(now.getTime() / 1000);
  const headers = (overrides: Partial<{ id: string; timestamp: string; signature: string }> = {}) => ({
    id: 'msg_1',
    timestamp: String(timestamp),
    signature: signResendWebhook(body, 'msg_1', timestamp, SECRET),
    ...overrides,
  });

  it('accepts a correctly signed request', () => {
    expect(verifyResendWebhook(body, headers(), SECRET, now)).toEqual({ ok: true, id: 'msg_1' });
  });

  it('accepts one valid signature among several during a secret rotation', () => {
    const other = signResendWebhook(body, 'msg_1', timestamp, `whsec_${Buffer.from('another-secret').toString('base64')}`);
    expect(verifyResendWebhook(body, headers({ signature: `${other} ${signResendWebhook(body, 'msg_1', timestamp, SECRET)}` }), SECRET, now).ok).toBe(true);
  });

  it('rejects a tampered body, a wrong secret, wrong headers and a missing signature', () => {
    expect(verifyResendWebhook(`${body} `, headers(), SECRET, now).ok).toBe(false);
    expect(verifyResendWebhook(body, headers(), `whsec_${Buffer.from('wrong').toString('base64')}`, now).ok).toBe(false);
    expect(verifyResendWebhook(body, headers({ id: 'msg_2' }), SECRET, now).ok).toBe(false);
    expect(verifyResendWebhook(body, { id: 'msg_1', timestamp: String(timestamp), signature: undefined }, SECRET, now)).toEqual({ ok: false, reason: 'missing_headers' });
    expect(verifyResendWebhook(body, headers({ signature: 'v0,abc' }), SECRET, now)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('refuses a replayed request outside the tolerance window, in both directions', () => {
    const old = timestamp - WEBHOOK_TOLERANCE_SECONDS - 1;
    const future = timestamp + WEBHOOK_TOLERANCE_SECONDS + 1;
    expect(verifyResendWebhook(body, { id: 'msg_1', timestamp: String(old), signature: signResendWebhook(body, 'msg_1', old, SECRET) }, SECRET, now)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyResendWebhook(body, { id: 'msg_1', timestamp: String(future), signature: signResendWebhook(body, 'msg_1', future, SECRET) }, SECRET, now)).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses everything when no signing secret is configured', () => {
    expect(verifyResendWebhook(body, headers(), null, now)).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('refuses a non-numeric timestamp rather than coercing it', () => {
    expect(verifyResendWebhook(body, headers({ timestamp: '2026-09-07' }), SECRET, now)).toEqual({ ok: false, reason: 'bad_timestamp' });
  });
});

/**
 * A provider's error text is not ours to trust: it can echo the request,
 * including the key it was authenticated with. The original assertion here was
 * vacuous — the fake response never contained the key — so this one puts the
 * key in the provider's message and requires it not to survive (post-audit
 * remediation).
 */
describe('credential redaction in provider errors', () => {
  it('removes an API key, a webhook secret and a bearer token the provider echoes back', async () => {
    const echoes = [
      `rejected using ${validEnv.RESEND_API_KEY}`,
      'rejected using whsec_abcdefghijklmnopqrstuvwxyz',
      'rejected using Bearer re_some_other_key_value_here',
    ];
    for (const echoed of echoes) {
      const transport = new ResendTransport(
        resendConfigFromEnv(validEnv, { production: false }).config!,
        (async () => new Response(JSON.stringify({ message: echoed }), { status: 422, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch,
      );
      const error = await transport.send(message).then(
        () => null,
        (thrown: unknown) => thrown as Error,
      );
      expect(error!.message, echoed).toContain('[redacted-credential]');
      expect(error!.message, echoed).not.toContain('whsec_abcdefghijklmnopqrstuvwxyz');
      expect(error!.message, echoed).not.toContain(validEnv.RESEND_API_KEY);
    }
  });
});
