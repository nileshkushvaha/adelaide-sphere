import { useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Select, Space, Table, Tooltip, Typography } from 'antd';
import { ENQUIRY_HANDLING_ACTIONS } from '@adelaide-sphere/domain';
import { useOnError } from '@refinedev/core';
import { DELIVERY_STATUSES, HANDLING_STATUSES, enquiriesApi, type AdminEnquiry, type DeliveryStatus, type HandlingStatus } from '@/api/enquiries';
import { isApiError } from '@/api/errors';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { ErrorState, ListEmpty, PageHeader, StatusTag, TableCard, statusRowClass } from '@/components/ui';
import { useBusy } from '@/shared/useBusy';
import { businessesApi } from '@/api/businesses';
import { RevealContact } from '@/components/RevealContact';
import { RemoteSelect } from '@/components/RemoteSelect';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { expandToggle } from '@/components/ui/expandToggle';

const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  queued: 'queued',
  providerAccepted: 'accepted by provider',
  delivered: 'delivered',
  retrying: 'retrying',
  failed: 'failed',
  suppressed: 'suppressed',
};
const HANDLING_LABELS: Record<HandlingStatus, string> = { new: 'new', inProgress: 'in progress', closed: 'closed' };

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['deliveryStatus', 'handlingStatus', 'businessId'] as const;

/**
 * Enquiry handling (SRS ENQ 004/007). Delivery state and handling state are
 * shown separately: closing an enquiry never claims the email arrived.
 */
