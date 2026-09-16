import { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { Link } from 'react-router';
import { StatusTag } from '@/components/ui';
import { useCapabilities } from '@/auth/access-control';
import { routeRequirement } from '@/auth/permissions';
import { formatDateTime } from '@/shared/format';
import { activitySentence, metadataLabel, metadataText, adelaideTime, readableTargetType, type ActivityItem } from '@/shared/activity';
import { ActivityDetail } from './ActivityDetail';

/**
 * One event inside an expanded group: a single line with the time and the
 * record it concerns. Its outcome is shown only when it differs from success,
 * and it opens only when it holds something the group summary does not.
 */
export function ActivityMemberRow({ entry, shared, onShowRequest }: { entry: ActivityItem; shared: Record<string, string>; onShowRequest?: (requestId: string) => void }) {
  const [open, setOpen] = useState(false);
  const { can } = useCapabilities();
  const failure = entry.outcome === 'failure';
  const detailId = `activity-member-${entry.id}`;
  const own = Object.entries(entry.metadata ?? {}).filter(([key, value]) => shared[key] !== metadataText(value));
  const expandable = Boolean(entry.requestId || entry.ipAddress || entry.reason || own.length > 0);

  const href = entry.targetLabel ? (activitySentence(entry).find((part): part is { strong: string; href?: string | null } => typeof part !== 'string')?.href ?? null) : null;
  const mayOpen = (target: string) => {
    const required = routeRequirement(target);
    if (required.permissions.length === 0) return true;
    return required.anyOf ? required.permissions.some((code) => can(code)) : can(...required.permissions);
  };
  const name = entry.targetLabel ?? (entry.targetType ? readableTargetType(entry.targetType) : entry.action);
  const code = entry.targetId && entry.targetId !== entry.targetLabel && /\./.test(entry.targetId) ? entry.targetId : null;

  return (
    <li className={`as-activity-member${failure ? ' is-failure' : ''}`}>
      <div className="as-activity-member__line">
        <Tooltip title={`${formatDateTime(entry.createdAt)}, Adelaide time`}>
          <time dateTime={entry.createdAt} className="as-activity-member__time">
            {adelaideTime(entry.createdAt)}
          </time>
        </Tooltip>
        <span className="as-activity-member__name">
          {href && mayOpen(href) ? <Link to={href}>{name}</Link> : <span>{name}</span>}
          {code && <code className="as-activity-code">{code}</code>}
          {own.length > 0 && !open && (
            <span className="as-activity-member__own">
              {own
                .slice(0, 2)
                .map(([key, value]) => `${metadataLabel(key)}: ${metadataText(value)}`)
                .join(' · ')}
            </span>
          )}
        </span>
        {failure && <StatusTag status="failure" label="refused or failed" />}
        {expandable ? (
          <Button
            type="text"
            size="small"
            className={`as-activity-row__toggle${open ? ' is-open' : ''}`}
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={`${open ? 'Hide' : 'Show'} details for ${name}`}
            icon={<DownOutlined aria-hidden="true" />}
            onClick={() => setOpen((value) => !value)}
          />
        ) : (
          <span className="as-activity-member__spacer" aria-hidden="true" />
        )}
      </div>
      {open && (
        <div id={detailId} className="as-activity-member__detail">
          <ActivityDetail entry={entry} shared={shared} onShowRequest={onShowRequest} />
        </div>
      )}
    </li>
  );
}
