import { json, type Express } from 'express';
import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApiPrefixGuard } from './common/api-prefix-guard.js';
import type { IncomingMessage } from 'node:http';
import { bodyParserErrorHandler } from './common/body-parser-errors.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { HttpMetricsInterceptor } from './observability/http-metrics.interceptor.js';
import { createMetricsEndpoint } from './observability/metrics.endpoint.js';
import { requestIdMiddleware } from './common/request-id.js';
import { createValidationPipe } from './common/validation.js';

export const API_PREFIX = '/api/v1';
/** SRS API 004: JSON bodies are capped at 64 KB. */
export const JSON_BODY_LIMIT = '64kb';
/** Admin content routes that carry long formatted text (pages, articles); matches nginx `client_max_body_size 1m`. */
export const CONTENT_BODY_LIMIT = '1mb';
export const CONTENT_BODY_PATHS = ['/admin/pages', '/admin/posts'] as const;

/**
 * Options that must be passed when creating the application (real or test).
 * bodyParser: false lets configureApp register size-limited parsers itself.
 * abortOnError: false makes initialisation failures (e.g. invalid environment)
 * reject instead of calling process.abort(), so main.ts can report them.
 */
export const APP_CREATE_OPTIONS = { bodyParser: false, abortOnError: false } as const;

export interface ConfigureAppOptions {
  /** Trusted reverse-proxy hops; see EnvironmentVariables.TRUST_PROXY. Default 0. */
  trustProxy?: number;
  /** Shared secret for /metrics; unset means loopback-only. */
  metricsToken?: string;
}

/**
 * Applies the cross-cutting HTTP behaviour shared by main.ts and the e2e tests:
 * request IDs, body-size limits, the /api/v1 prefix, global validation and the
 * error envelope. Anything added here is exercised by the test suite.
 */
export function configureApp(app: NestExpressApplication, options: ConfigureAppOptions = {}): INestApplication {
  // Express matches routes case-insensitively by default, which let
  // `/api/v1/Admin/...` reach admin handlers past the path-based guards. Each
  // route has exactly one spelling. Nest's adapter creates the Express router
  // before this runs, so the setting alone is too late; the router reads its
  // own flag as each route is added, and Nest adds its routes at init, after
  // this. app.e2e-spec.ts fails if an upgrade stops honouring it.
  const express = app.getHttpAdapter().getInstance() as Express & { router: { caseSensitive?: boolean } };
  express.set('case sensitive routing', true);
  express.router.caseSensitive = true;
  // Client IP is taken from X-Forwarded-For only for the configured number of
  // trusted hops (0 = never). Express then exposes req.ip for limits/audit.
  app.set('trust proxy', options.trustProxy ?? 0);
  // Security headers for a JSON API (SRS SEC 001). The CSP forbids everything:
  // API responses are never documents to render, so a strict policy costs nothing.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(requestIdMiddleware);
  // Before the prefix guard: metrics are not part of the product API and are
  // not published in the OpenAPI document (SRS MON 001).
  app.use(createMetricsEndpoint(options.metricsToken));
  app.use(createApiPrefixGuard(API_PREFIX));
  // The provider webhook is signed over the exact bytes it sent, so the raw body
  // is kept alongside the parsed one for that route only (SRS 1.2 MAIL 007). The
  // express type for this option does not carry `verify`, but body-parser does.
  // Page and article content is the one place an editor legitimately sends more
  // than 64 KB (a page holds up to 200 000 characters of formatted text), so
  // those routes alone accept up to the edge's 1 MB; body-parser skips a body
  // that is already parsed, so the general parser below leaves them alone.
  for (const path of CONTENT_BODY_PATHS) app.use(`${API_PREFIX}${path}`, json({ limit: CONTENT_BODY_LIMIT }));
  app.useBodyParser('json', {
    limit: JSON_BODY_LIMIT,
    verify: (req: IncomingMessage & { rawBody?: string; url?: string }, _res: unknown, buffer: Buffer) => {
      if (req.url?.startsWith(`${API_PREFIX}/webhooks/`)) req.rawBody = buffer.toString('utf8');
    },
  } as Parameters<typeof app.useBodyParser<'json'>>[1]);
  app.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: false });
  app.use(bodyParserErrorHandler);
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new HttpMetricsInterceptor());
  app.disable('x-powered-by');
  return app;
}
