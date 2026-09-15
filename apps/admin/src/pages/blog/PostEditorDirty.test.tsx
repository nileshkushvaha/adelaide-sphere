import { screen } from '@testing-library/react';
import { PostEditorPage } from '@/pages/blog/PostEditorPage';
import { renderWithProviders } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

describe('new article editor', () => {
  beforeEach(() => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/authors') || url.includes('/blog-categories') || url.includes('/blog-tags')) return jsonResponse(200, { data: [], meta: { page: 1, pageSize: 20, total: 0, pageCount: 1 } });
      return jsonResponse(200, { data: [], meta: { page: 1, pageSize: 20, total: 0, pageCount: 1 } });
    }) as typeof fetch;
  });

  it('previews the article, not the hints beside the fields', async () => {
    renderWithProviders(<PostEditorPage />, { initialEntries: ['/admin/posts/new'] });
    await screen.findByRole('heading', { level: 1, name: /new article/i });
    // The search preview stands in for the article; it must never echo a
    // field's own helper text back as though it were the page's title.
    expect(screen.getAllByText('Article title').length).toBeGreaterThan(0);
    expect(screen.getByText(/Made from the title when you save/)).toBeInTheDocument();
    expect(screen.getByText(/adelaidesphere · \/blog\//)).toBeInTheDocument();
  });

  it('does not claim unsaved changes before anything is typed', async () => {
    renderWithProviders(<PostEditorPage />, { initialEntries: ['/admin/posts/new'] });
    expect(await screen.findByRole('heading', { level: 1, name: /new article/i })).toBeInTheDocument();
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });
});
