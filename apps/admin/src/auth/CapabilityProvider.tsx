import { useMemo, type ReactNode } from 'react';
import { usePermissions } from '@refinedev/core';
import { holdsAll } from './permissions';
import { CapabilityContext, type Capabilities } from './access-control';

/**
 * One capability layer for the whole application. It reads Refine's
 * `usePermissions`, which is backed by the auth provider's cached `/me`
 * response, so a role or permission change reaches every screen as soon as the
 * session is re-checked, and logging out clears it with the identity.
 */
export function CapabilityProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = usePermissions<string[]>({});
  const value = useMemo<Capabilities>(
    () => ({
      permissions: data,
      // `undefined` means "not known yet" — never treat it as "holds nothing" in
      // a way that flashes a forbidden state before the answer arrives.
      loading: isLoading || data === undefined,
      can: (...required) => holdsAll(data, required),
    }),
    [data, isLoading],
  );
  return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>;
}
