import type { NextFunction, Response } from 'express';
import { sendErrorEnvelope } from './error-envelope.js';
import { getRequestId, type RequestWithId } from './request-id.js';

interface BodyParserError {
  type?: string;
  status?: number;
}

/**
 * Express error middleware registered immediately after the body parsers.
 * Nest rewraps parser SyntaxErrors as a plain BadRequestException and drops the
 * parser's `type`, so handling them here keeps the messages precise and
 * guarantees the envelope before Nest routing is involved.
 */
export function bodyParserErrorHandler(
  err: unknown,
  req: RequestWithId,
  res: Response,
  next: NextFunction,
): void {
  const e = (err ?? {}) as BodyParserError;
  const requestId = getRequestId(req);
  if (e.type === 'entity.parse.failed') {
    sendErrorEnvelope(res, 400, { code: 'BAD_REQUEST', message: 'Malformed JSON body', requestId });
    return;
  }
  if (e.type === 'entity.too.large') {
    sendErrorEnvelope(res, 413, { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large', requestId });
    return;
  }
  if (e.type === 'encoding.unsupported' || e.type === 'charset.unsupported') {
    sendErrorEnvelope(res, 415, { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported request encoding', requestId });
    return;
  }
  next(err);
}
