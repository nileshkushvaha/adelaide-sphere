import { screen, within } from '@testing-library/react';
import { RedirectEditorPage } from './RedirectEditorPage';
import { RedirectsPage } from './RedirectsPage';
import { renderWithProviders, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const now = '2026-09-06T00:00:00.000Z';
const redirect = {
  id: 'r1',
  sourcePath: '/business/old-cafe',
  targetPath: '/business/new-cafe',
  kind: 'permanent' as const,
  reason: 'Renamed',
  resourceType: 'business',
  resourceId: 'b1',
  createdByAdminId: 'admin1',
  isActive: true,
  createdAt: now,
  updatedAt: now,
};
const meta = { page: 1, pageSize: 25, total: 1, pageCount: 1 };

describe('SEO redirects', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.startsWith('/api/v1/admin/redirects/resolve') && method === 'GET') {
        const asked = new URL(url, 'http://x').searchParams.get('path');
        if (asked === '/business/old-cafe') {
          return jsonResponse(200, { data: { requestedPath: asked, normalisedPath: asked, rule: redirect, status: 301, targetPath: '/business/new-cafe', outcome: 'applies' } });
        }
        if (asked === '/business/paused') {
          return jsonResponse(200, { data: { requestedPath: asked, normalisedPath: asked, rule: { ...redirect, isActive: false }, status: null, targetPath: null, outcome: 'inactive' } });
        }
        return jsonResponse(200, { data: { requestedPath: asked, normalisedPath: asked, rule: null, status: null, targetPath: null, outcome: 'no-rule' } });
      }
      if (url.match(/\/api\/v1\/admin\/redirects\/[^/]+\/(de)?activate/) && method === 'POST') {
        return jsonResponse(200, { data: { ...redirect, isActive: url.endsWith('/activate') } });
      }
      if (url.startsWith('/api/v1/admin/redirects') && method === 'GET') return jsonResponse(200, { data: [redirect], meta });
      if (url === '/api/v1/admin/redirects' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { targetPath?: string | null };
        if (body.targetPath && body.targetPath.startsWith('http')) {
          return jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Target must be a site-relative path on this site', fields: { targetPath: ['Target must be a site-relative path on this site'] }, requestId: 'r' } });
        }
        return jsonResponse(201, { data: { ...redirect, id: 'r2' } });
      }
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists redirects with their source, target and type', async () => {
    renderWithProviders(<RedirectsPage />, { initialEntries: ['/admin/redirects'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'SEO redirects' })).toBeInTheDocument();
    const row = (await screen.findByText('/business/old-cafe')).closest('tr')!;
    expect(within(row).getByText('/business/new-cafe')).toBeInTheDocument();
    expect(within(row).getByText('Renamed')).toBeInTheDocument();
  });

  it('offers creation as a route rather than a dialog', async () => {
    renderWithProviders(<RedirectsPage />, { initialEntries: ['/admin/redirects'] });
    expect(await screen.findByRole('link', { name: /new redirect/i })).toHaveAttribute('href', '/admin/redirects/new');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates a 301 and hides the target field for a removed page', async () => {
    const ue = user();
    renderWithProviders(<RedirectEditorPage />, { initialEntries: ['/admin/redirects/new'] });
    await ue.type(await screen.findByLabelText(/old address/i), '/business/gone-cafe');
    await ue.type(screen.getByLabelText(/new address/i), '/business/new-cafe');
    await ue.click(screen.getByRole('button', { name: /save redirect/i }));
    const post = calls.find((call) => call.method === 'POST');
    expect(JSON.parse(post!.body!)).toMatchObject({ sourcePath: '/business/gone-cafe', targetPath: '/business/new-cafe', kind: 'permanent' });
  });

  it('hides the target field for a page that is removed for good', async () => {
    const ue = user();
    renderWithProviders(<RedirectEditorPage />, { initialEntries: ['/admin/redirects/new'] });
    expect(await screen.findByLabelText(/new address/i)).toBeInTheDocument();
    // Ant Design hides the real radio input behind its label, so click the label.
    await ue.click(screen.getByText('Removed (410)'));
    expect(screen.queryByLabelText(/new address/i)).not.toBeInTheDocument();
  });

  it('shows the API validation message on the target field', async () => {
    const ue = user();
    renderWithProviders(<RedirectEditorPage />, { initialEntries: ['/admin/redirects/new'] });
    await ue.type(await screen.findByLabelText(/old address/i), '/business/old');
    await ue.type(screen.getByLabelText(/new address/i), 'https://evil.example/x');
    await ue.click(screen.getByRole('button', { name: /save redirect/i }));
    expect(await screen.findAllByText(/site-relative path on this site/i)).not.toHaveLength(0);
  });

  it('offers a temporary move, keeps its destination field, and sends the kind the server understands', async () => {
    const ue = user();
    renderWithProviders(<RedirectEditorPage />, { initialEntries: ['/admin/redirects/new'] });
    await screen.findByRole('heading', { level: 1, name: /new redirect/i });

    // Ant hides the radio input behind its label, so the label is what a person
    // actually clicks.
    await ue.click(screen.getByText('Moved for now (302)'));
    // A 302 still needs somewhere to send people; only a removal does not.
    expect(screen.getByLabelText('New address')).toBeInTheDocument();
    expect(screen.getByText(/not remembered by browsers or search engines/i)).toBeInTheDocument();

    await ue.type(screen.getByLabelText('Old address'), '/business/pop-up');
    await ue.type(screen.getByLabelText('New address'), '/business/pop-up-2026');
    await ue.click(screen.getByRole('button', { name: /save redirect/i }));

    const posted = calls.find((call) => call.method === 'POST' && call.url === '/api/v1/admin/redirects');
    expect(JSON.parse(posted!.body!)).toMatchObject({ sourcePath: '/business/pop-up', targetPath: '/business/pop-up-2026', kind: 'temporary' });
  });

  it('separates what a rule is from whether it is on, and can switch it off without deleting it', async () => {
    const ue = user();
    renderWithProviders(<RedirectsPage />, { initialEntries: ['/admin/redirects'] });
    await screen.findByRole('heading', { level: 1, name: /seo redirects/i });

    const row = (await screen.findByText('/business/old-cafe')).closest('tr')! as HTMLElement;
    expect(within(row).getByText('Moved for good (301)')).toBeInTheDocument();
    expect(within(row).getByText('active')).toBeInTheDocument();

    await ue.click(within(row).getByRole('button', { name: /switch off the redirect from/i }));
    // This one came from a slug change, so the warning has to say what that means.
    expect(await screen.findByText(/leaves the old address genuinely broken/i)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /^switch off$/i }));

    const posted = calls.find((call) => call.method === 'POST' && call.url.endsWith('/deactivate'));
    expect(posted, 'switching off posts to the deactivate route').toBeDefined();
  });

  it('says what an address does, including when a rule exists but is switched off', async () => {
    const ue = user();
    renderWithProviders(<RedirectsPage />, { initialEntries: ['/admin/redirects'] });
    await screen.findByRole('heading', { level: 1, name: /seo redirects/i });

    const panel = (await screen.findByRole('heading', { level: 2, name: 'Test an address' })).closest('.ant-card') as HTMLElement;
    const field = within(panel).getByLabelText('Address to test');
    await ue.type(field, '/business/old-cafe');
    await ue.click(within(panel).getByRole('button', { name: 'Test this address' }));
    expect(await screen.findByText('301')).toBeInTheDocument();
    expect(screen.getByText(/search engines move their record/i)).toBeInTheDocument();

    await ue.clear(field);
    await ue.type(field, '/business/paused');
    await ue.click(within(panel).getByRole('button', { name: 'Test this address' }));
    // "Nothing happens" and "there is no rule" are different facts.
    expect(await screen.findByText(/exists for this address but is switched off/i)).toBeInTheDocument();
  });
});