import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { SettingsStoreService } from '../settings/settings-store.service.js';
import { settingGroup } from '../settings/registry.js';

export interface SecurityPolicy {
  sessionIdleMs: number;
  sessionAbsoluteMs: number;
  maxConcurrentSessions: number;
  passwordResetMs: number;
  passwordMinLength: number;
  passwordHistoryDepth: number;
  loginMaxFailedAttempts: number;
  loginBlockSeconds: number;
}

/**
 * How long a resolved policy is reused before it is read again. Session
 * validation runs on every admin request, so reading the row each time would
 * put a query in front of every one of them. Fifteen seconds is the worst-case
 * delay before a change takes effect — short enough to call the settings
 * "runtime" honestly, long enough that the read is not a cost.
 */
const CACHE_MS = 15_000;

/**
 * The security settings, resolved once and enforced everywhere (SRS 1.2
 * SECS 001–005).
 *
 * Every value here has an enforcement point named in the registry, and every
 * bound is at least as strict as the specification it narrows: AUTH 001/002 for
 * sessions and reset links, SEC 002 for login throttling. A stored value outside
 * its declared bounds — a row written before a bound changed, say — is clamped
 * rather than trusted, so the *worst* this service can ever return is the
 * baseline the SRS already requires.
 */
@Injectable()
export class SecurityPolicyService {
  private readonly logger = new Logger(SecurityPolicyService.name);
  private cached: { value: SecurityPolicy; expires: number } | null = null;
  private readonly envIdleMinutes: number;
  private readonly envAbsoluteHours: number;

  constructor(
    private readonly store: SettingsStoreService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    // The environment still sets the outer bound: a setting may narrow what the
    // deployment allows, never widen it.
    this.envIdleMinutes = config.get('SESSION_IDLE_MINUTES', { infer: true });
    this.envAbsoluteHours = config.get('SESSION_ABSOLUTE_HOURS', { infer: true });
  }

  /** Drops the cache so the next read sees a change immediately (SECS 006). */
  invalidate(): void {
    this.cached = null;
  }

  async policy(): Promise<SecurityPolicy> {
    const now = Date.now();
    if (this.cached && this.cached.expires > now) return this.cached.value;

    let stored: Record<string, unknown> = {};
    try {
      const document = await this.store.readDocument<Record<string, unknown>>('security', settingGroup('security').storeKey);
      if (document.data && typeof document.data === 'object') stored = document.data as Record<string, unknown>;
    } catch (error) {
      // The database being unreachable must not weaken security: fall through
      // to the defaults, which are the SRS baseline.
      this.logger.warn(`security settings unavailable (${(error as Error).name}); applying the specified defaults`);
    }

    const value: SecurityPolicy = {
      sessionIdleMs: this.minutes(stored.sessionIdleMinutes, 'sessionIdleMinutes', this.envIdleMinutes) * 60_000,
      sessionAbsoluteMs: this.hours(stored.sessionAbsoluteHours, 'sessionAbsoluteHours', this.envAbsoluteHours) * 3_600_000,
      maxConcurrentSessions: this.integer(stored.maxConcurrentSessions, 'maxConcurrentSessions'),
      passwordResetMs: this.integer(stored.passwordResetMinutes, 'passwordResetMinutes') * 60_000,
      passwordMinLength: this.integer(stored.passwordMinLength, 'passwordMinLength'),
      passwordHistoryDepth: this.integer(stored.passwordHistoryDepth, 'passwordHistoryDepth'),
      loginMaxFailedAttempts: this.integer(stored.loginMaxFailedAttempts, 'loginMaxFailedAttempts'),
      loginBlockSeconds: this.integer(stored.loginBlockMinutes, 'loginBlockMinutes') * 60,
    };
    this.cached = { value, expires: now + CACHE_MS };
    return value;
  }

  /** A declared integer, clamped to its declared bounds; the default when absent or unusable. */
  private integer(raw: unknown, key: string): number {
    const declaration = settingGroup('security').settings.find((setting) => setting.key === key);
    if (!declaration) throw new Error(`security setting ${key} is not declared`);
    const fallback = declaration.default as number;
    if (typeof raw !== 'number' || !Number.isInteger(raw)) return fallback;
    const min = declaration.bounds.min ?? Number.NEGATIVE_INFINITY;
    const max = declaration.bounds.max ?? Number.POSITIVE_INFINITY;
    return Math.min(Math.max(raw, min), max);
  }

  /** Session timeouts additionally never exceed what the deployment configured. */
  private minutes(raw: unknown, key: string, envMinutes: number): number {
    return Math.min(this.integer(raw, key), envMinutes);
  }

  private hours(raw: unknown, key: string, envHours: number): number {
    return Math.min(this.integer(raw, key), envHours);
  }
}
