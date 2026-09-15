import { screen, within } from '@testing-library/react';
import { FaqsPage } from '@/pages/website/FaqsPage';
import { renderWithProviders, providerWithPermissions } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const faq = {
  id: 'faq-1',
  question: 'How do I list my business?',
  answerHtml: '<p>Send us the details.</p>',
  answerSource: 'Send us the details.',
  answerFormat: 'html',
  groupName: 'Listings',
  displayOrder: 0,
  status: 'draft',
  publishedAt: null,
  version: 1,
  updatedAt: '2026-09-07T10:00:00.000Z',
};

const list = { data: [faq], meta: { page: 1, pageSize: 20, total: 1, pageCount: 1 } };

/** Action visibility follows the separate permissions (SRS 1.2 FAQ 002, RBAC 010). */
describe('FaqsPage', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = (async () => jsonResponse(200, list)) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('offers no create, edit, publish or delete action to a viewer', async () => {
    renderWithProviders(<FaqsPage />, { initialEntries: ['/admin/website/faqs'], authProvider: providerWithPermissions(['website.faqs.view']) });

    expect(await screen.findByRole('heading', { level: 1, name: 'FAQs' })).toBeInTheDocument();
    expect(await screen.findByText('How do I list my business?')).toBeInTheDocument();
    for (const name of [/new question/i, /^edit$/i, /^publish$/i, /^delete$/i]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('offers each action once its own permission is held', async () => {
    renderWithProviders(<FaqsPage />, {
      initialEntries: ['/admin/website/faqs'],
      authProvider: providerWithPermissions(['website.faqs.view', 'website.faqs.create', 'website.faqs.update', 'website.faqs.publish', 'website.faqs.delete']),
    });

    // One await for the list to arrive, then synchronous queries: a
    // `findByRole` with a name computes an accessible name for every button on
    // the screen and retries until it matches, so four of them in a row is four
    // sweeps of the whole table for something already on screen after the first.
    expect(await screen.findByRole('button', { name: /new question/i })).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /list my business/i });
    for (const action of [/^edit$/i, /^publish$/i, /^delete$/i]) {
      expect(within(row).getByRole('button', { name: action })).toBeInTheDocument();
    }
  });

  it('offers Unpublish for a published question rather than Publish', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { ...list, data: [{ ...faq, status: 'published' }] })) as typeof fetch;
    renderWithProviders(<FaqsPage />, {
      initialEntries: ['/admin/website/faqs'],
      authProvider: providerWithPermissions(['website.faqs.view', 'website.faqs.publish']),
    });

    expect(await screen.findByRole('button', { name: /^unpublish$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument();
  });
});
