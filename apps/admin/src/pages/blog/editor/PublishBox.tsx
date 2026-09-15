import { Alert, Button, Dropdown, Form, Input, Space, Switch, Typography, theme } from 'antd';
import { CheckCircleOutlined, DownOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { MAX_FEATURED_POSTS, type PostRequirement } from '@adelaide-sphere/domain/posts';
import type { Post, PostAction } from '@/api/blog';
import { SectionCard, StatusTag } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { ACTION_LABELS, ACTIONS_BY_STATUS } from './types';

interface Props {
  post: Post | null;
  checklist: PostRequirement[];
  canWrite: boolean;
  canPublish: boolean;
  readOnly: boolean;
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
  onAction: (action: PostAction) => void;
  onFocusField: (field: PostRequirement['field']) => void;
  /** Opens the preview of what is typed now, saved or not. */
  onPreview: () => void;
  /** Opens the version history; only offered once the article exists. */
  onHistory?: () => void;
  /** Features or stops featuring a published article. */
  onFeature?: (featured: boolean) => void;
  featuring?: boolean;
}

/**
 * The "Publish" box, WordPress-style: where the article stands, what is left
 * before it can go live, and the buttons that save, publish or schedule it.
 * Rarely used and destructive actions sit under "More" so the everyday ones
 * are not crowded by them.
 */
export function PublishBox({ post, checklist, canWrite, canPublish, readOnly, saving, dirty, onSave, onAction, onFocusField, onPreview, onHistory, onFeature, featuring = false }: Props) {
  const { token } = theme.useToken();
  const status = post?.status ?? 'draft';
  const available = canPublish ? ACTIONS_BY_STATUS[status] : [];
  const primary: PostAction[] = available.filter((action) => action === 'publish' || action === 'schedule' || action === 'restore');
  const more = available.filter((action) => !primary.includes(action));
  const unmet = checklist.filter((requirement) => !requirement.met);
  const showChecklist = status !== 'published' && status !== 'archived';

  return (
    <SectionCard title="Publish" style={{ marginBottom: 16 }}>
      <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 12 }}>
        <Space size={8} wrap>
          <Typography.Text type="secondary">Status:</Typography.Text>
          <StatusTag status={status} />
        </Space>
        {post?.scheduledAt && status === 'scheduled' && <Typography.Text type="secondary">Goes live {formatDateTime(post.scheduledAt)}</Typography.Text>}
        {post?.firstPublishedAt && <Typography.Text type="secondary">First published {formatDateTime(post.firstPublishedAt)}</Typography.Text>}
      </Space>

      {post && status === 'published' && canPublish && onFeature && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: token.colorFillQuaternary }}>
          <div>
            <Typography.Text strong id="post-feature-label" style={{ display: 'block' }}>
              Feature on the home page
            </Typography.Text>
            <Typography.Text type="secondary" id="post-feature-help" style={{ fontSize: 12.5 }}>
              {dirty
                ? 'Save your changes first.'
                : post.featuredAt
                  ? `Featured since ${formatDateTime(post.featuredAt)}. It leads the home page and the blog.`
                  : `Up to ${MAX_FEATURED_POSTS} articles can lead the home page and the blog.`}
            </Typography.Text>
          </div>
          <Switch aria-labelledby="post-feature-label" aria-describedby="post-feature-help" checked={Boolean(post.featuredAt)} loading={featuring} disabled={saving || dirty || featuring} onChange={(checked) => onFeature(checked)} />
        </div>
      )}

      {showChecklist && (
        <div style={{ marginBottom: 12 }}>
          {/* Announces only the headline changing, not every keystroke's checklist update. */}
          <Typography.Text strong role="status" style={{ display: 'block' }}>
            {unmet.length === 0 ? 'Ready to publish' : 'Not ready to publish'}
          </Typography.Text>
          {unmet.length > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              {unmet.length} {unmet.length === 1 ? 'thing' : 'things'} to do first
            </Typography.Text>
          )}
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
            {checklist.map((requirement) => (
              <li key={requirement.code} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '3px 0', fontSize: 13.5 }}>
                {requirement.met ? (
                  <CheckCircleOutlined aria-hidden="true" style={{ color: token.colorSuccess, marginTop: 3 }} />
                ) : (
                  <ExclamationCircleOutlined aria-hidden="true" style={{ color: token.colorWarning, marginTop: 3 }} />
                )}
                <span className="sr-only">{requirement.met ? 'Done:' : 'To do:'}</span>
                {requirement.met ? (
                  <span>{requirement.message}</span>
                ) : (
                  <Button type="link" size="small" style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => onFocusField(requirement.field)}>
                    {requirement.message}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Form.Item label="Comments" name="commentsEnabled" valuePropName="checked" style={{ marginBottom: 12 }} extra="Readers can comment; every comment waits for moderation.">
        <Switch />
      </Form.Item>

      {post?.firstPublishedAt && !readOnly && (
        <Form.Item label="Note about this change (optional)" name="revisionReason" extra="Kept with the previous version of the article." style={{ marginBottom: 12 }}>
          <Input maxLength={500} placeholder="e.g. Corrected the opening hours" />
        </Form.Item>
      )}

      {canWrite && !canPublish && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="You can write and save drafts" description="Publishing needs the “Publish articles” permission. Ask the administrator who manages access." />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12 }}>
        <Space wrap size={8}>
          {!readOnly && (
            <Button onClick={onSave} loading={saving} disabled={saving || (!dirty && Boolean(post))}>
              {status === 'published' ? 'Update article' : 'Save draft'}
            </Button>
          )}
          <Button onClick={onPreview}>Preview</Button>
          {post && onHistory && <Button onClick={onHistory}>History</Button>}
        </Space>
        <Space wrap size={8}>
          {more.length > 0 && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: more.map((action) => ({ key: action, label: ACTION_LABELS[action].label, danger: ACTION_LABELS[action].danger })),
                onClick: ({ key }) => onAction(key as PostAction),
              }}
            >
              <Button>
                More <DownOutlined aria-hidden="true" />
              </Button>
            </Dropdown>
          )}
          {primary.map((action) => (
            <Button key={action} type={action === 'schedule' ? 'default' : 'primary'} onClick={() => onAction(action)} disabled={saving}>
              {ACTION_LABELS[action].label}
            </Button>
          ))}
        </Space>
      </div>
    </SectionCard>
  );
}
