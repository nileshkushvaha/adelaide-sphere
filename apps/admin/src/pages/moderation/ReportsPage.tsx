import { useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Select, Space, Table, Typography } from 'antd';
import { useOnError } from '@refinedev/core';
import { Link } from 'react-router';
import { moderationApi, REPORT_STATUSES, type AdminReport, type ReportOutcome, type ReportStatus } from '@/api/moderation';
import { isApiError } from '@/api/errors';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { ErrorState, ListEmpty, PageHeader, Pill, StatusTag, TableCard, statusRowClass } from '@/components/ui';
import { useBusy } from '@/shared/useBusy';
import { RevealContact } from '@/components/RevealContact';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { FormSelect } from '@/components/FormSelect';
import { expandToggle } from '@/components/ui/expandToggle';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';

/** What the reporter chose, in the words of the public report form. */
const REASON_LABELS: Record<string, string> = { spam: 'Spam', offensive: 'Offensive', misleading: 'Misleading', privacy: 'Privacy concern', other: 'Other' };
const reasonLabel = (reason: string) => REASON_LABELS[reason] ?? reason;

const OUTCOMES: { value: ReportOutcome; label: string }[] = [
  { value: 'retain', label: 'Retain the content' },
  { value: 'remove', label: 'Content should be removed' },
  { value: 'spam', label: 'Spam' },
];

/** How a decision reads once it has been made, from the same list it was chosen in. */
const outcomeLabel = (outcome: string) => OUTCOMES.find((entry) => entry.value === outcome)?.label ?? outcome;

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['status'] as const;

/**
 * Abuse report queue (SRS REP 002). Resolving records the decision only;
 * removing a review remains a separate moderation action on the Reviews page.
 */
