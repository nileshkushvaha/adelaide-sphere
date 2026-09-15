import { useState } from 'react';
import { App, Button, Drawer, Empty, List, Skeleton, Space, Tag, Typography } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { pageSectionsHtml, type PageSection } from '@adelaide-sphere/domain/page-sections';
import { pagesApi, type StaticPage } from '@/api/settings';
import { isApiError } from '@/api/errors';
import { TextComparison } from '@/components/TextComparison';
import { ErrorState } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { readableText } from '@/shared/readableText';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { sectionLabel, sectionSummary } from './page-sections-model';

interface Props {
  page: StaticPage;
  /** What is in the editor now, to compare against. */
  current: { title: string; sections: PageSection[] };
  dirty: boolean;
  canRestore: boolean;
  onClose: () => void;
  /** After a restore: the page is re-read and the editor starts again from it. */
  onRestored: () => void;
}

/**
 * Earlier versions of a page (change log 1.17): who saved each one and when,
 * its sections, a word-by-word comparison of its text with what is in the
 * editor now, and a way to bring it back. Restoring keeps the current page as a
 * version too, so it can always be undone.
 */
export function PageRevisionsDrawer({ page, current, dirty, canRestore, onClose, onRestored }: Props) {
  const { message, modal } = App.useApp();
  const [selected, setSelected] = useState<string | null>(null);
  const [list, reloadList] = useAsync((signal) => pagesApi().listRevisions(page.slug, signal), [page.slug]);
  const [detail, reloadDetail] = useAsync((signal) => (selected ? pagesApi().getRevision(page.slug, selected, signal) : Promise.resolve(null)), [page.slug, selected]);

  const restore = () => {
    if (detail.status !== 'ready' || !detail.data) return;
    const revision = detail.data;
    modal.confirm({
      title: `Bring back the version from ${formatDateTime(revision.createdAt)}?`,
      content: `${dirty ? 'Your unsaved changes will be replaced. ' : ''}The page as it is saved now is kept as a version, so you can switch back.${page.status === 'published' ? ' The live page changes straight away.' : ''}`,
      okText: 'Restore this version',
      onOk: async () => {
        try {
          await pagesApi().restoreRevision(page.slug, revision.id, page.version);
          message.success(page.status === 'published' ? 'Earlier version restored and live.' : 'Earlier version restored.');
          onRestored();
        } catch (error) {
          if (isApiError(error) && error.code === 'STALE_VERSION') message.error('Someone saved this page a moment ago. Reload it, then try again.');
          else if (isApiError(error) && error.code === 'VALIDATION_ERROR') {
            const first = Object.values(error.fields).flat()[0];
            message.error(`That version uses something that is no longer available${first ? `: ${first}` : ''}. Restore it, then fix the section, or choose another version.`);
          } else message.error(errorMessage(error));
        }
      },
    });
  };

  const revisionSections = detail.status === 'ready' && detail.data ? (detail.data.sections as unknown as PageSection[]) : [];

  return (
    <Drawer open onClose={onClose} width="min(980px, 100vw)" title="Version history" destroyOnHidden>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        A version is kept every time the page is saved, up to the latest 50.
      </Typography.Paragraph>
      {list.status === 'loading' && <Skeleton active />}
      {list.status === 'error' && <ErrorState message={list.message} reference={list.reference} onRetry={reloadList} />}
      {list.status === 'ready' && list.data.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No earlier versions yet. One is kept the next time the page is saved." />}
      {list.status === 'ready' && list.data.length > 0 && (
        <div className="ms-revisions">
          <List
            className="ms-revisions__list"
            size="small"
            bordered
            dataSource={list.data}
            renderItem={(item) => (
              <List.Item style={{ padding: 0 }}>
                <button type="button" className="ms-revisions__item" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
                  <span style={{ fontWeight: 600 }}>{formatDateTime(item.createdAt)}</span>
                  <span className="ms-revisions__meta">
                    {item.actorName ?? 'Unknown editor'}
                    {item.reason ? ` · ${item.reason}` : ''}
                  </span>
                </button>
              </List.Item>
            )}
          />
          <div className="ms-revisions__detail">
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
                  {canRestore && (
                    <Button type="primary" onClick={restore}>
                      Restore this version
                    </Button>
                  )}
                </Space>
                <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                  <del className="ms-diff-removed">Struck through</del> is in that version but not now; <ins className="ms-diff-added">highlighted</ins> is new since.
                </Typography.Text>
                {detail.data.title !== null && detail.data.title !== current.title && (
                  <section>
                    <Typography.Title level={3} style={{ fontSize: 15 }}>
                      Title
                    </Typography.Title>
                    <TextComparison before={detail.data.title} after={current.title} />
                  </section>
                )}
                <section>
                  <Typography.Title level={3} style={{ fontSize: 15 }}>
                    Sections in that version
                  </Typography.Title>
                  <ol style={{ margin: 0, paddingInlineStart: 20 }}>
                    {revisionSections.map((section) => (
                      <li key={section.id} style={{ fontSize: 13.5 }}>
                        <strong>{sectionLabel(section)}</strong>
                        {section.hidden ? ' (hidden)' : ''} — <Typography.Text type="secondary">{sectionSummary(section, detail.data!.title ?? page.title)}</Typography.Text>
                      </li>
                    ))}
                  </ol>
                </section>
                <section>
                  <Typography.Title level={3} style={{ fontSize: 15 }}>
                    Page text
                  </Typography.Title>
                  <TextComparison before={readableText(pageSectionsHtml(revisionSections), 'html')} after={readableText(pageSectionsHtml(current.sections), 'html')} />
                </section>
              </Space>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
