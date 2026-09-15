import { useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Select, Space, Table, Tooltip, Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { REVIEW_STATUSES, moderationApi, type AdminComment, type ReviewDecision, type ReviewStatus } from '@/api/moderation';
import { isApiError } from '@/api/errors';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { blogApi } from '@/api/blog';
import { RevealContact } from '@/components/RevealContact';
import { RemoteSelect } from '@/components/RemoteSelect';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useBusy } from '@/shared/useBusy';
import { ErrorState, ListEmpty, PageHeader, StatusTag, TableCard, statusRowClass } from '@/components/ui';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { expandToggle } from '@/components/ui/expandToggle';
import { brand } from '@/config/theme';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';

/**
 * One entry per decision, so the dialog's title, its button and the message
 * afterwards can never describe different actions — they are read from the same
 * row rather than assembled from nested conditions at three call sites.
 */
const DECISIONS: Record<ReviewDecision, { title: string; hint: string; confirm: string; done: string; danger?: boolean; reasonRequired: boolean }> = {
  approve: { title: 'Publish this comment?', hint: 'It appears under the article immediately.', confirm: 'Publish comment', done: 'Comment published.', reasonRequired: false },
  reject: { title: 'Reject this comment?', hint: 'It stays hidden. The original text is kept for the record.', confirm: 'Reject comment', done: 'Comment rejected.', danger: true, reasonRequired: true },
  spam: { title: 'Mark this comment as spam?', hint: 'Same as rejecting, but recorded as spam for abuse signals.', confirm: 'Mark as spam', done: 'Comment marked as spam.', danger: true, reasonRequired: true },
};

/**
 * The first line of what is being judged.
 *
 * The queues carried Publish, Reject and Spam on every row while showing not
 * one word of the text those buttons decide about: the only way to read a
 * submission was to expand it, one at a time. A moderator can now recognise
 * obvious spam from the row, and still expand for anything that needs the whole
 * thing.
 */
function excerpt(text: string, limit = 120): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > limit ? `${line.slice(0, limit - 1)}…` : line;
}

const FILTERS = ['status', 'reported', 'postId', 'id'] as const;

