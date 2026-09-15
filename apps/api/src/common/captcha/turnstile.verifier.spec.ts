import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptchaUnavailableError } from './captcha.port.js';
import { TurnstileVerifier } from './turnstile.verifier.js';

/**
 * Turnstile is the only thing standing between an automated client and the
 * public write endpoints (SRS SEC 002/003), and it had no test of its own until
 * this audit (finding F-03). The behaviour that matters is what it *refuses*:
 * a failed verification, a token minted for another site or another action, and
 * a provider it could not reach — the last of which must fail closed, because
 * accepting unverified content when Cloudflare is down is exactly the outcome
 * an attacker would arrange.
 */
describe('TurnstileVerifier', () => {
  const SECRET = 'turnstile-secret-value-not-real';
  const config = (values: Record<string, string | undefined>) =>
    ({ get: (key: string) => values[key] }) as unknown as ConstructorParameters<typeof TurnstileVerifier>[0];

  const withFetch = (impl: typeof globalThis.fetch) => {
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    return () => {
      globalThis.fetch = original;
    };
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  const verifier = (values: Record<string, string | undefined> = { TURNSTILE_SECRET_KEY: SECRET, PUBLIC_SITE_URL: 'https://adelaidesphere.example' }) =>
    new TurnstileVerifier(config(values));

  it('refuses to verify at all when no secret is configured, rather than passing everything', async () => {
    await expect(verifier({ TURNSTILE_SECRET_KEY: '' }).verify('token', 'contact', undefined)).rejects.toBeInstanceOf(CaptchaUnavailableError);
    expect(verifier({ TURNSTILE_SECRET_KEY: '' }).configured).toBe(false);
  });

  it('rejects a missing token without calling the provider', async () => {
    const fetchMock = vi.fn();
    restore = withFetch(fetchMock as unknown as typeof globalThis.fetch);
    expect(await verifier().verify(undefined, 'contact', undefined)).toEqual({ ok: false, reason: 'missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a token the provider verified for this site and this action', async () => {
    const fetchMock = vi.fn(async () => json({ success: true, hostname: 'adelaidesphere.example', action: 'contact' }));
    restore = withFetch(fetchMock as unknown as typeof globalThis.fetch);
    expect(await verifier().verify('token', 'contact', '203.0.113.10')).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const sent = new URLSearchParams(String(init.body));
    expect(sent.get('response')).toBe('token');
    // The caller's address is passed so Cloudflare can score it.
    expect(sent.get('remoteip')).toBe('203.0.113.10');
  });

  it('rejects a token the provider did not verify', async () => {
    restore = withFetch((async () => json({ success: false, 'error-codes': ['invalid-input-response'] })) as unknown as typeof globalThis.fetch);
    expect(await verifier().verify('token', 'contact', undefined)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a token minted for a different site or a different action', async () => {
    restore = withFetch((async () => json({ success: true, hostname: 'attacker.example', action: 'contact' })) as unknown as typeof globalThis.fetch);
    expect(await verifier().verify('token', 'contact', undefined)).toEqual({ ok: false, reason: 'invalid' });

    restore();
    restore = withFetch((async () => json({ success: true, hostname: 'adelaidesphere.example', action: 'review' })) as unknown as typeof globalThis.fetch);
    expect(await verifier().verify('token', 'contact', undefined)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('fails closed when the provider is unreachable or answers badly', async () => {
    restore = withFetch((async () => {
      throw new Error('network down');
    }) as unknown as typeof globalThis.fetch);
    await expect(verifier().verify('token', 'contact', undefined)).rejects.toBeInstanceOf(CaptchaUnavailableError);

    restore();
    restore = withFetch((async () => json({}, 500)) as unknown as typeof globalThis.fetch);
    await expect(verifier().verify('token', 'contact', undefined)).rejects.toBeInstanceOf(CaptchaUnavailableError);
  });

  it('never puts the secret in the error it raises', async () => {
    restore = withFetch((async () => {
      throw new Error(`upstream refused ${SECRET}`);
    }) as unknown as typeof globalThis.fetch);
    const error = await verifier()
      .verify('token', 'contact', undefined)
      .then(
        () => null,
        (thrown: unknown) => thrown as Error,
      );
    expect(error).toBeInstanceOf(CaptchaUnavailableError);
    expect(error!.message).not.toContain(SECRET);
  });
});
