import { createContext, useContext } from 'react';
import type { AccessControlProvider } from '@refinedev/core';
import { holdsAll, holdsAny, routeRequirement, type PermissionCode } from './permissions';

/**
 * Refine access control (SRS RBAC 010). `can` answers from the effective
 * permission codes the **server** calculated and returned from `/admin/auth/me`;
 * nothing here re-derives roles, and nothing here is a security boundary — every
 * request is enforced again by the API, which answers 403 whatever the interface
 * decided to show.
 *
 * A resource is addressed either by its route path (`{ resource: '/roles' }`) or
 * by a permission code directly (`{ action: 'listings.publish' }`), so a button
 * inside a page can ask about one capability without inventing a resource name.
 */
export function createAccessControlProvider(getPermissions: () => readonly string[] | undefined): AccessControlProvider {
  return {
    async can({ resource, action, params }) {
      const held = getPermissions();
      if (!held) return { can: false, reason: 'Loading your permissions' };
      const explicit = (params?.permissions as PermissionCode[] | undefined) ?? [];
      const route = explicit.length === 0 && !action?.includes('.') ? routeRequirement(resource ?? '') : null;
      const required = explicit.length > 0 ? explicit : action?.includes('.') ? [action as PermissionCode] : (route?.permissions ?? []);
      // An unmapped resource has no requirement; the API still guards it.
      if (required.length === 0) return { can: true };
      const allowed = route?.anyOf ? holdsAny(held, required) : holdsAll(held, required);
      return allowed ? { can: true } : { can: false, reason: 'You do not have permission to do that' };
    },
    options: { buttons: { enableAccessControl: true, hideIfUnauthorized: true } },
  };
}


export interface Capabilities {
  /** Effective permission codes, or undefined until the server has answered. */
  permissions: readonly string[] | undefined;
  loading: boolean;
  can: (...required: PermissionCode[]) => boolean;
}

export const CapabilityContext = createContext<Capabilities | null>(null);

/** Typed capability check for components: `const { can, loading } = useCapabilities()`. */
export function useCapabilities(): Capabilities {
  const value = useContext(CapabilityContext);
  if (!value) throw new Error('useCapabilities used outside CapabilityProvider');
  return value;
}
