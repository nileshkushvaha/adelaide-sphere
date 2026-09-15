import type { ReactNode } from 'react';
import { Alert } from 'antd';
import { Link } from 'react-router';
import { queuesApi } from '@/api/system';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { useAsync } from '@/shared/useAsync';

/**
 * Says so when the background worker has stopped, in the terms of the screen it
 * appears on: images waiting to be prepared, enquiry emails waiting to be sent.
 *
 * Worker liveness is only asked for when the reader may see the queues; for
 * anyone else nothing is shown, rather than a guess. `otherwise` renders when
 * the worker is running (or its state is not known), so a screen can keep its
 * own, softer hint without asking for liveness twice.
 */
export function WorkerStoppedAlert({ consequence, otherwise = null }: { consequence: ReactNode; otherwise?: ReactNode }) {
  const { can } = useCapabilities();
  const mayViewQueues = can(PERMISSION.systemQueuesView);
  const [liveness] = useAsync(() => (mayViewQueues ? queuesApi.workers() : Promise.resolve(null)), [mayViewQueues]);
  const stopped = liveness.status === 'ready' && liveness.data !== null && !liveness.data.healthy;

  if (!stopped) return <>{otherwise}</>;
  return (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 20 }}
      message="Background processing is not running"
      description={
        <>
          {consequence} <Link to="/system/queues">Check background processing</Link>
        </>
      }
    />
  );
}
