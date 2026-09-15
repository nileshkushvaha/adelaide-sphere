import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import type { RequestContext } from './auth.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';
import { SecurityPolicyService } from './security-policy.service.js';
import { SessionService } from './session.service.js';

type Values = Record<string, boolean | number | string>;

/**
 * What a security setting change does to what already exists (SRS 1.2 SECS 006).
 *
 * Most settings need nothing here: shortening the idle window or the maximum
 * session length is applied by `SessionService.validate` on the next request,
 * and a password policy applies at the next password change by definition.
 * Lowering the concurrent session limit is different — sessions that are
 * already over the new limit would otherwise survive until they expired — so it
 * is applied immediately and recorded.
 */
@Injectable()
export class SecurityConsequenceService {
  private readonly logger = new Logger(SecurityConsequenceService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly sessions: SessionService,
    private readonly policy: SecurityPolicyService,
    private readonly audit: AuditService,
  ) {}

  async apply(before: Values, after: Values, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    // The change must be visible to enforcement immediately, not after the
    // policy cache expires.
    this.policy.invalidate();

    await this.pruneStoredPasswordHistory(before, after, actor, ctx);
    await this.endSurplusSessions(before, after, actor, ctx);
  }

  /**
   * Lowering the history depth — to zero especially — prunes what is already
   * stored. Keeping hashes the policy no longer asks for would mean the setting
   * did not mean what it said, and would leave data with no purpose.
   */
  private async pruneStoredPasswordHistory(before: Values, after: Values, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const previousDepth = typeof before.passwordHistoryDepth === 'number' ? before.passwordHistoryDepth : null;
    const newDepth = typeof after.passwordHistoryDepth === 'number' ? after.passwordHistoryDepth : null;
    if (newDepth === null || previousDepth === null || newDepth >= previousDepth) return;

    const db = await this.database.client();
    let removed = 0;
    if (newDepth === 0) {
      removed = (await db.adminPasswordHistory.deleteMany({})).count;
    } else {
      const admins = await db.adminUser.findMany({ select: { id: true } });
      for (const admin of admins) {
        const keep = await db.adminPasswordHistory.findMany({ where: { adminId: admin.id }, orderBy: { createdAt: 'desc' }, take: newDepth, select: { id: true } });
        removed += (await db.adminPasswordHistory.deleteMany({ where: { adminId: admin.id, id: { notIn: keep.map((row) => row.id) } } })).count;
      }
    }
    if (removed === 0) return;

    await this.audit.record({
      action: 'auth.password.history_pruned',
      actorAdminId: actor.id,
      targetType: 'security_settings',
      targetId: 'security',
      metadata: { previousDepth, newDepth, hashesRemoved: removed },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
  }

  /** Lowering the concurrent session limit applies to sessions that already exist. */
  private async endSurplusSessions(before: Values, after: Values, actor: AdminPrincipal, ctx: RequestContext): Promise<void> {
    const previousLimit = typeof before.maxConcurrentSessions === 'number' ? before.maxConcurrentSessions : null;
    const newLimit = typeof after.maxConcurrentSessions === 'number' ? after.maxConcurrentSessions : null;
    if (newLimit === null || previousLimit === null || newLimit >= previousLimit) return;

    const db = await this.database.client();
    const admins = await db.adminUser.findMany({ where: { status: 'active' }, select: { id: true } });
    let revoked = 0;
    for (const admin of admins) {
      revoked += await this.sessions.enforceConcurrencyLimit(admin.id, newLimit, 'session_limit_lowered');
    }
    if (revoked === 0) return;

    this.logger.log(`session limit lowered to ${newLimit}: ${revoked} session(s) ended`);
    await this.audit.record({
      action: 'auth.session.revoke_all',
      actorAdminId: actor.id,
      targetType: 'security_settings',
      targetId: 'security',
      metadata: { reason: 'session_limit_lowered', previousLimit, newLimit, sessionsEnded: revoked },
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
    });
  }
}
