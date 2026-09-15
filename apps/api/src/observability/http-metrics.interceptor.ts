import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { authorizationRejections, httpDuration, httpRequests, requestRejections } from './metrics.registry.js';

/** Refusals worth counting separately from ordinary 4xx (SRS SEC 003, RBAC 010). */
const REJECTION_BY_CODE: Record<string, string> = {
  CSRF_ORIGIN_REJECTED: 'csrf_origin',
  RATE_LIMITED: 'throttled',
  TOO_MANY_REQUESTS: 'throttled',
  CAPTCHA_UNAVAILABLE: 'captcha_unavailable',
  PAYLOAD_TOO_LARGE: 'payload_too_large',
};

/**
 * One counter and one histogram per request (post-audit remediation, MON 001).
 *
 * The route label is the **pattern** Nest matched (`/api/v1/admin/pages/:slug`),
 * never the URL: a label taken from the address would grow without bound as
 * visitors invent paths, which is both a memory leak in the scraper and a way
 * for a slug — or something worse pasted into one — to land in a metrics store.
 * A request that matched no route is labelled `unmatched` for the same reason.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { route?: { path?: string } }>();
    const response = http.getResponse<Response>();
    const started = process.hrtime.bigint();
    const method = request.method;

    const record = (status: number, error?: unknown) => {
      const route = routePattern(request);
      const statusClass = `${Math.floor(status / 100)}xx`;
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      httpRequests.inc({ method, route, status_class: statusClass, status: String(status) });
      httpDuration.observe({ method, route, status_class: statusClass }, seconds);

      if (status === 401) requestRejections.inc({ kind: 'unauthorized' });
      if (status === 403) requestRejections.inc({ kind: 'forbidden' });
      if (status === 413) requestRejections.inc({ kind: 'payload_too_large' });
      if (error instanceof HttpException) {
        const body = error.getResponse() as { code?: unknown; requiredPermission?: unknown };
        const kind = typeof body?.code === 'string' ? REJECTION_BY_CODE[body.code] : undefined;
        if (kind) requestRejections.inc({ kind });
        // The permission is a registry value, so it is a safe, bounded label.
        if (status === 403 && typeof body?.requiredPermission === 'string') authorizationRejections.inc({ permission: body.requiredPermission });
      }
    };

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode),
        error: (error: unknown) => record(error instanceof HttpException ? error.getStatus() : 500, error),
      }),
    );
  }
}

function routePattern(request: Request & { route?: { path?: string } }): string {
  const path = request.route?.path;
  if (typeof path === 'string' && path.length > 0) return path.startsWith('/') ? path : `/${path}`;
  // No matched route: never fall back to the URL, which the caller controls.
  return 'unmatched';
}
