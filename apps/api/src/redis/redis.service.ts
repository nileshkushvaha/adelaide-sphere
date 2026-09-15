import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { EnvironmentVariables } from '../config/env.validation.js';

export type RedisPingResult = { ok: true; latencyMs: number } | { ok: false; reason: 'error' | 'timeout' };

/**
 * Single ioredis client for the process (distributed limits; BullMQ later uses
 * its own connections). Lazy: nothing connects until the first command.
 * Commands never queue while disconnected, so callers see fast failures and
 * can fail safe (SRS SEC 003) instead of hanging.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      commandTimeout: 1_500,
      retryStrategy: (attempt) => Math.min(30_000, 500 * 2 ** Math.min(attempt, 6)),
      keyPrefix: 'ms:',
    });
    this.client.on('error', (error: Error & { code?: string }) => {
      // Codes only; never the URL (which carries the password).
      this.logger.warn(`redis error${error.code ? ` (${error.code})` : ''}`);
    });
  }

  async ping(timeoutMs = 1_500): Promise<RedisPingResult> {
    const started = Date.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      const outcome = await Promise.race([
        this.ensureConnected().then(() => this.client.ping()).then(() => 'ok' as const),
        new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), timeoutMs);
        }),
      ]);
      if (outcome === 'timeout') return { ok: false, reason: 'timeout' };
      return { ok: true, latencyMs: Date.now() - started };
    } catch {
      return { ok: false, reason: 'error' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Connects on first use; ioredis handles reconnection afterwards. */
  async ensureConnected(): Promise<void> {
    if (this.client.status === 'ready') return;
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect();
      return;
    }
    // connecting / reconnecting: wait briefly for ready
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (e: Error) => {
        cleanup();
        reject(e);
      };
      const cleanup = () => {
        this.client.off('ready', onReady);
        this.client.off('error', onError);
      };
      this.client.once('ready', onReady);
      this.client.once('error', onError);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit().catch(() => this.client.disconnect());
    }
  }
}
