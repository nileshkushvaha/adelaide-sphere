import { App, Button, Input, Popconfirm, Select, Space, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { Link } from 'react-router';
import { isApiError } from '@/api/errors';
import { REDIRECT_KIND_LABELS, seoApi, type Redirect, type RedirectKind } from '@/api/seo';
import { EmptyState, ErrorState, PageHeader, StatusTag, TableCard } from '@/components/ui';
import { RedirectPreviewPanel } from './RedirectPreviewPanel';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { useBusy } from '@/shared/useBusy';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['q', 'kind', 'active'] as const;

/**
 * Redirect rules (SRS SEO 004). Slug changes create these automatically; this
 * screen covers pages that moved or were deliberately removed.
 */
export function RedirectsPage() {
  useDocumentTitle('SEO redirects');
  const api = seoApi();
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const { can } = useCapabilities();
  const mayCreate = can(PERMISSION.redirectsCreate);
  const mayUpdate = can(PERMISSION.redirectsUpdate);
  const mayDelete = can(PERMISSION.redirectsDelete);
  const list = useListParams(FILTERS);
  const search = list.get('q') ?? '';
  const kind = list.get('kind') as RedirectKind | undefined;
  const active = list.get('active');
  const activeOnly = active === undefined ? undefined : active === 'yes';
  const page = list.page;
  const [state, reload] = useAsync(
    (signal) => api.list({ q: search || undefined, kind, isActive: activeOnly, page, pageSize: list.pageSize }, signal),
    [search, kind, active, page, list.pageSize],
  );
  // Popconfirm shows a spinner and blocks a second click only while its
  // `onConfirm` promise is pending, so these must return the promise.
  const [busy, run] = useBusy();

  const setActive = (row: Redirect, active: boolean) =>
    run(async () => {
      try {
        await api.setActive(row.id, active);
        message.success(active ? 'Redirect switched on. It reaches visitors within about ten seconds.' : 'Redirect switched off. It stops reaching visitors within about ten seconds.');
        reload();
      } catch (error) {
        if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
        else message.error(errorMessage(error));
      }
    });

  const remove = (row: Redirect) =>
    run(async () => {
      try {
        await api.remove(row.id);
        message.success('Redirect deleted.');
        reload();
      } catch (error) {
        if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
        else message.error(errorMessage(error));
      }
    });

  const rows = state.status === 'ready' ? state.data.data : [];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Configuration' }, { label: 'SEO redirects' }]}
        title="SEO redirects"
        description="Old addresses that forward visitors and search engines. Slug changes add these automatically."
        actions={
          mayCreate ? (
            <Link to="/redirects/new">
              <Button type="primary" icon={<PlusOutlined aria-hidden="true" />}>
                New redirect
              </Button>
            </Link>
          ) : null
        }
      />
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}

      <RedirectPreviewPanel />

      <TableCard
        toolbar={
          <>
            <Input.Search
              allowClear
              placeholder="Search a path"
              defaultValue={search}
              onSearch={(value) => list.set('q', value.trim() || undefined)}
              style={{ width: 280 }}
              aria-label="Search redirects"
            />
            <Select
              allowClear
              aria-label="Filter by type"
              placeholder="Any type"
              value={kind}
              onChange={(value) => list.set('kind', value)}
              style={{ width: 210 }}
              options={(Object.keys(REDIRECT_KIND_LABELS) as RedirectKind[]).map((value) => ({ value, label: REDIRECT_KIND_LABELS[value] }))}
            />
            <Select
              allowClear
              aria-label="Filter by state"
              placeholder="On and off"
              value={active}
              onChange={(value) => list.set('active', value)}
              style={{ width: 150 }}
              options={[
                { value: 'yes', label: 'On' },
                { value: 'no', label: 'Switched off' },
              ]}
            />
          </>
        }
        summary={state.status === 'ready' ? `${rows.length} of ${state.data.meta.total} redirect${state.data.meta.total === 1 ? '' : 's'}` : undefined}
      >
      <Table<Redirect>
        rowKey="id"
        loading={state.status === 'loading'}
        dataSource={rows}
        scroll={{ x: 900 }}
        pagination={
          state.status === 'ready' ? tablePagination(state.data.meta, list) : false
        }
        locale={{
          emptyText: state.status === 'ready' ? <EmptyState title="No redirects" description="Nothing has moved yet. Redirects appear here when a published address changes." /> : ' ',
        }}
        columns={[
          { title: 'From', dataIndex: 'sourcePath', render: (value: string) => <code>{value}</code> },
          {
            title: 'To',
            render: (_: unknown, row) => (row.targetPath ? <code>{row.targetPath}</code> : <Typography.Text type="secondary">Removed permanently</Typography.Text>),
          },
          // Type and state are two different facts, so they are two columns:
          // "active" used to mean "not a 410", which is a different thing again.
          { title: 'Type', width: 190, render: (_: unknown, row) => REDIRECT_KIND_LABELS[row.kind] },
          { title: 'State', width: 130, render: (_: unknown, row) => <StatusTag status={row.isActive ? 'active' : 'inactive'} /> },
          { title: 'Reason', dataIndex: 'reason', ellipsis: true, render: (value: string | null) => value ?? '—' },
          { title: 'Created', dataIndex: 'createdAt', width: 180, render: formatDateTime },
          {
            title: <span className="sr-only">Actions</span>,
            width: 210,
            render: (_: unknown, row) => (
              <Space size={4} wrap>
                {!mayUpdate ? null : row.isActive ? (
                  <Popconfirm
                    title="Switch this redirect off?"
                    description={
                      row.resourceType
                        ? 'This one was created when a published address changed, so switching it off leaves the old address genuinely broken for anyone who saved it.'
                        : 'Visitors following the old address will reach the page itself, or a “page not found” if there is nothing there. It takes effect within about ten seconds.'
                    }
                    okText="Switch off"
                    cancelText="Leave it on"
                    onConfirm={() => setActive(row, false)}
                    okButtonProps={{ loading: busy }}
                  >
                    <Button type="link" aria-label={`Switch off the redirect from ${row.sourcePath}`}>
                      Switch off
                    </Button>
                  </Popconfirm>
                ) : (
                  <Button type="link" aria-label={`Switch on the redirect from ${row.sourcePath}`} onClick={() => void setActive(row, true)} disabled={busy}>
                    Switch on
                  </Button>
                )}
                {mayDelete && (
                <Popconfirm
                  title="Delete this redirect?"
                  description="The rule and its history are removed. To stop it temporarily, switch it off instead."
                  okText="Delete redirect"
                  cancelText="Keep it"
                  okButtonProps={{ danger: true, loading: busy }}
                  onConfirm={() => remove(row)}
                >
                  <Button type="link" danger aria-label={`Delete redirect from ${row.sourcePath}`}>
                    Delete
                  </Button>
                </Popconfirm>
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
