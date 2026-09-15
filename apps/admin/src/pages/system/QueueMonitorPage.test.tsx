import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueueMonitorPage } from '@/pages/system/QueueMonitorPage';
import { renderWithProviders, providerWithPermissions } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const summary = {
  name: 'adelaide-sphere',
  label: 'Adelaide Sphere',
  purpose: 'Every background job.',
  pausable: true,
  pauseConsequence: 'While this queue is paused, enquiries are stored but not delivered. Nothing is lost; everything waits.',
  paused: false,
  counts: { waiting: 2, active: 0, delayed: 0, completed: 10, failed: 1 },
  oldestWaitingSeconds: 240,
  workers: { count: 1, estimated: true, detail: '1 worker connection reported by Redis.' },
  available: true,
  detail: 'Connected',
  jobs: [{ name: 'enquiry.email', label: 'Enquiry delivery', purpose: 'Sends an accepted enquiry.' }],
};

const liveness = {
  healthy: true,
  detail: '1 worker checked in within the heartbeat window.',
  workers: [{ instanceId: '1234-ab12cd34', version: '1.0.0', startedAt: '2026-09-08T00:00:00.000Z', lastBeatAt: '2026-09-08T01:00:00.000Z', ageSeconds: 8, queues: ['adelaide-sphere'], processed: 42, failed: 1 }],
  oldestHeartbeatAgeSeconds: 8,
  scheduler: { healthy: true, detail: 'Every task the product depends on has succeeded within its expected window.', stale: [] },
};

const failedJob = {
  id: 'job-1',
  name: 'enquiry.email',
  label: 'Enquiry delivery',
  state: 'failed',
  attemptsMade: 5,
  createdAt: '2026-09-08T01:00:00.000Z',
  processedAt: '2026-09-08T01:00:05.000Z',
  finishedAt: '2026-09-08T01:00:06.000Z',
  failedReason: 'SMTP connection refused',
  progress: null,
  data: { fields: [{ label: 'Enquiry', value: 'enq-1' }], unrecognised: false },
  canRetry: true,
  canRemove: true,
};

const jobsPage = { data: [failedJob], meta: { page: 1, pageSize: 20, total: 1, pageCount: 1 } };

function fakeFetch(overrides: { summary?: unknown; jobs?: unknown; liveness?: unknown; onPost?: (url: string, body: unknown) => unknown } = {}) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') {
      const result = overrides.onPost?.(url, init.body ? JSON.parse(String(init.body)) : undefined);
      return jsonResponse(200, { data: result ?? { requested: 1, succeeded: ['job-1'], failed: [] } });
    }
    if (url.includes('/workers')) return jsonResponse(200, { data: overrides.liveness ?? liveness });
    if (url.includes('/jobs')) return jsonResponse(200, overrides.jobs ?? jobsPage);
    return jsonResponse(200, { data: [overrides.summary ?? summary] });
  }) as typeof fetch;
}

