import { App, Button, Space } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { formatDateTime } from '@/shared/format';
import { metadataLabel, metadataText, readableTargetType, type ActivityItem } from '@/shared/activity';

/** A value that reads as a code — an action, a permission key, a request id — is set in monospace. */
const CODE = /^([a-z0-9_]+\.)+[a-z0-9_*]+$|^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/**
 * Everything one event recorded, for an investigation, laid out as a grid of
 * short facts rather than a long two-column table. Inside a group, `shared`
 * holds what every event in the group has in common; the group says it once,
 * so each member shows only what is its own.
 *
 * Nothing private reaches this panel — the server redacted it when the event
 * was written (ACT 004).
 */
export function ActivityDetail({ entry, shared, onShowRequest }: { entry: ActivityItem; shared?: Record<string, string>; onShowRequest?: (requestId: string) => void }) {
  const { message } = App.useApp();
  const inGroup = shared !== undefined;
  const facts: Array<[string, string]> = [];
  if (!inGroup) facts.push(['Recorded as', entry.action]);
  facts.push(['When', `${formatDateTime(entry.createdAt)}, Adelaide time`]);
  if (!inGroup) {
    if (entry.domainLabel) facts.push(['Area', entry.domainLabel]);
    facts.push(['Who', entry.actorName ? `${entry.actorName}${entry.actorEmail ? ` (${entry.actorEmail})` : ''}` : 'The system itself']);
  }
  if (entry.targetType) facts.push([readableTargetType(entry.targetType), entry.targetLabel ?? entry.targetId ?? '—']);
  if (entry.targetId && entry.targetLabel && entry.targetId !== entry.targetLabel) facts.push(['Code or id', entry.targetId]);
  if (entry.reason) facts.push(['Reason given', entry.reason]);
  if (entry.requestId) facts.push(['Request id', entry.requestId]);
  if (entry.ipAddress) facts.push(['Address it came from', entry.ipAddress]);
  for (const [key, value] of Object.entries(entry.metadata ?? {})) {
    const text = metadataText(value);
    if (shared?.[key] === text) continue;
    facts.push([metadataLabel(key), text]);
  }

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      message.success('Request id copied');
    } catch {
      message.error('The request id could not be copied');
    }
  };

  return (
    <div>
      <dl className="ms-activity-facts">
        {facts.map(([label, value]) => (
          <div key={label} className="ms-activity-facts__item">
            <dt>{label}</dt>
            <dd>{CODE.test(value) ? <code className="ms-activity-code">{value}</code> : value}</dd>
          </div>
        ))}
      </dl>
      {entry.requestId && (
        <Space wrap size={8} style={{ marginTop: 12 }}>
          <Button size="small" icon={<CopyOutlined aria-hidden="true" />} onClick={() => void copy(entry.requestId!)}>
            Copy request id
          </Button>
          {onShowRequest && (
            <Button size="small" onClick={() => onShowRequest(entry.requestId!)}>
              Show everything from this request
            </Button>
          )}
        </Space>
      )}
    </div>
  );
}
