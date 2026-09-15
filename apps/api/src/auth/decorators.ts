import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { PermissionKey } from '../identity/permissions.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import type { SessionSummary } from './session.service.js';

export const PUBLIC_ROUTE_KEY = 'ms:public';
export const SESSION_ONLY_KEY = 'ms:session-only';
export const PERMISSIONS_KEY = 'ms:permissions';
export const ANY_PERMISSIONS_KEY = 'ms:any-permissions';

/** Marks an admin-prefixed route as reachable without a session (login, forgot, reset). */
export const Public = () => SetMetadata(PUBLIC_ROUTE_KEY, true);

/** Requires a valid session but no specific permission (me, logout). */
export const SessionOnly = () => SetMetadata(SESSION_ONLY_KEY, true);

/** Requires a valid session holding every listed permission. */
export const RequirePermissions = (...permissions: [PermissionKey, ...PermissionKey[]]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Requires a valid session holding at least one listed permission. Only for
 * lookups another screen depends on — the listing editor's category list, the
 * article editor's tag picker — so holding that screen's permission is enough
 * without also being given the lookup's own menu item (change log 1.13).
 */
export const RequireAnyPermission = (...permissions: [PermissionKey, PermissionKey, ...PermissionKey[]]) => SetMetadata(ANY_PERMISSIONS_KEY, permissions);

export interface AuthenticatedRequest extends Request {
  admin?: AdminPrincipal;
  session?: SessionSummary;
  sessionToken?: string;
}

export const CurrentAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext): AdminPrincipal => {
  const admin = ctx.switchToHttp().getRequest<AuthenticatedRequest>().admin;
  if (!admin) throw new Error('CurrentAdmin used on a route without session authentication');
  return admin;
});

export const CurrentSession = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionSummary => {
  const session = ctx.switchToHttp().getRequest<AuthenticatedRequest>().session;
  if (!session) throw new Error('CurrentSession used on a route without session authentication');
  return session;
});
