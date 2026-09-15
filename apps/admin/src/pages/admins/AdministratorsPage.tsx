import { Button, Input, Select, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link } from 'react-router';
import { adminsApi, type AdminListItem } from '@/api/admins';
import { authorizationApi } from '@/api/authorization';
import { ErrorState, ListEmpty, PageHeader, StatusTag, TableCard } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { useAsync } from '@/shared/useAsync';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['q', 'status', 'role'] as const;

/**
 * Administrators (SRS ADM 003, RBAC 004). Inviting happens on its own route so
 * roles are chosen deliberately rather than assumed; this screen lists, filters
 * and links to each account.
 */
export function AdministratorsPage() {
  useDocumentTitle('Administrators');
  const { can } = useCapabilities();
  const mayInvite = can(PERMISSION.adminsCreate);
  const list = useListParams<(typeof FILTERS)[number], 'sort' | 'order'>(FILTERS);
  const page = list.page;
  const q = list.get('q') ?? '';
  const status = (list.get('status') as AdminListItem['status'] | null) ?? undefined;
  const sort = (list.get('sort') as 'createdAt' | 'displayName' | 'email' | 'lastLoginAt' | undefined) ?? 'createdAt';
  const order = (list.get('order') as 'asc' | 'desc' | undefined) ?? 'desc';
  const role = list.get('role');
  const [state, reload] = useAsync(() => adminsApi.list({ page, pageSize: list.pageSize, q: q || undefined, status, role, sort, order }), [page, list.pageSize, q, status, role, sort, order]);

  /** Ant's own name for the direction, for the column currently sorted. */
  const sortColumn = (field: string) => (sort === field ? (order === 'desc' ? ('descend' as const) : ('ascend' as const)) : null);
  // Roles arrive on an account as keys; a reader recognises the name they chose,
  // so the list is fetched once to translate them. A key that no longer resolves
  // is shown as it is rather than hidden.
  const [rolesState] = useAsync((signal) => authorizationApi().listAllRoles(signal), []);
  const roleName = (key: string) => (rolesState.status === 'ready' ? rolesState.data.data.find((role) => role.key === key)?.name : undefined) ?? key;


  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Configuration' }, { label: 'Administrators' }]}
        title="Administrators"
        description="Everyone who can sign in. Invited accounts become active once a password is set."
        actions={
          mayInvite ? (
            <Link to="/admins/new">
              <Button type="primary" icon={<PlusOutlined aria-hidden="true" />}>
                New administrator
              </Button>
            </Link>
          ) : null
        }
      />
      <TableCard
        toolbar={
          <>
            <Input.Search aria-label="Search by email or name" placeholder="Search email or name" allowClear defaultValue={q} onSearch={(v) => list.set('q', v.trim() || undefined)} style={{ width: 280 }} />
            <Select aria-label="Filter by status" allowClear placeholder="All statuses" value={status} onChange={(v) => list.set('status', v)} style={{ width: 160 }} options={[{ value: 'invited', label: 'Invited' }, { value: 'active', label: 'Active' }, { value: 'disabled', label: 'Disabled' }]} />
            {/* The roles are already loaded to name them in the table, so the
                filter costs no extra request. */}
            <Select
              aria-label="Filter by role"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Any role"
              value={role}
              onChange={(value) => list.set('role', value)}
              style={{ width: 200 }}
              loading={rolesState.status === 'loading'}
              options={rolesState.status === 'ready' ? rolesState.data.data.map((entry) => ({ value: entry.key, label: entry.name })) : []}
            />
          </>
        }
      >
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      <Table<AdminListItem>
        rowKey="id"
        className="ms-scroll-table"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data.data : []}
        pagination={state.status === 'ready' ? tablePagination(state.data.meta, list) : false}
        scroll={{ x: 720 }}
        // Sorting writes to the address bar with the filters, so an ordered
        // view can be linked to.
        // Ant calls this for page changes too; those belong to the pagination
        // control, so only a sort is handled here, or a page click would reset
        // the list to page 1.
        onChange={(_pagination, _filters, sorter, extra) => {
          if (extra.action !== 'sort') return;
          const next = Array.isArray(sorter) ? sorter[0] : sorter;
          const field = typeof next?.field === 'string' ? next.field : undefined;
          list.setSort(field && next?.order ? field : undefined, next?.order === 'descend' ? 'desc' : 'asc');
        }}
        columns={[
          { title: 'Name', dataIndex: 'displayName', sorter: true, sortOrder: sortColumn('displayName'), render: (v: string, r) => <Link to={`/admins/${r.id}`}>{v}</Link> },
          { title: 'Email', dataIndex: 'email', sorter: true, sortOrder: sortColumn('email') },
          { title: 'Status', dataIndex: 'status', width: 120, render: (v: AdminListItem['status']) => <StatusTag status={v} /> },
          { title: 'Roles', dataIndex: 'roles', render: (v: string[]) => (v.length > 0 ? v.map(roleName).join(', ') : 'None') },
          { title: 'Two-step sign-in', dataIndex: 'totpEnabled', width: 150, render: (v: boolean) => (v ? 'On' : 'Off') },
          { title: 'Last signed in', dataIndex: 'lastLoginAt', width: 190, sorter: true, sortOrder: sortColumn('lastLoginAt'), render: (v: string | null) => (v ? formatDateTime(v) : 'Never') },
        ]}
        locale={{
          emptyText: (
            <ListEmpty state={state} filtered={list.filtered} noun="administrators" onClear={list.clear} empty={{ title: 'No administrators yet', description: 'Invite someone to give them access to this admin.' }} />
          ),
        }}
      />
      </TableCard>
    </div>
  );
}
