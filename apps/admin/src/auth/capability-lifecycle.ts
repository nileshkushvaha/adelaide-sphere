import type { AuthProvider } from '@refinedev/core';

/**
 * Keeps the capability cache in step with the session (SRS RBAC 010).
 *
 * Refine calls `accessControlProvider.can` outside React, so the effective
 * permission codes are held next to the provider. They must be dropped the
 * moment the session ends — on logout, on an authentication error that logs the
 * administrator out, and on a failed session check — otherwise the previous
 * administrator's capabilities would still answer `can` for whoever is at the
 * keyboard next.
 */
export function withCapabilityLifecycle(provider: AuthProvider, store: { set: (codes: string[] | undefined) => void }): AuthProvider {
  return {
    ...provider,
    async getPermissions(params) {
      const codes = (await provider.getPermissions?.(params)) as string[] | undefined;
      store.set(codes);
      return codes ?? [];
    },
    async logout(params) {
      store.set(undefined);
      return (await provider.logout?.(params)) ?? { success: true, redirectTo: '/login' };
    },
    async onError(error) {
      const outcome = (await provider.onError?.(error)) ?? {};
      if (outcome.logout) store.set(undefined);
      return outcome;
    },
    async check(params) {
      const outcome = (await provider.check?.(params)) ?? { authenticated: false };
      if (!outcome.authenticated) store.set(undefined);
      return outcome;
    },
  };
}
