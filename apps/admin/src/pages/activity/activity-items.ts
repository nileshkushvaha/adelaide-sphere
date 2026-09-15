import type { AuditEntry } from '@/api/admins';
import type { ActivityItem } from '@/shared/activity';

/** An activity log entry in the shape the timeline draws. */
export function fromAuditEntry(entry: AuditEntry): ActivityItem {
  return {
    id: entry.id,
    action: entry.action,
    category: entry.category ?? null,
    domainLabel: entry.domainLabel ?? null,
    outcome: entry.outcome ?? null,
    actorName: entry.actor?.displayName ?? null,
    actorEmail: entry.actor?.email ?? null,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel ?? null,
    metadata: entry.metadata,
    reason: entry.reason,
    requestId: entry.requestId,
    ipAddress: entry.ipAddress,
    createdAt: entry.createdAt,
    count: entry.count ?? 1,
    firstAt: entry.firstAt,
    lastAt: entry.lastAt,
    groupKey: entry.groupKey ?? null,
  };
}
