import { Button, Input, Select, Space, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link } from 'react-router';
import { POST_STATUSES, blogApi, type PostStatus, type PostSummary } from '@/api/blog';
import { formatDateTime } from '@/shared/format';
import { useAsync } from '@/shared/useAsync';
import { ErrorState, ListEmpty, PageHeader, Pill, StatusTag, TableCard } from '@/components/ui';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';


/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['q', 'status', 'authorId', 'categoryId', 'tagId'] as const;

/** Article index (SRS BLOG 001–002). Filters live in the URL so a shared link reproduces the view. */
export function PostsPage() {
  useDocumentTitle('Articles');
  const api = blogApi();
  const list = useListParams(FILTERS);
  const { can } = useCapabilities();
  const canWrite = can(PERMISSION.postsCreate);
  const status = (list.get('status') as PostStatus | null) ?? undefined;
  const q = list.get('q') ?? '';
  const authorId = list.get('authorId');
  const categoryId = list.get('categoryId');
  const tagId = list.get('tagId');
  const page = list.page;
  const [state, reload] = useAsync(
    (signal) => api.listPosts({ status, q: q || undefined, authorId, categoryId, tagId, page, pageSize: list.pageSize }, signal),
    [status, q, authorId, categoryId, tagId, page, list.pageSize],
  );
  // The three sets an article is classified by. They are small and rarely
  // change, so they are read once and reused by all three pickers.
  const [authors] = useAsync((signal) => api.listAuthors({}, signal), []);
  const [categories] = useAsync((signal) => api.listTerms('blog-categories', {}, signal), []);
  const [tags] = useAsync((signal) => api.listTerms('blog-tags', {}, signal), []);

  /** Options for a picker, with the record's own name as the label. */
  const options = <T extends { id: string; name?: string; displayName?: string }>(rows: T[]) =>
    rows.map((row) => ({ value: row.id, label: row.displayName ?? row.name ?? row.id }));


  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Editorial' }, { label: 'Articles' }]}
        title="Articles"
        description="Write, schedule and publish blog articles. Drafts stay private until you publish them."
        actions={
          <>
            {canWrite && (
          <Link to="/posts/new">
            <Button type="primary" icon={<PlusOutlined aria-hidden="true" />}>
              New article
            </Button>
          </Link>
        )}
          </>
        }
      />
      <TableCard
        toolbar={
          <>
            <Input.Search aria-label="Search articles" placeholder="Search by title" allowClear defaultValue={q} onSearch={(v) => list.set('q', v.trim() || undefined)} style={{ width: 260 }} />
            <Select aria-label="Filter by status" allowClear placeholder="All statuses" value={status} onChange={(v) => list.set('status', v)} style={{ width: 160 }} options={POST_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} />
            <Select
              aria-label="Filter by author"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Any author"
              value={authorId}
              onChange={(v) => list.set('authorId', v)}
              style={{ width: 180 }}
              loading={authors.status === 'loading'}
              options={authors.status === 'ready' ? options(authors.data) : []}
            />
            <Select
              aria-label="Filter by category"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Any category"
              value={categoryId}
              onChange={(v) => list.set('categoryId', v)}
              style={{ width: 180 }}
              loading={categories.status === 'loading'}
              options={categories.status === 'ready' ? options(categories.data) : []}
            />
            <Select
              aria-label="Filter by tag"
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Any tag"
              value={tagId}
              onChange={(v) => list.set('tagId', v)}
              style={{ width: 160 }}
              loading={tags.status === 'loading'}
              options={tags.status === 'ready' ? options(tags.data) : []}
            />
          </>
        }
      >
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      <Table<PostSummary>
        rowKey="id"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data.data : []}
        pagination={state.status === 'ready' ? tablePagination(state.data.meta, list) : false}
        scroll={{ x: 900 }}
        columns={[
          { title: 'Title', dataIndex: 'title', render: (v: string, post) => <Link to={`/posts/${encodeURIComponent(post.id)}`}>{v}</Link> },
          { title: 'Author', dataIndex: 'authorName' },
          { title: 'Category', dataIndex: 'categoryName' },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (v: PostStatus, post) => (
              <Space size={4}>
                <StatusTag status={v} />
                {v === 'published' && post.featuredAt && <Pill tone="positive">Featured</Pill>}
                {post.guestPost && <Pill tone="neutral">Guest post</Pill>}
                {v === 'draft' && post.publishFailure && <Pill tone="critical">Couldn’t publish on schedule</Pill>}
                {v === 'draft' && !post.publishFailure && post.publicationBlockers.length > 0 && <Pill tone="attention">Not ready to publish</Pill>}
                {v === 'scheduled' && post.scheduledAt && <span>{formatDateTime(post.scheduledAt)}</span>}
              </Space>
            ),
          },
          { title: 'Updated', dataIndex: 'updatedAt', render: formatDateTime },
        ]}
        locale={{
          emptyText: (
            <ListEmpty
              state={state}
              filtered={list.filtered}
              noun="articles"
              onClear={list.clear}
              empty={{
                title: 'No articles yet',
                // An article needs an author, so say so before the writer
                // discovers it halfway through the editor.
                description: authors.status === 'ready' && authors.data.length === 0 ? 'Create an author first, then write the first article.' : 'Write the first article for the Adelaide Sphere blog.',
              }}
            />
          ),
        }}
      />
      </TableCard>
    </div>
  );
}
