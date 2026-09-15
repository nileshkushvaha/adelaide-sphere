import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Ceilings for privileged mutations, per administrator (SRS SEC 003, RBAC 008).
 *
 * The numbers are set from how the interface actually behaves: saving a role is
 * two requests (details, then permissions), so 20 a minute is ten roles a minute
 * — far above deliberate editing and far below scripted abuse. The hourly window
 * bounds a slow, patient attacker with a stolen privileged session.
 */
export const SENSITIVE_LIMITS = {
  burst: { max: 20, windowSeconds: 60 },
  sustained: { max: 200, windowSeconds: 3_600 },
  /**
   * Applied per process when Redis cannot be reached. Deliberately tighter,
   * because it is per replica rather than shared: with N replicas the effective
   * ceiling is N × this. It keeps a bound in place during an outage without
   * locking an operator out of the very screens they need to restore access.
   */
  fallback: { max: 5, windowSeconds: 60 },
} as const;

/**
 * Fixed-window ceiling for authorization and administrator-account mutations.
 *
 * Keyed by the **authenticated administrator id**, which no client can spoof,
 * with the trusted client address recorded only in the log line. The address is
 * never the key: it comes from `X-Forwarded-For` and is only meaningful for the
 * documented number of proxy hops (`TRUST_PROXY`), so basing a security control
 * on it would let a misconfiguration remove the control.
 */
@Injectable()
export class SensitiveThrottleService {
  private readonly logger = new Logger(SensitiveThrottleService.name);
  /** Per-process counters used only while Redis is unavailable. */
  private readonly fallbackCounters = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly redis: RedisService) {}

  async consume(adminId: string, ip: string | undefined): Promise<ThrottleDecision> {
    try {
      await this.redis.ensureConnected();
      for (const [name, limit] of [
        ['burst', SENSITIVE_LIMITS.burst],
        ['sustained', SENSITIVE_LIMITS.sustained],
      ] as const) {
        const key = `throttle:authz:${name}:${adminId}`;
        const count = await this.redis.client.incr(key);
        if (count === 1) await this.redis.client.expire(key, limit.windowSeconds);
        if (count > limit.max) {
          const ttl = await this.redis.client.ttl(key);
          this.logger.warn(`sensitive mutation ceiling reached (${name}) for administrator ${adminId} from ${ip ?? 'unknown'}`);
          return { allowed: false, retryAfterSeconds: Math.max(1, ttl) };
        }
      }
      return { allowed: true };
    } catch (error) {
      this.logger.warn(`sensitive throttle store unavailable (${(error as { code?: string })?.code ?? 'error'}); applying the per-process fallback`);
      return this.consumeFallback(adminId);
    }
  }

  private consumeFallback(adminId: string): ThrottleDecision {
    const now = Date.now();
    const window = SENSITIVE_LIMITS.fallback.windowSeconds * 1_000;
    const existing = this.fallbackCounters.get(adminId);
    if (!existing || existing.resetAt <= now) {
      this.fallbackCounters.set(adminId, { count: 1, resetAt: now + window });
      this.prune(now);
      return { allowed: true };
    }
    existing.count += 1;
    if (existing.count > SENSITIVE_LIMITS.fallback.max) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)) };
    }
    return { allowed: true };
  }

  /** Keeps the fallback map from growing without bound during a long outage. */
  private prune(now: number): void {
    if (this.fallbackCounters.size < 1_000) return;
    for (const [key, value] of this.fallbackCounters) if (value.resetAt <= now) this.fallbackCounters.delete(key);
  }
}
