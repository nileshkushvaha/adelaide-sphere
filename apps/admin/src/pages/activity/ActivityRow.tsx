import { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { Link } from 'react-router';
import { Pill, StatusTag } from '@/components/ui';
import { useCapabilities } from '@/auth/access-control';
import { routeRequirement } from '@/auth/permissions';
import { formatDateTime } from '@/shared/format';
import { activitySentence, activitySubject, adelaideTime, timeSpan, type ActivityItem } from '@/shared/activity';
import { activityAreaIcon } from '@/shared/activityIcons';
import { ActivityDetail } from './ActivityDetail';
import { ActivityGroupMembers } from './ActivityGroupMembers';

/**
 * One event — or one group of repeated events — in the activity timeline
 * (change log 1.14). It reads as a sentence: who did what to which record, with
 * the record's name linked when the reader can open it. Details and a group's
 * members open in place from the toggle, so links in the sentence stay links
 * rather than being buried inside a button.
 *
 * `full` is the activity log and `compact` the dashboard card. The events inside
 * an expanded group are drawn by `ActivityGroupMembers` as single lines.
 */
export function ActivityRow({ entry, variant = 'full', onShowRequest }: { entry: ActivityItem; variant?: 'full' | 'compact'; onShowRequest?: (requestId: string) => void }) {
  const [open, setOpen] = useState(false);
  const { can } = useCapabilities();
  const count = entry.count ?? 1;
  const area = entry.category ?? 'unknown';
  const failure = entry.outcome === 'failure';
  const when = entry.lastAt ?? entry.createdAt;
  const detailId = `activity-detail-${entry.id}`;

  const mayOpen = (href: string) => {
    const required = routeRequirement(href.split('?')[0] ?? href);
    if (required.permissions.length === 0) return true;
    return required.anyOf ? required.permissions.some((code) => can(code)) : can(...required.permissions);
  };

  const caption = [
    entry.domainLabel ?? null,
    entry.actorEmail ?? (entry.actorName ? null : 'automatic'),
    count > 1 ? timeSpan(entry.firstAt, entry.lastAt) : null,
  ].filter(Boolean);

  return (
    <li className={`as-activity-row as-activity-row--${variant}${failure ? ' is-failure' : ''}`}>
      <div className="as-activity-row__main">
        <span className={`as-activity-icon as-activity-icon--${area}`}>{activityAreaIcon(area)}</span>
        <div className="as-activity-row__body">
          <p className="as-activity-row__sentence">
            <span className="as-activity-row__actor">{activitySubject(entry)} </span>
            {activitySentence(entry).map((part, index) =>
              typeof part === 'string' ? (
                <span key={index}>{part}</span>
              ) : part.href && mayOpen(part.href) ? (
                <Link key={index} to={part.href} className="as-activity-row__target">
                  {part.strong}
                </Link>
              ) : (
                <strong key={index} className="as-activity-row__target">
                  {part.strong}
                </strong>
              ),
            )}
          </p>
          {variant !== 'compact' && caption.length > 0 && <p className="as-activity-row__meta">{caption.join(' · ')}</p>}
        </div>
        <div className="as-activity-row__side">
          <Tooltip title={`${formatDateTime(when)}, Adelaide time`}>
            <time dateTime={when} className="as-activity-row__time">
              {adelaideTime(when)}
            </time>
          </Tooltip>
          {count > 1 && <Pill tone="progress">×{count}</Pill>}
          {variant !== 'compact' && <StatusTag status={failure ? 'failure' : 'success'} label={failure ? 'refused or failed' : 'succeeded'} />}
          {variant !== 'compact' && (
            <Button
              type="text"
              size="small"
              className={`as-activity-row__toggle${open ? ' is-open' : ''}`}
              aria-expanded={open}
              aria-controls={detailId}
              aria-label={count > 1 ? undefined : open ? 'Hide details' : 'Show details'}
              icon={<DownOutlined aria-hidden="true" />}
              iconPosition="end"
              onClick={() => setOpen((value) => !value)}
            >
              {count > 1 ? (open ? 'Hide' : `Show all ${count}`) : null}
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div id={detailId} className={count > 1 && entry.groupKey ? 'as-activity-row__group' : 'as-activity-row__detail'}>
          {count > 1 && entry.groupKey ? <ActivityGroupMembers group={entry} onShowRequest={onShowRequest} /> : <ActivityDetail entry={entry} onShowRequest={onShowRequest} />}
        </div>
      )}
    </li>
  );
}
