import { useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Select, Space, Table, Tooltip, Typography } from 'antd';
import { FlagOutlined, WarningOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { moderationApi, REVIEW_STATUSES, type AdminReview, type ReviewDecision, type ReviewStatus } from '@/api/moderation';
import { isApiError } from '@/api/errors';
import { formatDateTime } from '@/shared/format';
import { errorMessage, fieldErrors, useAsync } from '@/shared/useAsync';
import { ErrorState, ListEmpty, PageHeader, StatusTag, TableCard, statusRowClass } from '@/components/ui';
import { useBusy } from '@/shared/useBusy';
import { businessesApi } from '@/api/businesses';
import { RevealContact } from '@/components/RevealContact';
import { RemoteSelect } from '@/components/RemoteSelect';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { expandToggle } from '@/components/ui/expandToggle';
import { brand } from '@/config/theme';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';

/**
 * One entry per decision, so the dialog's title, its button and the message
 * afterwards always describe the same action — the reviews queue said only
 * "Confirm", which is the one word that cannot be wrong and cannot help.
 */
const DECISION_LABELS: Record<ReviewDecision, { title: string; hint: string; confirm: string; done: string; danger?: boolean; reasonRequired: boolean }> = {
  approve: { title: 'Publish this review?', hint: 'It becomes visible on the business page and counts towards the rating.', confirm: 'Publish review', done: 'Review published.', reasonRequired: false },
  reject: { title: 'Reject this review?', hint: 'It stays out of public view and the rating. The original text is kept for the record.', confirm: 'Reject review', done: 'Review rejected.', danger: true, reasonRequired: true },
  spam: { title: 'Mark this review as spam?', hint: 'Same as rejecting, but recorded as spam for abuse signals.', confirm: 'Mark as spam', done: 'Review marked as spam.', danger: true, reasonRequired: true },
};

/** The parameters that narrow this list; everything else is sort or page. */
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

const FILTERS = ['repeatFlagged', 'reported', 'status', 'businessId', 'id'] as const;

/**
 * Review moderation queue (SRS REV 003). Decisions carry the record version and
 * a reason; aggregates are maintained by the API inside the same transaction.
 */
export function ReviewsPage() {
  useDocumentTitle('Reviews');
  const { can } = useCapabilities();
  const mayModerate = can(PERMISSION.reviewsModerate);
  const mayRedact = can(PERMISSION.reviewsRedact);
  const api = moderationApi();
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const list = useListParams(FILTERS);
  const status = (list.get('status') as ReviewStatus | null) ?? undefined;
  const repeatFlagged = list.get('repeatFlagged') === 'true';
  const reported = list.get('reported') === 'true';
  const page = list.page;
  const businessId = list.get('businessId');
  // Set when an abuse report links straight to the item it is about.
  const id = list.get('id');
  const [state, reload] = useAsync((signal) => api.listReviews({ id, status, repeatFlagged: repeatFlagged || undefined, reported: reported || undefined, businessId, page, pageSize: list.pageSize }, signal), [id, status, repeatFlagged, reported, businessId, page, list.pageSize]);
  const [pending, setPending] = useState<{ review: AdminReview; decision: ReviewDecision } | null>(null);
  const [redacting, setRedacting] = useState<AdminReview | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Confirming twice sent the decision twice; one at a time.
  const [busy, run] = useBusy();
  const [decisionForm] = Form.useForm<{ reason?: string }>();
  const [redactForm] = Form.useForm<{ publicText: string; reason: string }>();


  const handleError = (error: unknown, fallback: string) => {
    if (isApiError(error) && error.kind === 'unauthorized') {
      onAuthError(error);
      return;
    }
    if (isApiError(error) && (error.code === 'STALE_VERSION' || error.code === 'INVALID_STATE')) {
      setDialogError(`${error.userMessage} Reload the queue to see the current state.`);
      return;
    }
    const errors = fieldErrors(error);
    setDialogError(Object.values(errors).flat()[0] ?? errorMessage(error) ?? fallback);
  };

  const submitDecision = () =>
    run(async () => {
      if (!pending) return;
      setDialogError(null);
      const values = await decisionForm.validateFields().catch(() => null);
      if (!values) return;
      try {
        await api.decide(pending.review.id, pending.decision, { expectedVersion: pending.review.version, reason: values.reason || undefined });
        message.success(DECISION_LABELS[pending.decision].done);
        setPending(null);
        decisionForm.resetFields();
        reload();
      } catch (error) {
        handleError(error, 'The decision could not be saved.');
      }
    });

  const submitRedaction = () =>
    run(async () => {
      if (!redacting) return;
      setDialogError(null);
      const values = await redactForm.validateFields().catch(() => null);
      if (!values) return;
      try {
        await api.redact(redacting.id, { expectedVersion: redacting.version, publicText: values.publicText?.trim() ? values.publicText : null, reason: values.reason });
        message.success('Published text updated.');
        setRedacting(null);
        redactForm.resetFields();
        reload();
      } catch (error) {
        handleError(error, 'The redaction could not be saved.');
      }
    });

  // The chosen business's name, whether or not it is on this page of results.
  const [chosenBusiness] = useAsync((signal) => (businessId ? businessesApi().get(businessId, signal) : Promise.resolve(null)), [businessId]);

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Community' }, { label: 'Reviews' }]} title="Reviews" description="Reviews are never published automatically. Ratings are never edited." />
      <TableCard
        toolbar={
          <>
            <RemoteSelect
              ariaLabel="Filter by business"
              placeholder="Any business"
              value={businessId}
              valueLabel={chosenBusiness.status === 'ready' ? chosenBusiness.data?.name : undefined}
              onChange={(next) => list.set('businessId', next)}
              search={(term, signal) => businessesApi().list({ q: term || undefined, pageSize: 20, sort: 'name', order: 'asc' }, signal).then((r) => r.data.map((row) => ({ value: row.id, label: row.name })))}
              width={230}
            />
            <Select aria-label="Filter by status" allowClear placeholder="All statuses" value={status} onChange={(v) => list.set('status', v)} style={{ width: 160 }} options={REVIEW_STATUSES.map((s) => ({ value: s, label: s }))} />
            <Select aria-label="Filter by flag" allowClear placeholder="Any flag" value={repeatFlagged ? 'repeat' : reported ? 'reported' : undefined} style={{ width: 190 }} onChange={(v) => list.setMany({ repeatFlagged: v === 'repeat' ? 'true' : undefined, reported: v === 'reported' ? 'true' : undefined })} options={[{ value: 'repeat', label: 'Repeat submissions' }, { value: 'reported', label: 'Has open reports' }]} />
          </>
        }
      >
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      <Table<AdminReview>
        // Colour is on the rows that still need a decision, not on every row.
        rowClassName={(row) => statusRowClass(row.status)}
        rowKey="id"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data.data : []}
        pagination={state.status === 'ready' ? tablePagination(state.data.meta, list) : false}
        scroll={{ x: 1100 }}
        expandable={{
          expandIcon: expandToggle((review) => `the review by ${review.displayName} of ${review.businessName}`),
          expandedRowRender: (review) => (
            <div style={{ maxWidth: 900 }}>
              <Typography.Paragraph style={{ whiteSpace: 'pre-line' }}>{review.originalText}</Typography.Paragraph>
              {review.publicText && (
                <Alert type="info" showIcon message="Published text differs from the original" description={<span style={{ whiteSpace: 'pre-line' }}>{review.publicText}{review.redactionReason ? ` — ${review.redactionReason}` : ''}</span>} />
              )}
              <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                Contact: <RevealContact masked={review.email} permission={PERMISSION.reviewsEmailView} reveal={() => api.revealReviewEmail(review.id)} /> · acknowledged {review.acknowledgedVersion}
                {review.moderationReason ? ` · reason: ${review.moderationReason}` : ''}
              </Typography.Paragraph>
            </div>
          ),
        }}
        columns={[
          { title: 'Business', dataIndex: 'businessName', width: 180, ellipsis: true },
          { title: 'Rating', dataIndex: 'rating', width: 90, render: (v: number) => `${v} / 5` },
          {
            title: 'Review',
            dataIndex: 'originalText',
            render: (value: string, review) => (
              <span>
                {excerpt(value)}
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                  {review.displayName}
                </Typography.Text>
              </span>
            ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (v: ReviewStatus, review) => (
              <Space size={4}>
                <StatusTag status={v} />
                {review.repeatFlagged && (
                  <Tooltip title="Same email reviewed this business within 30 days">
                    <FlagOutlined aria-label="Repeat submission" style={{ color: brand.warning }} />
                  </Tooltip>
                )}
                {review.openReportCount > 0 && (
                  <Tooltip title={`${review.openReportCount} open report(s)`}>
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
            render: (_: unknown, review) => (
              <Space wrap>
                {mayModerate && review.status !== 'approved' && <Button size="small" type="primary" onClick={() => { setDialogError(null); decisionForm.resetFields(); setPending({ review, decision: 'approve' }); }}>Publish</Button>}
                {mayModerate && review.status !== 'rejected' && <Button size="small" danger onClick={() => { setDialogError(null); decisionForm.resetFields(); setPending({ review, decision: 'reject' }); }}>Reject</Button>}
                {mayModerate && review.status !== 'spam' && <Button size="small" onClick={() => { setDialogError(null); decisionForm.resetFields(); setPending({ review, decision: 'spam' }); }}>Spam</Button>}
                {mayRedact && <Button size="small" onClick={() => { setDialogError(null); redactForm.setFieldsValue({ publicText: review.publicText ?? review.originalText, reason: '' }); setRedacting(review); }}>Redact</Button>}
              </Space>
            ),
          },
        ]}
        locale={{
          emptyText: (
            <ListEmpty state={state} filtered={list.filtered} noun="reviews" onClear={list.clear} empty={{ title: 'No reviews yet', description: 'Reviews visitors submit to business listings arrive here for moderation.' }} />
          ),
        }}
      />
      </TableCard>
      <Modal open={pending !== null} title={pending ? DECISION_LABELS[pending.decision].title : ''} okText={pending ? DECISION_LABELS[pending.decision].confirm : 'Confirm'} okButtonProps={{ danger: pending ? DECISION_LABELS[pending.decision].danger : false }} confirmLoading={busy} onOk={() => void submitDecision()} onCancel={() => setPending(null)} destroyOnHidden>
        {pending && <Typography.Paragraph>{DECISION_LABELS[pending.decision].hint}</Typography.Paragraph>}
        {dialogError && <Alert type="error" showIcon role="alert" message={dialogError} style={{ marginBottom: 12 }} />}
        <Form form={decisionForm} layout="vertical" requiredMark={false}>
          <Form.Item label="Reason (recorded in the audit log)" name="reason" rules={pending && DECISION_LABELS[pending.decision].reasonRequired ? [{ required: true, message: 'A reason is required' }] : undefined}>
            <Input.TextArea placeholder="Why, for the audit log" rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal open={redacting !== null} title="Edit the published text" okText="Save published text" confirmLoading={busy} onOk={() => void submitRedaction()} onCancel={() => setRedacting(null)} destroyOnHidden>
        <Typography.Paragraph>The original submission is always kept. Clear the field to publish the original again. The rating cannot be changed.</Typography.Paragraph>
        {dialogError && <Alert type="error" showIcon role="alert" message={dialogError} style={{ marginBottom: 12 }} />}
        <Form form={redactForm} layout="vertical" requiredMark={false}>
          <Form.Item label="Published text" name="publicText">
            <Input.TextArea placeholder="The text readers will see" rows={5} maxLength={3000} />
          </Form.Item>
          <Form.Item label="Reason" name="reason" rules={[{ required: true, min: 5, message: 'Give at least 5 characters' }]}>
            <Input maxLength={500} placeholder="e.g. Names a staff member" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
