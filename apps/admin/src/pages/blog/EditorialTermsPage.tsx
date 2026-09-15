import { App, Button, Input, Select, Switch, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { Link } from 'react-router';
import { blogApi, type BlogTerm } from '@/api/blog';
import { isApiError } from '@/api/errors';
import { ErrorState, ListEmpty, PageHeader, StatusTag, TableCard } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { EDITORIAL_TERM_PERMISSIONS, type EditorialTermsConfig } from './editorial-configs';
import { useCapabilities } from '@/auth/access-control';

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['q', 'status'] as const;

/**
 * Blog categories and tags (SRS BLOG 001/005). The list activates and
 * deactivates; creating and editing happen on their own routes, so a landing
 * page's Markdown is written at a readable width rather than in a dialog.
 */
export function EditorialTermsPage({ config }: { config: EditorialTermsConfig }) {
  useDocumentTitle(config.title);
  const api = blogApi();
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const { can } = useCapabilities();
  const mayCreate = can(EDITORIAL_TERM_PERMISSIONS[config.kind].create);
  const mayUpdate = can(EDITORIAL_TERM_PERMISSIONS[config.kind].update);
  const list = useListParams(FILTERS);
  const q = list.get('q') ?? '';
  const status = list.get('status') as 'active' | 'inactive' | undefined;
  const [state, reload] = useAsync<BlogTerm[]>((signal) => api.listTerms(config.kind, { q: q || undefined, status }, signal), [config.kind, q, status]);
  const listHref = `/${config.kind}`;

  const toggleActive = async (row: BlogTerm) => {
    try {
      await api.setTermActive(config.kind, row.id, !row.active, row.version);
      message.success(row.active ? 'Deactivated' : 'Activated');
      reload();
    } catch (error) {
      if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
      else message.error(errorMessage(error));
    }
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Editorial' }, { label: config.title }]}
        title={config.title}
        description={config.intro}
        actions={
          mayCreate ? (
            <Link to={`${listHref}/new`}>
              <Button type="primary" icon={<PlusOutlined aria-hidden="true" />}>
                New {config.singular.toLowerCase()}
              </Button>
            </Link>
          ) : null
        }
      />
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      <TableCard
        toolbar={
          <>
            <Input.Search
              aria-label={`Search ${config.title.toLowerCase()}`}
              placeholder={`Search ${config.title.toLowerCase()}`}
              allowClear
              defaultValue={q}
              onSearch={(value) => list.set('q', value.trim() || undefined)}
              style={{ width: 260 }}
            />
            <Select
              aria-label="Filter by status"
              allowClear
              placeholder="Any status"
              value={status}
              onChange={(value) => list.set('status', value)}
              style={{ width: 150 }}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          </>
        }
      >
      <Table<BlogTerm>
        rowKey="id"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data : []}
        pagination={false}
        scroll={{ x: 700 }}
        columns={[
          { title: 'Name', render: (_: unknown, row) => <Link to={`${listHref}/${row.id}`}>{row.name}</Link> },
          { title: 'Articles', dataIndex: 'postCount' },
          { title: 'Status', dataIndex: 'active', render: (v: boolean) => <StatusTag status={v ? 'active' : 'inactive'} /> },
          { title: 'Updated', dataIndex: 'updatedAt', render: formatDateTime },
          {
            title: <span className="sr-only">Actions</span>,
            render: (_: unknown, row) => <Switch checked={row.active} disabled={!mayUpdate} onChange={() => void toggleActive(row)} aria-label={`${row.active ? 'Deactivate' : 'Activate'} ${row.name}`} />,
          },
        ]}
        locale={{
          emptyText: (
            <ListEmpty
              state={state}
              filtered={list.filtered}
              noun={config.title.toLowerCase()}
              onClear={list.clear}
              empty={{ title: `No ${config.title.toLowerCase()} yet`, description: config.intro }}
            />
          ),
        }}
      />
      </TableCard>
    </div>
  );
}
