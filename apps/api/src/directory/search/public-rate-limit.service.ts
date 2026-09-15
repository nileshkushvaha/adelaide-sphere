import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service.js';

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Thrown when the limiter store is unavailable; public callers answer 503 rather than skipping the ceiling (SRS API 004). */
export class RateLimiterUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Rate limiter unavailable', cause === undefined ? undefined : { cause });
    this.name = 'RateLimiterUnavailableError';
  }
}

/**
 * Conservative fixed-window ceiling for public GET endpoints (SRS API 004),
 * keyed by trusted client IP. Separate from the login throttle: this one never
 * touches account identifiers.
 */
@Injectable()
export class PublicRateLimitService {
  private readonly logger = new Logger(PublicRateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  async consume(scope: string, ip: string, max: number, windowSeconds: number): Promise<RateDecision> {
    const key = `public:${scope}:${ip}`;
    try {
      await this.redis.ensureConnected();
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, windowSeconds);
      if (count <= max) return { allowed: true };
      const ttl = await this.redis.client.ttl(key);
      return { allowed: false, retryAfterSeconds: Math.max(1, ttl) };
    } catch (error) {
      this.logger.warn(`public rate limit unavailable (${(error as { code?: string })?.code ?? 'error'})`);
      throw new RateLimiterUnavailableError(error);
    }
  }
}
