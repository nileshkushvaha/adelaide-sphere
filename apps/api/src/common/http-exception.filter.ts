import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseUnavailableError, Prisma } from '@adelaide-sphere/database';
import { getRequestId, type RequestWithId } from './request-id.js';
import { sendErrorEnvelope } from './error-envelope.js';
import { RequestValidationException, type FieldErrors } from './validation.js';

const CODES: Partial<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

/** Statuses whose framework message could reveal paths or internals get a fixed text. */
const GENERIC_MESSAGES: Partial<Record<number, string>> = {
  404: 'Resource not found',
  413: 'Request body too large',
  500: 'Unexpected error',
};

/** Errors thrown by Express body parsing (http-errors) carry status/type but are not HttpExceptions. */
interface HttpErrorLike {
  status?: number;
  statusCode?: number;
  type?: string;
  expose?: boolean;
  message?: string;
}

interface Described {
  status: number;
  code: string;
  message: string;
  fields: FieldErrors;
}

/** Accepts only a `{ field: string[] }` map so arbitrary exception payloads never leak into responses. */
function fieldErrorsOf(value: unknown): FieldErrors {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: FieldErrors = {};
  for (const [key, list] of Object.entries(value as Record<string, unknown>)) {
    if (Array.isArray(list) && list.every((m) => typeof m === 'string')) out[key] = list as string[];
  }
  return out;
}

/**
 * Maps every exception to the SRS API 002 envelope
 * {error:{code,message,fields,requestId}} with a meaningful status code.
 * Unexpected errors become a generic 500; details are logged server-side only.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithId>();
    const requestId = getRequestId(req);
    const { status, code, message, fields } = this.describe(exception);

    if (status >= 500) {
      const detail =
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
      // The route pattern, not the address: a path can carry a preview token and
      // a query string can carry whatever the caller typed.
      const route = `${req.baseUrl ?? ''}${(req as { route?: { path?: string } }).route?.path ?? '[unmatched route]'}`;
      this.logger.error(`[${requestId}] ${req.method} ${route} -> ${status}\n${detail}`);
    }

    sendErrorEnvelope(res, status, { code, message, fields, requestId });
  }

  private describe(exception: unknown): Described {
    if (exception instanceof RequestValidationException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        fields: exception.fields,
      };
    }

    // Temporary infrastructure failure (SRS API 002: 503), never a stack trace.
    if (exception instanceof DatabaseUnavailableError) {
      return { status: HttpStatus.SERVICE_UNAVAILABLE, code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable. Please try again shortly.', fields: {} };
    }

    // Database errors that escaped a service: the right status, never Prisma's
    // own text, which names models, fields and constraints.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') return { status: HttpStatus.CONFLICT, code: 'CONFLICT', message: 'This conflicts with an existing record.', fields: {} };
      if (exception.code === 'P2025') return { status: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: GENERIC_MESSAGES[404]!, fields: {} };
    }
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return { status: HttpStatus.SERVICE_UNAVAILABLE, code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable. Please try again shortly.', fields: {} };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      let code = CODES[status] ?? 'HTTP_ERROR';
      let message = GENERIC_MESSAGES[status] ?? exception.message;
      if (typeof response === 'object' && response !== null) {
        const r = response as { code?: unknown; message?: unknown; fields?: unknown };
        if (typeof r.code === 'string') code = r.code;
        if (typeof r.message === 'string' && !(status in GENERIC_MESSAGES)) message = r.message;
        return { status, code, message, fields: fieldErrorsOf(r.fields) };
      }
      return { status, code, message, fields: {} };
    }

    // Express/body-parser errors (e.g. 413 entity.too.large, 400 entity.parse.failed).
    const err = exception as HttpErrorLike | null;
    const status = typeof err?.status === 'number' ? err.status : err?.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      const message =
        err?.type === 'entity.parse.failed'
          ? 'Malformed JSON body'
          : (GENERIC_MESSAGES[status] ?? (err?.expose && err.message ? err.message : 'Bad request'));
      return { status, code: CODES[status] ?? 'BAD_REQUEST', message, fields: {} };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Unexpected error',
      fields: {},
    };
  }
}
