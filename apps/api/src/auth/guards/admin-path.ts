import type { Request } from 'express';

export const ADMIN_PATH_PREFIX = '/api/v1/admin';

/** Every route under /api/v1/admin is a restricted admin route (SRS section 16). */
export function isAdminPath(req: Pick<Request, 'path'>): boolean {
  return req.path === ADMIN_PATH_PREFIX || req.path.startsWith(`${ADMIN_PATH_PREFIX}/`);
}
