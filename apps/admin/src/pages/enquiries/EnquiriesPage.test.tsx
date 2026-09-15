import { screen, within } from '@testing-library/react';
import { EnquiriesPage } from './EnquiriesPage';
import { renderWithProviders, authenticatedProvider, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const now = '2026-09-06T00:00:00.000Z';
const enquiry = {
  id: 'e1', kind: 'business', businessId: 'b1', businessName: 'Enquiry Test Bakery', name: 'Jo Visitor', email: 'jo@example.com', phone: '03 9000 4444',
  subject: 'Catering for twenty people', message: 'Do you cater for office breakfasts?', handlingStatus: 'new', deliveryStatus: 'failed',
  deliveryAttempts: 5, lastError: 'provider rejected', suppressionReason: null, deliveredAt: null, handledByAdminId: null,
  acknowledgedVersion: '2026-09-01', version: 1, createdAt: now,
};
const meta = { page: 1, pageSize: 20, total: 1, pageCount: 1 };

describe('enquiries page', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.startsWith('/api/v1/admin/enquiries') && method === 'GET') return jsonResponse(200, { data: [enquiry], meta });
      if (url === '/api/v1/admin/enquiries/e1' && method === 'PATCH') return jsonResponse(200, { data: { ...enquiry, handlingStatus: 'inProgress', version: 2 } });
      if (url === '/api/v1/admin/enquiries/e1/retry') return jsonResponse(200, { data: { ...enquiry, deliveryStatus: 'queued', lastError: null, version: 2 } });
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows delivery and handling state separately and starts handling', async () => {
    const ue = user();
    renderWithProviders(<EnquiriesPage />, { initialEntries: ['/admin/enquiries?deliveryStatus=failed'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Enquiries' })).toBeInTheDocument();
    const row = (await screen.findByText('Enquiry Test Bakery')).closest('tr')!;
    expect(within(row).getByText('failed')).toBeInTheDocument();
    expect(within(row).getByText('new')).toBeInTheDocument();
    // The business picker also fetches, so find the queue's own request.
    expect(calls.map((c) => c.url)).toContain('/api/v1/admin/enquiries?deliveryStatus=failed&page=1&pageSize=20');
    await ue.click(within(row).getByRole('button', { name: /^Start handling/ }));
    expect(JSON.parse(calls.find((c) => c.method === 'PATCH')!.body!)).toEqual({ expectedVersion: 1, handlingStatus: 'inProgress' });
  });

  it('re-queues a failed delivery with an audited reason', async () => {
    const ue = user();
    renderWithProviders(<EnquiriesPage />, { initialEntries: ['/admin/enquiries'] });
    const row = (await screen.findByText('Enquiry Test Bakery')).closest('tr')!;
    await ue.click(within(row).getByRole('button', { name: /retry delivery/i }));
    const dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByLabelText(/reason/i), 'Owner reported non-delivery');
    await ue.click(within(dialog).getByRole('button', { name: /^retry delivery$/i }));
    expect(JSON.parse(calls.find((c) => c.url.endsWith('/retry'))!.body!)).toEqual({ expectedVersion: 1, reason: 'Owner reported non-delivery' });
  });

  it('hides write actions for a read-only enquiry role', async () => {
    const provider = authenticatedProvider();
    provider.getPermissions = async () => ['enquiries.read'];
    renderWithProviders(<EnquiriesPage />, { initialEntries: ['/admin/enquiries'], authProvider: provider });
    const row = (await screen.findByText('Enquiry Test Bakery')).closest('tr')!;
    expect(within(row).queryByRole('button', { name: /retry delivery/i })).not.toBeInTheDocument();
    // The accessible names carry the subject ("Close: Catering…"), so match the verb.
    expect(within(row).queryByRole('button', { name: /^Close/ })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: /^Start handling/ })).not.toBeInTheDocument();
  });
});
