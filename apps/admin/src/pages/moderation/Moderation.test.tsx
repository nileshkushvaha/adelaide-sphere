import { screen, within } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { ReportsPage } from './ReportsPage';
import { ReviewsPage } from './ReviewsPage';
import { renderWithProviders, authenticatedProvider, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const now = '2026-09-06T00:00:00.000Z';
const review = {
  id: 'r1', businessId: 'b1', businessName: 'Review Test Cafe', displayName: 'Jo Visitor', email: 'jo@example.com', rating: 5,
  originalText: 'Excellent coffee and friendly staff every single morning.', publicText: null, redactionReason: null,
  status: 'pending', moderationReason: null, moderatorAdminId: null, decidedAt: null, repeatFlagged: true, openReportCount: 1,
  acknowledgedVersion: '2026-09-01', version: 1, createdAt: now,
};
const report = {
  id: 'rep1', reviewId: 'r1', businessId: 'b1', reason: 'privacy', details: 'Mentions my full name.', reporterEmail: 'reporter@example.com',
  targetSnapshot: 'Excellent coffee and friendly staff every single morning.', status: 'open', outcome: null, resolutionNote: null,
  moderatorAdminId: null, targetType: 'review', commentId: null, parentId: 'b1', targetStatus: 'approved', version: 1, createdAt: now, resolvedAt: null,
};
const meta = { page: 1, pageSize: 20, total: 1, pageCount: 1 };

describe('moderation pages', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  let rejectAttempts = 0;
  beforeEach(() => {
    calls.length = 0;
    rejectAttempts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.startsWith('/api/v1/admin/reviews') && method === 'GET') return jsonResponse(200, { data: [review], meta });
      if (url === '/api/v1/admin/reviews/r1/reject' && method === 'POST') {
        rejectAttempts += 1;
        if (rejectAttempts === 1) return jsonResponse(409, { error: { code: 'STALE_VERSION', message: 'This review was changed by someone else.', fields: {}, requestId: 'r' } });
        return jsonResponse(200, { data: { ...review, status: 'rejected', version: 2 } });
      }
      if (url === '/api/v1/admin/reviews/r1/redaction') return jsonResponse(200, { data: { ...review, publicText: 'Excellent coffee.', version: 2 } });
      if (url.startsWith('/api/v1/admin/reports') && method === 'GET') return jsonResponse(200, { data: [report], meta });
      if (url === '/api/v1/admin/reports/rep1/resolve') return jsonResponse(200, { data: { ...report, status: 'resolved', outcome: 'retain', version: 2 } });
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists pending reviews with flags and requires a reason to reject, surfacing stale conflicts', async () => {
    const ue = user();
    renderWithProviders(<ReviewsPage />, { initialEntries: ['/admin/reviews?status=pending'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Reviews' })).toBeInTheDocument();
    const row = (await screen.findByText('Review Test Cafe')).closest('tr')!;
    expect(within(row).getByText('pending')).toBeInTheDocument();
    expect(within(row).getByLabelText('Repeat submission')).toBeInTheDocument();
    expect(within(row).getByLabelText('Reported')).toBeInTheDocument();
    // The business picker also fetches, so find the queue's own request.
    expect(calls.map((c) => c.url)).toContain('/api/v1/admin/reviews?status=pending&page=1&pageSize=20');

    await ue.click(within(row).getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: /Reject review/ }));
    expect(await within(dialog).findByText('A reason is required')).toBeInTheDocument();
    await ue.type(within(dialog).getByLabelText(/reason/i), 'Contains personal information');
    await ue.click(within(dialog).getByRole('button', { name: /Reject review/ }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/changed by someone else/i);
    await ue.click(within(dialog).getByRole('button', { name: /Reject review/ }));
    const posts = calls.filter((c) => c.url === '/api/v1/admin/reviews/r1/reject');
    expect(posts).toHaveLength(2);
    expect(JSON.parse(posts[1]!.body!)).toEqual({ expectedVersion: 1, reason: 'Contains personal information' });
  });

  it('saves a redaction with a reason and never sends the rating', async () => {
    const ue = user();
    renderWithProviders(<ReviewsPage />, { initialEntries: ['/admin/reviews'] });
    const row = (await screen.findByText('Review Test Cafe')).closest('tr')!;
    await ue.click(within(row).getByRole('button', { name: 'Redact' }));
    const dialog = await screen.findByRole('dialog');
    await ue.clear(within(dialog).getByLabelText(/published text/i));
    await ue.type(within(dialog).getByLabelText(/published text/i), 'Excellent coffee.');
    await ue.type(within(dialog).getByLabelText(/^reason/i), 'Removed a staff name');
    await ue.click(within(dialog).getByRole('button', { name: /Save published text/ }));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(JSON.parse(patch.body!)).toEqual({ expectedVersion: 1, publicText: 'Excellent coffee.', reason: 'Removed a staff name' });
  });

  it('resolves an abuse report with an outcome and hides the queues without permission', async () => {
    const ue = user();
    renderWithProviders(<ReportsPage />, { initialEntries: ['/admin/reports?status=open'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Abuse reports' })).toBeInTheDocument();
    // The reason is shown in the report form's words, not as its stored code.
    const row = (await screen.findByText('Privacy concern')).closest('tr')!;
    await ue.click(within(row).getByRole('button', { name: /resolve/i }));
    const dialog = await screen.findByRole('dialog');
    await ue.type(within(dialog).getByLabelText(/note/i), 'No personal information found');
    await ue.click(within(dialog).getByRole('button', { name: /Resolve report/ }));
    const post = calls.find((c) => c.url === '/api/v1/admin/reports/rep1/resolve')!;
    expect(JSON.parse(post.body!)).toEqual({ expectedVersion: 1, outcome: 'retain', note: 'No personal information found' });
  });

  it('hides both queues from the navigation without the moderation permissions', async () => {
    const provider = authenticatedProvider();
    provider.getPermissions = async () => ['listings.read'];
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/'], authProvider: provider });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: 'Reviews' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abuse reports' })).not.toBeInTheDocument();
  });
});
