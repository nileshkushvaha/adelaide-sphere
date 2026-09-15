import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { CacheService } from './cache.service.js';
import { CACHE_NAMESPACES, CACHE_TAG_TARGETS, cacheNamespace, cacheTagTarget, reachesProtectedKeys } from './cache-registry.js';

/** Bounded scan so counting or clearing a namespace can never become an unbounded loop. */
const SCAN_BATCH = 500;
const SCAN_MAX_KEYS = 20_000;

export interface CacheStatus {
  redis: { available: boolean; detail: string };
  namespaces: { key: string; label: string; description: string; ttlSeconds: number; entries: number | null; approximate: boolean; lastClearedAt: string | null }[];
  tags: { key: string; label: string; description: string; lastClearedAt: string | null }[];
}

/**
 * The operational view of the caches, and the only way to clear them
 * (SRS 1.2 CMGR 001–005).
 *
 * Every operation names a registered namespace or tag. There is no path from an
 * administrator's input to a Redis key or pattern, no whole-store flush and no
 * command execution, which is what keeps sessions, throttle counters, the
 * authorization cache and the queue out of reach by construction rather than by
 * care.
 */
@Injectable()
export class CacheAdminService {
  private readonly logger = new Logger(CacheAdminService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly database: DatabaseService,
  ) {}

  /** Where the last clearing of each entry is remembered, so the screen can show it. */
  private lastClearedKey(kind: 'namespace' | 'tag', key: string): string {
    return `cache:last-cleared:${kind}:${key}`;
  }

  async status(): Promise<CacheStatus> {
    let available = true;
    let detail = 'Connected';
    try {
      await this.redis.ensureConnected();
      await this.redis.client.ping();
    } catch (error) {
      available = false;
      detail = `Unavailable (${(error as { code?: string })?.code ?? 'error'}). Pages are served from the database instead.`;
    }

    const namespaces = await Promise.all(
      CACHE_NAMESPACES.map(async (namespace) => ({
        key: namespace.key,
        label: namespace.label,
        description: namespace.description,
        ttlSeconds: namespace.ttlSeconds,
        // Approximate on purpose: SCAN is a sample of a moving target, and the
        // count is capped, so this is never presented as exact (CMGR 001).
        entries: available ? await this.countEntries(namespace.prefix) : null,
        approximate: true,
        lastClearedAt: available ? await this.lastCleared('namespace', namespace.key) : null,
      })),
    );

    const tags = await Promise.all(
      CACHE_TAG_TARGETS.map(async (target) => ({
        key: target.key,
        label: target.label,
        description: target.description,
        lastClearedAt: available ? await this.lastCleared('tag', target.key) : null,
      })),
    );

    return { redis: { available, detail }, namespaces, tags };
  }

  /** Clears one registered namespace held by this API. */
  async clearNamespace(key: string, actor: AdminPrincipal, ctx: RequestContext): Promise<{ cleared: number }> {
    const namespace = cacheNamespace(key);
    if (!namespace) throw new HttpException({ code: 'UNKNOWN_CACHE', message: 'No such cache' }, HttpStatus.NOT_FOUND);
    // Belt and braces: the registry is checked at declaration time too, so this
    // can only fire if somebody adds an unsafe prefix and ignores the test.
    if (reachesProtectedKeys(namespace.prefix)) {
      this.logger.error(`refusing to clear ${key}: prefix ${namespace.prefix} reaches protected keys`);
      throw new HttpException({ code: 'FORBIDDEN_CACHE', message: 'That cache cannot be cleared from here.' }, HttpStatus.CONFLICT);
    }

    let cleared = 0;
    try {
      await this.redis.ensureConnected();
      cleared = await this.deleteByPrefix(namespace.prefix);
      await this.redis.client.set(this.lastClearedKey('namespace', key), new Date().toISOString());
    } catch (error) {
      // Failing safely and visibly: an operator must not be told a cache was
      // cleared when Redis was unreachable (CMGR 003).
      this.logger.warn(`cache clear failed for ${key} (${(error as { code?: string })?.code ?? 'error'})`);
      throw new HttpException(
        { code: 'CACHE_UNAVAILABLE', message: 'The cache is unavailable, so nothing was cleared. Try again once Redis is reachable.' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    await this.audit.record({
      action: 'system.cache.clear',
      actorAdminId: actor.id,
      targetType: 'cache_namespace',
      targetId: key,
      metadata: { entriesCleared: cleared },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
    return { cleared };
  }

  /**
   * Clears one registered web-tier tag through the ordinary invalidation
   * pipeline, so the same worker purges the same pages as a publication would
   * — across every replica and the content delivery layer (CMGR 005).
   */
  async clearTag(key: string, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const target = cacheTagTarget(key);
    if (!target) throw new HttpException({ code: 'UNKNOWN_CACHE', message: 'No such cache' }, HttpStatus.NOT_FOUND);

    const db = await this.database.client();
    await db.$transaction(async (tx) => {
      await this.cache.recordInvalidation(tx, { resourceType: 'cache_tag', resourceId: key, correlationId: ctx.requestId, tags: [target.tag] });
    });
    await this.cache.bumpNamespace();
    try {
      await this.redis.client.set(this.lastClearedKey('tag', key), new Date().toISOString());
    } catch {
      // Only the "last cleared" note is lost; the invalidation itself is durable
      // because it went through the outbox.
    }

    await this.audit.record({
      action: 'system.cache.clear',
      actorAdminId: actor.id,
      targetType: 'cache_tag',
      targetId: key,
      metadata: { tag: target.tag },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
  }

  // ---- Redis helpers, bounded and prefix-scoped ------------------------------

  /**
   * Keys for one registered prefix, inside the current publication namespace.
   *
   * ioredis applies its `keyPrefix` to ordinary commands but **not** to SCAN:
   * the pattern has to carry the prefix, and the keys that come back carry it
   * too, so they are stripped before DEL — which would otherwise apply the
   * prefix a second time and delete nothing. Getting this wrong is silent
   * (everything "succeeds", nothing is cleared), which is why the integration
   * test asserts on the entries actually removed.
   */
  private async keysFor(prefix: string, limit: number): Promise<string[]> {
    const keyPrefix = (this.redis.client.options.keyPrefix as string | undefined) ?? '';
    const pattern = `${keyPrefix}cache:*:${prefix}*`;
    const found: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.client.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_BATCH);
      cursor = next;
      // Back to the unprefixed form the client expects.
      found.push(...batch.map((key) => (keyPrefix && key.startsWith(keyPrefix) ? key.slice(keyPrefix.length) : key)));
      if (found.length >= limit) break;
    } while (cursor !== '0');
    return found.slice(0, limit);
  }

  private async countEntries(prefix: string): Promise<number | null> {
    try {
      return (await this.keysFor(prefix, SCAN_MAX_KEYS)).length;
    } catch {
      return null;
    }
  }

  private async deleteByPrefix(prefix: string): Promise<number> {
    const keys = await this.keysFor(prefix, SCAN_MAX_KEYS);
    if (keys.length === 0) return 0;
    let deleted = 0;
    for (let index = 0; index < keys.length; index += SCAN_BATCH) {
      deleted += await this.redis.client.del(...keys.slice(index, index + SCAN_BATCH));
    }
    return deleted;
  }

  private async lastCleared(kind: 'namespace' | 'tag', key: string): Promise<string | null> {
    try {
      return await this.redis.client.get(this.lastClearedKey(kind, key));
    } catch {
      return null;
    }
  }
}
