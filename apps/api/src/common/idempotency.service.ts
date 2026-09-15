import { createHash, createHmac } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@adelaide-sphere/database';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { DatabaseService } from '../database/database.service.js';

export const IDEMPOTENCY_TTL_HOURS = 24;
export const IDEMPOTENCY_HEADER = 'idempotency-key';

export interface StoredResponse {
  status: number;
  body: Record<string, unknown>;
}

/** Same key, different payload: a client bug, not a replay (SRS API 003). */
export class IdempotencyConflictError extends ConflictException {
  constructor() {
    super({ code: 'IDEMPOTENCY_KEY_REUSED', message: 'This idempotency key was already used with a different request body' });
  }
}

/**
 * Scoped idempotency for public form POSTs (SRS API 003): the key is stored as
 * a keyed hash with a payload fingerprint and the original receipt, for 24
 * hours. A replay returns the first outcome without creating rows or sending
 * mail again.
 */
@Injectable()
export class IdempotencyService {
  private readonly secret: string;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.secret = config.get('APP_SECRET_KEY', { infer: true });
  }

  keyHash(key: string): string {
    return createHmac('sha256', this.secret).update(key).digest('hex');
  }

  /**
   * What makes two submissions "the same". The Turnstile token is single-use and
   * the honeypot is not content, so a retry after a lost response (which needs
   * a fresh token) is recognised as the same submission instead of a conflict.
   */
  fingerprint(payload: unknown): string {
    const content = payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.fromEntries(Object.entries(payload as Record<string, unknown>).filter(([key]) => key !== 'captchaToken' && key !== 'website')) : payload;
    return createHash('sha256').update(JSON.stringify(content ?? null)).digest('hex');
  }

  /** Returns the stored receipt for a replay, or null when this is a new request. */
  async lookup(scope: string, key: string, payload: unknown): Promise<StoredResponse | null> {
    const db = await this.database.client();
    const record = await db.idempotencyRecord.findUnique({ where: { scope_keyHash: { scope, keyHash: this.keyHash(key) } } });
    if (!record) return null;
    if (record.expiresAt.getTime() <= Date.now()) {
      await db.idempotencyRecord.delete({ where: { scope_keyHash: { scope, keyHash: this.keyHash(key) } } }).catch(() => undefined);
      return null;
    }
    if (record.payloadFingerprint !== this.fingerprint(payload)) throw new IdempotencyConflictError();
    return { status: record.responseStatus, body: record.responseBody as Record<string, unknown> };
  }

  async remember(scope: string, key: string, payload: unknown, response: StoredResponse): Promise<void> {
    const db = await this.database.client();
    const keyHash = this.keyHash(key);
    const data = {
      scope,
      keyHash,
      payloadFingerprint: this.fingerprint(payload),
      responseStatus: response.status,
      responseBody: response.body as Prisma.InputJsonObject,
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 3_600_000),
    };
    await db.idempotencyRecord.upsert({ where: { scope_keyHash: { scope, keyHash } }, create: data, update: data });
  }
}
