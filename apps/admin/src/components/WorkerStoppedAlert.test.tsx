import { screen } from '@testing-library/react';
import { WorkerStoppedAlert } from './WorkerStoppedAlert';
import { providerWithPermissions, renderWithProviders } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const liveness = (healthy: boolean) => ({ data: { healthy, workers: [], expectedQueues: [], detail: '' } });

describe('WorkerStoppedAlert', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('says what a stopped worker means for this screen', async () => {
    globalThis.fetch = (async () => jsonResponse(200, liveness(false))) as typeof fetch;
    renderWithProviders(<WorkerStoppedAlert consequence="Enquiry emails are waiting." otherwise={<p>All fine</p>} />, { authProvider: providerWithPermissions(['system.queues.view']) });
    expect(await screen.findByText('Background processing is not running')).toBeInTheDocument();
    expect(screen.getByText(/Enquiry emails are waiting/)).toBeInTheDocument();
    expect(screen.queryByText('All fine')).not.toBeInTheDocument();
  });

  it('shows the screen’s own content while the worker runs', async () => {
    globalThis.fetch = (async () => jsonResponse(200, liveness(true))) as typeof fetch;
    renderWithProviders(<WorkerStoppedAlert consequence="Enquiry emails are waiting." otherwise={<p>All fine</p>} />, { authProvider: providerWithPermissions(['system.queues.view']) });
    expect(await screen.findByText('All fine')).toBeInTheDocument();
  });

  // Narrowed permissions last: the capability store is shared across tests.
  it('asks nothing and claims nothing for a reader who cannot see the queues', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse(200, liveness(false));
    }) as typeof fetch;
    renderWithProviders(<WorkerStoppedAlert consequence="Enquiry emails are waiting." />, { authProvider: providerWithPermissions(['media.view']) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.some((url) => url.includes('/queues/workers'))).toBe(false);
    expect(screen.queryByText('Background processing is not running')).not.toBeInTheDocument();
  });
});
