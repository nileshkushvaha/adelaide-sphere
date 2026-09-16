import type { Request } from 'express';

export const ADMIN_PATH_PREFIX = '/api/v1/admin';

/**
 * Every route under /api/v1/admin is a restricted admin route (SRS section 16).
 *
 * The comparison ignores case on purpose. Routing is case-sensitive
 * (`configureApp`), but this check is the one thing standing between an
 * anonymous request and the admin handlers, so it must not depend on that
 * setting: `/api/v1/Admin/...` is treated as an admin path either way.
 */
export function isAdminPath(req: Pick<Request, 'path'>): boolean {
  const path = req.path.toLowerCase();
  return path === ADMIN_PATH_PREFIX || path.startsWith(`${ADMIN_PATH_PREFIX}/`);
}