export function ReportsPage() {
  useDocumentTitle('Abuse reports');
  const { can } = useCapabilities();
  const mayHandle = can(PERMISSION.reportsManage);
  const api = moderationApi();
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const list = useListParams(FILTERS);
  const status = (list.get('status') as ReportStatus | null) ?? undefined;
  const page = list.page;
  const [state, reload] = useAsync((signal) => api.listReports({ status, page, pageSize: list.pageSize }, signal), [status, page, list.pageSize]);
  const [resolving, setResolving] = useState<AdminReport | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Confirming twice sent the decision twice; one at a time.
  const [busy, run] = useBusy();
  const [form] = Form.useForm<{ outcome: ReportOutcome; note?: string }>();


  const handleError = (error: unknown) => {
    if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
    else if (isApiError(error) && (error.code === 'STALE_VERSION' || error.code === 'INVALID_STATE')) setDialogError(`${error.userMessage} Reload the queue to see the current state.`);
    else setDialogError(errorMessage(error));
  };

  const investigate = async (report: AdminReport) => {
    try {
      await api.investigate(report.id, report.version);
      message.success('Marked as investigating');
      reload();
    } catch (error) {
      if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
      else message.error(errorMessage(error));
    }
  };

  const submitResolution = () =>
    run(async () => {
      if (!resolving) return;
      setDialogError(null);
      const values = await form.validateFields().catch(() => null);
      if (!values) return;
      try {
        await api.resolve(resolving.id, { expectedVersion: resolving.version, outcome: values.outcome, note: values.note || undefined });
        message.success('Report resolved');
        setResolving(null);
        form.resetFields();
        reload();
      } catch (error) {
        handleError(error);
      }
    });

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Community' }, { label: 'Abuse reports' }]} title="Abuse reports" description="Reports never remove content. Record an outcome, then open the item to act on it." />
      <TableCard
        toolbar={
          <>
            <Select aria-label="Filter by status" allowClear placeholder="All statuses" value={status} onChange={(v) => list.set('status', v)} style={{ width: 180 }} options={REPORT_STATUSES.map((s) => ({ value: s, label: s }))} />
          </>
        }
      >
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      <Table<AdminReport>
        // Colour is on the rows that still need a decision, not on every row.
        rowClassName={(row) => statusRowClass(row.status)}
        rowKey="id"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data.data : []}
        pagination={state.status === 'ready' ? tablePagination(state.data.meta, list) : false}
        scroll={{ x: 1000 }}
        expandable={{
          expandIcon: expandToggle((report) => `the ${reasonLabel(report.reason).toLowerCase()} report about a ${report.targetType}`),
          expandedRowRender: (report) => (
            <div style={{ maxWidth: 900 }}>
              <Typography.Paragraph strong>Reported content, as it appeared</Typography.Paragraph>
              <Typography.Paragraph style={{ whiteSpace: 'pre-line' }}>{report.targetSnapshot}</Typography.Paragraph>
              {report.details && <Typography.Paragraph>Reporter’s note: {report.details}</Typography.Paragraph>}
              <Typography.Paragraph type="secondary">
                {report.reporterEmail ? (
                  <>
                    Reporter contact: <RevealContact masked={report.reporterEmail} permission={PERMISSION.reportsEmailView} reveal={() => api.revealReporterEmail(report.id)} />
                  </>
                ) : (
                  'No reporter contact provided'
                )}
                {report.resolutionNote ? ` · outcome note: ${report.resolutionNote}` : ''}
              </Typography.Paragraph>
            </div>
          ),
        }}
        columns={[
          { title: 'Reason', dataIndex: 'reason', render: (value: string) => reasonLabel(value) },
          {
            title: 'Target',
            render: (_: unknown, report) => (
              // The link now opens the reported item itself. It used to open
              // the whole queue filtered by that item's status, which looked
              // like a link to the content and was not: the moderator had to
              // find it by eye among everything else in the same state.
              <Link to={report.targetType === 'review' ? `/reviews?id=${encodeURIComponent(report.reviewId ?? '')}` : `/comments?id=${encodeURIComponent(report.commentId ?? '')}`}>
                Open the {report.targetType}
              </Link>
            ),
          },
          // The state of the reported item, in the same vocabulary the
          // moderation queues use for it rather than the stored word.
          { title: 'Target status', dataIndex: 'targetStatus', render: (v: string) => <StatusTag status={v} /> },
          { title: 'Status', dataIndex: 'status', render: (v: ReportStatus, report) => <Space size={4}><StatusTag status={v} />{report.outcome && <Pill tone={report.outcome === 'remove' ? 'critical' : 'neutral'}>{outcomeLabel(report.outcome)}</Pill>}</Space> },
          { title: 'Received', dataIndex: 'createdAt', render: formatDateTime },
          {
            title: <span className="sr-only">Actions</span>,
            width: 220,
            render: (_: unknown, report) => (
              <Space wrap>
                {mayHandle && report.status === 'open' && <Button size="small" onClick={() => void investigate(report)}>Investigate</Button>}
                {mayHandle && report.status !== 'resolved' && <Button size="small" type="primary" onClick={() => { setDialogError(null); form.resetFields(); setResolving(report); }}>Resolve</Button>}
              </Space>
            ),
          },
        ]}
        locale={{
          emptyText: (
            <ListEmpty state={state} filtered={list.filtered} noun="reports" onClear={list.clear} empty={{ title: 'No abuse reports', description: 'Reports visitors raise about a review or comment arrive here.' }} />
          ),
        }}
      />
      </TableCard>
      <Modal open={resolving !== null} title="Resolve this report" okText="Resolve report" confirmLoading={busy} onOk={() => void submitResolution()} onCancel={() => setResolving(null)} destroyOnHidden>
        {dialogError && <Alert type="error" showIcon role="alert" message={dialogError} style={{ marginBottom: 12 }} />}
        <Form form={form} layout="vertical" requiredMark={false} initialValues={{ outcome: 'retain' }}>
          <Form.Item label="Outcome" name="outcome" rules={[{ required: true, message: 'Choose an outcome' }]}>
            <FormSelect options={OUTCOMES} />
          </Form.Item>
          <Form.Item label="Note (recorded in the audit log)" name="note">
            <Input.TextArea rows={3} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
