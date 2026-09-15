import { screen, within } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { SiteSettingsPage } from './SiteSettingsPage';
import { renderWithProviders, authenticatedProvider, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const settings = { heroHeadline: 'Discover Adelaide businesses', heroPhrases: ['local services', 'places to eat'], countersEnabled: false, version: 3, updatedAt: '2026-09-06T00:00:00.000Z', updatedByAdminId: 'a1' };

describe('site settings page', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  let puts = 0;
  beforeEach(() => {
    calls.length = 0;
    puts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url === '/api/v1/admin/settings/home' && method === 'GET') return jsonResponse(200, { data: settings });
      if (url === '/api/v1/admin/settings/home' && method === 'PUT') {
        puts += 1;
        if (puts === 1) return jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Some settings are invalid', fields: { 'heroPhrases.1': ['Phrases must be different'] }, requestId: 'r' } });
        return jsonResponse(200, { data: { ...settings, version: 4, countersEnabled: true } });
      }
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads the settings, maps field errors and saves with the record version', async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/settings'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Home page settings' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Discover Adelaide businesses')).toBeInTheDocument();
    expect(screen.getByDisplayValue('local services')).toBeInTheDocument();
    await ue.click(screen.getByRole('switch', { name: /show counters/i }));
    await ue.click(screen.getByRole('button', { name: /save settings/i }));
    expect(await screen.findByText('Phrases must be different')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /save settings/i }));
    const put = calls.filter((c) => c.method === 'PUT').at(-1)!;
    expect(JSON.parse(put.body!)).toEqual({ heroHeadline: 'Discover Adelaide businesses', heroPhrases: ['local services', 'places to eat'], heroSlides: [], countersEnabled: true, expectedVersion: 3 });
    // The navigation distinguishes the two settings screens: general (identity,
    // branding, footer) and this one (the home page banner).
    expect(screen.getByRole('link', { name: 'Home page settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'General settings' })).toBeInTheDocument();
  });

  it('hides the navigation entry without settings.manage', async () => {
    const provider = authenticatedProvider();
    provider.getPermissions = async () => ['listings.read'];
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/'], authProvider: provider });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: 'Home page settings' })).not.toBeInTheDocument();
  });
});

describe('home banner slides', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  const settings = {
    heroHeadline: 'Discover Adelaide businesses',
    heroPhrases: ['local services', 'places to eat'],
    heroSlides: [{ mediaId: 'm1', caption: 'Flinders Street', focalX: 0.4, focalY: 0.6 }],
    heroSlidePreviews: [{ url: 'https://cdn.example/hero.webp', previewUrl: 'https://cdn.example/card.webp', alt: 'Flinders Street station', caption: 'Flinders Street', focalX: 0.4, focalY: 0.6, width: 1600, height: 900 }],
    countersEnabled: false,
    version: 2,
    updatedAt: '2026-09-06T00:00:00.000Z',
    updatedByAdminId: 'a1',
  };
  const asset = {
    id: 'm2',
    sourceName: 'lanes.jpg',
    mimeType: 'image/jpeg',
    bytes: 1000,
    width: 2000,
    height: 1200,
    status: 'ready',
    altText: 'A Melbourne laneway',
    credit: null,
    rightsNote: null,
    focalX: 0.5,
    focalY: 0.5,
    rejectionReason: null,
    variants: [{ kind: 'card', url: 'https://cdn.example/lanes-800.webp', width: 800, height: 480 }],
    usages: [],
    version: 1,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
  };

  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.startsWith('/api/v1/admin/settings/home') && method === 'GET') return jsonResponse(200, { data: settings });
      if (url.startsWith('/api/v1/admin/settings/home') && method === 'PUT') return jsonResponse(200, { data: { ...settings, version: 3 } });
      if (url.startsWith('/api/v1/admin/media')) return jsonResponse(200, { data: [asset], meta: { page: 1, pageSize: 48, total: 1, pageCount: 1 } });
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows the saved slides and adds another from the media library', async () => {
    const ue = user();
    renderWithProviders(<SiteSettingsPage />, { initialEntries: ['/admin/settings'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Home page settings' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Flinders Street')).toBeInTheDocument();

    await ue.click(screen.getByRole('button', { name: /add image/i }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByText('lanes.jpg'));
    await ue.click(within(dialog).getByRole('button', { name: /use image/i }));

    await ue.click(screen.getByRole('button', { name: /save settings/i }));
    const put = calls.filter((call) => call.method === 'PUT').at(-1)!;
    expect(JSON.parse(put.body!).heroSlides).toEqual([
      { mediaId: 'm1', caption: 'Flinders Street', focalX: 0.4, focalY: 0.6 },
      { mediaId: 'm2', caption: null, focalX: 0.5, focalY: 0.5 },
    ]);
  });
});