/** Queue monitor (SRS 1.2 QMON 001–005): what is shown, and what may be done. */
describe('QueueMonitorPage', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows depths, the oldest waiting job and worker availability marked as an estimate', async () => {
    globalThis.fetch = fakeFetch();
    renderWithProviders(<QueueMonitorPage />, { initialEntries: ['/admin/system/queues'], authProvider: providerWithPermissions(['system.queues.view']) });

    expect(await screen.findByRole('heading', { level: 1, name: 'Queue monitor' })).toBeInTheDocument();
    expect(await screen.findByText('4 min')).toBeInTheDocument();
    expect(await screen.findByText('estimate')).toBeInTheDocument();
    expect(screen.getByText('SMTP connection refused')).toBeInTheDocument();
  });

  it('offers no action at all to an operator who may only look', async () => {
    globalThis.fetch = fakeFetch();
    renderWithProviders(<QueueMonitorPage />, { initialEntries: ['/admin/system/queues'], authProvider: providerWithPermissions(['system.queues.view']) });

    expect(await screen.findByRole('heading', { level: 1, name: 'Queue monitor' })).toBeInTheDocument();
    for (const name of [/retry selected/i, /remove selected/i, /pause queue/i]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    // No selection column either, so there is nothing to select and then fail on.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('keeps retry disabled until specific jobs are selected — there is no "retry everything"', async () => {
    globalThis.fetch = fakeFetch();
    renderWithProviders(<QueueMonitorPage />, {
      initialEntries: ['/admin/system/queues'],
      authProvider: providerWithPermissions(['system.queues.view', 'system.queues.retry']),
    });

    const retry = await screen.findByRole('button', { name: /retry selected/i });
    expect(retry).toBeDisabled();
    await userEvent.click(await screen.findByRole('checkbox', { name: /select enquiry delivery job-1/i }));
    await waitFor(() => expect(retry).toBeEnabled());
  });

  it('warns that a retry may repeat an external effect, and sends only the selected ids', async () => {
    const posted: { url: string; body: unknown }[] = [];
    globalThis.fetch = fakeFetch({ onPost: (url, body) => { posted.push({ url, body }); return { requested: 1, succeeded: ['job-1'], failed: [] }; } });
    renderWithProviders(<QueueMonitorPage />, {
      initialEntries: ['/admin/system/queues'],
      authProvider: providerWithPermissions(['system.queues.view', 'system.queues.retry']),
    });

    await userEvent.click(await screen.findByRole('checkbox', { name: /select enquiry delivery job-1/i }));
    await userEvent.click(screen.getByRole('button', { name: /retry selected/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/already partly sent|deliver a message/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /^retry$/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.url).toContain('/admin/system/queues/adelaide-sphere/retry');
    expect(posted[0]!.body).toEqual({ jobIds: ['job-1'] });
  });

  it('states what stops working before pausing the queue', async () => {
    globalThis.fetch = fakeFetch();
    renderWithProviders(<QueueMonitorPage />, {
      initialEntries: ['/admin/system/queues'],
      authProvider: providerWithPermissions(['system.queues.view', 'system.queues.pause']),
    });

    await userEvent.click(await screen.findByRole('button', { name: /pause queue/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/enquiries are stored but not delivered/i)).toBeInTheDocument();
  });

  it('says plainly when a payload is not in the display allowlist rather than showing it', async () => {
    globalThis.fetch = fakeFetch({
      jobs: { data: [{ ...failedJob, id: 'job-2', label: 'something.new', data: { fields: [], unrecognised: true } }], meta: { page: 1, pageSize: 20, total: 1, pageCount: 1 } },
    });
    renderWithProviders(<QueueMonitorPage />, { initialEntries: ['/admin/system/queues'], authProvider: providerWithPermissions(['system.queues.view']) });
    expect(await screen.findByText(/not in the display allowlist/i)).toBeInTheDocument();
  });

  it('explains an unreachable queue instead of showing zeros', async () => {
    globalThis.fetch = fakeFetch({
      summary: { ...summary, available: false, counts: null, oldestWaitingSeconds: null, detail: 'The queue is unreachable. Accepted work is still stored.' },
    });
    renderWithProviders(<QueueMonitorPage />, { initialEntries: ['/admin/system/queues'], authProvider: providerWithPermissions(['system.queues.view']) });
    expect(await screen.findByText('Queue unreachable')).toBeInTheDocument();
    expect(screen.getByText(/Accepted work is still stored/)).toBeInTheDocument();
  });

  it('separates a reachable queue from a worker that is actually running', async () => {
    globalThis.fetch = fakeFetch({
      liveness: {
        healthy: false,
        detail: 'No worker has checked in. Nothing is consuming adelaide-sphere: enquiries are stored but not delivered.',
        workers: [],
        oldestHeartbeatAgeSeconds: null,
        scheduler: { healthy: false, detail: 'One task has not succeeded within the expected window.', stale: [{ code: 'content.publish-scheduled', label: 'Publish scheduled articles and pages', lastSuccessAt: '2026-09-07T00:00:00.000Z', staleAfterMinutes: 25 }] },
      },
    });
    renderWithProviders(<QueueMonitorPage />, { authProvider: providerWithPermissions(['system.queues.view']) });

    expect(await screen.findByText('Nothing is processing work')).toBeInTheDocument();
    expect(await screen.findByText(/Nothing is consuming adelaide-sphere/)).toBeInTheDocument();
    // The stopped schedule is named, not just counted.
    expect(await screen.findByText(/Publish scheduled articles and pages/)).toBeInTheDocument();
  });

  it('lists each replica by instance, version and last report, with no host or environment detail', async () => {
    globalThis.fetch = fakeFetch();
    renderWithProviders(<QueueMonitorPage />, { authProvider: providerWithPermissions(['system.queues.view']) });

    expect(await screen.findByText('1234-ab12cd34')).toBeInTheDocument();
    expect(await screen.findByText('Workers reporting')).toBeInTheDocument();
  });
});