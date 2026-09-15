import { HealthController } from './health.controller.js';
import type { DatabaseService } from '../database/database.service.js';
import type { RedisService } from '../redis/redis.service.js';

function fakeDatabase(result: Awaited<ReturnType<DatabaseService['ping']>>): DatabaseService {
  return { ping: async () => result } as unknown as DatabaseService;
}

function fakeRedis(result: Awaited<ReturnType<RedisService['ping']>> = { ok: true, latencyMs: 1 }): RedisService {
  return { ping: async () => result } as unknown as RedisService;
}

function fakeResponse() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  return res;
}

describe('HealthController', () => {
  it('liveness returns only the status inside the data envelope and never touches the database', () => {
    const db = { ping: () => { throw new Error('must not be called'); } } as unknown as DatabaseService;
    const body = new HealthController(db, fakeRedis()).getHealth();
    expect(body).toEqual({ data: { status: 'ok' } });
    expect(Object.keys(body.data)).toEqual(['status']);
  });

  it('readiness returns 200 with the database check when the ping succeeds', async () => {
    const res = fakeResponse();
    await new HealthController(fakeDatabase({ ok: true, latencyMs: 3 }), fakeRedis()).getReadiness(
      { requestId: 'rid-1' } as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ data: { status: 'ready', checks: { database: 'ok', redis: 'ok' } } });
  });

  it.each([
    { ok: false, reason: 'error' } as const,
    { ok: false, reason: 'timeout' } as const,
    { ok: false, reason: 'backoff' } as const,
    { ok: false, reason: 'closed' } as const,
  ])(
    'readiness returns a 503 envelope without details when the ping reports %o',
    async (ping) => {
      const res = fakeResponse();
      await new HealthController(fakeDatabase(ping), fakeRedis()).getReadiness({ requestId: 'rid-2' } as never, res as never);
      expect(res.statusCode).toBe(503);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Service not ready', fields: {}, requestId: 'rid-2' },
      });
    },
  );

  it('readiness reports Redis unavailability without leaking details', async () => {
    const res = fakeResponse();
    await new HealthController(fakeDatabase({ ok: true, latencyMs: 1 }), fakeRedis({ ok: false, reason: 'error' })).getReadiness({ requestId: 'rid-3' } as never, res as never);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Service not ready', fields: {}, requestId: 'rid-3' } });
  });
});
