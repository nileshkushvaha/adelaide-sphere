import { screen } from '@testing-library/react';
import { BusinessesPage } from '@/pages/businesses/BusinessesPage';
import { PostsPage } from '@/pages/blog/PostsPage';
import { renderWithProviders, providerWithPermissions } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const businesses = { data: [], meta: { page: 1, pageSize: 25, total: 0, pageCount: 1 } };
const posts = { data: [], meta: { page: 1, pageSize: 25, total: 0, pageCount: 1 } };

/**
 * Action-level visibility (SRS RBAC 010): a screen an administrator may open
 * does not imply the actions inside it. These check the create controls, which
 * need a different permission from the list they sit on. The API refuses either
 * way — this is about not offering an action that will be refused.
 */
describe('action visibility follows permissions', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/admin/businesses')) return jsonResponse(200, businesses);
      if (url.includes('/admin/posts')) return jsonResponse(200, posts);
      if (url.includes('/admin/taxonomy') || url.includes('/admin/categories') || url.includes('/admin/areas') || url.includes('/admin/services')) return jsonResponse(200, { data: [] });
      return jsonResponse(200, { data: [] });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('hides "Add business" from an administrator who may only read listings', async () => {
    renderWithProviders(<BusinessesPage />, { initialEntries: ['/admin/businesses'], authProvider: providerWithPermissions(['listings.read']) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Businesses' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /add business/i })).not.toBeInTheDocument();
  });

  it('offers "Add business" once the create permission is held', async () => {
    renderWithProviders(<BusinessesPage />, { initialEntries: ['/admin/businesses'], authProvider: providerWithPermissions(['listings.read', 'listings.create']) });
    // The page header's action; the empty state offers the same thing again.
    expect(await screen.findByRole('link', { name: /add business/i })).toHaveAttribute('href', '/admin/businesses/new');
  });

  it('hides "New article" from an administrator without the editorial permission', async () => {
    renderWithProviders(<PostsPage />, { initialEntries: ['/admin/posts'], authProvider: providerWithPermissions(['listings.read']) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Articles' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new article/i })).not.toBeInTheDocument();
  });
});
