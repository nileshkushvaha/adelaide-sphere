import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Express-level middleware (registered before Nest routing) so that every
 * response, including 404s for unmatched routes and body-parser failures,
 * carries a server-generated request ID. Incoming X-Request-Id values are
 * deliberately ignored: trusting them would let a client forge IDs in logs.
 * Correlating with a trusted reverse proxy's ID is future work (ARC 004).
 */
export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const id = randomUUID();
  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}

export function getRequestId(req: RequestWithId): string {
  return req.requestId ?? 'unknown';
}
