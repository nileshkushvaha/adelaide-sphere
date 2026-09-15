import { clearAllLocalDrafts } from '@/shared/postDrafts';
import type { AuthProvider } from '@refinedev/core';
import { isApiError } from '@/api/errors';
import { authApi, type Authenticated, type LoginChallenge } from '@/api/auth';
import { accountApi } from '@/api/admins';
import { toSignInFailure } from './sign-in-failure';

/**
 * Refine auth provider backed by the API's cookie session. `check` asks the
 * server (`/me`) every time Refine needs to know, so a revoked or expired
 * session is detected on the next navigation; nothing about the session is
 * cached in the browser beyond the current in-memory identity.
 */
/** Concurrent/rapid `check` calls (Refine mounts several consumers per navigation) share one `/me` request. */
const CHECK_SHARE_WINDOW_MS = 1_000;

export function createAuthProvider(deps: { api?: typeof authApi; now?: () => number } = {}): AuthProvider & { current: () => Authenticated | null } {
  const api = deps.api ?? authApi;
  const now = deps.now ?? Date.now;
  let current: Authenticated | null = null;
  let inflightMe: { at: number; promise: Promise<Authenticated> } | null = null;

  const fetchMe = (): Promise<Authenticated> => {
    if (inflightMe && now() - inflightMe.at < CHECK_SHARE_WINDOW_MS) return inflightMe.promise;
    const promise = api.me().finally(() => {
      // Keep the settled result shareable for the rest of the window, then drop it.
      setTimeout(() => {
        if (inflightMe?.promise === promise) inflightMe = null;
      }, CHECK_SHARE_WINDOW_MS);
    });
    inflightMe = { at: now(), promise };
    return promise;
  };

  return {
    current: () => current,

    async login(params: { email: string; password: string } | { challenge: string; code: string }) {
      try {
        if ('challenge' in params) {
          current = await accountApi.totpChallenge(params.challenge, params.code);
          inflightMe = null;
          return { success: true, redirectTo: '/' };
        }
        const outcome = await api.login(params.email, params.password);
        if (outcome.kind === 'challenge') {
          // Not authenticated yet: the login page renders the code step with this challenge.
          return { success: false, error: { name: 'totp', message: JSON.stringify(outcome.value satisfies LoginChallenge) } };
        }
        current = outcome.value;
        inflightMe = null;
        return { success: true, redirectTo: '/' };
      } catch (error) {
        current = null;
        // The failure keeps its kind, wait time and field errors so the sign-in
        // screen can respond to each case rather than print one sentence.
        return { success: false, error: toSignInFailure(error) };
      }
    },

    async logout() {
      try {
        await api.logout();
      } catch {
        // The server may already consider the session gone; either way the client forgets it.
      }
      // Unsaved article copies stay on this computer only while someone is signed in.
      clearAllLocalDrafts();
      current = null;
      inflightMe = null;
      return { success: true, redirectTo: '/login' };
    },

    async check() {
      try {
        current = await fetchMe();
        return { authenticated: true };
      } catch (error) {
        current = null;
        if (isApiError(error) && error.kind === 'unauthorized') {
          return { authenticated: false, redirectTo: '/login', logout: false };
        }
        // Network/server problems: do not silently treat the user as logged out and drop work;
        // surface as not authenticated but keep the reason for the login page.
        return { authenticated: false, redirectTo: '/login', error: error instanceof Error ? error : new Error('Unable to verify the session') };
      }
    },

    async onError(error) {
      if (isApiError(error) && error.kind === 'unauthorized') {
        current = null;
        return { logout: true, redirectTo: '/login', error };
      }
      return {};
    },

    async getIdentity() {
      return current?.admin ?? null;
    },

    async getPermissions() {
      return current?.admin.permissions ?? [];
    },
  };
}
