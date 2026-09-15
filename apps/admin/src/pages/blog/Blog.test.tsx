import { screen, waitFor, within } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { EditorialTermsPage } from './EditorialTermsPage';
import { BLOG_CATEGORIES_CONFIG } from './editorial-configs';
import { PostsPage } from './PostsPage';
import { renderWithProviders, authenticatedProvider, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';
import { adelaideLocalToUtc, utcToAdelaideLocal } from '@/api/blog';

const now = '2026-09-06T00:00:00.000Z';
const author = { id: 'a1', displayName: 'Alex Editor', slug: 'alex-editor', bio: null, active: true, postCount: 1, version: 1, updatedAt: now };
const category = { id: 'c1', name: 'City guides', slug: 'city-guides', landingContent: '<p>Guides</p>', active: true, postCount: 1, version: 1, updatedAt: now };
const tag = { id: 't1', name: 'Coffee', slug: 'coffee', landingContent: null, active: true, postCount: 1, version: 1, updatedAt: now };
const post = {
  id: 'p1', title: 'Best laneway coffee', slug: 'best-laneway-coffee', status: 'draft', authorId: 'a1', authorName: 'Alex Editor',
  categoryId: 'c1', categoryName: 'City guides', tagIds: ['t1'], commentsEnabled: true, scheduledAt: null, publishedAt: null,
  firstPublishedAt: null, publicationBlockers: ['Excerpt must be at least 20 characters'], version: 2, updatedAt: now,
  excerpt: 'short', bodyMarkdown: '# Coffee\n\nBody text.', bodyFormat: 'markdown', sanitizedBody: '<h2>Coffee</h2><p>Body text.</p>', coverAlt: null,
  seoTitle: null, seoDescription: null, archivedAt: null, createdAt: now,
};
const meta = { page: 1, pageSize: 20, total: 1, pageCount: 1 };

describe('blog admin screens', () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string; body?: string }[] = [];
  let publishAttempts = 0;
  beforeEach(() => {
    calls.length = 0;
    publishAttempts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (url.startsWith('/api/v1/admin/posts?') || url === '/api/v1/admin/posts') {
        if (method === 'GET') return jsonResponse(200, { data: [post], meta });
        return jsonResponse(201, { data: { ...post, id: 'p2' } });
      }
      if (url === '/api/v1/admin/posts/p1' && method === 'GET') return jsonResponse(200, { data: post });
      // The preview is the server's rendering of what is typed — the same
      // sanitiser a save uses — not the editor's own HTML.
      if (url === '/api/v1/admin/posts/preview-render' && method === 'POST') {
        return jsonResponse(200, { data: { title: post.title, excerpt: post.excerpt, excerptGenerated: false, sanitizedBody: post.sanitizedBody, authorName: 'Priya Raman', categoryName: 'City life', cover: null, readingMinutes: 1, noindex: true } });
      }
      if (url === '/api/v1/admin/posts/p1/publish') {
        publishAttempts += 1;
        if (publishAttempts === 1) {
          return jsonResponse(409, { error: { code: 'PUBLICATION_BLOCKED', message: 'blocked', fields: { publication: ['Excerpt must be at least 20 characters'] }, requestId: 'r' } });
        }
        return jsonResponse(200, { data: { ...post, status: 'published', version: 3 } });
      }
      if (url === '/api/v1/admin/posts/p1/schedule') return jsonResponse(200, { data: { ...post, status: 'scheduled', scheduledAt: '2026-10-03T23:30:00.000Z', version: 3 } });
      if (url.startsWith('/api/v1/admin/authors')) return method === 'GET' ? jsonResponse(200, { data: [author] }) : jsonResponse(201, { data: author });
      if (url.startsWith('/api/v1/admin/blog-categories')) return jsonResponse(200, { data: [category] });
      if (url.startsWith('/api/v1/admin/blog-tags')) return jsonResponse(200, { data: [tag] });
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists articles with their state and links to the editor', async () => {
    renderWithProviders(<PostsPage />, { initialEntries: ['/admin/posts?status=draft'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Articles' })).toBeInTheDocument();
    const row = (await screen.findByRole('link', { name: 'Best laneway coffee' })).closest('tr')!;
    expect(within(row).getByText('draft')).toBeInTheDocument();
    expect(within(row).getByText('Not ready to publish')).toBeInTheDocument();
    expect(calls[0]?.url).toBe('/api/v1/admin/posts?status=draft&page=1&pageSize=20');
  });

  it('shows the sanitised preview and surfaces publication blockers from the API', async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/posts/p1'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Best laneway coffee' })).toBeInTheDocument();
    expect(await screen.findByText('Not ready to publish')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /^preview$/i }));
    const preview = await screen.findByTestId('post-preview');
    expect(preview.innerHTML).toBe('<h2>Coffee</h2><p>Body text.</p>');
    // It renders what is in the form, unsaved or not, through the API.
    const rendered = calls.find((c) => c.url === '/api/v1/admin/posts/preview-render');
    expect(JSON.parse(rendered!.body!)).toMatchObject({ title: 'Best laneway coffee', bodyFormat: 'markdown' });
    // The preview says whose article it is and that it is never public.
    expect(screen.getByText(/By Priya Raman in City life/)).toBeInTheDocument();
    expect(screen.getByText(/never shown publicly and is never indexed/i)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /close/i }));

    await ue.click(screen.getByRole('button', { name: /^publish article$/i }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: /^publish article$/i }));
    expect(await within(dialog).findByText('Excerpt must be at least 20 characters')).toBeInTheDocument();
    // One action at a time: the button is pressable again once the refused attempt has finished. (Its
    // loading icon's leave animation never completes in jsdom, so it is located by its text.)
    const retry = within(dialog).getByText('Publish article').closest('button')!;
    await waitFor(() => expect(retry).not.toHaveClass('ant-btn-loading'));
    await ue.click(retry);
    const publishes = calls.filter((c) => c.url.endsWith('/publish'));
    expect(publishes).toHaveLength(2);
    expect(JSON.parse(publishes[1]!.body!)).toMatchObject({ expectedVersion: 2 });
  });

  it('sends a Adelaide schedule as a UTC instant', async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/posts/p1'] });
    await screen.findByRole('heading', { level: 1, name: 'Best laneway coffee' });
    await ue.click(screen.getByRole('button', { name: /^schedule article$/i }));
    const dialog = await screen.findByRole('dialog');
    // A calendar picker that also accepts typing, in the Adelaide wall-clock time.
    const picker = within(dialog).getByLabelText(/publish at \(adelaide time/i);
    await ue.click(picker);
    await ue.clear(picker);
    await ue.type(picker, '2026-10-04 10:00{Enter}');
    await ue.click(within(dialog).getByRole('button', { name: /^schedule article$/i }));
    const scheduled = calls.find((c) => c.url.endsWith('/schedule'))!;
    // 10:00 on 2026-10-04 is ACDT (UTC+10:30), so 23:30Z the previous day.
    expect(JSON.parse(scheduled.body!)).toMatchObject({ expectedVersion: 2, scheduledAt: '2026-10-03T23:30:00.000Z' });
  });

  it('lists blog categories and links each to its own editable address', async () => {
    renderWithProviders(<EditorialTermsPage config={BLOG_CATEGORIES_CONFIG} />, { initialEntries: ['/admin/blog-categories'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Blog categories' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /new category/i })).toHaveAttribute('href', '/admin/blog-categories/new');
    // Editing is a route, so the list itself opens no dialog.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides the editorial navigation without posts.write', async () => {
    const provider = authenticatedProvider();
    provider.getPermissions = async () => ['listings.read'];
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/'], authProvider: provider });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('link', { name: 'Articles' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Authors' })).not.toBeInTheDocument();
  });
});

describe('Adelaide schedule conversion (SRS BLOG 002)', () => {
  it('round-trips across the daylight-saving boundary', () => {
    expect(adelaideLocalToUtc('2026-10-04T10:00')?.toISOString()).toBe('2026-10-03T23:30:00.000Z'); // ACDT, UTC+10:30
    expect(adelaideLocalToUtc('2026-07-01T10:00')?.toISOString()).toBe('2026-07-01T00:30:00.000Z'); // ACST, UTC+9:30
    expect(utcToAdelaideLocal(new Date('2026-10-03T23:30:00.000Z'))).toBe('2026-10-04T10:00');
    expect(utcToAdelaideLocal(new Date('2026-07-01T00:30:00.000Z'))).toBe('2026-07-01T10:00');
    expect(adelaideLocalToUtc('not-a-date')).toBeNull();
  });
});
