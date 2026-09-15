import { useState } from 'react';
import { Button, Skeleton } from 'antd';
import { auditApi, type AuditEntry } from '@/api/admins';
import { ErrorState } from '@/components/ui';
import { metadataLabel, metadataText, type ActivityItem } from '@/shared/activity';
import { useAsync } from '@/shared/useAsync';
import { fromAuditEntry } from './activity-items';
import { ActivityMemberRow } from './ActivityMemberRow';

const PAGE_SIZE = 20;

/** Metadata every loaded event in the group recorded identically, as text. */
function sharedMetadata(rows: AuditEntry[]): Record<string, string> {
  if (rows.length === 0) return {};
  const [first, ...rest] = rows;
  const shared: Record<string, string> = {};
  for (const [key, value] of Object.entries(first!.metadata ?? {})) {
    const text = metadataText(value);
    if (rest.every((row) => row.metadata && key in row.metadata && metadataText(row.metadata[key]) === text)) shared[key] = text;
  }
  return shared;
}

/**
 * The events inside one group. What the group has in common — the recorded
 * code, who did it, the metadata every event shares — is said once at the top;
 * each member is then one line: when, and which record. A member opens only
 * when it holds something of its own (a request id, a differing value).
 *
 * The first page is read here, so the shared facts are known; further pages
 * append twenty at a time and are compared against the same facts.
 */
export function ActivityGroupMembers({ group, onShowRequest }: { group: ActivityItem; onShowRequest?: (requestId: string) => void }) {
  const groupKey = group.groupKey ?? '';
  const [first, reload] = useAsync((signal) => auditApi.list({ groupKey, page: 1, pageSize: PAGE_SIZE }, signal), [groupKey]);
  const [extraPages, setExtraPages] = useState(0);

  if (first.status === 'loading') return <Skeleton active title={false} paragraph={{ rows: 3 }} />;
  if (first.status === 'error') return <ErrorState message={first.message} reference={first.reference} onRetry={reload} />;

  const { data, meta } = first.data;
  const shared = sharedMetadata(data);
  const loaded = Math.min(meta.total, PAGE_SIZE * (1 + extraPages));

  return (
    <div className="ms-activity-group">
      <dl className="ms-activity-group__summary" aria-label="What every event in this group has in common">
        <div>
          <dt>Events</dt>
          <dd>{meta.total}</dd>
        </div>
        <div>
          <dt>Recorded as</dt>
          <dd>
            <code className="ms-activity-code">{group.action}</code>
          </dd>
        </div>
        <div>
          <dt>Who</dt>
          <dd>{group.actorName ?? 'The system itself'}</dd>
        </div>
        {Object.entries(shared).map(([key, value]) => (
          <div key={key}>
            <dt>{metadataLabel(key)}</dt>
            <dd>{/^([a-z0-9_]+\.)+[a-z0-9_*]+$/i.test(value) ? <code className="ms-activity-code">{value}</code> : value}</dd>
          </div>
        ))}
      </dl>
      <ol className="ms-activity-members" aria-label={`The ${meta.total} events in this group`}>
        {data.map((entry) => (
          <ActivityMemberRow key={entry.id} entry={fromAuditEntry(entry)} shared={shared} onShowRequest={onShowRequest} />
        ))}
        {Array.from({ length: extraPages }, (_, index) => (
          <MembersPage key={index} groupKey={groupKey} page={index + 2} shared={shared} onShowRequest={onShowRequest} />
        ))}
      </ol>
      {loaded < meta.total && (
        <div className="ms-activity-group__more">
          <Button size="small" onClick={() => setExtraPages((value) => value + 1)}>
            Show {Math.min(PAGE_SIZE, meta.total - loaded)} more
          </Button>
          <span className="ms-activity-group__count">
            {loaded} of {meta.total} shown
          </span>
        </div>
      )}
    </div>
  );
}

function MembersPage({ groupKey, page, shared, onShowRequest }: { groupKey: string; page: number; shared: Record<string, string>; onShowRequest?: (requestId: string) => void }) {
  const [state, reload] = useAsync((signal) => auditApi.list({ groupKey, page, pageSize: PAGE_SIZE }, signal), [groupKey, page]);
  if (state.status === 'loading') {
    return (
      <li className="ms-activity-members__state">
        <Skeleton active title={false} paragraph={{ rows: 2 }} />
      </li>
    );
  }
  if (state.status === 'error') {
    return (
      <li className="ms-activity-members__state">
        <ErrorState message={state.message} reference={state.reference} onRetry={reload} />
      </li>
    );
  }
  return (
    <>
      {state.data.data.map((entry) => (
        <ActivityMemberRow key={entry.id} entry={fromAuditEntry(entry)} shared={shared} onShowRequest={onShowRequest} />
      ))}
    </>
  );
}
