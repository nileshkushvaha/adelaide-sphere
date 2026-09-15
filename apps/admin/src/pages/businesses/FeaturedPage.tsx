import { App, Button, Select, Space, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { Link, useNavigate } from 'react-router';
import { featuredApi, type FeaturedPlacement } from '@/api/businesses';
import { isApiError } from '@/api/errors';
import { ErrorState, ListEmpty, PageHeader, StatusTag, TableCard, statusRowClass } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { useBusy } from '@/shared/useBusy';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['state'] as const;

/** What each state means for the reader, in the order they are offered. */
const STATES: { value: FeaturedPlacement['state']; label: string }[] = [
  { value: 'live', label: 'Live now' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'ended', label: 'Ended' },
  { value: 'not-published', label: 'Listing not published' },
];

/**
 * Manual featured placements (SRS DIR 007). At most three ever appear for a
 * query, they never bypass matching or publication rules, and there is no
 * payment or billing anywhere in the flow.
 *
 * The list is filtered here rather than by the API, deliberately: placements
 * are an editorial set of a few dozen at most, the endpoint returns them in one
 * response, and paginating a list this size would cost a round trip to hide
 * four rows. If it ever grows, the filter moves to the query.
 */
export function FeaturedPage() {
  useDocumentTitle('Featured listings');
  const api = featuredApi();
  const { message, modal } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const { can } = useCapabilities();
  const navigate = useNavigate();
  const canManage = can(PERMISSION.featuredManage);
  const list = useListParams(FILTERS);
  const [state, reload] = useAsync((signal) => api.list(signal), []);
  const [, run] = useBusy();

  const selected = list.get('state') as FeaturedPlacement['state'] | undefined;
  const rows = (state.status === 'ready' ? state.data : []).filter((row) => !selected || row.state === selected);

  const remove = (row: FeaturedPlacement) =>
    modal.confirm({
      title: `Stop featuring ${row.businessName}?`,
      content: 'The listing stays published and keeps its place in ordinary results. Only the featured placement is removed.',
      okText: 'Remove placement',
      okButtonProps: { danger: true },
      onOk: () =>
        run(async () => {
          try {
            await api.remove(row.id);
            message.success('Placement removed.');
            reload();
          } catch (error) {
            if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
            else message.error(errorMessage(error));
          }
        }),
    });

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Business', href: '/businesses' }, { label: 'Featured listings' }]}
        title="Featured listings"
        description="Up to three appear above search results. They never change ranking or reveal an unpublished listing."
        actions={
          canManage ? (
            <Link to="/businesses/featured/new">
              <Button type="primary" icon={<PlusOutlined aria-hidden="true" />}>
                Feature a listing
              </Button>
            </Link>
          ) : null
        }
      />

      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}

      <TableCard
        toolbar={
          <Select
            aria-label="Filter by state"
            allowClear
            placeholder="Any state"
            value={selected}
            onChange={(value) => list.set('state', value)}
            style={{ width: 220 }}
            options={STATES}
          />
        }
        summary={state.status === 'ready' ? `${rows.length} of ${state.data.length} placement${state.data.length === 1 ? '' : 's'}` : undefined}
      >
        <Table<FeaturedPlacement>
          rowKey="id"
          // Colour marks the placements that are actually showing right now.
          rowClassName={(row) => statusRowClass(row.state)}
          loading={state.status === 'loading'}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{
            emptyText: (
              <ListEmpty
                state={state}
                filtered={list.filtered}
                noun="placements"
                onClear={list.clear}
                empty={{
                  title: 'Nothing is featured',
                  description: 'Feature a published listing to show it above the directory results for searches it already matches.',
                  action: canManage ? { label: 'Feature a listing', onClick: () => navigate('/businesses/featured/new') } : undefined,
                }}
              />
            ),
          }}
          columns={[
            {
              title: 'Listing',
              render: (_: unknown, row) => (
                <Link to={`/businesses/${row.businessId}`} style={{ fontWeight: 600 }}>
                  {row.businessName}
                </Link>
              ),
            },
            {
              title: 'State',
              width: 190,
              render: (_: unknown, row) => <StatusTag status={row.state} />,
            },
            {
              title: 'Showing',
              width: 260,
              render: (_: unknown, row) => (
                <span>
                  {formatDateTime(row.startsAt)}
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                    {row.endsAt ? `until ${formatDateTime(row.endsAt)}` : 'no end date'}
                  </Typography.Text>
                </span>
              ),
            },
            {
              title: 'Order',
              dataIndex: 'position',
              width: 90,
              align: 'right' as const,
              // Position decides which three are shown when more than three
              // match; it is not a rank in the results themselves.
              render: (value: number) => value,
            },
            { title: 'Note', dataIndex: 'note', ellipsis: true, render: (value: string | null) => value ?? <Typography.Text type="secondary">—</Typography.Text> },
            ...(canManage
              ? [
                  {
                    title: <span className="sr-only">Actions</span>,
                    width: 120,
                    render: (_: unknown, row: FeaturedPlacement) => (
                      <Space>
                        <Button size="small" danger onClick={() => remove(row)} aria-label={`Remove the featured placement for ${row.businessName}`}>
                          Remove
                        </Button>
                      </Space>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </TableCard>
    </div>
  );
}
