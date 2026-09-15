import type { AuthProvider } from '@refinedev/core';
import { withCapabilityLifecycle } from './capability-lifecycle';
import { capabilityStore } from './capability-store';

function harness(overrides: Partial<AuthProvider> = {}) {
  const store: { value: string[] | undefined } = { value: undefined };
  const base: AuthProvider = {
    login: async () => ({ success: true }),
    logout: async () => ({ success: true, redirectTo: '/login' }),
    check: async () => ({ authenticated: true }),
    onError: async () => ({}),
    getPermissions: async () => ['roles.view', 'audit.read'],
    ...overrides,
  };
  return { store, provider: withCapabilityLifecycle(base, { set: (codes) => { store.value = codes; } }) };
}

/**
 * The capability cache must never outlive the session it belongs to (SRS RBAC
 * 010). Without this, the next person at the keyboard is asked about with the
 * previous administrator's permissions until a fresh answer arrives.
 */
describe('capability lifecycle', () => {
  it('stores the codes the server returned', async () => {
    const { store, provider } = harness();
    await provider.getPermissions?.({});
    expect(store.value).toEqual(['roles.view', 'audit.read']);
  });

  it('clears them on logout', async () => {
    const { store, provider } = harness();
    await provider.getPermissions?.({});
    await provider.logout?.({});
    expect(store.value).toBeUndefined();
  });

  it('clears them when an error logs the administrator out', async () => {
    const { store, provider } = harness({ onError: async () => ({ logout: true, redirectTo: '/login' }) });
    await provider.getPermissions?.({});
    await provider.onError?.(new Error('401'));
    expect(store.value).toBeUndefined();
  });

  it('keeps them for an error that does not end the session', async () => {
    const { store, provider } = harness({ onError: async () => ({}) });
    await provider.getPermissions?.({});
    await provider.onError?.(new Error('500'));
    expect(store.value).toEqual(['roles.view', 'audit.read']);
  });

  it('clears them when the session check fails', async () => {
    const { store, provider } = harness({ check: async () => ({ authenticated: false, redirectTo: '/login' }) });
    await provider.getPermissions?.({});
    await provider.check?.({});
    expect(store.value).toBeUndefined();
  });

  it('is wired to the shared store, so the access-control provider reads what the session wrote', async () => {
    const provider = withCapabilityLifecycle(
      { login: async () => ({ success: true }), check: async () => ({ authenticated: true }), logout: async () => ({ success: true }), onError: async () => ({}), getPermissions: async () => ['media.view'] },
      capabilityStore,
    );
    await provider.getPermissions?.({});
    expect(capabilityStore.get()).toEqual(['media.view']);
    await provider.logout?.({});
    expect(capabilityStore.get()).toBeUndefined();
  });

  it('reports no permissions rather than throwing when the provider has none', async () => {
    const { store, provider } = harness({ getPermissions: undefined });
    await expect(provider.getPermissions?.({})).resolves.toEqual([]);
    expect(store.value).toBeUndefined();
  });
});
