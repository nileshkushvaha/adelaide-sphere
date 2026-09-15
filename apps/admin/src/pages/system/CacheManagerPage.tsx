import { Alert, App, Button, Space, Table, Typography } from 'antd';
import { cacheApi, type CacheNamespaceStatus, type CacheTagStatus } from '@/api/system';
import { PERMISSION } from '@/auth/permissions';
import { useCapabilities } from '@/auth/access-control';
import { ErrorState, PageHeader, PageLoader, StatusTag, TableCard } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

/**
 * Cache manager (SRS 1.2 CMGR 001–005).
 *
 * Only the caches the server registers can be seen or cleared, and each entry is
 * named rather than typed: there is no field here that takes a key or a pattern,
 * and no control that clears everything. Sessions, sign-in limits and the queue
 * are deliberately not here — they have their own screens and their own
 * permissions.
 */
/** "300s" is a number; "5 minutes" is an answer. */
function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  if (seconds < 3_600) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.round(seconds / 3_600);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export function CacheManagerPage() {
  useDocumentTitle('Cache manager');
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const [state, reload] = useAsync(() => cacheApi.status(), []);
  const mayClear = can(PERMISSION.systemCacheInvalidate);

  const clear = (kind: 'namespace' | 'tag', key: string, label: string, consequence: string) => {
    modal.confirm({
      title: kind === 'namespace' ? `Clear the ${label.toLowerCase()} cache?` : `Refresh ${label.toLowerCase()}?`,
      content: consequence,
      okText: kind === 'namespace' ? 'Clear cache' : 'Refresh pages',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const result = await cacheApi.clear(kind, key);
          message.success(kind === 'namespace' ? `Cleared ${result.cleared ?? 0} entr${result.cleared === 1 ? 'y' : 'ies'}` : 'Pages queued for refresh');
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
        crumbs={[{ label: 'System' }, { label: 'Cache manager' }]}
        title="Cache manager"
        description="Clearing only slows pages briefly. It never signs anyone out."
        actions={<Button onClick={reload}>Refresh</Button>}
      />

      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}

      {/* The page rendered only its heading while loading, so it read as a
          screen with nothing on it rather than one still arriving. */}
      {state.status === 'loading' && <PageLoader label="Reading the cache…" />}

      {state.status === 'ready' && (
        <>
          {state.data.redis.available ? (
            // Healthy is a line, not a panel.
            <Space size={10} align="center" style={{ marginBottom: 20 }}>
              <StatusTag status="connected" />
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Caching is working normally.
              </Typography.Text>
            </Space>
          ) : (
            <Alert
              type="warning"
              showIcon
              message="Caching is unavailable"
              description="Pages are still served, from the database each time, so the site is slower until this returns."
              style={{ marginBottom: 20 }}
            />
          )}

          <TableCard
            title="Stored data"
            description="Answers the site keeps for a short time so repeated requests do not query the database again."
            footer="Entry counts are approximate: they are sampled rather than counted exactly."
          >
            <Table<CacheNamespaceStatus>
              rowKey="key"
              size="small"
              pagination={false}
              dataSource={state.data.namespaces}
              columns={[
                { title: 'Cache', dataIndex: 'label', width: 220 },
                { title: 'What it holds', dataIndex: 'description' },
                {
                  title: 'Entries',
                  dataIndex: 'entries',
                  width: 140,
                  render: (value: number | null) => (value === null ? '—' : value === 0 ? 'None' : <span>about {value.toLocaleString('en-AU')}</span>),
                },
                { title: 'Expires after', dataIndex: 'ttlSeconds', width: 140, render: (value: number) => duration(value) },
                { title: 'Last cleared', dataIndex: 'lastClearedAt', width: 190, render: (value: string | null) => (value ? formatDateTime(value) : 'Never') },
                {
                  title: <span className="sr-only">Actions</span>,
                  width: 110,
                  render: (_: unknown, record) =>
                    mayClear ? (
                      <Button size="small" onClick={() => clear('namespace', record.key, record.label, 'These entries are rebuilt from the database the next time someone asks for them. Nothing is lost.')}>
                        Clear
                      </Button>
                    ) : null,
                },
              ]}
            />
          </TableCard>

          <TableCard title="Public pages" description="Pages the site serves from a saved copy. Refreshing one rebuilds it in the background.">
            <Table<CacheTagStatus>
              rowKey="key"
              size="small"
              pagination={false}
              dataSource={state.data.tags}
              columns={[
                { title: 'Pages', dataIndex: 'label', width: 220 },
                { title: 'What it covers', dataIndex: 'description' },
                { title: 'Last cleared', dataIndex: 'lastClearedAt', width: 190, render: (value: string | null) => (value ? formatDateTime(value) : 'Never') },
                {
                  title: <span className="sr-only">Actions</span>,
                  width: 110,
                  render: (_: unknown, record) =>
                    mayClear ? (
                      <Button size="small" onClick={() => clear('tag', record.key, record.label, 'These pages are refreshed in the background, the same way publishing refreshes them.')}>
                        Refresh
                      </Button>
                    ) : null,
                },
              ]}
            />
          </TableCard>

          {!mayClear && (
            <Alert type="info" showIcon style={{ marginTop: 4 }} message="You can see the caches but not clear them." />
          )}
        </>
      )}
    </div>
  );
}
