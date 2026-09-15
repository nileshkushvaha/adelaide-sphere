import { Button, Col, Row, Typography } from 'antd';
import { Link } from 'react-router';
import { queuesApi } from '@/api/system';
import { PERMISSION } from '@/auth/permissions';
import { useCapabilities } from '@/auth/access-control';
import { ErrorState, SectionCard, StatusTag } from '@/components/ui';
import { brand } from '@/config/theme';
import { useAsync } from '@/shared/useAsync';

/** Plain-language age; "1757280000000" tells an operator nothing. */
function age(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5_400) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} hours ago`;
}

function Line({ label, value, detail }: { label: string; value: React.ReactNode; detail?: string }) {
  return (
    <div style={{ paddingBlock: 10, borderBottom: `1px solid ${brand.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Typography.Text style={{ fontWeight: 500 }}>{label}</Typography.Text>
        {value}
      </div>
      {detail && (
        <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 2 }}>
          {detail}
        </Typography.Text>
      )}
    </div>
  );
}

/**
 * Background processing, on the dashboard, for administrators who may see it.
 *
 * A queue that answers is not the same as a worker that is running — the
 * distinction the queue monitor makes, summarised here so the first screen of
 * the day says whether anything is being processed at all.
 */
export function SystemHealthCard() {
  const { can } = useCapabilities();
  const mayView = can(PERMISSION.systemQueuesView);
  const [state, reload] = useAsync(() => (mayView ? queuesApi.workers() : Promise.resolve(null)), [mayView]);

  if (!mayView) return null;

  return (
    <SectionCard
      title="Background processing"
      description="Email delivery, image processing and scheduled publishing all run here."
      extra={<Link to="/system/queues">Queue monitor</Link>}
    >
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      {state.status === 'loading' && (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Checking…
        </Typography.Text>
      )}
      {state.status === 'ready' && state.data && (
        <Row gutter={[24, 0]}>
          <Col xs={24} lg={12}>
            <Line
              label="Workers"
              value={<StatusTag status={state.data.healthy ? 'running' : 'stopped'} />}
              detail={state.data.detail}
            />
            {state.data.workers.length > 0 && (
              <Line
                label="Last report"
                value={<Typography.Text style={{ fontWeight: 500 }}>{age(state.data.oldestHeartbeatAgeSeconds)}</Typography.Text>}
                detail={state.data.workers.length === 1 ? 'One worker is running.' : `${state.data.workers.length} workers are running.`}
              />
            )}
          </Col>
          <Col xs={24} lg={12}>
            <Line
              label="Scheduled tasks"
              value={<StatusTag status={state.data.scheduler.healthy ? 'on schedule' : 'behind'} />}
              detail={state.data.scheduler.detail}
            />
            {state.data.scheduler.stale.length > 0 && (
              <div style={{ paddingTop: 10 }}>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  Waiting: {state.data.scheduler.stale.map((task) => task.label).join(', ')}.
                </Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <Link to="/system/schedules">
                    <Button size="small">Open scheduled tasks</Button>
                  </Link>
                </div>
              </div>
            )}
          </Col>
        </Row>
      )}
    </SectionCard>
  );
}
