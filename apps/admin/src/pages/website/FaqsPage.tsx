import { App, Button, Input, Select, Space, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router';
import { faqsApi, type Faq } from '@/api/website';
import { PERMISSION } from '@/auth/permissions';
import { useCapabilities } from '@/auth/access-control';
import { ErrorState, ListEmpty, PageHeader, StatusTag, TableCard } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['q', 'status', 'groupName'] as const;

/**
 * Frequently asked questions (SRS 1.2 FAQ 002). Publication is an explicit
 * action, edits carry `expectedVersion`, and the answer is sanitised on the
 * server — this screen shows what was written, never what was rendered.
 */
export function FaqsPage() {
  useDocumentTitle('FAQs');
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const list = useListParams(FILTERS);
  const page = list.page;
  const status = (list.get('status') ?? '') as '' | 'draft' | 'published';
  const q = list.get('q') ?? '';

  const navigate = useNavigate();
  const groupName = list.get('groupName');
  const [state, reload] = useAsync(() => faqsApi.list({ page, pageSize: list.pageSize, status: status || undefined, q: q || undefined, groupName }), [page, list.pageSize, status, q, groupName]);
  // The groups that exist, taken from the page in hand: the API has no endpoint
  // for them, and inventing one for a handful of labels would be a round trip
  // to populate a dropdown.
  const groups = state.status === 'ready' ? [...new Set(state.data.data.map((faq) => faq.groupName).filter((name): name is string => Boolean(name)))].sort() : [];


  const setPublished = (record: Faq, published: boolean) => {
    modal.confirm({
      title: published ? 'Publish this question?' : 'Unpublish this question?',
      content: published ? 'It becomes visible on the public FAQ page immediately.' : 'It disappears from the public FAQ page immediately. Nothing is deleted.',
      okText: published ? 'Publish' : 'Unpublish',
      onOk: async () => {
        try {
          await faqsApi.setPublished(record.id, published, record.version);
          message.success(published ? 'Published' : 'Unpublished');
          reload();
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  };

  const remove = (record: Faq) => {
    modal.confirm({
      title: 'Delete this question?',
      content: 'This cannot be undone. If you only want it off the site, unpublish it instead.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await faqsApi.remove(record.id);
          message.success('Deleted');
          reload();
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Website' }, { label: 'FAQs' }]}
        title="FAQs"
        description="Shown on the public FAQ page, in this order."
        actions={
          can(PERMISSION.websiteFaqsCreate) ? (
            <Link to="/website/faqs/new">
              <Button type="primary" icon={<PlusOutlined />}>
                New question
              </Button>
            </Link>
          ) : null
        }
      />

      <TableCard
        toolbar={
          <>
            <Select
              aria-label="Filter by status"
              placeholder="Status"
              allowClear
              value={status || undefined}
              style={{ width: 160 }}
              onChange={(value?: string) => list.set('status', value)}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'published', label: 'Published' },
              ]}
            />
            <Input.Search aria-label="Search questions" placeholder="Search questions" allowClear defaultValue={q} style={{ width: 280 }} onSearch={(value) => list.set('q', value.trim() || undefined)} />
            {(groups.length > 0 || groupName) && (
              <Select
                aria-label="Filter by group"
                placeholder="Any group"
                allowClear
                value={groupName}
                style={{ width: 190 }}
                onChange={(value?: string) => list.set('groupName', value)}
                options={groups.map((name) => ({ value: name, label: name }))}
              />
            )}
          </>
        }
      >

      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}

      <Table<Faq>
        rowKey="id"
        size="small"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data.data : []}
        locale={{
          emptyText: (
            <ListEmpty state={state} filtered={list.filtered} noun="questions" onClear={list.clear} empty={{ title: 'No questions yet', description: 'Add the questions people actually ask, in the order they should appear.', action: can(PERMISSION.websiteFaqsCreate) ? { label: 'New question', onClick: () => navigate('/website/faqs/new') } : undefined }} />
          ),
        }}
        pagination={
          state.status === 'ready'
            ? tablePagination(state.data.meta, list)
            : false
        }
        scroll={{ x: 900 }}
        columns={[
          { title: 'Order', dataIndex: 'displayOrder', width: 80 },
          { title: 'Question', dataIndex: 'question' },
          { title: 'Group', dataIndex: 'groupName', width: 160, render: (v: string | null) => v ?? '—' },
          {
            title: 'Status',
            dataIndex: 'status',
            width: 120,
            render: (value: string) => <StatusTag status={value} />,
          },
          { title: 'Updated', dataIndex: 'updatedAt', width: 180, render: formatDateTime },
          {
            title: 'Actions',
            width: 260,
            render: (_: unknown, record) => (
              <Space size={4} wrap>
                {can(PERMISSION.websiteFaqsUpdate) && (
                  <Button size="small" onClick={() => navigate(`/website/faqs/${record.id}`)}>
                    Edit
                  </Button>
                )}
                {can(PERMISSION.websiteFaqsPublish) && (
                  <Button size="small" onClick={() => setPublished(record, record.status !== 'published')}>
                    {record.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                )}
                {can(PERMISSION.websiteFaqsDelete) && (
                  <Button size="small" danger onClick={() => remove(record)}>
                    Delete
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
      </TableCard>
    </div>
  );
}
