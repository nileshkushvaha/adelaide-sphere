import { screen, within } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { CommentsPage } from './CommentsPage';
import { renderWithProviders, authenticatedProvider, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const now = '2026-09-06T00:00:00.000Z';
const comment = {
  id: 'c1', postId: 'p1', postTitle: 'Where to find laneway coffee', displayName: 'Sam Reader', email: 'sam@example.com',
  originalText: 'Great guide, thanks for the tips.', publicText: null, redactionReason: null, status: 'pending',
  moderationReason: null, moderatorAdminId: null, decidedAt: null, openReportCount: 1, acknowledgedVersion: '2026-09-01', version: 1, createdAt: now,
};
const meta = { page: 1, pageSize: 20, total: 1, pageCount: 1 };

describe('comments moderation queue', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.startsWith('/api/v1/admin/comments') && method === 'GET') return jsonResponse(200, { data: [comment], meta });
      if (url === '/api/v1/admin/comments/c1/approve') return jsonResponse(200, { data: { ...comment, status: 'approved', version: 2 } });
      if (url === '/api/v1/admin/comments/c1/reject') return jsonResponse(200, { data: { ...comment, status: 'rejected', version: 2 } });
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('publishes a pending comment and flags reported ones', async () => {
    const ue = user();
    renderWithProviders(<CommentsPage />, { initialEntries: ['/admin/comments?status=pending'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Comments' })).toBeInTheDocument();
    const row = (await screen.findByText('Where to find laneway coffee')).closest('tr')!;
    expect(within(row).getByText('pending')).toBeInTheDocument();
    expect(within(row).getByLabelText('Reported')).toBeInTheDocument();
    // The article picker also fetches, so find the queue's own request.
    expect(calls.map((c) => c.url)).toContain('/api/v1/admin/comments?status=pending&page=1&pageSize=20');
    await ue.click(within(row).getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Publish comment' }));
    expect(JSON.parse(calls.find((c) => c.url.endsWith('/approve'))!.body!)).toEqual({ expectedVersion: 1 });
  });

  it('requires a reason to reject', async () => {
    const ue = user();
    renderWithProviders(<CommentsPage />, { initialEntries: ['/admin/comments'] });
    const row = (await screen.findByText('Where to find laneway coffee')).closest('tr')!;
    await ue.click(within(row).getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Reject comment' }));
    expect(await within(dialog).findByText('A reason is required')).toBeInTheDocument();
    await ue.type(within(dialog).getByLabelText(/reason/i), 'Off topic');
    // Not an exact name: Ant's loading icon is still animating out under jsdom,
    // which leaves an empty span inside the button's accessible name.
    await ue.click(screen.getByRole('button', { name: /Reject comment/ }));
    expect(JSON.parse(calls.find((c) => c.url.endsWith('/reject'))!.body!)).toEqual({ expectedVersion: 1, reason: 'Off topic' });
  });

  it('tells an empty queue apart from filtered-out results, and clears the filters', async () => {
    const ue = user();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push({ url: String(input), method: 'GET' });
      return jsonResponse(200, { data: [], meta: { ...meta, total: 0 } });
    }) as typeof fetch;

    const { unmount } = renderWithProviders(<CommentsPage />, { initialEntries: ['/admin/comments'] });
    expect(await screen.findByText('No comments yet')).toBeInTheDocument();
    unmount();

    renderWithProviders(<CommentsPage />, { initialEntries: ['/admin/comments?status=pending'] });
    expect(await screen.findByText('No comments match your filters')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('No comments yet')).toBeInTheDocument();
  });

  it('reports a failed load instead of showing an empty queue', async () => {
    globalThis.fetch = (async () => jsonResponse(500, { error: { code: 'INTERNAL', message: 'Boom', requestId: 'req-7' } })) as typeof fetch;
    renderWithProviders(<CommentsPage />, { initialEntries: ['/admin/comments'] });
    const alert = await screen.findByRole('alert');
    // A server failure is described in the client's words, never the server's, with the reference to quote.
    expect(alert).toHaveTextContent(/unexpected problem/i);
    expect(alert).toHaveTextContent(/req-7/);
    expect(alert).not.toHaveTextContent(/boom/i);
    expect(screen.queryByText('No comments yet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('sends one decision when the confirm button is clicked twice', async () => {
    const ue = user();
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.endsWith('/approve')) {
        await held;
        return jsonResponse(200, { data: { ...comment, status: 'approved', version: 2 } });
      }
      return jsonResponse(200, { data: [comment], meta });
    }) as typeof fetch;

    renderWithProviders(<CommentsPage />, { initialEntries: ['/admin/comments'] });
    const row = (await screen.findByText('Where to find laneway coffee')).closest('tr')!;
    await ue.click(within(row).getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Publish comment' });
    await ue.click(confirm);
    await ue.click(confirm);
    expect(calls.filter((c) => c.url.endsWith('/approve'))).toHaveLength(1);
    release!();
  });

  it('hides the queue without comments.moderate', async () => {
    const provider = authenticatedProvider();
    provider.getPermissions = async () => ['listings.read'];
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/'], authProvider: provider });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: 'Comments' })).not.toBeInTheDocument();
  });
});
