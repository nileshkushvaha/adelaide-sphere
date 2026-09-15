import { ApiError } from '@/api/errors';
import { createAuthProvider } from './auth-provider';
import type { Authenticated } from '@/api/auth';

const principal: Authenticated = {
  admin: { id: 'a1', email: 'admin@example.com', displayName: 'Admin', roles: ['super_admin'], permissions: ['listings.read'], inheritedPermissions: ['listings.read'], directPermissions: [], totpEnabled: false },
  session: { id: 's1', createdAt: '2026-09-06T00:00:00.000Z', idleExpiresAt: '2026-09-06T00:30:00.000Z', expiresAt: '2026-09-06T12:00:00.000Z' },
};
const unauthorized = new ApiError({ kind: 'unauthorized', status: 401, code: 'UNAUTHENTICATED', userMessage: 'Sign in to continue' });

function fakeApi(overrides: Partial<Record<'login' | 'me' | 'logout', (...args: never[]) => Promise<unknown>>> = {}) {
  return {
    login: overrides.login ?? (async () => ({ kind: 'session', value: principal })),
    me: overrides.me ?? (async () => principal),
    logout: overrides.logout ?? (async () => undefined),
    forgotPassword: async () => undefined,
    resetPassword: async () => undefined,
  } as never;
}

describe('cookie-session auth provider', () => {
  it('login success stores the identity in memory only and redirects to the dashboard', async () => {
    const provider = createAuthProvider({ api: fakeApi() });
    expect(await provider.login({ email: 'a', password: 'b' })).toEqual({ success: true, redirectTo: '/' });
    expect(await provider.getIdentity?.()).toEqual(principal.admin);
    expect(await provider.getPermissions?.()).toEqual(['listings.read']);
    expect(Object.keys(localStorage)).toHaveLength(0);
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });

  it('login failure surfaces the API message without throwing', async () => {
    const provider = createAuthProvider({
      api: fakeApi({ login: async () => { throw new ApiError({ kind: 'unauthorized', status: 401, code: 'INVALID_CREDENTIALS', userMessage: 'Invalid email or password' }); } }),
    });
    const result = await provider.login({ email: 'a@example.com', password: 'secret-password-1' });
    expect(result.success).toBe(false);
    expect(result.error).toMatchObject({ name: 'Sign-in failed', message: 'Invalid email or password', kind: 'unauthorized', retryAfterSeconds: null, fields: {} });
    // What the screen is handed must never carry what was typed.
    expect(JSON.stringify({ ...result.error, message: result.error?.message })).not.toMatch(/a@example\.com|secret-password-1/);
    expect(await provider.getIdentity?.()).toBeNull();
  });

  it('keeps the wait time from a rate-limited sign-in, so the screen can state it', async () => {
    const provider = createAuthProvider({
      api: fakeApi({ login: async () => { throw new ApiError({ kind: 'rate_limited', status: 429, code: 'RATE_LIMITED', userMessage: 'Too many attempts.', retryAfterSeconds: 120 }); } }),
    });
    expect((await provider.login({ email: 'a@example.com', password: 'x' })).error).toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 120 });
  });

  it('check asks the server and redirects to login when the session is gone', async () => {
    const ok = createAuthProvider({ api: fakeApi() });
    expect(await ok.check()).toEqual({ authenticated: true });
    const gone = createAuthProvider({ api: fakeApi({ me: async () => { throw unauthorized; } }) });
    expect(await gone.check()).toEqual({ authenticated: false, redirectTo: '/login', logout: false });
  });

  it('a 401 from any request logs the user out; other errors do not', async () => {
    const provider = createAuthProvider({ api: fakeApi() });
    expect(await provider.onError?.(unauthorized)).toMatchObject({ logout: true, redirectTo: '/login' });
    expect(await provider.onError?.(new ApiError({ kind: 'server', status: 500, code: null, userMessage: 'x' }))).toEqual({});
  });

  it('logout clears the identity even if the server call fails', async () => {
    const provider = createAuthProvider({ api: fakeApi({ logout: async () => { throw new Error('boom'); } }) });
    await provider.login({ email: 'a', password: 'b' });
    expect(await provider.logout({})).toEqual({ success: true, redirectTo: '/login' });
    expect(await provider.getIdentity?.()).toBeNull();
  });

  it('shares one /me request across rapid concurrent checks and re-asks the server later', async () => {
    let calls = 0;
    let clock = 0;
    const provider = createAuthProvider({ api: fakeApi({ me: async () => { calls += 1; return principal; } }), now: () => clock });
    await Promise.all([provider.check(), provider.check(), provider.check()]);
    expect(calls).toBe(1);
    clock += 5_000;
    await provider.check();
    expect(calls).toBe(2);
  });
});
