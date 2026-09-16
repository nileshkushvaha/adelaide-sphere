import { vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { TermsPage } from './TermsPage';
import { AREAS_CONFIG, CATEGORIES_CONFIG } from './configs';
import { renderWithProviders, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const areas = [
  { id: 'l1', name: 'Norwood', slug: 'norwood', editorialIntro: null, eligibilitySource: 'council list', eligibilityVerifiedAt: '2026-09-06T00:00:00.000Z', sortOrder: 2, active: true, version: 1, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z' },
  { id: 'l2', name: 'Kent Town', slug: 'kent-town', editorialIntro: null, eligibilitySource: null, eligibilityVerifiedAt: null, sortOrder: 3, active: false, version: 2, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z' },
];

describe('taxonomy terms page (local areas)', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url === '/api/v1/admin/areas/l1' && method === 'GET') return jsonResponse(200, { data: areas[0] });
      if (url.startsWith('/api/v1/admin/areas') && method === 'GET') return jsonResponse(200, { data: areas, meta: { page: 1, pageSize: 20, total: 2, pageCount: 1 } });
      if (url === '/api/v1/admin/areas' && method === 'POST') {
        const body = JSON.parse(String(init?.body));
        if (body.name === 'Norwood') return jsonResponse(409, { error: { code: 'SLUG_IN_USE', message: 'That slug is already used', fields: { slug: ['That slug is already used'] }, requestId: 'r' } });
        return jsonResponse(201, { data: { ...areas[0], id: 'l3', name: body.name, slug: 'kensington' } });
      }
      if (url === '/api/v1/admin/areas/l1' && method === 'PATCH') return jsonResponse(409, { error: { code: 'STALE_VERSION', message: 'changed', fields: {}, requestId: 'r' } });
      if (url === '/api/v1/admin/areas/l1/deactivate') return jsonResponse(200, { data: { ...areas[0], active: false, version: 2 } });
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists areas with status, verification and URL-driven filters', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/areas?status=active&sort=sortOrder&order=desc'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Local areas' })).toBeInTheDocument();
    const row = (await screen.findByText('Kent Town')).closest('tr')!;
    expect(within(row).getByText('inactive')).toBeInTheDocument();
    expect(within(row).getByText('Not verified')).toBeInTheDocument();
    expect(calls[0]?.url).toBe('/api/v1/admin/areas?page=1&pageSize=20&status=active&sort=sortOrder&order=desc');
    expect(screen.getByRole('link', { name: 'Local areas' })).toBeInTheDocument();
  });

  it('moves to another page without losing the sort (a page click is not a sort)', async () => {
    const ue = user();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push({ url, method: 'GET' });
      const page = Number(new URL(url, 'http://admin.test').searchParams.get('page') ?? '1');
      return jsonResponse(200, { data: areas, meta: { page, pageSize: 20, total: 48, pageCount: 3 } });
    }) as typeof fetch;
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/areas?sort=name&order=asc'] });
    await screen.findByText('Kent Town');

    await ue.click(screen.getByTitle('2'));
    await vi.waitFor(() => expect(calls.some((call) => call.url.includes('page=2'))).toBe(true));
    const second = calls.find((call) => call.url.includes('page=2'))!;
    expect(second.url).toContain('sort=name');
    expect(second.url).toContain('order=asc');
  });

  it('creates on its own route, maps field errors from the envelope, and confirms deactivation', async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/areas/new'] });
    expect(await screen.findByRole('heading', { level: 1, name: /add local area/i })).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/^name/i), 'Norwood');
    await ue.click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByText(/already used/i)).toBeInTheDocument();
    await ue.clear(screen.getByLabelText(/^name/i));
    await ue.type(screen.getByLabelText(/^name/i), 'Kensington');
    await ue.click(screen.getByRole('button', { name: /^create$/i }));
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/v1/admin/areas' && c.body?.includes('Kensington'));
    expect(post).toBeDefined();
    expect(JSON.parse(post!.body!)).toMatchObject({ name: 'Kensington' });

    // Creating returns to the list, where activation is still a confirmation.
    renderWithProviders(<TermsPage config={AREAS_CONFIG} />, { initialEntries: ['/admin/areas'] });
    await ue.click(await screen.findByRole('switch', { name: /deactivate norwood/i }));
    const titles = await screen.findAllByText(/deactivate “norwood”/i);
    const confirm = titles.map((t) => t.closest('.ant-modal-confirm')).find((el): el is HTMLElement => el instanceof HTMLElement)!;
    await ue.click(within(confirm).getByRole('button', { name: /^deactivate$/i }));
    const deactivate = calls.find((c) => c.url === '/api/v1/admin/areas/l1/deactivate');
    expect(deactivate).toBeDefined();
    expect(JSON.parse(deactivate!.body!)).toEqual({ expectedVersion: 1 });
  });

  it('surfaces stale-version conflicts when editing', async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/areas/l1'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Norwood' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/changed by someone else/i);
  });

  it('links each term to its own editable address', async () => {
    renderWithProviders(<TermsPage config={AREAS_CONFIG} />, { initialEntries: ['/admin/areas'] });
    expect(await screen.findByRole('link', { name: 'Norwood' })).toHaveAttribute('href', '/admin/areas/l1');
    expect(screen.getByRole('link', { name: /add local area/i })).toHaveAttribute('href', '/admin/areas/new');
  });
});

const categories = [
  { id: 'c1', name: 'Food & Drink', slug: 'food-drink', description: 'Eating out', parentId: null, sortOrder: 0, active: true, version: 1, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z' },
  { id: 'c2', name: 'Cafes', slug: 'cafes', description: null, parentId: 'c1', sortOrder: 1, active: true, version: 1, createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z' },
];

describe('taxonomy terms page (categories)', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/v1/admin/categories/c1') return jsonResponse(200, { data: categories[0] });
      if (url.startsWith('/api/v1/admin/categories')) return jsonResponse(200, { data: categories, meta: { page: 1, pageSize: 20, total: 2, pageCount: 1 } });
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders the list with no dialog of its own', async () => {
    renderWithProviders(<TermsPage config={CATEGORIES_CONFIG} />, { initialEntries: ['/admin/categories'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Categories' })).toBeInTheDocument();
    expect(await screen.findByText('Food & Drink')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('offers every top-level category as a parent when creating', async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/categories/new'] });
    await ue.click(await screen.findByLabelText(/parent category/i));
    expect(await screen.findByTitle('Food & Drink')).toBeInTheDocument();
  });

  it('excludes the category being edited from its own parent options', async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/categories/c1'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Food & Drink' })).toBeInTheDocument();
    await ue.click(screen.getByLabelText(/parent category/i));
    // A category may not be its own parent.
    expect(screen.queryByTitle('Food & Drink')).not.toBeInTheDocument();
  });
});
