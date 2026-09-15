import { describe, expect, it, vi } from 'vitest';
import { CacheService } from './cache.service.js';

/** A Redis stand-in: only the commands the cache uses. */
function fakeRedis(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    ensureConnected: vi.fn(async () => undefined),
    client: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      incr: vi.fn(async (key: string) => {
        const next = Number(store.get(key) ?? '1') + 1;
        store.set(key, String(next));
        return next;
      }),
    },
    store,
  };
}

const outbox = { write: vi.fn(async () => 'event-id') };

describe('CacheService', () => {
  it('serves a second read from the cache', async () => {
    const redis = fakeRedis({ 'cache:public:ns': '1' });
    const cache = new CacheService(redis as never, outbox as never);
    const load = vi.fn(async () => ({ value: 42 }));
    expect(await cache.getOrSet('key', 30, load)).toEqual({ value: 42 });
    expect(await cache.getOrSet('key', 30, load)).toEqual({ value: 42 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent misses into one load (SRS CACHE 003 stampede protection)', async () => {
    const redis = fakeRedis({ 'cache:public:ns': '1' });
    const cache = new CacheService(redis as never, outbox as never);
    // One deferred the loader resolves, so all three callers are in flight at once.
    let resolve!: (value: { value: number }) => void;
    const deferred = new Promise<{ value: number }>((r) => (resolve = r));
    const load = vi.fn(() => deferred);
    const all = Promise.all([cache.getOrSet('k', 30, load), cache.getOrSet('k', 30, load), cache.getOrSet('k', 30, load)]);
    // Let the namespace lookup settle so every caller has reached the loader.
    await new Promise((r) => setTimeout(r, 0));
    resolve({ value: 7 });
    expect(await all).toEqual([{ value: 7 }, { value: 7 }, { value: 7 }]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('bumping the namespace retires every existing entry', async () => {
    const redis = fakeRedis({ 'cache:public:ns': '1' });
    const cache = new CacheService(redis as never, outbox as never);
    await cache.getOrSet('key', 30, async () => 'first');
    await cache.bumpNamespace();
    const second = await cache.getOrSet('key', 30, async () => 'second');
    expect(second).toBe('second');
  });

  it('falls through to the loader when Redis is unavailable', async () => {
    const redis = fakeRedis();
    redis.ensureConnected.mockRejectedValue(new Error('down'));
    const cache = new CacheService(redis as never, outbox as never);
    const load = vi.fn(async () => 'live');
    expect(await cache.getOrSet('key', 30, load)).toBe('live');
    expect(await cache.getOrSet('key', 30, load)).toBe('live');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('records an invalidation with normalised tags, and nothing when there are none', async () => {
    const redis = fakeRedis({ 'cache:public:ns': '1' });
    const cache = new CacheService(redis as never, outbox as never);
    const tx = {} as never;
    await cache.recordInvalidation(tx, { resourceType: 'business', resourceId: 'b1', tags: ['businesses', 'businesses', ' business:a '] });
    expect(outbox.write).toHaveBeenCalledWith(tx, expect.objectContaining({ type: 'cache.invalidate', payload: { tags: 'businesses,business:a', urgent: false } }));
    outbox.write.mockClear();
    await cache.recordInvalidation(tx, { resourceType: 'business', resourceId: 'b1', tags: [] });
    expect(outbox.write).not.toHaveBeenCalled();
  });
});
