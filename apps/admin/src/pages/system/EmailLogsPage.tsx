import { useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Input, Select, Space, Table, Timeline, Typography, App } from 'antd';
import { emailLogsApi, type EmailDelivery, type EmailDeliveryDetail, type EmailDeliveryStatus } from '@/api/email-logs';
import { PERMISSION } from '@/auth/permissions';
import { useCapabilities } from '@/auth/access-control';
import { ErrorState, ListEmpty, PageHeader, StatusTag, TableCard, statusRowClass } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useBusy } from '@/shared/useBusy';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { WorkerStoppedAlert } from '@/components/WorkerStoppedAlert';

const STATUS_COLOUR: Record<EmailDeliveryStatus, string> = {
  queued: 'default',
  sent: 'blue',
  delivered: 'green',
  delayed: 'gold',
  failed: 'red',
  bounced: 'red',
  complained: 'volcano',
  suppressed: 'magenta',
};

const STATUSES: EmailDeliveryStatus[] = ['queued', 'sent', 'delivered', 'delayed', 'failed', 'bounced', 'complained', 'suppressed'];
/** What each kind of email is for, in the reader's words rather than the stored key. */
const CATEGORY_LABELS: Record<string, string> = { auth: 'Sign-in and account', enquiry: 'Enquiries', moderation: 'Moderation', system: 'System' };
const CATEGORIES = Object.keys(CATEGORY_LABELS);
/** The stored delivery states as they read on screen; "bounced" is plain enough to keep. */
const STATUS_LABELS: Record<string, string> = { queued: 'Queued', sent: 'Sent', delivered: 'Delivered', delayed: 'Delayed', failed: 'Failed', bounced: 'Bounced', complained: 'Marked as spam', suppressed: 'Suppressed' };

/** Statuses a resend is refused for (SRS 1.2 MAIL 009); the server refuses them too. */
const RESEND_REFUSED: EmailDeliveryStatus[] = ['delivered', 'complained', 'suppressed'];

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['category', 'search', 'status'] as const;

/**
 * Transactional email delivery log (SRS 1.2 MAIL 010). Read-only: no create,
 * edit or delete. Recipients are masked until an administrator with the
 * separate permission reveals one, and every reveal is recorded server-side.
 */
