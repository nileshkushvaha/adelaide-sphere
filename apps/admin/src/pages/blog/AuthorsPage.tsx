import { App, Avatar, Button, Input, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { PlusOutlined, UserOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { Link, useNavigate } from 'react-router';
import { blogApi, type Author } from '@/api/blog';
import { isApiError } from '@/api/errors';
import { ErrorState, ListEmpty, PageHeader, StatusTag, TableCard } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['q', 'status'] as const;

/**
 * Author directory (SRS BLOG 001/004). An author is public attribution only:
 * it grants no access and never shows an administrator's account email.
 */
export function AuthorsPage() {
  useDocumentTitle('Authors');
  const api = blogApi();
  const navigate = useNavigate();
  const { can } = useCapabilities();
  const mayCreate = can(PERMISSION.authorsCreate);
  const mayUpdate = can(PERMISSION.authorsUpdate);
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const list = useListParams(FILTERS);
  const q = list.get('q') ?? '';
  const status = list.get('status') as 'active' | 'inactive' | undefined;
  const [state, reload] = useAsync((signal) => api.listAuthors({ q: q || undefined, status }, signal), [q, status]);
  const authors = state.status === 'ready' ? state.data : [];

  const toggleActive = async (row: Author) => {
    try {
      await api.setAuthorActive(row.id, !row.active, row.version);
      message.success(row.active ? 'Author deactivated' : 'Author activated');
      reload();
    } catch (error) {
      if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
      else message.error(errorMessage(error));
    }
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Editorial', href: '/posts' }, { label: 'Authors' }]}
        title="Authors"
        description="Public bylines and author cards: photo, role, biography, topics and profile links. Authors never sign in."
        actions={
          mayCreate ? (
            <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} onClick={() => navigate('/authors/new')}>
              New author
            </Button>
          ) : null
        }
      />
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      <TableCard
        toolbar={
          <>
            <Input.Search
              allowClear
              placeholder="Search by name or role"
              defaultValue={q}
              onSearch={(value) => list.set('q', value.trim() || undefined)}
              style={{ width: 300 }}
              aria-label="Search authors"
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
      <Table<Author>
        rowKey="id"
        loading={state.status === 'loading'}
        dataSource={authors}
        pagination={false}
        scroll={{ x: 900 }}
        locale={{
          emptyText: (
            <ListEmpty
              state={state}
              filtered={list.filtered}
              noun="authors"
              onClear={list.clear}
              empty={{
                title: 'No authors yet',
                description: 'Create an author before writing an article: every article needs a byline.',
                action: { label: 'New author', onClick: () => navigate('/authors/new') },
              }}
            />
          ),
        }}
        columns={[
          {
            title: 'Author',
            render: (_: unknown, row) => (
              <Space>
                <Avatar src={row.image?.url} size={40} icon={<UserOutlined aria-hidden="true" />} alt="" />
                <span>
                  <Link to={`/authors/${row.id}`} style={{ fontWeight: 600 }}>
                    {row.displayName}
                  </Link>
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                    {row.role ?? 'No role set'}
                  </Typography.Text>
                </span>
              </Space>
            ),
          },
          {
            title: 'Topics',
            render: (_: unknown, row) => (row.expertise.length === 0 ? <Typography.Text type="secondary">—</Typography.Text> : <Space wrap size={4}>{row.expertise.slice(0, 3).map((topic) => <Tag key={topic}>{topic}</Tag>)}</Space>),
          },
          { title: 'Links', render: (_: unknown, row) => row.links.length },
          { title: 'Articles', render: (_: unknown, row) => `${row.publishedPostCount} published / ${row.postCount} total` },
          { title: 'Status', render: (_: unknown, row) => <StatusTag status={row.active ? 'active' : 'inactive'} /> },
          { title: 'Updated', dataIndex: 'updatedAt', render: formatDateTime },
          {
            title: <span className="sr-only">Actions</span>,
            render: (_: unknown, row) => <Switch checked={row.active} disabled={!mayUpdate} onChange={() => void toggleActive(row)} aria-label={`${row.active ? 'Deactivate' : 'Activate'} ${row.displayName}`} />,
          },
        ]}
      />
      </TableCard>
    </div>
  );
}
