import { LoginThrottleService, ThrottleUnavailableError } from './login-throttle.service.js';

/** In-memory stand-in for the ioredis commands the service uses. */
class FakeRedisClient {
  store = new Map<string, { value: number; expiresAt: number | null }>();
  now = 1_000_000;
  failing = false;
  fail() {
    if (this.failing) throw Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
  }
  async get(key: string) {
    this.fail();
    const e = this.live(key);
    return e ? String(e.value) : null;
  }
  async ttl(key: string) {
    this.fail();
    const e = this.live(key);
    return e ? (e.expiresAt === null ? -1 : Math.ceil((e.expiresAt - this.now) / 1000)) : -2;
  }
  async incr(key: string) {
    this.fail();
    const e = this.live(key) ?? { value: 0, expiresAt: null };
    e.value += 1;
    this.store.set(key, e);
    return e.value;
  }
  async del(key: string) {
    this.store.delete(key);
    return 1;
  }
  multi() {
    const ops: Array<() => void> = [];
    const chain = {
      expire: (key: string, seconds: number) => {
        ops.push(() => {
          const e = this.store.get(key);
          if (e) e.expiresAt = this.now + seconds * 1000;
        });
        return chain;
      },
      exec: async () => {
        this.fail();
        ops.forEach((op) => op());
        return [];
      },
    };
    return chain;
  }
  private live(key: string) {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expiresAt !== null && e.expiresAt <= this.now) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }
}

function make() {
  const client = new FakeRedisClient();
  const redis = { client, ensureConnected: async () => client.fail() } as never;
  // Defaults: these tests cover the SEC 002 ceilings; narrowing them through
  // the security settings is covered by the security settings suite.
  const policy = { policy: async () => ({ sessionIdleMs: 0, sessionAbsoluteMs: 0, maxConcurrentSessions: 10, passwordResetMs: 0, passwordMinLength: 12, passwordHistoryDepth: 0, loginMaxFailedAttempts: 5, loginBlockSeconds: 900 }) } as never;
  const service = new LoginThrottleService(redis, policy, { get: () => 'unit-test-secret-key-0123456789-0123456789' } as never);
  return { client, service };
}

describe('LoginThrottleService', () => {
  it('allows until the fifth failure, then blocks with a retry hint for the window', async () => {
    const { client, service } = make();
    for (let i = 0; i < 5; i++) {
      expect(await service.check('login', '10.0.0.1', 'a@example.com')).toEqual({ allowed: true });
      await service.recordFailure('login', '10.0.0.1', 'a@example.com');
    }
    const blocked = await service.check('login', '10.0.0.1', 'a@example.com');
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked).toMatchObject({ retryAfterSeconds: 900 });
    client.now += 901_000;
    expect(await service.check('login', '10.0.0.1', 'a@example.com')).toEqual({ allowed: true });
  });

  it('throttles per account independently of IP and clears on reset', async () => {
    const { service } = make();
    for (let i = 0; i < 5; i++) await service.recordFailure('login', `10.0.0.${i}`, 'victim@example.com');
    expect((await service.check('login', '10.0.0.99', 'victim@example.com')).allowed).toBe(false);
    expect((await service.check('login', '10.0.0.99', 'other@example.com')).allowed).toBe(true);
    await service.reset('login', 'victim@example.com');
    expect((await service.check('login', '10.0.0.99', 'victim@example.com')).allowed).toBe(true);
  });

  it('escalates the account window after repeated abuse', async () => {
    const { client, service } = make();
    for (let i = 0; i < 10; i++) await service.recordFailure('login', `10.1.0.${i}`, 'victim@example.com');
    const blocked = await service.check('login', '10.9.9.9', 'victim@example.com');
    expect(blocked).toMatchObject({ allowed: false, retryAfterSeconds: 3600 });
    client.now += 1_000;
  });

  it('never stores the email: the account key is a keyed hash', () => {
    const { service } = make();
    const key = service.accountKey('login', 'victim@example.com');
    expect(key).not.toContain('victim');
    expect(key).not.toContain('example');
    expect(service.accountKey('login', 'victim@example.com')).toBe(key);
    expect(service.accountKey('reset', 'victim@example.com')).not.toBe(key);
  });

  it('surfaces store failures as ThrottleUnavailableError (callers fail safe)', async () => {
    const { client, service } = make();
    client.failing = true;
    await expect(service.check('login', '10.0.0.1', 'a@example.com')).rejects.toBeInstanceOf(ThrottleUnavailableError);
    await expect(service.recordFailure('login', '10.0.0.1', 'a@example.com')).rejects.toBeInstanceOf(ThrottleUnavailableError);
  });
});
