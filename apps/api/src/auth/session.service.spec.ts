import { hashSessionToken, SESSION_COOKIE_PATH, SessionService } from './session.service.js';

function make(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { SESSION_IDLE_MINUTES: 30, SESSION_ABSOLUTE_HOURS: 12, SESSION_COOKIE_SECURE: true, ...overrides };
  // The security policy resolves to the specified defaults in these tests; the
  // settings that narrow it have their own suite.
  const policy = { policy: async () => ({ sessionIdleMs: 30 * 60_000, sessionAbsoluteMs: 12 * 3_600_000, maxConcurrentSessions: 10, passwordResetMs: 30 * 60_000, passwordMinLength: 12, passwordHistoryDepth: 0, loginMaxFailedAttempts: 5, loginBlockSeconds: 900 }) } as never;
  return new SessionService({} as never, policy, { get: (k: string) => values[k] } as never);
}

describe('SessionService', () => {
  it('cookie is HttpOnly, SameSite=Strict, scoped to the admin API path and bounded by the absolute lifetime', () => {
    const opts = make().cookieOptions;
    expect(opts).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict', path: SESSION_COOKIE_PATH, maxAge: 12 * 3_600_000 });
    expect(SESSION_COOKIE_PATH).toBe('/api/v1/admin');
    expect(make({ SESSION_COOKIE_SECURE: false }).cookieOptions.secure).toBe(false);
  });

  it('hashes tokens with SHA-256 (hex) so the database never holds the raw token', () => {
    const h = hashSessionToken('token-value');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain('token-value');
    expect(hashSessionToken('token-value')).toBe(h);
  });

  it('rejects obviously malformed tokens without touching the database', async () => {
    const svc = make();
    expect(await svc.validate(undefined)).toEqual({ ok: false, reason: 'missing' });
    expect(await svc.validate('short')).toEqual({ ok: false, reason: 'missing' });
    expect(await svc.validate('x'.repeat(200))).toEqual({ ok: false, reason: 'missing' });
  });
});
