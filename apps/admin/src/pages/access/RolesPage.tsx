import { useMemo, useState } from 'react';
import { App, Button, Input, Space, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { useOnError } from '@refinedev/core';
import { authorizationApi, type RoleListItem } from '@/api/authorization';
import { isApiError } from '@/api/errors';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { formatDateTime } from '@/shared/format';
import { ErrorState, ListEmpty, PageHeader, Pill, StatusTag, TableCard } from '@/components/ui';

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['q'] as const;

/**
 * Roles (SRS RBAC 010). Creating and editing appear only with the matching
 * permission; the API refuses either regardless of what is rendered here.
 */
export function RolesPage() {
  useDocumentTitle('Roles');
  const api = useMemo(() => authorizationApi(), []);
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const { can } = useCapabilities();
  const list = useListParams(FILTERS);
  const search = list.get('q') ?? '';
  // The field keeps what is being typed; the address bar keeps what was searched.
  const [q, setQ] = useState(search);
  const page = list.page;

  const [state, reload] = useAsync((signal) => api.listRoles({ page, pageSize: list.pageSize, q: search || undefined }, signal), [page, list.pageSize, search]);

  const remove = async (role: RoleListItem) => {
    try {
      await api.deleteRole(role.id);
      message.success(`Role “${role.name}” deleted`);
      reload();
    } catch (error) {
      if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
      else message.error(errorMessage(error));
    }
  };

  const rows = state.status === 'ready' ? state.data.data : [];
  const meta = state.status === 'ready' ? state.data.meta : undefined;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Configuration' }, { label: 'Roles' }]}
        title="Roles"
        description="Named sets of permissions. An administrator can hold several."
        actions={
          can(PERMISSION.rolesCreate) ? (
            <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} onClick={() => navigate('/roles/new')}>
              New role
            </Button>
          ) : undefined
        }
      />
      <TableCard
        toolbar={
          <Input.Search
            allowClear
            aria-label="Search roles"
            placeholder="Search roles"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onSearch={(value) => list.set('q', value.trim() || undefined)}
            style={{ width: 280 }}
          />
        }
        summary={meta ? `${rows.length} of ${meta.total} role${meta.total === 1 ? '' : 's'}` : undefined}
      >
        {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
        {state.status === 'ready' && rows.length === 0 ? (
          <ListEmpty
            state={state}
            filtered={list.filtered}
            noun="roles"
            onClear={list.clear}
            empty={{ title: 'No roles yet', description: 'A role is a named set of permissions you can give to several administrators at once.' }}
          />
        ) : (
          <Table<RoleListItem>
            rowKey="id"
            dataSource={rows}
            loading={state.status === 'loading'}
            pagination={tablePagination(meta ?? { page, pageSize: list.pageSize, total: 0 }, list)}
            className="ms-scroll-table"
            // A fixed floor rather than max-content: the columns then share the
            // card's width instead of the table dictating it, so nothing is
            // clipped on a desktop and it still scrolls on a phone.
            scroll={{ x: 900 }}
            columns={[
              {
                title: 'Role',
                dataIndex: 'name',
                // Wide enough that the name and its key each stay on one line:
                // a key broken across lines ("moderat or") reads as a typo.
                width: 240,
                render: (_value, role) => (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
                      {role.name}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                      {role.key}
                    </Typography.Text>
                  </Space>
                ),
              },
              { title: 'Description', dataIndex: 'description', ellipsis: true, responsive: ['md'] },
              {
                title: 'Status',
                dataIndex: 'isActive',
                render: (_value, role) => (
                  <Space size={4} wrap>
                    <StatusTag status={role.isActive ? 'active' : 'disabled'} />
                    {/* A protected role cannot be deleted, deactivated or edited by hand (RBAC 011). */}
                    {role.isSystem && <Pill>Built in</Pill>}
                  </Space>
                ),
              },
              { title: 'Permissions', dataIndex: 'permissionCount', width: 120, align: 'right', responsive: ['md'] },
              { title: 'Administrators', dataIndex: 'adminCount', width: 140, align: 'right', responsive: ['md'] },
              { title: 'Last changed', dataIndex: 'updatedAt', width: 190, responsive: ['xl'], render: (value: string) => formatDateTime(value) },
              {
                title: <span className="sr-only">Actions</span>,
                key: 'actions',
                width: 170,
                render: (_value, role) => (
                  <Space>
                    <Button size="small" onClick={() => navigate(`/roles/${role.id}`)}>
                      {can(PERMISSION.rolesUpdate) && !role.isSystem ? 'Edit' : 'View'}
                    </Button>
                    {can(PERMISSION.rolesDelete) && !role.isSystem && role.adminCount === 0 && (
                      <Button
                        size="small"
                        danger
                        aria-label={`Delete ${role.name}`}
                        onClick={() =>
                          modal.confirm({
                            title: `Delete the ${role.name} role?`,
                            content: 'The role and its permissions are removed. No administrator holds it, so nobody loses access. This cannot be undone.',
                            okText: 'Delete role',
                            okButtonProps: { danger: true },
                            cancelText: 'Keep role',
                            onOk: () => remove(role),
                          })
                        }
                      >
                        Delete
                      </Button>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        )}
      </TableCard>
    </>
  );
}
