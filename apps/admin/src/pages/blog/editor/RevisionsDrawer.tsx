import { useState } from 'react';
import { Alert, App, Button, Drawer, Empty, List, Skeleton, Space, Tag, Typography } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { blogApi, type Post } from '@/api/blog';
import { isApiError } from '@/api/errors';
import { TextComparison } from '@/components/TextComparison';
import { ErrorState } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { readableText } from '@/shared/readableText';
import { errorMessage, useAsync } from '@/shared/useAsync';

interface Props {
  post: Post;
  /** What is in the editor now, to compare against. */
  current: { title: string; excerpt: string; bodyMarkdown: string; bodyFormat: 'html' | 'markdown' };
  dirty: boolean;
  onClose: () => void;
  onRestored: (post: Post) => void;
}

/**
 * Earlier versions of the article (SRS 1.10 BLOG 003): who saved each one and
 * when, a word-by-word comparison with what is in the editor now, and a way to
 * bring one back. Restoring keeps the current text as a version too, so it can
 * always be undone.
 */
export function RevisionsDrawer({ post, current, dirty, onClose, onRestored }: Props) {
  const { message, modal } = App.useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [list, reloadList] = useAsync((signal) => blogApi().listRevisions(post.id, signal), [post.id]);
  const [detail, reloadDetail] = useAsync((signal) => (selected ? blogApi().getRevision(post.id, selected, signal) : Promise.resolve(null)), [post.id, selected]);

  const restore = () => {
    if (detail.status !== 'ready' || !detail.data) return;
    const revision = detail.data;
    modal.confirm({
      title: `Bring back the version from ${formatDateTime(revision.createdAt)}?`,
      content: dirty
        ? 'Your unsaved changes will be replaced. The article as it is saved now is kept as a version, so you can switch back.'
        : 'The article as it is saved now is kept as a version, so you can switch back.',
      okText: 'Restore this version',
      onOk: async () => {
        try {
          const restored = await blogApi().restoreRevision(post.id, revision.id, post.version);
          message.success(post.status === 'published' ? 'Earlier version restored and live on the blog.' : 'Earlier version restored.');
          onRestored(restored);
        } catch (error) {
          message.error(isApiError(error) && error.code === 'STALE_VERSION' ? 'Someone saved this article a moment ago. Reload it, then try again.' : errorMessage(error));
        }
      },
    });
  };

  return (
    <Drawer open onClose={onClose} width="min(980px, 100vw)" title="Version history" destroyOnHidden>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        A version is kept each time the article's title or text is saved, up to the latest 50.
      </Typography.Paragraph>
      {list.status === 'loading' && <Skeleton active />}
      {list.status === 'error' && <ErrorState message={list.message} reference={list.reference} onRetry={reloadList} />}
      {list.status === 'ready' && list.data.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No earlier versions yet. One is kept the next time the text is saved." />}
      {list.status === 'ready' && list.data.length > 0 && (
        <div className="as-revisions">
          <List
            className="as-revisions__list"
            size="small"
            bordered
            dataSource={list.data}
            renderItem={(item) => (
              <List.Item style={{ padding: 0 }}>
                <button type="button" className="as-revisions__item" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
                  <span style={{ fontWeight: 600 }}>{formatDateTime(item.createdAt)}</span>
                  <span className="as-revisions__meta">
                    {item.actorName ?? 'Unknown editor'}
                    {item.reason ? ` · ${item.reason}` : ''}
                  </span>
                </button>
              </List.Item>
            )}
          />
          <div className="as-revisions__detail">
            {!selected && <Typography.Text type="secondary">Choose a version to compare it with what is in the editor now.</Typography.Text>}
            {selected && detail.status === 'loading' && <Skeleton active paragraph={{ rows: 8 }} />}
            {selected && detail.status === 'error' && <ErrorState message={detail.message} reference={detail.reference} onRetry={reloadDetail} />}
            {detail.status === 'ready' && detail.data && (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                  <Space wrap size={6}>
                    <Tag icon={<HistoryOutlined aria-hidden="true" />}>{formatDateTime(detail.data.createdAt)}</Tag>
                    <Typography.Text type="secondary">by {detail.data.actorName ?? 'unknown editor'}</Typography.Text>
                  </Space>
                  {post.status !== 'archived' && (
                    <Button type="primary" onClick={restore}>
                      Restore this version
                    </Button>
                  )}
                </Space>
                <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                  <del className="as-diff-removed">Struck through</del> is in that version but not now; <ins className="as-diff-added">highlighted</ins> is new since.
                </Typography.Text>
                {detail.data.title !== null && detail.data.title !== current.title && (
                  <section>
                    <Typography.Title level={3} style={{ fontSize: 15 }}>Title</Typography.Title>
                    <TextComparison before={detail.data.title} after={current.title} />
                  </section>
                )}
                {detail.data.excerpt !== null && detail.data.excerpt !== current.excerpt && (
                  <section>
                    <Typography.Title level={3} style={{ fontSize: 15 }}>Summary</Typography.Title>
                    <TextComparison before={detail.data.excerpt} after={current.excerpt} />
                  </section>
                )}
                <section>
                  <Typography.Title level={3} style={{ fontSize: 15 }}>Article text</Typography.Title>
                  {detail.data.bodySource === detail.data.sanitizedSnapshot && detail.data.bodyFormat === 'html' && (
                    <Alert type="info" showIcon style={{ marginBottom: 8 }} message="This older version was kept before formatting details were recorded; restoring it keeps its text and headings." />
                  )}
                  <TextComparison before={readableText(detail.data.bodySource, detail.data.bodyFormat)} after={readableText(current.bodyMarkdown, current.bodyFormat)} />
                </section>
              </Space>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
