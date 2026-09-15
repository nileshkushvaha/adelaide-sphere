import type { Response } from 'express';
import type { FieldErrors } from './validation.js';

export interface ErrorEnvelope {
  error: { code: string; message: string; fields: FieldErrors; requestId: string };
}

/** Writes an SRS API 002 error envelope; error responses are never cacheable. */
export function sendErrorEnvelope(
  res: Response,
  status: number,
  error: Omit<ErrorEnvelope['error'], 'fields'> & { fields?: FieldErrors },
): void {
  const body: ErrorEnvelope = { error: { fields: {}, ...error } };
  res.status(status).setHeader('Cache-Control', 'no-store');
  res.json(body);
}
