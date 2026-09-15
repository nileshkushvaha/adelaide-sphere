import { screen, within } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { renderWithProviders, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const admins = [
  { id: 'a1', email: 'admin@example.com', displayName: 'Test Admin', status: 'active', roles: ['super_admin'], totpEnabled: true, lastLoginAt: '2026-09-06T01:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', version: 3 },
  { id: 'a2', email: 'new@example.com', displayName: 'New Person', status: 'invited', roles: ['super_admin'], totpEnabled: false, lastLoginAt: null, createdAt: '2026-09-05T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z', version: 1 },
];

describe('Administrators page', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.startsWith('/api/v1/admin/admins') && (init?.method ?? 'GET') === 'GET') {
        return jsonResponse(200, { data: admins, meta: { page: 1, pageSize: 20, total: 2, pageCount: 1 } });
      }
      if (url.startsWith('/api/v1/admin/roles')) {
        return jsonResponse(200, {
          data: [
            { id: 'r1', key: 'super_admin', name: 'Super Admin', description: 'Everything', isSystem: true, isActive: true, version: 1, adminCount: 1, permissionCount: 60, updatedAt: '2026-09-01T00:00:00.000Z' },
            { id: 'r2', key: 'editor', name: 'Editor', description: 'Content only', isSystem: false, isActive: true, version: 1, adminCount: 0, permissionCount: 8, updatedAt: '2026-09-01T00:00:00.000Z' },
          ],
          meta: { page: 1, pageSize: 50, total: 2, pageCount: 1 },
        });
      }
      if (url === '/api/v1/admin/admins' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.email === 'taken@example.com') return jsonResponse(409, { error: { code: 'EMAIL_IN_USE', message: 'An administrator with that email already exists', fields: {}, requestId: 'r1' } });
        return jsonResponse(201, { data: { ...admins[1], id: 'a3', email: body.email, displayName: body.displayName } });
      }
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists administrators from the API with status and 2FA, and links to detail', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/admins'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Administrators' })).toBeInTheDocument();
    const row = (await screen.findByText('New Person')).closest('tr')!;
    expect(within(row).getByText('invited')).toBeInTheDocument();
    expect(within(row).getByText('Off')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Test Admin' }).getAttribute('href')).toMatch(/\/admins\/a1$/);
    expect(calls[0]?.url).toBe('/api/v1/admin/admins?page=1&pageSize=20&sort=createdAt&order=desc');
    expect(screen.getByRole('link', { name: 'Administrators' })).toBeInTheDocument(); // nav (admins.manage present)
  });

  it('invites on its own route, with roles chosen rather than assumed, and surfaces API conflicts', async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/admins/new'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'New administrator' })).toBeInTheDocument();

    await ue.type(screen.getByLabelText(/email/i), 'taken@example.com');
    await ue.type(screen.getByLabelText(/display name/i), 'Taken Person');
    // Nothing is sent until a role is chosen: an account with no access reads
    // as broken, and one with every access was never deliberately granted.
    await ue.click(screen.getByRole('button', { name: /create and send setup link/i }));
    expect(await screen.findByText(/choose at least one role/i)).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);

    await ue.click(screen.getByLabelText(/roles/i));
    await ue.click((await screen.findAllByTitle(/^Editor/)).at(-1)!);
    await ue.click(screen.getByRole('button', { name: /create and send setup link/i }));
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();

    await ue.clear(screen.getByLabelText(/email/i));
    await ue.type(screen.getByLabelText(/email/i), 'fresh@example.com');
    await ue.click(screen.getByRole('button', { name: /create and send setup link/i }));
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/v1/admin/admins' && c.body?.includes('fresh@example.com'));
    expect(post).toBeDefined();
    expect(JSON.parse(post!.body!)).toEqual({ email: 'fresh@example.com', displayName: 'Taken Person', roleKeys: ['editor'] });
  });

  it('offers the invite as a link, not a dialog', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/admins'] });
    expect(await screen.findByRole('link', { name: /new administrator/i })).toHaveAttribute('href', '/admin/admins/new');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
