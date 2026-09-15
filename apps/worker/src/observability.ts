import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const workerRegistry = new Registry();
workerRegistry.setDefaultLabels({ service: 'worker' });
collectDefaultMetrics({ register: workerRegistry, prefix: 'ms_' });

/** Job name is a registry value and outcome is a closed set, so both are bounded labels. */
export const jobsProcessed = new Counter({
  name: 'ms_worker_jobs_total',
  help: 'Jobs finished by this worker, by job name and outcome.',
  labelNames: ['job', 'outcome'] as const, // completed | failed
  registers: [workerRegistry],
});

export const jobDuration = new Histogram({
  name: 'ms_worker_job_duration_seconds',
  help: 'Time to run one job, by job name.',
  labelNames: ['job'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [workerRegistry],
});

/**
 * Scheduled task outcomes, recorded where the run happens. Both labels are
 * registry values, so the series count is fixed by the code.
 */
export const scheduledTaskRuns = new Counter({
  name: 'ms_scheduled_task_runs_total',
  help: 'Scheduled task runs by task code and outcome.',
  labelNames: ['task', 'outcome'] as const,
  registers: [workerRegistry],
});

export const workerUp = new Gauge({
  name: 'ms_worker_up',
  help: '1 while this worker process is running and consuming its queue.',
  registers: [workerRegistry],
});

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Optional metrics endpoint for the worker (post-audit remediation, MON 001).
 *
 * The worker has no product HTTP surface and this does not give it one: it
 * serves `/metrics` and `/health` only, is off unless a port is configured, and
 * binds to the loopback interface unless a token is set — the same two ways in
 * as the API's endpoint, refusing everything else with 404.
 */
export function startMetricsServer(port: number, token: string | undefined, log: (line: string) => void, bind = '127.0.0.1'): Server {
  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    const header = req.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const authorised = token !== undefined ? presented !== '' && tokenMatches(presented, token) : LOOPBACK.has(req.socket.remoteAddress ?? '');
    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"status":"ok"}');
      return;
    }
    if (path !== '/metrics' || !authorised) {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":{"code":"NOT_FOUND","message":"Resource not found"}}');
      return;
    }
    void workerRegistry
      .metrics()
      .then((body) => res.writeHead(200, { 'Content-Type': workerRegistry.contentType, 'Cache-Control': 'no-store' }).end(body))
      .catch(() => res.writeHead(503, { 'Content-Type': 'text/plain' }).end('metrics unavailable\n'));
  });
  // Loopback by default. Binding wider is an explicit decision (WORKER_METRICS_BIND),
  // taken when the scraper is a separate container on an internal network — and
  // it is refused without a token, so widening the bind alone cannot expose it.
  server.listen(port, bind, () => log(`metrics on ${bind}:${port}`));
  return server;
}
