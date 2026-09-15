import { App, Button, Input, Select, Space, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router';
import { testimonialsApi, type Testimonial } from '@/api/website';
import { PERMISSION } from '@/auth/permissions';
import { useCapabilities } from '@/auth/access-control';
import { ErrorState, ListEmpty, PageHeader, StatusTag, TableCard } from '@/components/ui';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['status', 'q'] as const;

/**
 * Testimonials (SRS 1.2 TSTM 005).
 *
 * A testimonial is entered by an administrator who holds the permission to
 * enter one, and whether it appears on the site is decided by its status alone.
 * The screen says "active" and "inactive" rather than the stored "draft" and
 * "published", because for a quote on the home page that is what the two states
 * mean; the four sibling content types keep the publishing words.
 */

/** How the stored status reads on this screen. */
const STATUS_LABELS: Record<string, string> = { draft: 'Inactive', published: 'Active' };
export function TestimonialsPage() {
  useDocumentTitle('Testimonials');
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const list = useListParams(FILTERS);
  const page = list.page;
  const status = (list.get('status') ?? '') as '' | 'draft' | 'published';

  const q = list.get('q') ?? '';
  const [state, reload] = useAsync(() => testimonialsApi.list({ page, pageSize: list.pageSize, status: status || undefined, q: q || undefined }), [page, list.pageSize, status, q]);



  const setPublished = (record: Testimonial, published: boolean) => {
    modal.confirm({
      title: published ? 'Show this testimonial?' : 'Hide this testimonial?',
      content: published ? 'It appears on the public home page immediately.' : 'It disappears from the public home page immediately. Nothing is deleted.',
      okText: published ? 'Make it active' : 'Make it inactive',
      onOk: async () => {
        try {
          await testimonialsApi.setPublished(record.id, published, record.version);
          message.success(published ? 'Testimonial is active.' : 'Testimonial is inactive.');
          reload();
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  };

  const remove = (record: Testimonial) => {
    modal.confirm({
      title: 'Delete this testimonial?',
      content: 'This cannot be undone. If you only want it off the site, make it inactive instead.',
      okText: 'Delete testimonial',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await testimonialsApi.remove(record.id);
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
        crumbs={[{ label: 'Website' }, { label: 'Testimonials' }]}
        title="Testimonials"
        description="Quotes shown on the public home page, in this order."
        actions={
          can(PERMISSION.websiteTestimonialsCreate) ? (
            <Link to="/website/testimonials/new">
              <Button type="primary" icon={<PlusOutlined />}>
                New testimonial
              </Button>
            </Link>
          ) : null
        }
      />

      <TableCard
        toolbar={
          <>
            <Input.Search
              aria-label="Search testimonials"
              placeholder="Search the person or the quote"
              allowClear
              defaultValue={q}
              onSearch={(value) => list.set('q', value.trim() || undefined)}
              style={{ width: 260 }}
            />
            <Select
              aria-label="Filter by status"
              placeholder="Status"
              allowClear
              value={status || undefined}
              style={{ width: 160 }}
              onChange={(value?: string) => list.set('status', value)}
              options={[
                { value: 'published', label: 'Active' },
                { value: 'draft', label: 'Inactive' },
              ]}
            />
          </>
        }
      >

      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}

      <Table<Testimonial>
        rowKey="id"
        size="small"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data.data : []}
        locale={{
          emptyText: (
            <ListEmpty state={state} filtered={list.filtered} noun="testimonials" onClear={list.clear} empty={{ title: 'No testimonials yet', description: 'Add a quote to show on the website.', action: can(PERMISSION.websiteTestimonialsCreate) ? { label: 'New testimonial', onClick: () => navigate('/website/testimonials/new') } : undefined }} />
          ),
        }}
        pagination={
          state.status === 'ready'
            ? tablePagination(state.data.meta, list)
            : false
        }
        scroll={{ x: 1000 }}
        columns={[
          { title: 'Order', dataIndex: 'displayOrder', width: 80 },
          { title: 'Name', dataIndex: 'displayName', width: 180 },
          { title: 'Quote', dataIndex: 'quote', render: (value: string) => <span>{value.length > 90 ? `${value.slice(0, 90)}…` : value}</span> },
          // The stored words are the shared publishing vocabulary; on this
          // screen they read as what they mean for a quote on the home page.
          { title: 'Status', dataIndex: 'status', width: 110, render: (value: string) => <StatusTag status={value} label={STATUS_LABELS[value]} /> },
          {
            title: 'Actions',
            width: 300,
            render: (_: unknown, record) => (
              <Space size={4} wrap>
                {can(PERMISSION.websiteTestimonialsUpdate) && (
                  <Button size="small" onClick={() => navigate(`/website/testimonials/${record.id}`)}>
                    Edit
                  </Button>
                )}
                {can(PERMISSION.websiteTestimonialsPublish) && (
                  <Button size="small" onClick={() => setPublished(record, record.status !== 'published')}>
                    {record.status === 'published' ? 'Make inactive' : 'Make active'}
                  </Button>
                )}
                {can(PERMISSION.websiteTestimonialsDelete) && (
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