/** Comment moderation (SRS COM 001): the same states and rules as reviews. */
export function CommentsPage() {
  useDocumentTitle('Comments');
  const { can } = useCapabilities();
  const mayModerate = can(PERMISSION.commentsModerate);
  const mayRedact = can(PERMISSION.commentsRedact);
  const mayReply = can(PERMISSION.commentsReply);
  const api = moderationApi();
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const list = useListParams(FILTERS);
  const status = list.get('status') as ReviewStatus | undefined;
  const reported = list.get('reported') === 'true';
  const page = list.page;
  const postId = list.get('postId');
  // Set when an abuse report links straight to the item it is about.
  const id = list.get('id');
  const [state, reload] = useAsync((signal) => api.listComments({ id, status, reported: reported || undefined, postId, page, pageSize: list.pageSize }, signal), [id, status, reported, postId, page, list.pageSize]);
  const [pending, setPending] = useState<{ comment: AdminComment; decision: ReviewDecision } | null>(null);
  const [redacting, setRedacting] = useState<AdminComment | null>(null);
  const [replying, setReplying] = useState<AdminComment | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busy, run] = useBusy();
  const [decisionForm] = Form.useForm<{ reason?: string }>();
  const [redactForm] = Form.useForm<{ publicText: string; reason: string }>();
  const [replyForm] = Form.useForm<{ text: string }>();

  const handleError = (error: unknown) => {
    if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
    else if (isApiError(error) && (error.code === 'STALE_VERSION' || error.code === 'INVALID_STATE')) setDialogError(`${error.userMessage} Reload the queue to see the current state.`);
    else setDialogError(errorMessage(error));
  };

  const submitDecision = () =>
    run(async () => {
      if (!pending) return;
      setDialogError(null);
      const values = await decisionForm.validateFields().catch(() => null);
      if (!values) return;
      try {
        await api.decideComment(pending.comment.id, pending.decision, { expectedVersion: pending.comment.version, reason: values.reason || undefined });
        message.success(DECISIONS[pending.decision].done);
        setPending(null);
        decisionForm.resetFields();
        reload();
      } catch (error) {
        handleError(error);
      }
    });

  const submitRedaction = () =>
    run(async () => {
      if (!redacting) return;
      setDialogError(null);
      const values = await redactForm.validateFields().catch(() => null);
      if (!values) return;
      try {
        await api.redactComment(redacting.id, { expectedVersion: redacting.version, publicText: values.publicText?.trim() ? values.publicText : null, reason: values.reason });
        message.success('Published text updated.');
        setRedacting(null);
        redactForm.resetFields();
        reload();
      } catch (error) {
        handleError(error);
      }
    });

  const submitReply = () =>
    run(async () => {
      if (!replying) return;
      setDialogError(null);
      const values = await replyForm.validateFields().catch(() => null);
      if (!values) return;
      try {
        await api.replyToComment(replying.id, values.text);
        message.success('Reply published under the article.');
        setReplying(null);
        replyForm.resetFields();
        reload();
      } catch (error) {
        handleError(error);
      }
    });

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Community' }, { label: 'Comments' }]} title="Comments" description="Comments arrive pending and never appear automatically. Rejecting keeps the original text for the record." />
      <TableCard
        toolbar={
          <>
            <RemoteSelect
              ariaLabel="Filter by article"
              placeholder="Any article"
              value={postId}
              valueLabel={state.status === 'ready' ? state.data.data.find((row) => row.postId === postId)?.postTitle : undefined}
              onChange={(next) => list.set('postId', next)}
              search={(term, signal) => blogApi().listPosts({ q: term || undefined, pageSize: 20 }, signal).then((r) => r.data.map((row) => ({ value: row.id, label: row.title })))}
              width={240}
            />
            <Select aria-label="Filter by status" allowClear placeholder="All statuses" value={status} onChange={(v) => list.set('status', v)} style={{ width: 160 }} options={REVIEW_STATUSES.map((s) => ({ value: s, label: s }))} />
            <Select aria-label="Filter by reports" allowClear placeholder="Any" value={reported ? 'reported' : undefined} onChange={(v) => list.set('reported', v ? 'true' : undefined)} style={{ width: 190 }} options={[{ value: 'reported', label: 'Has open reports' }]} />
          </>
        }
      >
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      <Table<AdminComment>
        // Colour is on the rows that still need a decision, not on every row.
        rowClassName={(row) => statusRowClass(row.status)}
        rowKey="id"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data.data : []}
        pagination={state.status === 'ready' ? tablePagination(state.data.meta, list) : false}
        scroll={{ x: 1000 }}
        expandable={{
          expandIcon: expandToggle((comment) => `the comment by ${comment.displayName}`),
          expandedRowRender: (comment) => (
            <div style={{ maxWidth: 900 }}>
              <Typography.Paragraph style={{ whiteSpace: 'pre-line' }}>{comment.originalText}</Typography.Paragraph>
              {comment.publicText && (
                <Alert
                  type="info"
                  showIcon
                  message="Published text differs from the original"
                  description={<span style={{ whiteSpace: 'pre-line' }}>{comment.publicText}{comment.redactionReason ? ` — ${comment.redactionReason}` : ''}</span>}
                />
              )}
              <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                {comment.email ? (
                  <>
                    Contact: <RevealContact masked={comment.email} permission={PERMISSION.commentsEmailView} reveal={() => api.revealCommentEmail(comment.id)} /> · acknowledged {comment.acknowledgedVersion}
                  </>
                ) : (
                  'Written by the Adelaide Sphere team'
                )}
                {comment.moderationReason ? ` · reason: ${comment.moderationReason}` : ''}
              </Typography.Paragraph>
            </div>
          ),
        }}
        columns={[
          { title: 'Article', dataIndex: 'postTitle', width: 190, ellipsis: true },
          {
            title: 'Comment',
            dataIndex: 'originalText',
            render: (value: string, comment) => (
              <span>
                {comment.parentId && (
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                    ↳ Reply to {comment.parentDisplayName ?? 'a comment'}: “{excerpt(comment.parentExcerpt ?? '', 60)}”
                  </Typography.Text>
                )}
                {excerpt(value)}
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  {comment.displayName}
                  {comment.staff ? ' · team reply' : ''}
                </Typography.Text>
              </span>
            ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (v: ReviewStatus, comment) => (
              <Space size={4}>
                <StatusTag status={v} />
                {comment.openReportCount > 0 && (
                  <Tooltip title={`${comment.openReportCount} open report(s)`}>
                    <WarningOutlined aria-label="Reported" style={{ color: brand.danger }} />
                  </Tooltip>
                )}
              </Space>
            ),
          },
          { title: 'Submitted', dataIndex: 'createdAt', render: formatDateTime },
          {
            title: <span className="sr-only">Actions</span>,
            width: 260,
            render: (_: unknown, comment) => (
              <Space wrap>
                {mayModerate && comment.status !== 'approved' && <Button size="small" type="primary" onClick={() => { setDialogError(null); decisionForm.resetFields(); setPending({ comment, decision: 'approve' }); }}>Publish</Button>}
                {mayModerate && comment.status !== 'rejected' && <Button size="small" danger onClick={() => { setDialogError(null); decisionForm.resetFields(); setPending({ comment, decision: 'reject' }); }}>Reject</Button>}
                {mayModerate && comment.status !== 'spam' && <Button size="small" onClick={() => { setDialogError(null); decisionForm.resetFields(); setPending({ comment, decision: 'spam' }); }}>Spam</Button>}
                {mayReply && comment.status === 'approved' && <Button size="small" onClick={() => { setDialogError(null); replyForm.resetFields(); setReplying(comment); }}>Reply</Button>}
                {mayRedact && <Button size="small" onClick={() => { setDialogError(null); redactForm.setFieldsValue({ publicText: comment.publicText ?? comment.originalText, reason: '' }); setRedacting(comment); }}>Redact</Button>}
              </Space>
            ),
          },
        ]}
        locale={{
          emptyText: (
            <ListEmpty
              state={state}
              filtered={list.filtered}
              noun="comments"
              onClear={list.clear}
              empty={{ title: 'No comments yet', description: <>Comments appear here as readers leave them on articles. None have been submitted.</> }}
            />
          ),
        }}
      />
      </TableCard>
      <Modal open={pending !== null} title={pending ? DECISIONS[pending.decision].title : ''} okText={pending ? DECISIONS[pending.decision].confirm : 'Confirm'} okButtonProps={{ danger: pending ? DECISIONS[pending.decision].danger : false }} confirmLoading={busy} onOk={() => void submitDecision()} onCancel={() => setPending(null)} destroyOnHidden>
        {pending && <Typography.Paragraph>{DECISIONS[pending.decision].hint}</Typography.Paragraph>}
        {dialogError && <Alert type="error" showIcon role="alert" message={dialogError} style={{ marginBottom: 12 }} />}
        <Form form={decisionForm} layout="vertical" requiredMark={false}>
          <Form.Item label="Reason (recorded in the audit log)" name="reason" rules={pending && DECISIONS[pending.decision].reasonRequired ? [{ required: true, message: 'A reason is required' }] : undefined}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal open={replying !== null} title="Reply as the Adelaide Sphere team" okText="Publish reply" confirmLoading={busy} onOk={() => void submitReply()} onCancel={() => setReplying(null)} destroyOnHidden>
        {replying && (
          <Typography.Paragraph type="secondary" style={{ whiteSpace: 'pre-line' }}>
            {replying.displayName}: “{excerpt(replying.publicText ?? replying.originalText, 240)}”
          </Typography.Paragraph>
        )}
        <Typography.Paragraph>The reply appears under this comment straight away, signed “Adelaide Sphere team”. You can edit its published text later.</Typography.Paragraph>
        {dialogError && <Alert type="error" showIcon role="alert" message={dialogError} style={{ marginBottom: 12 }} />}
        <Form form={replyForm} layout="vertical" requiredMark={false}>
          <Form.Item label="Your reply" name="text" rules={[{ required: true, min: 2, message: 'Write a reply of at least 2 characters' }]}>
            <Input.TextArea rows={5} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </Modal>
      <Modal open={redacting !== null} title="Edit the published text" okText="Save published text" confirmLoading={busy} onOk={() => void submitRedaction()} onCancel={() => setRedacting(null)} destroyOnHidden>
        <Typography.Paragraph>The original comment is always kept. Clear the field to publish the original again.</Typography.Paragraph>
        {dialogError && <Alert type="error" showIcon role="alert" message={dialogError} style={{ marginBottom: 12 }} />}
        <Form form={redactForm} layout="vertical" requiredMark={false}>
          <Form.Item label="Published text" name="publicText">
            <Input.TextArea rows={4} maxLength={2000} />
          </Form.Item>
          <Form.Item label="Reason" name="reason" rules={[{ required: true, min: 5, message: 'Give at least 5 characters' }]}>
            <Input maxLength={500} placeholder="e.g. Off topic for this article" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
