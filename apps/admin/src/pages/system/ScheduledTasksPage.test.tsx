import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduledTasksPage } from '@/pages/system/ScheduledTasksPage';
import { renderWithProviders, providerWithPermissions } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const required = {
  code: 'activity.retention',
  label: 'Apply activity log retention',
  description: 'Removes activity events older than 365 days.',
  scheduleLabel: 'Daily at 03:10 Adelaide time',
  timezone: 'Australia/Adelaide',
  missedRunPolicy: 'skip-to-next',
  timeoutMs: 300000,
  retries: 1,
  manualRunAllowed: true,
  highImpact: true,
  requiredForCorrectness: true,
  safeToOverlap: false,
  enabled: true,
  lastStartedAt: '2026-09-08T03:10:00.000Z',
  lastFinishedAt: '2026-09-08T03:10:01.000Z',
  lastOutcome: 'succeeded',
  lastDurationMs: 900,
  lastDetail: 'Removed 7 activity events',
  running: false,
};

const optional = { ...required, code: 'queue.clean-metadata', label: 'Tidy finished job records', highImpact: false, requiredForCorrectness: false, lastOutcome: null, lastDetail: null, lastDurationMs: null };

function fakeFetch(onPost?: (url: string, body: unknown) => void) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') {
      onPost?.(url, init.body ? JSON.parse(String(init.body)) : undefined);
      return jsonResponse(200, { data: { dispatched: true } });
    }
    if (url.includes('/runs')) return jsonResponse(200, { data: [], meta: { page: 1, pageSize: 20, total: 0, pageCount: 1 } });
    return jsonResponse(200, { data: [required, optional] });
  }) as typeof fetch;
}

/** Scheduled tasks (SRS 1.2 TASK 001–006). */
describe('ScheduledTasksPage', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows what each task does, when it runs and how the last run went', async () => {
    globalThis.fetch = fakeFetch();
    renderWithProviders(<ScheduledTasksPage />, { initialEntries: ['/admin/system/schedules'], authProvider: providerWithPermissions(['system.schedules.view']) });

    expect(await screen.findByRole('heading', { level: 1, name: 'Scheduled tasks' })).toBeInTheDocument();
    expect(await screen.findByText('Apply activity log retention')).toBeInTheDocument();
    expect(screen.getAllByText('Daily at 03:10 Adelaide time').length).toBeGreaterThan(0);
    expect(screen.getByText('Removed 7 activity events')).toBeInTheDocument();
    expect(screen.getByText('Not run yet')).toBeInTheDocument();
  });

  it('offers no run or switch to an operator who may only look', async () => {
    globalThis.fetch = fakeFetch();
    renderWithProviders(<ScheduledTasksPage />, { initialEntries: ['/admin/system/schedules'], authProvider: providerWithPermissions(['system.schedules.view']) });

    expect(await screen.findByText('Apply activity log retention')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run now/i })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /switch tidy finished job records off/i })).toBeDisabled();
  });

  it('will not offer to switch off a task the product depends on', async () => {
    globalThis.fetch = fakeFetch();
    renderWithProviders(<ScheduledTasksPage />, {
      initialEntries: ['/admin/system/schedules'],
      authProvider: providerWithPermissions(['system.schedules.view', 'system.schedules.manage']),
    });

    expect(await screen.findByRole('switch', { name: /apply activity log retention is always on/i })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /switch tidy finished job records off/i })).toBeEnabled();
  });

  it('asks a high-impact task to be confirmed by name, and refuses the wrong one', async () => {
    const posted: { url: string; body: unknown }[] = [];
    globalThis.fetch = fakeFetch((url, body) => posted.push({ url, body }));
    renderWithProviders(<ScheduledTasksPage />, {
      initialEntries: ['/admin/system/schedules'],
      authProvider: providerWithPermissions(['system.schedules.view', 'system.schedules.run']),
    });

    const rows = await screen.findAllByRole('button', { name: /run now/i });
    await userEvent.click(rows[0]!);
    expect(await screen.findByText(/changes published content or deletes records/i)).toBeInTheDocument();
    const confirm = () => screen.getAllByRole('button', { name: /^run now$/i }).at(-1)!;

    // Clicking through without typing the code must not dispatch anything.
    await userEvent.click(confirm());
    await waitFor(() => expect(posted).toHaveLength(0));

    await userEvent.type(screen.getByLabelText(/type activity.retention to confirm/i), 'activity.retention');
    await userEvent.click(confirm());
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.url).toContain('/admin/system/schedules/activity.retention/run');
    expect(posted[0]!.body).toEqual({});
  });

  it('sends only the task code when switching an optional task off', async () => {
    const posted: { url: string; body: unknown }[] = [];
    globalThis.fetch = fakeFetch((url, body) => posted.push({ url, body }));
    renderWithProviders(<ScheduledTasksPage />, {
      initialEntries: ['/admin/system/schedules'],
      authProvider: providerWithPermissions(['system.schedules.view', 'system.schedules.manage']),
    });

    await userEvent.click(await screen.findByRole('switch', { name: /switch tidy finished job records off/i }));
    // Switching a task off stops recurring work, so it is confirmed first.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/will not run on its schedule again/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Switch it off' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.url).toContain('/admin/system/schedules/queue.clean-metadata/enabled');
    expect(posted[0]!.body).toEqual({ enabled: false });
  });
});
