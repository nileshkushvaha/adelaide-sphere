import { useEffect, useState } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { getLiveness } from '@/api/health';
import { isApiError } from '@/api/errors';
import { StatusTag } from '@/components/ui';

type Status =
  | { state: 'loading' }
  | { state: 'available'; requestId: string | null }
  | { state: 'unavailable'; message: string; reference: string | null };

/**
 * Checks API liveness once on mount and again only when the user asks.
 * No background polling (it would add load and hide real outages behind flapping).
 */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  // Incrementing `attempt` re-runs the effect; the click handler also resets to loading.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getLiveness(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setStatus({ state: 'available', requestId: result.requestId });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isApiError(error)) {
          if (error.kind === 'aborted') return;
          setStatus({ state: 'unavailable', message: error.userMessage, reference: error.requestId ? error.reference : error.code });
        } else {
          setStatus({ state: 'unavailable', message: 'The API returned an unexpected response.', reference: null });
        }
      });
    return () => controller.abort();
  }, [attempt]);

  const recheck = () => {
    setStatus({ state: 'loading' });
    setAttempt((n) => n + 1);
  };

  const retry = (
    <Button size="small" icon={<ReloadOutlined aria-hidden="true" />} onClick={recheck} disabled={status.state === 'loading'}>
      Check again
    </Button>
  );

  return (
    <section aria-labelledby="api-status-heading" aria-live="polite" aria-busy={status.state === 'loading'}>
      <h2 id="api-status-heading" className="sr-only">
        Connection to the API
      </h2>
      {status.state === 'loading' && (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Checking the connection…
        </Typography.Text>
      )}
      {status.state === 'available' && (
        // Healthy is a one-line fact, not a full-width green panel: the loud
        // treatment is reserved for the state an administrator must act on.
        <Space size={10} align="center">
          <StatusTag status="connected" />
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            This interface can reach the API.
          </Typography.Text>
          {retry}
        </Space>
      )}
      {status.state === 'unavailable' && (
        <Alert
          type="error"
          showIcon
          message="Cannot reach the API"
          description={
            <Space direction="vertical" size={4}>
              <span>{status.message} Nothing you save will be stored until the connection returns.</span>
              {status.reference && <Typography.Text type="secondary">Quote reference {status.reference} if you report this.</Typography.Text>}
              {retry}
            </Space>
          }
        />
      )}
    </section>
  );
}
