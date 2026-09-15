import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { metricsRegistry } from './metrics.registry.js';

export const METRICS_PATH = '/metrics';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // Compare in constant time, and only when the lengths already match — the
  // length of a secret is not worth leaking through timing either.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Metrics exposition (post-audit remediation, SRS MON 001).
 *
 * Deliberately Express-level and outside `/api/v1`: it is not part of the
 * product's API, it is not in the OpenAPI document, and it must not be reachable
 * through the public routes. Two ways in, both closed by default:
 *
 *  - a request from the loopback interface (a scraper sidecar on the same host);
 *  - `Authorization: Bearer <METRICS_TOKEN>`, when that variable is configured.
 *
 * Anything else gets 404 rather than 401: an unauthenticated caller should not
 * learn that the endpoint exists.
 */
export function createMetricsEndpoint(token?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path !== METRICS_PATH) {
      next();
      return;
    }
    const header = req.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const authorised = (token !== undefined && presented !== '' && tokenMatches(presented, token)) || (token === undefined && LOOPBACK.has(req.socket.remoteAddress ?? ''));
    if (!authorised) {
      res.status(404).type('application/json').send(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Resource not found' } }));
      return;
    }
    void metricsRegistry
      .metrics()
      .then((body) => {
        res.status(200).set('Content-Type', metricsRegistry.contentType).set('Cache-Control', 'no-store').send(body);
      })
      .catch(() => {
        res.status(503).type('text/plain').send('metrics unavailable\n');
      });
  };
}
