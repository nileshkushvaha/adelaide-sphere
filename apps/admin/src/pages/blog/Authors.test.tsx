import { screen, within } from '@testing-library/react';
import { AuthorEditorPage } from './AuthorEditorPage';
import { AuthorsPage } from './AuthorsPage';
import { renderWithProviders, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const now = '2026-09-06T00:00:00.000Z';
const author = {
  id: 'a1',
  displayName: 'Alex Editor',
  slug: 'alex-editor',
  role: 'Food editor',
  shortBio: 'Writes about Melbourne food.',
  bio: '<p>Ten years covering the city.</p>',
  pronouns: 'they/them',
  location: 'Fitzroy',
  publicEmail: 'alex@example.com',
  websiteUrl: 'https://alex.example',
  expertise: ['Coffee', 'Markets'],
  links: [{ kind: 'x', url: 'https://x.com/alex', label: null }],
  image: { id: 'm1', url: 'https://cdn.example/alex.webp', alt: 'Alex' },
  imageMediaId: 'm1',
  seoTitle: null,
  seoDescription: null,
  active: true,
  postCount: 4,
  publishedPostCount: 3,
  version: 2,
  updatedAt: now,
};

describe('author profiles', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  beforeEach(() => {
    calls.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url === '/api/v1/admin/authors' && method === 'GET') return jsonResponse(200, { data: [author] });
      if (url === '/api/v1/admin/authors' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { links?: unknown[] };
        if ((body.links ?? []).some((link) => (link as { url: string }).url.includes('example.com'))) {
          return jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { 'links.0.url': ['A instagram link must point at instagram.com'] }, requestId: 'r1' } });
        }
        return jsonResponse(201, { data: { ...author, id: 'a2' } });
      }
      if (url === '/api/v1/admin/authors/a1' && method === 'GET') return jsonResponse(200, { data: author });
      if (url === '/api/v1/admin/authors/a1' && method === 'PATCH') return jsonResponse(200, { data: { ...author, version: 3 } });
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists authors with their role, topics and article counts', async () => {
    renderWithProviders(<AuthorsPage />, { initialEntries: ['/admin/authors'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Authors' })).toBeInTheDocument();
    const row = (await screen.findByRole('link', { name: 'Alex Editor' })).closest('tr')!;
    expect(within(row).getByText('Food editor')).toBeInTheDocument();
    expect(within(row).getByText('Coffee')).toBeInTheDocument();
    expect(within(row).getByText('3 published / 4 total')).toBeInTheDocument();
  });

  it('loads a full profile into the editor and saves every field with the expected version', async () => {
    const ue = user();
    renderWithProviders(<AuthorEditorPage />, { initialEntries: ['/admin/authors/a1'], routePath: '/authors/:id' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Alex Editor' })).toBeInTheDocument();
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Alex Editor');
    expect(screen.getByLabelText(/^role/i)).toHaveValue('Food editor');
    expect(screen.getByLabelText(/pronouns/i)).toHaveValue('they/them');
    expect(screen.getByLabelText(/public email/i)).toHaveValue('alex@example.com');
    await ue.clear(screen.getByLabelText(/^role/i));
    await ue.type(screen.getByLabelText(/^role/i), 'Senior food editor');
    await ue.click(screen.getByRole('button', { name: /save changes/i }));
    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch).toBeTruthy();
    expect(JSON.parse(patch!.body!)).toMatchObject({
      displayName: 'Alex Editor',
      role: 'Senior food editor',
      expertise: ['Coffee', 'Markets'],
      links: [{ kind: 'x', url: 'https://x.com/alex' }],
      imageMediaId: 'm1',
      expectedVersion: 2,
    });
  });

  it('maps a rejected profile link back to its own field', async () => {
    const ue = user();
    renderWithProviders(<AuthorEditorPage />, { initialEntries: ['/admin/authors/new'], routePath: '/authors/new' });
    expect(await screen.findByRole('heading', { level: 1, name: 'New author' })).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/display name/i), 'New Writer');
    await ue.click(screen.getByRole('button', { name: /add link/i }));
    await ue.type(screen.getByLabelText('Address'), 'https://example.com/me');
    await ue.click(screen.getByRole('button', { name: /create author/i }));
    expect(await screen.findByText(/must point at instagram\.com/i)).toBeInTheDocument();
  });
});
