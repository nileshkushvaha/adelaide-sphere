import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_NAMESPACES, CACHE_TAG_TARGETS, PROTECTED_PREFIXES, cacheNamespace, cacheTagTarget, reachesProtectedKeys } from './cache-registry.js';

describe('cache registry (SRS 1.2 CMGR 001–004)', () => {
  it('declares a label, a description and a bounded prefix for every namespace', () => {
    for (const namespace of CACHE_NAMESPACES) {
      expect(namespace.label.length, namespace.key).toBeGreaterThan(3);
      expect(namespace.description.length, namespace.key).toBeGreaterThan(10);
      expect(namespace.prefix, namespace.key).toMatch(/^[a-z][a-z0-9_-]*:$/);
      expect(namespace.ttlSeconds, namespace.key).toBeGreaterThan(0);
    }
    for (const target of CACHE_TAG_TARGETS) {
      expect(target.tag.length, target.key).toBeGreaterThan(2);
      expect(target.description.length, target.key).toBeGreaterThan(10);
    }
  });

  it('never reaches session, throttle, authorization, queue or idempotency keys (CMGR 004)', () => {
    for (const namespace of CACHE_NAMESPACES) {
      expect(reachesProtectedKeys(namespace.prefix), namespace.key).toBe(false);
    }
    // The guard itself works in both directions: a prefix inside a protected
    // space, and a prefix so broad it would swallow one.
    expect(reachesProtectedKeys('session:')).toBe(true);
    expect(reachesProtectedKeys('throttle:login:')).toBe(true);
    expect(reachesProtectedKeys('bull:')).toBe(true);
    expect(reachesProtectedKeys('s')).toBe(true); // would match session:
    expect(reachesProtectedKeys('search:')).toBe(false);
  });

  it('lists every key space that must stay out of reach', () => {
    expect([...PROTECTED_PREFIXES]).toEqual(['session:', 'throttle:', 'authz:', 'bull:', 'idempotency:']);
  });

  it('resolves only registered entries', () => {
    expect(cacheNamespace('search')?.prefix).toBe('search:');
    expect(cacheNamespace('everything')).toBeNull();
    expect(cacheNamespace('*')).toBeNull();
    expect(cacheTagTarget('alerts')?.tag).toBe('alerts');
    expect(cacheTagTarget('anything')).toBeNull();
  });

  it('the cache module contains no whole-store flush or arbitrary command (CMGR 004)', () => {
    // Read as text: the point is that these calls do not exist anywhere in the
    // module, not that some code path avoids them.
    const sources = ['cache.service.ts', 'cache-admin.service.ts', 'cache-admin.controller.ts', 'cache-registry.ts']
      .map((file) => readFileSync(join(import.meta.dirname, file), 'utf8'))
      .join('\n');
    for (const forbidden of ['flushall', 'flushdb', 'sendCommand', 'client.call(', 'eval(']) {
      expect(sources.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase());
    }
  });
});
