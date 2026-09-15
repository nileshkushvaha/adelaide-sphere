import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@adelaide-sphere/database';
import type { AuditService, AuditWriteClient } from '../audit/audit.service.js';
import type { RequestContext } from '../auth/auth.service.js';
import type { AdminPrincipal } from '../identity/identity.service.js';

/**
 * The obligations every website content module shares (SRS 1.2 section 26):
 * optimistic concurrency, a transactional activity record, and cache
 * invalidation when what the public sees changes.
 *
 * Deliberately three small functions rather than a generic base service: the
 * four modules differ in their fields and their rules, and a generic wrapper
 * over the Prisma delegates would cost more in type gymnastics than it saves.
 * What they genuinely share is exactly this.
 */

/** Refuses a concurrent edit with 409 rather than silently merging (API 005). */
export function assertVersion(current: number, expected: number): void {
  if (current !== expected) {
    throw new ConflictException({ code: 'STALE_VERSION', message: 'This was changed by someone else. Reload and try again.' });
  }
}

export interface ContentAuditInput {
  action: string;
  targetType: string;
  targetId: string;
  actor: AdminPrincipal;
  ctx: RequestContext;
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Writes the activity event for a content mutation through the caller's
 * transaction client, so a change that cannot be recorded is rolled back rather
 * than applied silently.
 */
export async function recordContentActivity(tx: Prisma.TransactionClient, audit: AuditService, input: ContentAuditInput): Promise<void> {
  await audit.recordWith(tx as unknown as AuditWriteClient, {
    action: input.action,
    actorAdminId: input.actor.id,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata,
    requestId: input.ctx.requestId,
    ipAddress: input.ctx.ip,
    userAgent: input.ctx.userAgent,
  });
}

/**
 * Which mutations change what the public sees. A draft edit changes nothing
 * public, so it purges nothing; publishing, unpublishing, reordering and
 * deleting always do, and so does editing something already published.
 */
export function publicVisibilityChanged(before: { status: string } | null, after: { status: string } | null): boolean {
  return before?.status === 'published' || after?.status === 'published';
}
