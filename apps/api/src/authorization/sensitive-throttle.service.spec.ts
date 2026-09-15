import { SENSITIVE_LIMITS, SensitiveThrottleService } from './sensitive-throttle.service.js';
import type { RedisService } from '../redis/redis.service.js';

/** A Redis stand-in with the three commands the limiter uses. */
function fakeRedis() {
  const store = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    store,
    service: {
      ensureConnected: async () => undefined,
      client: {
        incr: async (key: string) => {
          const next = (store.get(key) ?? 0) + 1;
          store.set(key, next);
          return next;
        },
        expire: async (key: string, seconds: number) => {
          ttls.set(key, seconds);
          return 1;
        },
        ttl: async (key: string) => ttls.get(key) ?? -1,
      },
    } as unknown as RedisService,
  };
}

const brokenRedis = {
  ensureConnected: async () => {
    throw new Error('redis down');
  },
  client: {},
} as unknown as RedisService;

describe('SensitiveThrottleService (SRS SEC 003)', () => {
  it('allows a realistic editing burst and then refuses, with a retry hint', async () => {
    const { service } = fakeRedis();
    const throttle = new SensitiveThrottleService(service);
    for (let i = 0; i < SENSITIVE_LIMITS.burst.max; i++) {
      expect(await throttle.consume('admin-1', '203.0.113.1'), `request ${i + 1}`).toEqual({ allowed: true });
    }
    const refused = await throttle.consume('admin-1', '203.0.113.1');
    expect(refused.allowed).toBe(false);
    expect((refused as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
  });

  it('meters each administrator separately, so one busy editor cannot block another', async () => {
    const { service } = fakeRedis();
    const throttle = new SensitiveThrottleService(service);
    for (let i = 0; i < SENSITIVE_LIMITS.burst.max + 1; i++) await throttle.consume('admin-1', undefined);
    expect(await throttle.consume('admin-2', undefined)).toEqual({ allowed: true });
  });

  it('keys on the administrator, not the address, so a forged forwarding header changes nothing', async () => {
    const { service, store } = fakeRedis();
    const throttle = new SensitiveThrottleService(service);
    await throttle.consume('admin-1', '203.0.113.1');
    await throttle.consume('admin-1', '198.51.100.7');
    expect([...store.keys()].every((key) => key.includes('admin-1'))).toBe(true);
    expect([...store.keys()].some((key) => key.includes('203.0.113'))).toBe(false);
    expect(store.get('throttle:authz:burst:admin-1')).toBe(2);
  });

  it('falls back to a tighter per-process ceiling when Redis is unavailable, rather than to no ceiling', async () => {
    const throttle = new SensitiveThrottleService(brokenRedis);
    for (let i = 0; i < SENSITIVE_LIMITS.fallback.max; i++) {
      expect(await throttle.consume('admin-1', undefined), `request ${i + 1}`).toEqual({ allowed: true });
    }
    const refused = await throttle.consume('admin-1', undefined);
    expect(refused.allowed).toBe(false);
    // An outage must not lock an operator out of the screens that restore access,
    // so the fallback is a ceiling rather than a closed door.
    expect(SENSITIVE_LIMITS.fallback.max).toBeGreaterThan(0);
    expect(SENSITIVE_LIMITS.fallback.max).toBeLessThan(SENSITIVE_LIMITS.burst.max);
  });

  it('leaves room for real bulk editing', () => {
    // The role editor saves details and permissions as two requests, so the
    // burst ceiling must clear editing several roles a minute.
    expect(SENSITIVE_LIMITS.burst.max / 2).toBeGreaterThanOrEqual(10);
    expect(SENSITIVE_LIMITS.sustained.max).toBeGreaterThanOrEqual(SENSITIVE_LIMITS.burst.max * 5);
  });
});