export function EmailLogsPage() {
  useDocumentTitle('Email logs');
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  // Resending twice sends the message twice; one attempt at a time.
  const [, run] = useBusy();
  const list = useListParams(FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const page = list.page;
  const status = (list.get('status') ?? '') as EmailDeliveryStatus | '';
  const category = list.get('category') ?? '';
  const search = list.get('search') ?? '';

  const [state, reload] = useAsync(
    () => emailLogsApi.list({ page, pageSize: list.pageSize, status: status || undefined, category: category || undefined, search: search || undefined }),
    [page, list.pageSize, status, category, search],
  );
  const [detail] = useAsync<EmailDeliveryDetail | null>(() => (openId ? emailLogsApi.detail(openId) : Promise.resolve(null)), [openId]);


  const reveal = (id: string) =>
    modal.confirm({
      title: 'Show the recipient’s address?',
      content: 'Addresses are hidden by default because a log is not a mailing list. Revealing one is recorded in the activity log against your account.',
      okText: 'Show the address',
      onOk: () => revealNow(id),
    });

  const revealNow = async (id: string) => {
    try {
      const recipient = await emailLogsApi.revealRecipient(id);
      setRevealed((current) => ({ ...current, [id]: recipient }));
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  const resend = (record: EmailDelivery) => {
    modal.confirm({
      title: 'Resend this message?',
      // The consequence is stated before the action, not after it.
      content: `A new attempt will be created and linked to this one. The recipient may receive the message twice if the original was in fact delivered.`,
      okText: 'Resend message',
      onOk: () =>
        run(async () => {
        try {
          await emailLogsApi.resend(record.id);
          message.success('A new attempt has been queued.');
          reload();
        } catch (error) {
          message.error(errorMessage(error));
        }
      }),
    });
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'System' }, { label: 'Email logs' }]}
        title="Email logs"
        description="Every email the site has sent. Recipients are masked; bodies are not stored."
      />

      {/* Sign-in emails go straight from the server; enquiry emails are sent by
          the background worker, which creates their record here when it sends.
          With no worker there is nothing to list, and the empty log must not
          read as "nothing was sent". */}
      <WorkerStoppedAlert consequence="Enquiry emails are waiting and will be sent, and listed here, once it is running again. Sign-in emails are not affected." />

      <TableCard
        toolbar={
          <>
            <Select
              aria-label="Filter by status"
              placeholder="Status"
              allowClear
              value={status || undefined}
              style={{ width: 160 }}
              onChange={(value?: string) => list.set('status', value)}
              options={STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] ?? value }))}
            />
            <Select
              aria-label="Filter by category"
              placeholder="Category"
              allowClear
              value={category || undefined}
              style={{ width: 160 }}
              onChange={(value?: string) => list.set('category', value)}
              options={CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] ?? value }))}
            />
            <Input.Search
              aria-label="Search by message or reference id"
              placeholder="Message or reference id"
              allowClear
              defaultValue={search}
              style={{ width: 280 }}
              onSearch={(value) => list.set('search', value.trim() || undefined)}
            />
          </>
        }
      >

      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}

      <Table<EmailDelivery>
        // Colour is on the rows that still need a decision, not on every row.
        rowClassName={(row) => statusRowClass(row.status)}
        rowKey="id"
        size="small"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data.data : []}
        locale={{
          emptyText: (
            <ListEmpty state={state} filtered={list.filtered} noun="messages" onClear={list.clear} empty={{ title: 'No messages sent yet', description: 'Every email the site sends is recorded here with its delivery result.' }} />
          ),
        }}
        pagination={
          state.status === 'ready'
            ? tablePagination(state.data.meta, list)
            : false
        }
        scroll={{ x: 1000 }}
        columns={[
          { title: 'When', dataIndex: 'createdAt', render: formatDateTime, width: 180 },
          { title: 'Status', dataIndex: 'status', width: 120, render: (value: EmailDeliveryStatus) => <StatusTag status={value} /> },
          { title: 'Message', dataIndex: 'templateKey' },
          {
            title: 'Recipient',
            dataIndex: 'recipient',
            render: (masked: string, record) =>
              revealed[record.id] ? (
                <span>{revealed[record.id]}</span>
              ) : (
                <Space size={4}>
                  <span>{masked}</span>
                  {can(PERMISSION.systemEmailLogsRecipientsView) && (
                    <Button size="small" type="link" onClick={() => void reveal(record.id)}>
                      Reveal
                    </Button>
                  )}
                </Space>
              ),
          },
          { title: 'Attempts', dataIndex: 'attempts', width: 90 },
          {
            title: 'Actions',
            width: 170,
            render: (_: unknown, record) => (
              <Space size={4}>
                <Button size="small" onClick={() => setOpenId(record.id)}>
                  Details
                </Button>
                {can(PERMISSION.systemEmailLogsResend) && !RESEND_REFUSED.includes(record.status) && (
                  <Button size="small" onClick={() => resend(record)}>
                    Resend
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />
      </TableCard>

      <Drawer title="Delivery detail" width={560} open={openId !== null} onClose={() => setOpenId(null)} destroyOnHidden>
        {detail.status === 'loading' && <Typography.Paragraph>Loading…</Typography.Paragraph>}
        {detail.status === 'error' && <Alert type="error" showIcon message={detail.message} description={detail.reference} />}
        {detail.status === 'ready' && detail.data && (
          <>
            <Descriptions column={1} size="small" bordered items={[
              { key: 'status', label: 'Status', children: <StatusTag status={detail.data.status} /> },
              { key: 'template', label: 'Message', children: detail.data.templateKey },
              { key: 'category', label: 'Category', children: CATEGORY_LABELS[detail.data.category] ?? detail.data.category },
              { key: 'recipient', label: 'Recipient', children: revealed[detail.data.id] ?? detail.data.recipient },
              { key: 'subject', label: 'Subject', children: detail.data.subject ?? 'Not retained for this kind of message' },
              { key: 'provider', label: 'Provider', children: `${detail.data.provider}${detail.data.providerMessageId ? ` · ${detail.data.providerMessageId}` : ''}` },
              { key: 'related', label: 'Related record', children: detail.data.relatedType ? `${detail.data.relatedType} ${detail.data.relatedId ?? ''}` : '—' },
              { key: 'failure', label: 'Failure', children: detail.data.failureCode ? `${detail.data.failureCode}: ${detail.data.failureSummary ?? ''}` : '—' },
              { key: 'request', label: 'Request id', children: detail.data.requestId ?? '—' },
              { key: 'resent', label: 'Replaces', children: detail.data.resentFromId ?? '—' },
            ]} />

            <Typography.Title level={5} style={{ marginTop: 24 }}>
              Provider events
            </Typography.Title>
            {detail.data.events.length === 0 ? (
              <Typography.Paragraph type="secondary">
                No provider events yet. Delivery, bounce and complaint events arrive by webhook once the provider reports them.
              </Typography.Paragraph>
            ) : (
              <Timeline
                items={detail.data.events.map((event) => ({
                  color: STATUS_COLOUR[event.type as EmailDeliveryStatus] ?? 'blue',
                  children: (
                    <>
                      <div>{event.type}</div>
                      <Typography.Text type="secondary">{formatDateTime(event.occurredAt)}</Typography.Text>
                    </>
                  ),
                }))}
              />
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
