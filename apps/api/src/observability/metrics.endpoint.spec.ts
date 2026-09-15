import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { METRICS_PATH, createMetricsEndpoint } from './metrics.endpoint.js';
import { authEvents, emailDeliveries, httpRequests, metricsRegistry } from './metrics.registry.js';

const appWith = (token?: string) => {
  const app = express();
  app.use(createMetricsEndpoint(token));
  app.get('/other', (_req, res) => void res.send('ok'));
  return app;
};

describe('metrics exposition', () => {
  it('answers a loopback request when no token is configured', async () => {
    const response = await request(appWith()).get(METRICS_PATH);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).toContain('ms_http_requests_total');
  });

  it('does not admit to existing without the configured token', async () => {
    const token = 'x'.repeat(40);
    const denied = await request(appWith(token)).get(METRICS_PATH);
    // 404, not 401: an unauthorised caller learns nothing about the endpoint.
    expect(denied.status).toBe(404);
    expect(denied.text).not.toContain('ms_');

    const wrong = await request(appWith(token)).get(METRICS_PATH).set('Authorization', `Bearer ${'y'.repeat(40)}`);
    expect(wrong.status).toBe(404);

    const allowed = await request(appWith(token)).get(METRICS_PATH).set('Authorization', `Bearer ${token}`);
    expect(allowed.status).toBe(200);
  });

  it('leaves other paths alone', async () => {
    expect((await request(appWith()).get('/other')).status).toBe(200);
  });

  it('carries no address, recipient, identifier or secret in any label', async () => {
    // Record through the real metrics the request path uses, with values that
    // would be a leak if any of them reached a label.
    httpRequests.inc({ method: 'GET', route: '/api/v1/businesses/:slug', status_class: '2xx', status: '200' });
    authEvents.inc({ event: 'login_success' });
    emailDeliveries.inc({ provider: 'resend', outcome: 'delivered' });

    const body = await metricsRegistry.metrics();
    // Only the sample lines: HELP text is prose written here, label values are
    // the part that could carry something a request supplied.
    const samples = body.split('\n').filter((line) => line.length > 0 && !line.startsWith('#')).join('\n');
    for (const forbidden of ['@', 'password', 'token', 'secret', 'Bearer ', 'session=']) {
      expect(samples.toLowerCase().includes(forbidden.toLowerCase()), `metric samples must not contain ${JSON.stringify(forbidden)}`).toBe(false);
    }
    // Route labels are patterns, so a visitor-supplied slug can never appear.
    expect(body).toContain('route="/api/v1/businesses/:slug"');
  });
});
