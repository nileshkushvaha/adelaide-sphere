import { Injectable, Logger } from '@nestjs/common';
import { normaliseCacheTags } from '@adelaide-sphere/domain';
import type { Prisma } from '@adelaide-sphere/database';
import { RedisService } from '../redis/redis.service.js';
import { EVENT_TYPES, OutboxService } from '../outbox/outbox.service.js';

/** Namespace counter; bumping it retires every cached entry at once (SRS CACHE 003). */
const NAMESPACE_KEY = 'cache:public:ns';
/** Guard so one oversized payload cannot fill the cache (CACHE 003). */
const MAX_ENTRY_BYTES = 256 * 1024;

/**
 * Public read cache (SRS CACHE 001-003). Keys are namespaced by a publication
 * version, so a publication change retires every dependent entry immediately
 * rather than waiting for a TTL. Redis being unavailable is never fatal: reads
 * fall through to MySQL, which stays the authoritative source.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  /** Short-lived local copy of the namespace so each read is not two round trips. */
  private namespace: { value: string; expires: number } | null = null;
  /**
   * In-flight loads by key. Concurrent misses for the same key share one
   * computation instead of each hitting the database — the stampede protection
   * CACHE 003 asks for. Without it a cold cache under load exhausts the
   * connection pool.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly redis: RedisService,
    private readonly outbox: OutboxService,
  ) {}

  private async currentNamespace(): Promise<string> {
    if (this.namespace && this.namespace.expires > Date.now()) return this.namespace.value;
    try {
      await this.redis.ensureConnected();
      const value = (await this.redis.client.get(NAMESPACE_KEY)) ?? '1';
      this.namespace = { value, expires: Date.now() + 5_000 };
      return value;
    } catch {
      return 'nocache';
    }
  }

  /**
   * Reads through the cache. `key` must already contain every input that
   * changes the answer (filters, sort, page); the namespace adds publication
   * state (CACHE 003).
   */
  async getOrSet<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
    const namespace = await this.currentNamespace();
    if (namespace === 'nocache') return load();
    const fullKey = `cache:${namespace}:${key}`;
    try {
      const hit = await this.redis.client.get(fullKey);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      // A cache read failure must never fail the request.
    }
    const existing = this.inFlight.get(fullKey);
    if (existing) return existing as Promise<T>;

    const pending = (async () => {
      const value = await load();
      try {
        const serialised = JSON.stringify(value);
        if (Buffer.byteLength(serialised) <= MAX_ENTRY_BYTES) await this.redis.client.set(fullKey, serialised, 'EX', ttlSeconds);
      } catch {
        // Ignore write failures; the value is already computed and returned.
      }
      return value;
    })();
    this.inFlight.set(fullKey, pending);
    try {
      return await pending;
    } finally {
      this.inFlight.delete(fullKey);
    }
  }

  /**
   * Retires every cached public read. Called after a publication-affecting
   * change commits; a Redis failure is logged and the change still stands,
   * because the accompanying outbox event drives the retryable purge.
   */
  async bumpNamespace(): Promise<void> {
    this.namespace = null;
    try {
      await this.redis.ensureConnected();
      await this.redis.client.incr(NAMESPACE_KEY);
    } catch {
      this.logger.warn('cache namespace bump failed; entries expire by TTL instead');
    }
  }

  /**
   * Records a purge for the web tier inside the caller's transaction, so a
   * committed publication change always leaves an invalidation behind and the
   * worker can retry it until it succeeds (SRS CACHE 002).
   */
  async recordInvalidation(
    tx: Prisma.TransactionClient,
    input: { resourceType: string; resourceId: string; tags: string[]; urgent?: boolean; correlationId?: string | null },
  ): Promise<void> {
    const tags = normaliseCacheTags(input.tags);
    if (tags.length === 0) return;
    await this.outbox.write(tx, {
      type: EVENT_TYPES.cacheInvalidate,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      correlationId: input.correlationId ?? null,
      // Identifiers and tags only; never content (SRS EVT 001).
      payload: { tags: tags.join(','), urgent: input.urgent === true },
    });
  }
}
