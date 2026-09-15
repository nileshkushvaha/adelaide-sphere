import { screen } from '@testing-library/react';
import { MediaPicker } from './MediaPicker';
import { renderWithProviders, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const asset = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  sourceName: `${id}.jpg`,
  mimeType: 'image/jpeg',
  bytes: 1000,
  width: 800,
  height: 600,
  status: 'ready',
  rejectionReason: null,
  altText: 'A photograph',
  credit: null,
  rightsNote: null,
  focalX: null,
  focalY: null,
  variants: [{ kind: 'card', url: 'https://cdn/x.webp', width: 800, height: 600 }],
  usages: [],
  readyAt: null,
  version: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

describe('MediaPicker', () => {
  const originalFetch = globalThis.fetch;
  let urls: string[] = [];
  /** @param ready total ready assets the library reports @param processing how many are still being prepared */
  const serve = (rows: unknown[], ready: number, processing = 0) => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('status=quarantined')) return jsonResponse(200, { data: [], meta: { page: 1, pageSize: 1, total: processing, pageCount: 1 } });
      return jsonResponse(200, { data: rows, meta: { page: 1, pageSize: 24, total: ready, pageCount: Math.ceil(ready / 24) } });
    }) as typeof fetch;
  };
  beforeEach(() => {
    urls = [];
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const open = () => renderWithProviders(<MediaPicker open onCancel={() => {}} onPick={() => {}} />, { initialEntries: ['/admin/posts/new'] });

  it('pages against the API rather than showing only the first page it was given', async () => {
    const ue = user();
    serve([asset('a1')], 60);
    open();
    await screen.findByText('a1.jpg');
    // Sixty ready images existed and the picker used to ask for 48 and stop, so
    // the rest could not be reached from any editor.
    // Ant renders pager pages as links inside list items.
    await ue.click(await screen.findByTitle('2'));
    expect(urls.some((url) => url.includes('page=2'))).toBe(true);
  });

  it('searches the library instead of the page in hand', async () => {
    const ue = user();
    serve([asset('a1')], 1);
    open();
    await screen.findByText('a1.jpg');
    await ue.type(screen.getByLabelText('Search images'), 'harbour{Enter}');
    expect(urls.some((url) => url.includes('q=harbour'))).toBe(true);
  });

  it('explains that images are missing because they are still being prepared', async () => {
    serve([], 0, 3);
    open();
    expect(await screen.findByText(/3 images are still being prepared/i)).toBeInTheDocument();
  });

  it('says a search matched nothing rather than claiming the library is empty', async () => {
    const ue = user();
    serve([asset('a1')], 1);
    open();
    await screen.findByText('a1.jpg');
    serve([], 0);
    await ue.type(screen.getByLabelText('Search images'), 'zzz{Enter}');
    expect(await screen.findByText('No images match that search')).toBeInTheDocument();
  });

  it('will not let an image without alt text be chosen', async () => {
    serve([asset('a1', { altText: null })], 1);
    open();
    expect(await screen.findByText('Add alt text first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use image' })).toBeDisabled();
  });
});
