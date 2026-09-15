import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './create-test-app.js';
import { ValidationFixtureController } from './fixtures/validation-fixture.controller.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('API foundation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ValidationFixtureController] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health', () => {
    it('returns the liveness envelope with no-store and a request id', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      expect(res.body).toEqual({ data: { status: 'ok' } });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-request-id']).toMatch(UUID);
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('readiness (GET /health/ready) reports 503 with a safe envelope when MySQL and Redis are unreachable', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
      expect(res.body).toEqual({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service not ready',
          fields: {},
          requestId: res.headers['x-request-id'],
        },
      });
      expect(res.headers['cache-control']).toBe('no-store');
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/mysql:\/\//);
      expect(text).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|test:test/);
    });

    it('sends security headers on every response', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
      expect(res.headers['strict-transport-security']).toBeDefined();
      const notFound = await request(app.getHttpServer()).get('/nope').expect(404);
      expect(notFound.headers['x-content-type-options']).toBe('nosniff');
    });

    it('is not served without the version prefix', async () => {
      await request(app.getHttpServer()).get('/health').expect(404);
      await request(app.getHttpServer()).get('/api/health').expect(404);
    });
  });

  describe('error envelope', () => {
    it('returns a 404 envelope for unknown routes, and the scaffold root route is gone', async () => {
      for (const path of ['/', '/api/v1', '/api/v1/nope']) {
        const res = await request(app.getHttpServer()).get(path).expect(404);
        expect(res.body).toEqual({
          error: {
            code: 'NOT_FOUND',
            message: 'Resource not found',
            fields: {},
            requestId: res.headers['x-request-id'],
          },
        });
        expect(res.headers['cache-control']).toBe('no-store');
      }
    });

    it('generates its own request id and ignores a client-supplied one', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/nope')
        .set('X-Request-Id', 'forged-id')
        .expect(404);
      expect(res.headers['x-request-id']).toMatch(UUID);
      expect(res.headers['x-request-id']).not.toBe('forged-id');
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    });

    it('uses a fresh id per request', async () => {
      const a = await request(app.getHttpServer()).get('/api/v1/health');
      const b = await request(app.getHttpServer()).get('/api/v1/health');
      expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
    });

    it('maps unexpected failures to a generic 500 without leaking details', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/__fixture/boom').expect(500);
      expect(res.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected error',
          fields: {},
          requestId: res.headers['x-request-id'],
        },
      });
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('secret internal detail');
      expect(text).not.toContain('/var/app');
      expect(text).not.toMatch(/at .*\.(ts|js)/);
    });
  });

  describe('admin authentication boundary (no database or Redis reachable)', () => {
    it('protected admin routes reject anonymous requests before touching any backend', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/admin/auth/me').expect(401);
      expect(res.body.error).toEqual({ code: 'UNAUTHENTICATED', message: 'Sign in to continue', fields: {}, requestId: res.headers['x-request-id'] });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('login without a trusted Origin is refused (login CSRF)', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/admin/auth/login').send({ email: 'a@example.com', password: 'whatever-password-1' }).expect(403);
      expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
    });

    it('login fails safe with 503 when the rate-limiter store is unavailable (never bypasses the limiter)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .set('Origin', 'http://127.0.0.1:4002')
        .send({ email: 'a@example.com', password: 'whatever-password-1' })
        .expect(503);
      expect(res.body.error).toMatchObject({ code: 'SERVICE_UNAVAILABLE', fields: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/redis|ECONNREFUSED|127\.0\.0\.1:1/i);
    });

    it('validates login input before any backend work', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .set('Origin', 'http://127.0.0.1:4002')
        .send({ email: 'not-an-email', password: '' })
        .expect(400);
      expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'password']);
    });
  });

  describe('public taxonomy without a database', () => {
    it('answers 503 with the envelope (not 500) when MySQL is unreachable, and exposes the fixed Adelaide context', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/categories').expect(503);
      expect(res.body.error).toMatchObject({ code: 'SERVICE_UNAVAILABLE', fields: {} });
      expect(JSON.stringify(res.body)).not.toMatch(/mysql|ECONNREFUSED|prisma/i);
      const ctx = await request(app.getHttpServer()).get('/api/v1/site/context').expect(200);
      expect(ctx.body.data).toMatchObject({ city: 'Adelaide', state: 'SA', country: 'AU', timezone: 'Australia/Adelaide' });
      expect(ctx.headers['cache-control']).toContain('public');
    });
  });

  describe('request validation', () => {
    const valid = {
      name: 'Jamie',
      email: 'jamie@example.com',
      rating: 4,
      address: { suburb: 'Carlton' },
    };

    it('accepts a valid DTO', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/__fixture/submit')
        .send(valid)
        .expect(201);
      expect(res.body).toEqual({ data: { received: 'Jamie' } });
    });

    it('rejects unknown fields and reports them by name', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/__fixture/submit')
        .send({ ...valid, isAdmin: true })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('Request validation failed');
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
      expect(Object.keys(res.body.error.fields)).toEqual(['isAdmin']);
      expect(res.body.error.fields.isAdmin[0]).toMatch(/should not exist/);
    });

    it('reports multiple invalid fields, including nested paths, in one response', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/__fixture/submit')
        .send({ name: 'J', email: 'not-an-email', rating: 9, address: { suburb: 'X' } })
        .expect(400);
      expect(Object.keys(res.body.error.fields).sort()).toEqual([
        'address.suburb',
        'email',
        'name',
        'rating',
      ]);
    });

    it('does not coerce types implicitly', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/__fixture/submit')
        .send({ ...valid, rating: '4' })
        .expect(400);
      expect(res.body.error.fields).toHaveProperty('rating');
    });

    it('rejects malformed JSON with a 400 envelope', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/__fixture/submit')
        .set('Content-Type', 'application/json')
        .send('{"name": ')
        .expect(400);
      expect(res.body.error).toMatchObject({ code: 'BAD_REQUEST', message: 'Malformed JSON body' });
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    });

    it('rejects JSON bodies over 64 KB with a 413 envelope', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/__fixture/submit')
        .send({ ...valid, name: 'x'.repeat(70 * 1024) })
        .expect(413);
      expect(res.body.error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', fields: {} });
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    });
  });
});
