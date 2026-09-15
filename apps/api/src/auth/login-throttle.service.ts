import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecurityPolicyService } from './security-policy.service.js';
import { RedisService } from '../redis/redis.service.js';
import type { EnvironmentVariables } from '../config/env.validation.js';

export type ThrottleScope = 'login' | 'reset';

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * SRS SEC 002 defaults: 5 failed attempts per 15 minutes per IP, plus account
 * throttling. These are the *ceilings*: the security settings may make login
 * stricter — fewer attempts, a longer block — and can never loosen them or turn
 * them off (SRS 1.2 SECS 004).
 */
const LIMITS: Record<ThrottleScope, { ip: { max: number; windowSec: number }; account: { max: number; windowSec: number; escalatedWindowSec: number } }> = {
  login: { ip: { max: 5, windowSec: 900 }, account: { max: 5, windowSec: 900, escalatedWindowSec: 3_600 } },
  reset: { ip: { max: 5, windowSec: 900 }, account: { max: 3, windowSec: 900, escalatedWindowSec: 3_600 } },
};

/** Thrown when the limiter store is unavailable; callers must fail safe (503), never bypass. */
export class ThrottleUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Rate limiter unavailable', cause === undefined ? undefined : { cause });
    this.name = 'ThrottleUnavailableError';
  }
}

/**
 * Distributed login/reset throttling in Redis. Counters are per trusted client
 * IP and per account (keyed HMAC of the normalised email, so Redis never holds
 * emails, SRS DAT 002). Account throttling is progressive: after twice the
 * limit the block window extends to an hour (SRS AUTH 001).
 */
@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);
  private readonly secret: string;

  constructor(
    private readonly redis: RedisService,
    private readonly policy: SecurityPolicyService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secret = config.get('APP_SECRET_KEY', { infer: true });
  }

  accountKey(scope: ThrottleScope, normalisedEmail: string): string {
    const digest = createHmac('sha256', this.secret).update(normalisedEmail).digest('base64url').slice(0, 32);
    return `throttle:${scope}:acct:${digest}`;
  }

  ipKey(scope: ThrottleScope, ip: string): string {
    return `throttle:${scope}:ip:${ip}`;
  }

  /**
   * The limits in force: the SEC 002 ceilings, narrowed by the security
   * settings where they are stricter. `Math.min` on attempts and `Math.max` on
   * windows is the whole rule — a setting can only make login harder.
   */
  private async limitsFor(scope: ThrottleScope): Promise<(typeof LIMITS)[ThrottleScope]> {
    const ceiling = LIMITS[scope];
    const { loginMaxFailedAttempts, loginBlockSeconds } = await this.policy.policy();
    return {
      ip: { max: Math.min(ceiling.ip.max, loginMaxFailedAttempts), windowSec: Math.max(ceiling.ip.windowSec, loginBlockSeconds) },
      account: {
        max: Math.min(ceiling.account.max, loginMaxFailedAttempts),
        windowSec: Math.max(ceiling.account.windowSec, loginBlockSeconds),
        escalatedWindowSec: Math.max(ceiling.account.escalatedWindowSec, loginBlockSeconds * 4),
      },
    };
  }

  /** Checks both counters without incrementing. */
  async check(scope: ThrottleScope, ip: string, normalisedEmail: string): Promise<ThrottleDecision> {
    const limits = await this.limitsFor(scope);
    try {
      await this.redis.ensureConnected();
      const [ipCount, ipTtl, acctCount, acctTtl] = await Promise.all([
        this.redis.client.get(this.ipKey(scope, ip)),
        this.redis.client.ttl(this.ipKey(scope, ip)),
        this.redis.client.get(this.accountKey(scope, normalisedEmail)),
        this.redis.client.ttl(this.accountKey(scope, normalisedEmail)),
      ]);
      const blockedFor = (count: string | null, max: number, ttl: number) =>
        count !== null && Number(count) >= max ? Math.max(1, ttl) : 0;
      const retry = Math.max(blockedFor(ipCount, limits.ip.max, ipTtl), blockedFor(acctCount, limits.account.max, acctTtl));
      return retry > 0 ? { allowed: false, retryAfterSeconds: retry } : { allowed: true };
    } catch (error) {
      this.logger.warn(`throttle check failed (${(error as { code?: string })?.code ?? 'error'})`);
      throw new ThrottleUnavailableError(error);
    }
  }

  /** Records a failure against both counters. */
  async recordFailure(scope: ThrottleScope, ip: string, normalisedEmail: string): Promise<void> {
    const limits = await this.limitsFor(scope);
    try {
      await this.redis.ensureConnected();
      const ipKey = this.ipKey(scope, ip);
      const acctKey = this.accountKey(scope, normalisedEmail);
      const [ipCount, acctCount] = await Promise.all([this.redis.client.incr(ipKey), this.redis.client.incr(acctKey)]);
      const ops = this.redis.client.multi();
      if (ipCount === 1) ops.expire(ipKey, limits.ip.windowSec);
      if (acctCount === 1) ops.expire(acctKey, limits.account.windowSec);
      // Progressive account throttling: repeated abuse extends the block.
      if (acctCount === limits.account.max * 2) ops.expire(acctKey, limits.account.escalatedWindowSec);
      await ops.exec();
    } catch (error) {
      this.logger.warn(`throttle record failed (${(error as { code?: string })?.code ?? 'error'})`);
      throw new ThrottleUnavailableError(error);
    }
  }

  /** Clears the account counter after a successful authentication. */
  async reset(scope: ThrottleScope, normalisedEmail: string): Promise<void> {
    try {
      await this.redis.client.del(this.accountKey(scope, normalisedEmail));
    } catch {
      // A stale counter expires on its own; do not fail a successful login for this.
    }
  }
}
