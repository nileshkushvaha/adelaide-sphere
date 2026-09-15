import type { ReactNode } from 'react';
import { App, Button, Input, Select, Switch, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { Link, useNavigate } from 'react-router';
import { taxonomyApi, type TermItem, type TermKind, type TermListItem, type TermListQuery } from '@/api/taxonomy';
import { isApiError } from '@/api/errors';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { ErrorState, ListEmpty, PageHeader, StatusTag, TableCard } from '@/components/ui';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { useCapabilities } from '@/auth/access-control';
import { TERM_PERMISSIONS } from './configs';

export interface TermField {
  name: string;
  label: string;
  input: 'text' | 'textarea' | 'number' | 'tags' | 'parent' | 'permalink' | 'media' | 'icon';
  /** A heading rendered above this field, opening a new group of fields. */
  section?: { title: string; description?: string };
  /** For `media`: the record key holding the resolved image, for the preview. */
  preview?: string;
  /** For `media`: what the empty frame says, and what clearing means. */
  emptyLabel?: string;
  clearLabel?: string;
  aspectRatio?: string;
  required?: boolean;
  max?: number;
  help?: string;
  /** An example of what to type; never a repeat of the label. */
  placeholder?: string;
  /** For `permalink`: the public path the address sits under, e.g. `/business/category`. */
  base?: string;
}

export interface TermsPageConfig {
  kind: TermKind;
  title: string;
  singular: string;
  intro: string;
  fields: TermField[];
  columns?: { title: string; render: (item: TermListItem) => ReactNode }[];
}

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['q', 'status'] as const;

/**
 * Generic list and activate/deactivate screen for the three taxonomy resources
 * (SRS CFG 003, ADM 002). State lives in the URL so refresh and back preserve
 * the filters; creating and editing happen on their own routes
 * (`TermEditorPage`), and activation stays a confirmation because it changes
 * what the public site offers.
 */
export function TermsPage({ config }: { config: TermsPageConfig }) {
  useDocumentTitle(config.title);
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { mutate: onAuthError } = useOnError();
  const api = taxonomyApi<TermItem>(config.kind);
  const { can } = useCapabilities();
  const mayCreate = can(TERM_PERMISSIONS[config.kind].create);
  const mayUpdate = can(TERM_PERMISSIONS[config.kind].update);
  const list = useListParams<(typeof FILTERS)[number], 'sort' | 'order'>(FILTERS);
  const page = list.page;
  const q = list.get('q') ?? '';
  const status = (list.get('status') as 'active' | 'inactive' | null) ?? undefined;
  const sort = (list.get('sort') as TermListQuery['sort']) ?? 'name';
  const order = (list.get('order') as 'asc' | 'desc') ?? 'asc';
  const [state, reload] = useAsync(() => api.list({ page, pageSize: list.pageSize, q: q || undefined, status, sort, order }), [config.kind, page, list.pageSize, q, status, sort, order]);

  const listHref = `/${config.kind}`;

  /** Ant's own name for the direction, for the column currently sorted. */
  const sortColumn = (field: string) => (sort === field ? (order === 'desc' ? ('descend' as const) : ('ascend' as const)) : null);


  const toggleActive = (item: TermListItem) => {
    const next = !item.active;
    modal.confirm({
      title: `${next ? 'Activate' : 'Deactivate'} “${item.name}”?`,
      content: next ? 'It becomes selectable again.' : 'It is removed from new selections; existing links are preserved. Terms still used by active listings cannot be deactivated.',
      okText: next ? 'Activate' : 'Deactivate',
      okButtonProps: { danger: !next },
      onOk: async () => {
        try {
          await api.setActive(item.id, next, item.version);
          message.success(next ? 'Activated' : 'Deactivated');
          reload();
        } catch (error) {
          if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
          else message.error(errorMessage(error));
        }
      },
    });
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Business' }, { label: config.title }]}
        title={config.title}
        description={<>{config.intro}</>}
        actions={
          mayCreate ? (
            <Link to={`${listHref}/new`}>
              <Button type="primary" icon={<PlusOutlined aria-hidden="true" />}>
                Add {config.singular.toLowerCase()}
              </Button>
            </Link>
          ) : null
        }
      />
      <TableCard
        toolbar={
          <>
            <Input.Search aria-label="Search" placeholder="Search by name" allowClear defaultValue={q} onSearch={(v) => list.set('q', v.trim() || undefined)} style={{ width: 260 }} />
            <Select aria-label="Filter by status" allowClear placeholder="All" value={status} onChange={(v) => list.set('status', v)} style={{ width: 140 }} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          </>
        }
      >
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      <Table<TermListItem>
        rowKey="id"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data.data : []}
        // Sorting is the table's own affordance, and it writes to the same
        // address bar as the filters, so a sorted view can be linked to.
        // Ant calls this for page changes too; those belong to the pagination
        // control, so only a sort is handled here, or a page click would reset
        // the list to page 1.
        onChange={(_pagination, _filters, sorter, extra) => {
          if (extra.action !== 'sort') return;
          const next = Array.isArray(sorter) ? sorter[0] : sorter;
          const field = typeof next?.field === 'string' ? next.field : undefined;
          list.setSort(field && next?.order ? field : undefined, next?.order === 'descend' ? 'desc' : 'asc');
        }}
        pagination={state.status === 'ready' ? tablePagination(state.data.meta, list) : false}
        scroll={{ x: 760 }}
        columns={[
          {
            title: 'Name',
            dataIndex: 'name',
            sorter: true,
            sortOrder: sortColumn('name'),
            render: (value: string, item) => (
              <span>
                <Link to={`${listHref}/${item.id}`} style={{ fontWeight: 600 }}>
                  {value}
                </Link>
                {'parentName' in item && item.parentName && (
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                    under {item.parentName}
                  </Typography.Text>
                )}
              </span>
            ),
          },
          ...(config.columns ?? []).map((c) => ({ title: c.title, render: (_: unknown, item: TermListItem) => c.render(item) })),
          {
            title: 'Listings',
            dataIndex: 'listingCount',
            width: 110,
            align: 'right' as const,
            // What "in use" means here is the same rule that refuses to
            // deactivate a term: draft and published listings, not archived.
            render: (value: number) => (value === 0 ? <Typography.Text type="secondary">None</Typography.Text> : value),
          },
          { title: 'Status', dataIndex: 'active', width: 110, render: (v: boolean) => <StatusTag status={v ? 'active' : 'inactive'} /> },
          { title: 'Updated', dataIndex: 'updatedAt', width: 170, sorter: true, sortOrder: sortColumn('updatedAt'), render: formatDateTime },
          {
            title: <span className="sr-only">Actions</span>,
            width: 80,
            render: (_: unknown, item: TermListItem) => <Switch checked={item.active} disabled={!mayUpdate} onChange={() => toggleActive(item)} aria-label={`${item.active ? 'Deactivate' : 'Activate'} ${item.name}`} />,
          },
        ]}
        locale={{
          emptyText: (
            <ListEmpty
              state={state}
              filtered={list.filtered}
              noun={config.title.toLowerCase()}
              onClear={list.clear}
              empty={{ title: `No ${config.title.toLowerCase()} yet`, description: config.intro, action: mayCreate ? { label: `Add ${config.singular.toLowerCase()}`, onClick: () => navigate(`${listHref}/new`) } : undefined }}
            />
          ),
        }}
      />
      </TableCard>
    </div>
  );
}
