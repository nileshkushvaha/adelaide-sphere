import { screen, within } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { MediaDetailPage } from './MediaDetailPage';
import { MediaLibraryPage } from './MediaLibraryPage';
import { renderWithProviders, authenticatedProvider, providerWithPermissions, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';
import { localFileProblem, variantUrl } from '@/api/media';

const now = '2026-09-06T00:00:00.000Z';
const ready = {
  id: 'm1', sourceName: 'laneway.png', mimeType: 'image/png', bytes: 120_000, width: 1200, height: 800, status: 'ready',
  rejectionReason: null, altText: 'An Adelaide laneway', credit: null, rightsNote: null, focalX: null, focalY: null,
  variants: [{ kind: 'card' as const, url: 'https://cdn.test/media/card.webp', width: 800, height: 533 }, { kind: 'thumbnail' as const, url: 'https://cdn.test/media/thumb.webp', width: 320, height: 213 }],
  usages: [{ kind: 'business', id: 'b1', label: 'Gallery Cafe' }], version: 2, createdAt: now,
};
const meta = { page: 1, pageSize: 24, total: 1, pageCount: 1 };

describe('media library', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.startsWith('/api/v1/admin/media?') || url === '/api/v1/admin/media') return jsonResponse(200, { data: [ready], meta });
      if (url === '/api/v1/admin/media/m1' && method === 'GET') return jsonResponse(200, { data: ready });
      if (url === '/api/v1/admin/media/m1' && method === 'PATCH') return jsonResponse(200, { data: { ...ready, credit: 'Photo: Alex', version: 3 } });
      if (url === '/api/v1/admin/media/m1' && method === 'DELETE') return jsonResponse(409, { error: { code: 'MEDIA_IN_USE', message: 'This image is used in 1 place(s).', fields: {}, requestId: 'r' } });
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists assets with their status, size and usage count', async () => {
    renderWithProviders(<MediaLibraryPage />, { initialEntries: ['/admin/media?status=ready'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Media library' })).toBeInTheDocument();
    // Each image is its own list item, so the assertions stay inside one tile.
    const tile = (await screen.findByText('laneway.png')).closest('li')! as HTMLElement;
    expect(within(tile).getByText('ready')).toBeInTheDocument();
    expect(within(tile).getByText('1200 × 800')).toBeInTheDocument();
    expect(within(tile).getByText('Used in 1 place')).toBeInTheDocument();
    expect(screen.getByAltText('An Adelaide laneway')).toHaveAttribute('src', 'https://cdn.test/media/thumb.webp');
    // The images view asks for images only (change log 1.16: documents have their own view).
    expect(calls[0]?.url).toBe('/api/v1/admin/media?kind=image&status=ready&page=1&pageSize=24');
  });

  it('links each image to its own details route rather than opening a dialog', async () => {
    renderWithProviders(<MediaLibraryPage />, { initialEntries: ['/admin/media'] });
    await screen.findByText('laneway.png');
    expect(screen.getByRole('link', { name: /details for laneway.png/i })).toHaveAttribute('href', '/admin/media/m1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('saves image details with the record version, beside the image itself', async () => {
    const ue = user();
    renderWithProviders(<MediaDetailPage />, { initialEntries: ['/admin/media/m1'], routePath: '/media/:id' });
    expect(await screen.findByRole('heading', { level: 1, name: 'laneway.png' })).toBeInTheDocument();
    // The picture is on screen while the description is written.
    expect(screen.getByAltText('An Adelaide laneway')).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/credit/i), 'Photo: Alex');
    await ue.click(screen.getByRole('button', { name: /^save$/i }));
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(JSON.parse(patch.body!)).toMatchObject({ expectedVersion: 2, altText: 'An Adelaide laneway', credit: 'Photo: Alex' });
  });

  it('names what is using an image instead of counting it, and links to each one', async () => {
    renderWithProviders(<MediaDetailPage />, { initialEntries: ['/admin/media/m1'], routePath: '/media/:id' });
    await screen.findByRole('heading', { level: 1, name: 'laneway.png' });

    const section = (await screen.findByRole('heading', { level: 2, name: 'Where it is used' })).closest('.ant-card') as HTMLElement;
    expect(within(section).getByRole('link', { name: 'Gallery Cafe' })).toHaveAttribute('href', '/admin/businesses/b1');
    expect(within(section).getByText(/cannot be deleted while something still shows it/i)).toBeInTheDocument();
  });

  it('shows the sizes the site made and the file it came from', async () => {
    renderWithProviders(<MediaDetailPage />, { initialEntries: ['/admin/media/m1'], routePath: '/media/:id' });
    await screen.findByRole('heading', { level: 1, name: 'laneway.png' });

    const panel = (await screen.findByRole('heading', { level: 2, name: 'This image' })).closest('.ant-card') as HTMLElement;
    expect(within(panel).getByText('1200 × 800')).toBeInTheDocument();
    expect(within(panel).getByText('117 KB')).toBeInTheDocument();
    expect(within(panel).getByText('card')).toBeInTheDocument();
    // Storage keys and signed URLs are never a thing an administrator needs.
    expect(panel.textContent).not.toMatch(/objectKey|X-Amz|signature/i);
  });

  it('sets the focal point by clicking the picture, and can be moved from the keyboard', async () => {
    const ue = user();
    renderWithProviders(<MediaDetailPage />, { initialEntries: ['/admin/media/m1'], routePath: '/media/:id' });
    await screen.findByRole('heading', { level: 1, name: 'laneway.png' });

    const picker = await screen.findByRole('button', { name: /focal point for An Adelaide laneway/i });
    expect(screen.getByText(/the middle of the image is kept in frame/i)).toBeInTheDocument();

    // Arrow keys are the keyboard path; a drag-only control would be unusable.
    picker.focus();
    await ue.keyboard('{ArrowRight}');
    expect(await screen.findByText(/55% from the left/)).toBeInTheDocument();

    await ue.click(screen.getByRole('button', { name: /^save$/i }));
    const patch = calls.find((call) => call.method === 'PATCH');
    expect(JSON.parse(patch!.body!)).toMatchObject({ focalX: 0.55, focalY: 0.5, expectedVersion: 2 });
  });

  it('states the requirements before a file is chosen, and takes one by drop or by button', async () => {
    // Uploading needs the Media library's Upload permission (change log 1.13).
    renderWithProviders(<MediaLibraryPage />, { initialEntries: ['/admin/media'], authProvider: providerWithPermissions(['media.view', 'media.upload']) });
    await screen.findByRole('heading', { level: 1, name: 'Media library' });

    // The upload card appears once the administrator's permissions are known.
    expect(await screen.findByText(/JPEG, PNG or WebP, up to 10 MB/i)).toBeInTheDocument();
    expect(screen.getByText(/Drop an image here/i)).toBeInTheDocument();
    // The keyboard path is a real button, not a drop zone only.
    expect(screen.getByRole('button', { name: /choose an image/i })).toBeInTheDocument();
  });

  it('says plainly when background processing is not running, instead of leaving uploads on “processing”', async () => {
    const stopped = { healthy: false, detail: 'No worker has checked in.', workers: [], oldestHeartbeatAgeSeconds: null, scheduler: { healthy: false, detail: '', stale: [] } };
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/admin/system/queues/workers')) return jsonResponse(200, { data: stopped });
      return previous(input, init);
    }) as typeof fetch;

    // Reading worker liveness needs its own permission; without it the screen
    // can only say an upload has waited a long time, which the next case covers.
    renderWithProviders(<MediaLibraryPage />, { initialEntries: ['/admin/media'], authProvider: providerWithPermissions(['media.view', 'media.upload', 'media.delete', 'system.queues.view']) });
    expect(await screen.findByText('Background processing is not running')).toBeInTheDocument();
    expect(screen.getByText(/will be prepared once it is running again/i)).toBeInTheDocument();
  });

  it('hides the library without media.manage', async () => {
    const provider = authenticatedProvider();
    provider.getPermissions = async () => ['listings.read'];
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/'], authProvider: provider });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: 'Media library' })).not.toBeInTheDocument();
  });
});

describe('client-side upload checks (SRS MED 001)', () => {
  const file = (type: string, size: number) => ({ type, size, name: 'x' }) as File;

  it('rejects unsupported types and oversized files before any request', () => {
    expect(localFileProblem(file('image/jpeg', 1000))).toBeNull();
    expect(localFileProblem(file('image/svg+xml', 1000))).toMatch(/JPEG, PNG and WebP/);
    expect(localFileProblem(file('application/pdf', 1000))).toMatch(/JPEG, PNG and WebP/);
    expect(localFileProblem(file('image/png', 11 * 1024 * 1024))).toMatch(/10 MB/);
    expect(localFileProblem(file('image/png', 0))).toMatch(/empty/);
  });

  it('picks the smallest variant at or above the requested width', () => {
    expect(variantUrl(ready, 320)).toBe('https://cdn.test/media/thumb.webp');
    expect(variantUrl(ready, 700)).toBe('https://cdn.test/media/card.webp');
    expect(variantUrl(ready, 5000)).toBe('https://cdn.test/media/card.webp');
    expect(variantUrl({ variants: [] })).toBeNull();
  });


});