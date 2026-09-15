import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ACTIVITY_RETENTION_DAYS } from './activity-catalogue.js';

export interface AuditEntry {
  action: string;
  actorAdminId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  reason?: string | null;
  /** Non-sensitive keys only. Values are stringified and capped. */
  metadata?: Record<string, string | number | boolean | null> | null;
  requestId?: string | null;
  ipAddress?: string | null;
  /** Recorded for authorization events only, within PRIV 001 limits. */
  userAgent?: string | null;
}

/**
 * The subset of the Prisma client an audit write needs, so a transaction client
 * fits without importing the generated argument types here.
 */
export type AuditWriteClient = { auditLog: { create: (args: never) => unknown } };

const FORBIDDEN_METADATA_KEYS = /password|token|secret|cookie|authorization|hash/i;

/**
 * Append-only audit log (SRS section 14, MON 001). Writes never throw into the
 * caller: a failed audit write is logged and the business operation proceeds
 * (losing an audit row is preferable to failing a login), except where a
 * caller explicitly awaits `recordOrThrow` inside a transaction.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly database: DatabaseService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.recordOrThrow(entry);
    } catch (error) {
      this.logger.error(`audit write failed for ${entry.action}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async recordOrThrow(entry: AuditEntry): Promise<void> {
    const db = await this.database.client();
    await this.recordWith(db, entry);
  }

  /**
   * Applies the activity retention policy (SRS 1.2 ACT 006, PRIV 001): events
   * older than 365 days are removed. It reports how many rows went, never what
   * was in them, and is idempotent, so the scheduled task that calls it can be
   * re-run safely.
   */
  async purgeExpired(now: Date = new Date()): Promise<{ removed: number; olderThan: string }> {
    const cutoff = new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const db = await this.database.client();
    const { count } = await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    if (count > 0) this.logger.log(`activity retention: removed ${count} events older than ${cutoff.toISOString()}`);
    return { removed: count, olderThan: cutoff.toISOString() };
  }

  /**
   * Writes through a caller-supplied client — a transaction client, so an access
   * change and the record of it commit together or not at all (SRS RBAC 012).
   * It throws on failure by design: an access change that cannot be recorded is
   * rolled back rather than applied silently.
   */
  async recordWith(client: AuditWriteClient, entry: AuditEntry): Promise<void> {
    const create = client.auditLog.create as (args: { data: Record<string, unknown> }) => Promise<unknown>;
    await create({
      data: {
        action: entry.action.slice(0, 64),
        actorAdminId: entry.actorAdminId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        reason: entry.reason ? entry.reason.slice(0, 500) : null,
        metadata: entry.metadata ? sanitiseMetadata(entry.metadata) : undefined,
        requestId: entry.requestId ?? null,
        ipAddress: entry.ipAddress ? entry.ipAddress.slice(0, 45) : null,
        userAgent: entry.userAgent ? entry.userAgent.slice(0, 255) : null,
      },
    });
  }
}

export function sanitiseMetadata(metadata: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.test(key)) continue;
    if (value === null || typeof value === 'boolean' || typeof value === 'number') out[key] = value;
    else if (typeof value === 'string') out[key] = value.slice(0, 200);
  }
  return out;
}
