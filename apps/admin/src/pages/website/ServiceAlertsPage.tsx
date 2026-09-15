import { App, Button, Input, Select, Space, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router';
import { serviceAlertsApi, type AlertSeverity, type ServiceAlert } from '@/api/website';
import { PERMISSION } from '@/auth/permissions';
import { useCapabilities } from '@/auth/access-control';
import { ALERT_PRESENTATION, ALERT_SEVERITIES } from '@adelaide-sphere/domain/alerts';
import { ErrorState, ListEmpty, PageHeader, Pill, StatusTag, TableCard, type StatusTone } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { tablePagination } from '@/shared/tablePagination';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

/** The public banner's own tones, mapped onto the admin's palette. */
const SEVERITY_TONE: Record<AlertSeverity, StatusTone> = { informational: 'progress', warning: 'attention', emergency: 'critical' };

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['status', 'severity', 'q'] as const;

/**
 * Service alerts (SRS 1.2 ALRT 007). An alert renders above the header on every
 * public page, so publishing and unpublishing state that consequence before they
 * are confirmed. Times are entered and shown in Adelaide time and sent as
 * instants (ALRT 003).
 */
export function ServiceAlertsPage() {
  useDocumentTitle('Service alerts');
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const list = useListParams(FILTERS);
  const page = list.page;
  const status = (list.get('status') ?? '') as '' | 'draft' | 'published';

  const navigate = useNavigate();
  const severity = list.get('severity') as AlertSeverity | undefined;
  const q = list.get('q') ?? '';
  const [state, reload] = useAsync(() => serviceAlertsApi.list({ page, pageSize: list.pageSize, status: status || undefined, severity, q: q || undefined }), [page, list.pageSize, status, severity, q]);


  const setPublished = (record: ServiceAlert, published: boolean) => {
    modal.confirm({
      title: published ? 'Publish this alert?' : 'Unpublish this alert?',
      content: published
        ? 'It appears above the header on every public page, within its display window.'
        : 'It disappears from every public page immediately. Nothing is deleted.',
      okText: published ? 'Publish' : 'Unpublish',
      onOk: async () => {
        try {
          await serviceAlertsApi.setPublished(record.id, published, record.version);
          message.success(published ? 'Published' : 'Unpublished');
          reload();
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  };

  const remove = (record: ServiceAlert) => {
    modal.confirm({
      title: 'Delete this alert?',
      content: 'This cannot be undone. If you only want it off the site, unpublish it instead.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await serviceAlertsApi.remove(record.id);
          message.success('Deleted');
          reload();
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Website' }, { label: 'Service alerts' }]}
        title="Service alerts"
        description="Notices above every public page. At most two show, most severe first."
        actions={
          can(PERMISSION.websiteAlertsCreate) ? (
            <Link to="/website/service-alerts/new">
              <Button type="primary" icon={<PlusOutlined />}>
                New alert
              </Button>
            </Link>
          ) : null
        }
      />

      <TableCard
        toolbar={
          <>
            <Input.Search
              aria-label="Search alerts"
              placeholder="Search by title"
              allowClear
              defaultValue={q}
              onSearch={(value) => list.set('q', value.trim() || undefined)}
              style={{ width: 260 }}
            />
            <Select
              aria-label="Filter by status"
              placeholder="Status"
              allowClear
              value={status || undefined}
              style={{ width: 160 }}
              onChange={(value?: string) => list.set('status', value)}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'published', label: 'Published' },
              ]}
            />
            <Select
              aria-label="Filter by severity"
              placeholder="Any severity"
              allowClear
              value={severity}
              style={{ width: 180 }}
              onChange={(value?: AlertSeverity) => list.set('severity', value)}
              options={ALERT_SEVERITIES.map((value) => ({ value, label: ALERT_PRESENTATION[value].label }))}
            />
          </>
        }
      >

      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}

      <Table<ServiceAlert>
        rowKey="id"
        size="small"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data.data : []}
        locale={{
          emptyText: (
            <ListEmpty state={state} filtered={list.filtered} noun="alerts" onClear={list.clear} empty={{ title: 'No service alerts', description: 'Create one when something on the site needs explaining to visitors.', action: can(PERMISSION.websiteAlertsCreate) ? { label: 'New alert', onClick: () => navigate('/website/service-alerts/new') } : undefined }} />
          ),
        }}
        pagination={
          state.status === 'ready'
            ? tablePagination(state.data.meta, list)
            : false
        }
        scroll={{ x: 1000 }}
        columns={[
          { title: 'Severity', dataIndex: 'severity', width: 140, render: (value: AlertSeverity) => <Pill tone={SEVERITY_TONE[value]}>{ALERT_PRESENTATION[value].label}</Pill> },
          { title: 'Title', dataIndex: 'title' },
          {
            title: 'Window',
            width: 260,
            render: (_: unknown, record) =>
              record.startsAt || record.endsAt ? `${record.startsAt ? formatDateTime(record.startsAt) : 'now'} → ${record.endsAt ? formatDateTime(record.endsAt) : 'until removed'}` : 'Always',
          },
          { title: 'Status', dataIndex: 'status', width: 120, render: (value: string) => <StatusTag status={value} /> },
          {
            title: 'Actions',
            width: 260,
            render: (_: unknown, record) => (
              <Space size={4} wrap>
                {can(PERMISSION.websiteAlertsUpdate) && (
                  <Button size="small" onClick={() => navigate(`/website/service-alerts/${record.id}`)}>
                    Edit
                  </Button>
                )}
                {can(PERMISSION.websiteAlertsPublish) && (
                  <Button size="small" onClick={() => setPublished(record, record.status !== 'published')}>
                    {record.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                )}
                {can(PERMISSION.websiteAlertsDelete) && (
                  <Button size="small" danger onClick={() => remove(record)}>
                    Delete
                  </Button>
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
