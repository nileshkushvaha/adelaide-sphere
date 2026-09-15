import { useState } from 'react';
import { App, Button, Input, Select, Space, Table, Typography } from 'antd';
import { ExportOutlined, PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router';
import { DuplicatePageDialog } from './editor/DuplicatePageDialog';
import { pagesApi, type StaticPage } from '@/api/settings';
import { errorMessage } from '@/shared/useAsync';
import { PERMISSION } from '@/auth/permissions';
import { useCapabilities } from '@/auth/access-control';
import { ListEmpty, PageHeader, PageLoadError, Pill, StatusTag, TableCard } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { useAsync } from '@/shared/useAsync';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

/** The public site, for "View on site"; empty in production, where the admin shares the site's origin. */
const PUBLIC_SITE = ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '');

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['q', 'status'] as const;

/**
 * Website pages (SRS CFG 002, amended in SRS 1.6 and 1.7).
 *
 * Two kinds of row. The pages the product refers to by address — the three
 * policies — are always listed, whether or not anyone has written them,
 * and cannot be deleted or renamed. Everything below them is a page an
 * administrator created and may delete. Each opens on its own route, and the
 * list says plainly which are not publishable yet and why.
 */
export function PagesPage() {
  useDocumentTitle('Pages');
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const canCreate = can(PERMISSION.websitePagesCreate);
  const canEdit = can(PERMISSION.websitePagesUpdate);
  const canDelete = can(PERMISSION.websitePagesDelete);
  const navigate = useNavigate();
  const [duplicating, setDuplicating] = useState<StaticPage | null>(null);
  const list = useListParams(FILTERS);
  const q = list.get('q') ?? '';
  const status = list.get('status') as StaticPage['status'] | undefined;
  const [state, reload] = useAsync((signal) => pagesApi().list({ q: q || undefined, status }, signal), [q, status]);

  const remove = (page: StaticPage) => {
    modal.confirm({
      title: `Delete “${page.title}”?`,
      content: 'The page and its revision history are removed. This cannot be undone; the address becomes a 404 for anyone who saved it.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await pagesApi().remove(page.slug);
          message.success('Page deleted');
          reload();
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  };

  if (state.status === 'error') {
    return <PageLoadError title="Pages" crumbs={[{ label: 'Website' }, { label: 'Pages' }]} message={state.message} reference={state.reference} onRetry={reload} />;
  }
  const pages = state.status === 'ready' ? state.data : [];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Website' }, { label: 'Pages' }]}
        title="Pages"
        description="Policies and your own pages. Only published pages are public; add a page to a menu to link it."
        actions={
          canCreate ? (
            <Link to="/website/pages/new">
              <Button type="primary" icon={<PlusOutlined aria-hidden="true" />}>
                New page
              </Button>
            </Link>
          ) : null
        }
      />
      <TableCard
        toolbar={
          <>
            <Input.Search
              aria-label="Search pages"
              placeholder="Search by title or address"
              allowClear
              defaultValue={q}
              onSearch={(value) => list.set('q', value.trim() || undefined)}
              style={{ width: 280 }}
            />
            <Select
              aria-label="Filter by status"
              allowClear
              placeholder="Any status"
              value={status}
              onChange={(value) => list.set('status', value)}
              style={{ width: 150 }}
              options={[
                { value: 'published', label: 'Published' },
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'draft', label: 'Draft' },
              ]}
            />
          </>
        }
      >
      <Table<StaticPage>
        className="ms-scroll-table"
        scroll={{ x: 640 }}
        rowKey="slug"
        dataSource={pages}
        loading={state.status === 'loading'}
        pagination={false}
        locale={{
          emptyText: (
            <ListEmpty
              state={state}
              filtered={list.filtered}
              noun="pages"
              onClear={list.clear}
              empty={{ title: 'No pages yet', description: 'The policies appear here as soon as this list can be read. Choose “New page” to add your own.' }}
            />
          ),
        }}
        columns={[
          {
            title: 'Page',
            dataIndex: 'title',
            render: (_: unknown, record) => (
              <Space direction="vertical" size={0}>
                <Link to={`/website/pages/${record.slug}`}>{record.title}</Link>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  /{record.slug}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: 'Kind',
            key: 'kind',
            width: 190,
            render: (_: unknown, record) => (
              <Space size={6} wrap>
                <Pill tone={record.isSystem ? 'progress' : 'neutral'}>{record.isSystem ? 'Part of the product' : 'Added by an editor'}</Pill>
              </Space>
            ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            width: 200,
            render: (_: unknown, record) => (
              <Space direction="vertical" size={2}>
                <Space size={8}>
                  <StatusTag status={record.status} />
                  {record.status !== 'published' && record.publicationBlockers.length > 0 && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {record.publicationBlockers.length} to fix
                    </Typography.Text>
                  )}
                </Space>
                {record.status === 'scheduled' && record.scheduledAt && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Goes live {formatDateTime(record.scheduledAt)}
                  </Typography.Text>
                )}
                {record.status === 'draft' && record.publishFailure && <Pill tone="critical">Returned to draft</Pill>}
                {record.noindex && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Hidden from search engines
                  </Typography.Text>
                )}
              </Space>
            ),
          },
          {
            title: 'Last changed',
            dataIndex: 'updatedAt',
            width: 200,
            render: (_: unknown, record) => (record.version > 0 ? formatDateTime(record.updatedAt) : <Typography.Text type="secondary">Never saved</Typography.Text>),
          },
          {
            title: '',
            key: 'actions',
            width: 230,
            render: (_: unknown, record) =>
              (
                <Space size={8}>
                  <Link to={`/website/pages/${record.slug}`}>
                    <Button size="small">{canEdit ? 'Edit' : 'View'}</Button>
                  </Link>
                  {canCreate && record.version > 0 && (
                    <Button size="small" onClick={() => setDuplicating(record)} aria-label={`Duplicate ${record.title}`}>
                      Duplicate
                    </Button>
                  )}
                  {record.status === 'published' && (
                    <Button size="small" href={`${PUBLIC_SITE}/${record.slug}`} target="_blank" rel="noreferrer noopener" icon={<ExportOutlined aria-hidden="true" />} aria-label={`View ${record.title} on the site`} />
                  )}
                  {canDelete && !record.isSystem && (
                    <Button
                      size="small"
                      danger
                      // Refused by the API while it is published; the button
                      // says so rather than offering an action that fails.
                      disabled={!record.canDelete}
                      title={record.canDelete ? undefined : 'Unpublish it first'}
                      onClick={() => remove(record)}
                      aria-label={`Delete ${record.title}`}
                    >
                      Delete
                    </Button>
                  )}
                </Space>
              ),
          },
        ]}
      />
      </TableCard>
      {duplicating && (
        <DuplicatePageDialog
          source={duplicating}
          onCancel={() => setDuplicating(null)}
          onDuplicated={(copy) => {
            setDuplicating(null);
            message.success('Copy created as a draft.');
            navigate(`/website/pages/${encodeURIComponent(copy.slug)}`);
          }}
        />
      )}
    </div>
  );
}
