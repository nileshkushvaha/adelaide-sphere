import { useState } from 'react';
import { Alert, App, Button, Drawer, Input, Modal, Space, Switch, Table, Tooltip, Typography } from 'antd';
import { schedulesApi, type ScheduledRun, type ScheduledTask } from '@/api/system';
import { PERMISSION } from '@/auth/permissions';
import { useCapabilities } from '@/auth/access-control';
import { PageHeader, Pill, StatusTag } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { SCHEDULED_RUN_RETENTION_DAYS } from '@adelaide-sphere/domain';
import { useBusy } from '@/shared/useBusy';
import { tablePagination } from '@/shared/tablePagination';
import { PAGE_SIZES } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';


const duration = (ms: number | null) => (ms === null ? '—' : ms < 1_000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)}s`);

/**
 * Scheduled tasks (SRS 1.2 TASK 001–006).
 *
 * There is no field on this screen that accepts a command, a schedule or a
 * payload: the tasks come from the server's registry, and the only thing sent
 * back is which one to run or switch. A task the product's correctness depends
 * on shows why it cannot be switched off rather than offering a control that
 * would fail.
 */
export function ScheduledTasksPage() {
  useDocumentTitle('Scheduled tasks');
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const [reloadKey, setReloadKey] = useState(0);
  const [history, setHistory] = useState<ScheduledTask | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySize, setHistorySize] = useState(PAGE_SIZES[1]!);
  const [state, reload] = useAsync(() => schedulesApi.list(), [reloadKey]);
  const [runs] = useAsync(() => (history ? schedulesApi.runs(history.code, historyPage, historySize) : Promise.resolve(null)), [history?.code, historyPage, historySize, reloadKey]);

  const mayRun = can(PERMISSION.systemSchedulesRun);
  const mayManage = can(PERMISSION.systemSchedulesManage);

  const [pending, setPending] = useState<ScheduledTask | null>(null);
  const [typed, setTyped] = useState('');
  const [running, setRunning] = useState(false);
  // One switch at a time, so a row cannot be toggled twice while the first
  // request is still in flight.
  const [busy, run] = useBusy();

  const openRun = (task: ScheduledTask) => {
    setTyped('');
    setPending(task);
  };

  /**
   * A high-impact task publishes or deletes something, so confirming it means
   * typing its name rather than clicking through a dialog you had stopped
   * reading three tasks ago (TASK 005).
   */
  const confirmRun = async () => {
    if (!pending) return;
    // Enter in the confirmation field submits, so without this a second press
    // before the first request resolves runs the task twice.
    if (running) return;
    if (pending.highImpact && typed.trim() !== pending.code) {
      message.error('Type the task code to confirm.');
      return;
    }
    setRunning(true);
    try {
      await schedulesApi.run(pending.code);
      message.success('Sent to the worker. Its outcome appears in the history.');
      setPending(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setRunning(false);
    }
  };

  /**
   * Switching a task off stops recurring work indefinitely and nothing on the
   * screen would say so afterwards beyond one grey switch, so it is confirmed
   * and names the task. Switching one back on is ordinary and is not.
   */
  const setEnabled = (task: ScheduledTask, enabled: boolean) => {
    const apply = () =>
      run(async () => {
        try {
          await schedulesApi.setEnabled(task.code, enabled);
          message.success(enabled ? `${task.label} is on again.` : `${task.label} is off. It will not run until it is switched back on.`);
          setReloadKey((key) => key + 1);
        } catch (error) {
          message.error(errorMessage(error));
        }
      });
    if (enabled) return void apply();
    modal.confirm({
      title: `Stop running ${task.label}?`,
      content: `It will not run on its schedule again until someone switches it back on. ${task.description}`,
      okText: 'Switch it off',
      okButtonProps: { danger: true },
      onOk: apply,
    });
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'System' }, { label: 'Scheduled tasks' }]}
        title="Scheduled tasks"
        description="Timed jobs the system runs. Run one now, check recent runs, or pause optional ones."
        actions={<Button onClick={reload}>Refresh</Button>}
      />

      {state.status === 'error' && (
        <Alert type="error" showIcon message={state.message} description={state.reference} action={<Button onClick={reload}>Retry</Button>} style={{ marginBottom: 16 }} />
      )}

      <Table<ScheduledTask>
        rowKey="code"
        loading={state.status === 'loading'}
        dataSource={state.status === 'ready' ? state.data : []}
        pagination={false}
        scroll={{ x: 900 }}
        columns={[
          {
            title: 'Task',
            dataIndex: 'label',
            render: (_: unknown, task) => (
              <Space direction="vertical" size={2}>
                <Space size={8}>
                  <strong>{task.label}</strong>
                  {task.running && <StatusTag status="running" />}
                  {!task.enabled && <Pill>off</Pill>}
                </Space>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {task.description}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: 'Runs',
            dataIndex: 'scheduleLabel',
            width: 200,
            render: (_: unknown, task) => (
              <Space direction="vertical" size={0}>
                <span>{task.scheduleLabel}</span>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {task.timezone}
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: 'Last run',
            key: 'last',
            width: 240,
            render: (_: unknown, task) =>
              task.lastOutcome === null ? (
                <Typography.Text type="secondary">Not run yet</Typography.Text>
              ) : (
                <Space direction="vertical" size={2}>
                  <Space size={8}>
                    <StatusTag status={task.lastOutcome} />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {duration(task.lastDurationMs)}
                    </Typography.Text>
                  </Space>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {task.lastDetail ?? formatDateTime(task.lastStartedAt ?? '')}
                  </Typography.Text>
                </Space>
              ),
          },
          {
            title: 'On',
            key: 'enabled',
            width: 90,
            render: (_: unknown, task) =>
              task.requiredForCorrectness ? (
                <Tooltip title="Publication and retention are obligations, not preferences, so this task cannot be switched off.">
                  <Switch checked disabled aria-label={`${task.label} is always on`} />
                </Tooltip>
              ) : (
                <Switch
                  checked={task.enabled}
                  disabled={!mayManage || busy}
                  loading={busy}
                  aria-label={`Switch ${task.label} ${task.enabled ? 'off' : 'on'}`}
                  onChange={(checked) => setEnabled(task, checked)}
                />
              ),
          },
          {
            title: '',
            key: 'actions',
            width: 190,
            render: (_: unknown, task) => (
              <Space wrap>
                <Button size="small" onClick={() => { setHistory(task); setHistoryPage(1); }}>
                  History
                </Button>
                {mayRun && task.manualRunAllowed && (
                  <Button size="small" type="primary" disabled={!task.enabled} onClick={() => openRun(task)}>
                    Run now
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={pending !== null}
        title={pending ? `Run “${pending.label}” now?` : ''}
        okText="Run now"
        okButtonProps={{ danger: pending?.highImpact, loading: running }}
        onOk={() => void confirmRun()}
        onCancel={() => setPending(null)}
        destroyOnHidden
      >
        {pending && (
          <>
            <p style={{ marginTop: 0 }}>{pending.description}</p>
            <p>It runs on the worker, not here, and its next scheduled run ({pending.scheduleLabel.toLowerCase()}) is unaffected.</p>
            {pending.highImpact && (
              <>
                <p style={{ marginBottom: 8 }}>
                  This task changes published content or deletes records. Type <strong>{pending.code}</strong> to confirm.
                </p>
                <Input value={typed} placeholder={pending.code} aria-label={`Type ${pending.code} to confirm`} onChange={(event) => setTyped(event.target.value)} onPressEnter={() => void confirmRun()} />
              </>
            )}
          </>
        )}
      </Modal>

      <Drawer
        open={history !== null}
        onClose={() => setHistory(null)}
        width={720}
        title={history ? `${history.label} — recent runs` : ''}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          Outcomes and durations, kept for {SCHEDULED_RUN_RETENTION_DAYS} days. Changes are counted, not recorded.
        </Typography.Paragraph>
        <Table<ScheduledRun>
          rowKey="id"
          size="small"
          loading={runs.status === 'loading'}
          dataSource={runs.status === 'ready' && runs.data ? runs.data.data : []}
          pagination={
            runs.status === 'ready' && runs.data
              ? tablePagination(runs.data.meta, { pageSize: historySize, setPage: setHistoryPage, setPageSize: (size) => { setHistorySize(size); setHistoryPage(1); } })
              : false
          }
          columns={[
            { title: 'Started', dataIndex: 'startedAt', width: 180, render: (value: string) => formatDateTime(value) },
            { title: 'Trigger', dataIndex: 'trigger', width: 100 },
            { title: 'Outcome', dataIndex: 'outcome', width: 110, render: (value: string) => <StatusTag status={value} /> },
            { title: 'Took', dataIndex: 'durationMs', width: 90, render: (value: number | null) => duration(value) },
            { title: 'Detail', dataIndex: 'detail', render: (value: string | null) => value ?? '—' },
          ]}
        />
      </Drawer>
    </div>
  );
}
