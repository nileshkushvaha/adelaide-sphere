import { useEffect, useState } from 'react';
import { TermSelect } from '@/components/TermSelect';
import { useTermNames } from '@/shared/useTermNames';
import { Alert, Button, Dropdown, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { MoreOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons';
import { useList } from '@refinedev/core';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { BusinessListItem, BusinessStatus } from '@/api/businesses';
import { isApiError } from '@/api/errors';
import { formatDateTime } from '@/shared/format';
import { EmptyState, PageHeader, Pill, StatusTag, TableCard } from '@/components/ui';
import { PAGE_SIZES } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { brand } from '@/config/theme';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

/** The sort keys the API accepts (BUSINESS_SORT_FIELDS), in an administrator's words. */
const SORTS = {
  'updatedAt:desc': 'Recently changed',
  'updatedAt:asc': 'Longest unchanged',
  'name:asc': 'Name A–Z',
  'name:desc': 'Name Z–A',
  'createdAt:desc': 'Recently added',
  'firstPublishedAt:desc': 'Recently published',
  'status:asc': 'Status',
} as const;
type SortKey = keyof typeof SORTS;
const DEFAULT_SORT: SortKey = 'updatedAt:desc';

const STATUSES: BusinessStatus[] = ['draft', 'published', 'archived'];

/**
 * Business listings index (SRS BUS 001–006, DIR 005/006).
 *
 * Filters, sort and page live in the URL, so a view can be shared, reloaded and
 * returned to from a listing. Every filter is answered by the server: the page
 * never holds more than one page of listings, whatever the directory grows to.
 */
export function BusinessesPage() {
  useDocumentTitle('Businesses');
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useCapabilities();
  const canCreate = can(PERMISSION.listingsCreate);
  const canWrite = can(PERMISSION.listingsUpdate);
  const page = Number(params.get('page') ?? '1') || 1;
  const q = params.get('q') ?? '';
  const status = (STATUSES as string[]).includes(params.get('status') ?? '') ? (params.get('status') as BusinessStatus) : undefined;
  const categoryId = params.get('categoryId') ?? undefined;
  const localAreaId = params.get('localAreaId') ?? undefined;
  const featured = params.get('featured') === 'yes' || params.get('featured') === 'no' ? (params.get('featured') as 'yes' | 'no') : undefined;
  // `sort` and `order` stay separate in the address, as every other admin list
  // writes them; the control below joins them so there is one thing to choose.
  const sortParam = `${params.get('sort') ?? ''}:${params.get('order') ?? ''}`;
  const sortKey: SortKey = Object.hasOwn(SORTS, sortParam) ? (sortParam as SortKey) : DEFAULT_SORT;
  const [sort, order] = sortKey.split(':') as [string, 'asc' | 'desc'];

  // What is typed, against what has been asked for: the field stays responsive
  // while the request waits for a pause in typing. When the address changes from
  // elsewhere — a cleared filter, the Back button — the field follows it; that is
  // done during render rather than in an effect, so there is no extra pass.
  // How many rows a page holds, from the address bar and clamped to the sizes
  // offered, so a hand-typed value cannot ask the API for more than it allows.
  const askedSize = Number(params.get('pageSize'));
  const pageSize = PAGE_SIZES.includes(askedSize) ? askedSize : PAGE_SIZE;
  const [typed, setTyped] = useState(q);
  const [shownQuery, setShownQuery] = useState(q);
  if (shownQuery !== q) {
    setShownQuery(q);
    setTyped(q);
  }

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Any change but the page itself returns to the first page: page 7 of a
    // different filter is not where the reader meant to be (DIR 005).
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: key === 'q' });
  };

  useEffect(() => {
    if (typed === q) return;
    const timer = window.setTimeout(() => setParam('q', typed.trim() || undefined), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setParam reads the current params by design
  }, [typed, q]);

  const list = useList<BusinessListItem>({
    resource: 'businesses',
    pagination: { currentPage: page, pageSize },
    sorters: [{ field: sort, order }],
    filters: [
      { field: 'q', operator: 'contains', value: q || undefined },
      { field: 'status', operator: 'eq', value: status },
      { field: 'primaryCategoryId', operator: 'eq', value: categoryId },
      { field: 'localAreaId', operator: 'eq', value: localAreaId },
      { field: 'featured', operator: 'eq', value: featured },
    ],
    queryOptions: { retry: false, placeholderData: (previous) => previous },
    errorNotification: false,
  });
  // Names for the filter chips, looked up by id rather than by loading every term.
  const categoryNames = useTermNames('categories', categoryId ? [categoryId] : []).names;
  const areaNames = useTermNames('areas', localAreaId ? [localAreaId] : []).names;

  /** The filters in force, so they can be seen and removed one at a time (DIR 006). */
  const chips: { key: string; label: string }[] = [
    ...(q ? [{ key: 'q', label: `“${q}”` }] : []),
    ...(status ? [{ key: 'status', label: `Status: ${status}` }] : []),
    ...(categoryId ? [{ key: 'categoryId', label: `Category: ${categoryNames[categoryId]?.name ?? '…'}` }] : []),
    ...(localAreaId ? [{ key: 'localAreaId', label: `Area: ${areaNames[localAreaId]?.name ?? '…'}` }] : []),
    ...(featured ? [{ key: 'featured', label: featured === 'yes' ? 'Featured now' : 'Not featured' }] : []),
  ];
  const clearFilters = () => setParams(new URLSearchParams(sortKey === DEFAULT_SORT ? {} : { sort, order }));

  const error = list.query.error;
  const rows = list.result?.data ?? [];
  const total = list.result?.total ?? 0;
  const loading = list.query.isPending || list.query.isPlaceholderData;

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Business' }, { label: 'Businesses' }]}
        title="Businesses"
        description="Every Adelaide listing, its publishing state and where it appears in the directory."
        actions={
          canCreate ? (
            <Link to="/businesses/new">
              <Button type="primary" icon={<PlusOutlined aria-hidden="true" />}>
                Add business
              </Button>
            </Link>
          ) : null
        }
      />
      <TableCard
        toolbar={
          <>
            <Input.Search
              aria-label="Search businesses"
              placeholder="Search name, suburb, postcode or phone"
              allowClear
              value={typed}
              loading={loading && typed !== ''}
              onChange={(event) => setTyped(event.target.value)}
              onSearch={(value) => setParam('q', value.trim() || undefined)}
              style={{ width: 280 }}
            />
            <Select aria-label="Filter by status" allowClear placeholder="Any status" value={status} onChange={(value) => setParam('status', value)} style={{ width: 150 }} options={STATUSES.map((value) => ({ value, label: value }))} />
            <TermSelect kind="categories" includeInactive allowClear aria-label="Filter by category" placeholder="Any category" value={categoryId} onChange={(value) => setParam('categoryId', (value as string | undefined) ?? undefined)} style={{ width: 190 }} />
            <TermSelect kind="areas" includeInactive allowClear aria-label="Filter by local area" placeholder="Any area" value={localAreaId} onChange={(value) => setParam('localAreaId', (value as string | undefined) ?? undefined)} style={{ width: 170 }} />
            <Select
              aria-label="Filter by featured placement"
              allowClear
              placeholder="Featured"
              value={featured}
              onChange={(value) => setParam('featured', value)}
              style={{ width: 150 }}
              options={[
                { value: 'yes', label: 'Featured now' },
                { value: 'no', label: 'Not featured' },
              ]}
            />
            <Select
              aria-label="Sort by"
              value={sortKey}
              onChange={(value: SortKey) => {
                const [field, direction] = value.split(':');
                const next = new URLSearchParams(params);
                next.set('sort', field!);
                next.set('order', direction!);
                next.delete('page');
                setParams(next);
              }}
              style={{ width: 190 }}
              options={Object.entries(SORTS).map(([value, label]) => ({ value, label: `Sort: ${label}` }))}
            />
          </>
        }
        summary={list.query.isSuccess ? `${total} listing${total === 1 ? '' : 's'}${chips.length > 0 ? ' match these filters' : ''}` : undefined}
      >
        {chips.length > 0 && (
          <div className="ms-table-toolbar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Filters:
            </Typography.Text>
            {chips.map((chip) => (
              <Tag key={chip.key} closable onClose={() => setParam(chip.key, undefined)} closeIcon aria-label={`Remove filter ${chip.label}`}>
                {chip.label}
              </Tag>
            ))}
            <Button type="link" size="small" style={{ paddingInline: 0 }} onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}

        {/* A failed request is never reported as "no businesses" (SRS DIR 006). */}
        {list.query.isError && (
          <Alert
            type="error"
            showIcon
            role="alert"
            style={{ margin: '14px 16px 0' }}
            message={isApiError(error) ? error.userMessage : 'We could not load the businesses.'}
            description={isApiError(error) ? error.reference : null}
            action={<Button onClick={() => void list.query.refetch()}>Try again</Button>}
          />
        )}

        <Table<BusinessListItem>
          rowKey="id"
          className="ms-scroll-table"
          loading={loading}
          dataSource={rows}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: PAGE_SIZES,
            showTotal: (count, [from, to]) => `${from}–${to} of ${count}`,
            onChange: (next, size) => {
              // A size change is not a page change: treating it as one would
              // move the reader to a page they did not ask for.
              // `setParam` already returns to page 1 for any key but the page.
              if (size !== pageSize) setParam('pageSize', size === PAGE_SIZE ? undefined : String(size));
              else setParam('page', String(next));
            },
          }}
          scroll={{ x: 900 }}
          columns={[
            {
              title: 'Business',
              dataIndex: 'name',
              render: (name: string, row) => (
                <span>
                  <Space size={6}>
                    <Link to={`/businesses/${encodeURIComponent(row.id)}`} style={{ fontWeight: 500 }}>
                      {name}
                    </Link>
                    {row.duplicateFlagged && (
                      <Tooltip title="Another live listing has the same name">
                        <WarningOutlined style={{ color: brand.warning }} aria-label="Possible duplicate" />
                      </Tooltip>
                    )}
                  </Space>
                  {row.suburb && (
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                      {row.suburb}
                    </Typography.Text>
                  )}
                </span>
              ),
            },
            { title: 'Category', dataIndex: 'primaryCategoryName', width: 170, responsive: ['lg'] },
            { title: 'Area', dataIndex: 'localAreaName', width: 150, responsive: ['lg'] },
            {
              title: 'Status',
              dataIndex: 'status',
              width: 170,
              render: (value: BusinessStatus, row) => (
                <Space size={4} wrap>
                  <StatusTag status={value} />
                  {value === 'draft' && !row.publishable && <Pill tone="attention">not ready</Pill>}
                </Space>
              ),
            },
            {
              title: 'Featured',
              dataIndex: 'featuredNow',
              width: 110,
              responsive: ['md'],
              render: (value: boolean) => (value ? <Pill tone="progress">Featured</Pill> : <Typography.Text type="secondary">—</Typography.Text>),
            },
            { title: 'Updated', dataIndex: 'updatedAt', width: 180, responsive: ['md'], render: formatDateTime },
            {
              title: <span className="sr-only">Actions</span>,
              width: 60,
              fixed: 'right',
              render: (_: unknown, row) => (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      { key: 'edit', label: <Link to={`/businesses/${encodeURIComponent(row.id)}`}>{canWrite ? 'Edit listing' : 'View listing'}</Link> },
                      ...(row.status === 'published'
                        ? [
                            {
                              key: 'view',
                              label: (
                                <a href={`${import.meta.env.VITE_PUBLIC_SITE_URL ?? ''}/business/${row.slug}`} target="_blank" rel="noreferrer noopener">
                                  View on the website
                                </a>
                              ),
                            },
                          ]
                        : []),
                    ],
                  }}
                >
                  <Button type="text" icon={<MoreOutlined aria-hidden="true" />} aria-label={`Actions for ${row.name}`} />
                </Dropdown>
              ),
            },
          ]}
          locale={{
            emptyText: list.query.isSuccess ? (
              chips.length > 0 ? (
                <EmptyState title="No businesses match these filters" description="Try a different search, or remove a filter to widen the results." action={{ label: 'Clear filters', onClick: clearFilters }} />
              ) : (
                <EmptyState title="No businesses yet" description="Add the first Adelaide listing. It stays a private draft until you publish it." action={canCreate ? { label: 'Add business', onClick: () => navigate('/businesses/new') } : undefined} />
              )
            ) : (
              ' '
            ),
          }}
        />
      </TableCard>
    </div>
  );
}