export function EnquiriesPage() {
  useDocumentTitle('Enquiries');
  const api = enquiriesApi();
  const { message, modal } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const { can } = useCapabilities();
  const canManage = can(PERMISSION.enquiriesManage);
  const canRetry = can(PERMISSION.enquiriesRetry);
  const list = useListParams(FILTERS);
  const handlingStatus = (list.get('handlingStatus') as HandlingStatus | null) ?? undefined;
  const deliveryStatus = (list.get('deliveryStatus') as DeliveryStatus | null) ?? undefined;
  const page = list.page;
  const businessId = list.get('businessId');
  const [state, reload] = useAsync((signal) => api.list({ handlingStatus, deliveryStatus, businessId, page, pageSize: list.pageSize }, signal), [handlingStatus, deliveryStatus, businessId, page, list.pageSize]);
  const [retrying, setRetrying] = useState<AdminEnquiry | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Confirming twice sent the decision twice; one at a time.
  const [busy, run] = useBusy();
  const [form] = Form.useForm<{ reason: string }>();
  // The enquiry whose handling is being changed, so its buttons cannot send the change twice.
  const [changingId, setChangingId] = useState<string | null>(null);

  /**
   * Start handling, close or reopen — the only changes the API accepts (shared
   * rule in `@adelaide-sphere/domain`). Handling is the team's workflow; it
   * never sends, retries or confirms the email.
   */
  const changeHandling = async (enquiry: AdminEnquiry, next: HandlingStatus) => {
    setChangingId(enquiry.id);
    try {
      await api.setHandling(enquiry.id, { expectedVersion: enquiry.version, handlingStatus: next });
      message.success(next === 'closed' ? 'Enquiry closed' : enquiry.handlingStatus === 'closed' ? 'Enquiry reopened' : 'Handling started');
      reload();
    } catch (error) {
      if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
      else {
        message.error(errorMessage(error));
        // A stale version or a change someone else already made: show what is true now.
        reload();
      }
    } finally {
      setChangingId(null);
    }
  };

  /** Closing asks first, and says plainly when the email has not been confirmed as delivered (ENQ 006). */
  const confirmClose = (enquiry: AdminEnquiry) => {
    const delivered = enquiry.deliveryStatus === 'delivered' || enquiry.deliveryStatus === 'providerAccepted';
    modal.confirm({
      title: 'Close this enquiry?',
      content: delivered
        ? 'It is marked as finished for your team. You can reopen it later.'
        : `The email has not been confirmed as delivered (delivery is ${DELIVERY_LABELS[enquiry.deliveryStatus]}). Closing only records that your team is finished — it does not send or retry the email.`,
      okText: 'Close enquiry',
      onOk: () => changeHandling(enquiry, 'closed'),
    });
  };

  const submitRetry = () =>
    run(async () => {
      if (!retrying) return;
      setDialogError(null);
      const values = await form.validateFields().catch(() => null);
      if (!values) return;
      try {
        await api.retry(retrying.id, { expectedVersion: retrying.version, reason: values.reason });
        message.success('Delivery re-queued');
        setRetrying(null);
        form.resetFields();
        reload();
      } catch (error) {
        if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
        else setDialogError(errorMessage(error));
      }
    });

  // The chosen business's name, whether or not it is on this page of results.
  const [chosenBusiness] = useAsync((signal) => (businessId ? businessesApi().get(businessId, signal) : Promise.resolve(null)), [businessId]);

  return (
    <div>
      <PageHeader crumbs={[{ label: 'Community' }, { label: 'Enquiries' }]} title="Enquiries" description="Delivery status is the email; handling status is your workflow." />
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
            <Select aria-label="Filter by handling status" allowClear placeholder="Any handling status" value={handlingStatus} onChange={(v) => list.set('handlingStatus', v)} style={{ width: 200 }} options={HANDLING_STATUSES.map((s) => ({ value: s, label: HANDLING_LABELS[s] }))} />
            <Select aria-label="Filter by delivery status" allowClear placeholder="Any delivery status" value={deliveryStatus} onChange={(v) => list.set('deliveryStatus', v)} style={{ width: 220 }} options={DELIVERY_STATUSES.map((s) => ({ value: s, label: DELIVERY_LABELS[s] }))} />
          </>
        }
      >
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      <Table<AdminEnquiry>
        // Colour is on the rows that still need a decision, not on every row.
        rowClassName={(row) => statusRowClass(row.deliveryStatus)}
        rowKey="id"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data.data : []}
        pagination={state.status === 'ready' ? tablePagination(state.data.meta, list) : false}
        scroll={{ x: 1100 }}
        expandable={{
          expandIcon: expandToggle((enquiry) => `the enquiry from ${enquiry.name}`),
          expandedRowRender: (enquiry) => (
            <div style={{ maxWidth: 900 }}>
              <Typography.Paragraph strong>{enquiry.subject}</Typography.Paragraph>
              <Typography.Paragraph style={{ whiteSpace: 'pre-line' }}>{enquiry.message}</Typography.Paragraph>
              <Typography.Paragraph type="secondary">
                From {enquiry.name} · <RevealContact masked={enquiry.email} permission={PERMISSION.enquiriesContactView} reveal={() => api.revealContact(enquiry.id).then((contact) => contact.email)} />
                {enquiry.phone ? (
                  <>
                    {' · '}
                    <RevealContact masked={enquiry.phone} what="phone number" permission={PERMISSION.enquiriesContactView} reveal={() => api.revealContact(enquiry.id).then((contact) => contact.phone)} />
                  </>
                ) : null}{' '}
                · acknowledged {enquiry.acknowledgedVersion}
                {enquiry.lastError ? ` · last error: ${enquiry.lastError}` : ''}
                {enquiry.suppressionReason ? ` · suppressed: ${enquiry.suppressionReason}` : ''}
              </Typography.Paragraph>
            </div>
          ),
        }}
        columns={[
          { title: 'Business', dataIndex: 'businessName', render: (v: string | null) => v ?? 'General enquiry' },
          { title: 'From', dataIndex: 'name' },
          { title: 'Subject', dataIndex: 'subject', ellipsis: true },
          {
            title: 'Delivery',
            dataIndex: 'deliveryStatus',
            width: 190,
            // The tag and the attempt count stack: side by side they collided in
            // a column this narrow, and the count sat on top of the tag.
            render: (v: DeliveryStatus, e) => (
              <div>
                <StatusTag status={v} />
                {e.deliveryAttempts > 0 && (
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                    {e.deliveryAttempts} attempt{e.deliveryAttempts === 1 ? '' : 's'}
                  </Typography.Text>
                )}
              </div>
            ),
          },
          { title: 'Handling', dataIndex: 'handlingStatus', width: 140, render: (v: HandlingStatus) => <StatusTag status={v} /> },
          { title: 'Received', dataIndex: 'createdAt', width: 170, render: formatDateTime },
          {
            title: <span className="sr-only">Actions</span>,
            width: 280,
            render: (_: unknown, enquiry) =>
              canManage || canRetry ? (
                <Space wrap>
                  {canManage && ENQUIRY_HANDLING_ACTIONS[enquiry.handlingStatus].map((action) => (
                    <Tooltip key={action.to} title={action.description}>
                      <Button
                        size="small"
                        loading={changingId === enquiry.id}
                        disabled={changingId !== null && changingId !== enquiry.id}
                        aria-label={`${action.label}: ${enquiry.subject}`}
                        onClick={() => (action.to === 'closed' ? confirmClose(enquiry) : void changeHandling(enquiry, action.to))}
                      >
                        {action.label}
                      </Button>
                    </Tooltip>
                  ))}
                  {canRetry && (enquiry.deliveryStatus === 'failed' || enquiry.deliveryStatus === 'suppressed') && (
                    <Button size="small" type="primary" onClick={() => { setDialogError(null); form.resetFields(); setRetrying(enquiry); }}>
                      Retry delivery
                    </Button>
                  )}
                </Space>
              ) : null,
          },
        ]}
        locale={{
          emptyText: (
            <ListEmpty state={state} filtered={list.filtered} noun="enquiries" onClear={list.clear} empty={{ title: 'No enquiries yet', description: 'Enquiries visitors send to a business listing are recorded here.' }} />
          ),
        }}
      />
      </TableCard>
      <Modal open={retrying !== null} title="Re-queue this delivery" okText="Retry delivery" confirmLoading={busy} onOk={() => void submitRetry()} onCancel={() => setRetrying(null)} destroyOnHidden>
        <Typography.Paragraph>It is queued again. A timeout can mean the first one arrived, so check before retrying again.</Typography.Paragraph>
        {dialogError && <Alert type="error" showIcon role="alert" message={dialogError} style={{ marginBottom: 12 }} />}
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item label="Reason (recorded in the audit log)" name="reason" rules={[{ required: true, min: 5, message: 'Give at least 5 characters' }]}>
            <Input.TextArea placeholder="Why, for the audit log" rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
