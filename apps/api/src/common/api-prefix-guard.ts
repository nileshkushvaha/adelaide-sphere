import type { NextFunction, Response } from 'express';
import { sendErrorEnvelope } from './error-envelope.js';
import { getRequestId, type RequestWithId } from './request-id.js';

/**
 * Nest mounts its own not-found handler only under the global prefix (and its
 * wildcard needs at least one segment), so a request outside /api/v1/ would
 * otherwise fall through to Express's default HTML 404 page. This
 * Express-level middleware answers those requests with the standard JSON
 * envelope instead, before Nest routing is reached. Only paths *below* the
 * prefix are passed on; the bare prefix is not a resource.
 */
export function createApiPrefixGuard(prefix: string) {
  const base = `/${prefix.replace(/^\/+|\/+$/g, '')}`;
  return (req: RequestWithId, res: Response, next: NextFunction): void => {
    if (req.path.startsWith(`${base}/`)) {
      next();
      return;
    }
    sendErrorEnvelope(res, 404, {
      code: 'NOT_FOUND',
      message: 'Resource not found',
      requestId: getRequestId(req),
    });
  };
}
