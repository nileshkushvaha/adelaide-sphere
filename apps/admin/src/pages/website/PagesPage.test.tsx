import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

// The rich-text editor is ProseMirror behind a lazy import: real in the
// browser, and in jsdom a plain textarea that reports the same value, so these
// tests are about the page rather than about contenteditable.
vi.mock('@/components/RichTextEditorLazy', () => ({
  RichTextEditorLazy: ({ value, onChange, ariaLabel }: { value: string; onChange: (html: string) => void; ariaLabel?: string }) => (
    <textarea aria-label={ariaLabel ?? 'Body'} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));
import { PagesPage } from '@/pages/website/PagesPage';
import { PageCreatePage } from '@/pages/website/PageCreatePage';
import { PageEditorPage } from '@/pages/website/PageEditorPage';
import { renderWithProviders, providerWithPermissions } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const terms = {
  slug: 'terms',
  title: 'Terms of Use',
  sanitizedBody: '<p>An independent directory.</p>',
  bodySource: '<p>An independent directory.</p>',
  bodyFormat: 'html',
  seoTitle: null,
  seoDescription: null,
  seoKeywords: null,
  ogImageMediaId: null,
  ogImage: null,
  sections: [{ id: 'text-1', type: 'text', hidden: false, html: '<p>An independent directory.</p>' }],
  hasSections: false,
  references: { images: {}, documents: {}, businesses: {} },
  noindex: false,
  scheduledAt: null,
  publishFailure: null,
  layout: 'rightSidebar',
  status: 'published',
  publishedAt: '2026-09-08T00:00:00.000Z',
  publicationBlockers: [],
  purpose: 'The terms visitors accept by using the site.',
  template: 'generic',
  isSystem: true,
  canDelete: false,
  version: 3,
  updatedAt: '2026-09-08T00:00:00.000Z',
  updatedByAdminId: null,
};

const privacy = {
  ...terms,
  slug: 'privacy',
  title: 'Privacy Policy',
  status: 'draft',
  publishedAt: null,
  publicationBlockers: ['Page content must be at least 200 characters of real copy'],
  purpose: 'What personal data the site collects.',
  template: 'generic',
  isSystem: true,
  canDelete: false,
  version: 0,
};

/** A page an administrator created: deletable, and only while unpublished. */
const custom = {
  ...terms,
  slug: 'community-guidelines',
  title: 'Community guidelines',
  status: 'draft',
  publishedAt: null,
  template: 'generic',
  isSystem: false,
  canDelete: true,
  purpose: 'A page you created.',
  version: 1,
};

/**
 * Pages (SRS CFG 002 as amended in SRS 1.6): a fixed set of known pages, each
 * edited on its own route, with publication refused while the API says the copy
 * is not ready.
 */
describe('Website pages', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists the pages with their address, template and readiness', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { data: [terms, privacy] })) as typeof fetch;
    renderWithProviders(<PagesPage />, { initialEntries: ['/admin/website/pages'], authProvider: providerWithPermissions(['website.pages.view', 'website.pages.create', 'website.pages.update', 'website.pages.publish', 'website.pages.delete']) });

    expect(await screen.findByRole('heading', { level: 1, name: 'Pages' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/admin/website/pages/terms');
    expect(screen.getByText('/privacy')).toBeInTheDocument();
    // The reason a page is not publishable is visible before opening it.
    expect(screen.getByText('1 to fix')).toBeInTheDocument();
  });

  it('offers only a read-only way in to an administrator who may view pages', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { data: [terms, custom] })) as typeof fetch;
    // The list route itself requires website.pages.view (permissions.ts); within it, a viewer opens pages read-only.
    renderWithProviders(<PagesPage />, { initialEntries: ['/admin/website/pages'], authProvider: providerWithPermissions(['website.pages.view']) });

    expect(await screen.findByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/admin/website/pages/terms');
    expect(screen.getAllByRole('button', { name: /^view$/i })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new page/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^duplicate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete/i })).not.toBeInTheDocument();
  });

  it('edits a page on its own route', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { data: terms })) as typeof fetch;
    renderWithProviders(<PageEditorPage />, {
      initialEntries: ['/admin/website/pages/terms'],
      routePath: '/website/pages/:slug',
      authProvider: providerWithPermissions(['website.pages.view', 'website.pages.create', 'website.pages.update', 'website.pages.publish', 'website.pages.delete']),
    });

    expect(await screen.findByRole('heading', { level: 1, name: 'Terms of Use' })).toBeInTheDocument();
    expect(screen.getByText('Public address: /terms')).toBeInTheDocument();
    // Published, so the action offered is the reverse one.
    expect(await screen.findByRole('button', { name: /^unpublish$/i })).toBeInTheDocument();
  });

  it('will not offer publication while the API says the copy is not ready', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { data: privacy })) as typeof fetch;
    renderWithProviders(<PageEditorPage />, {
      initialEntries: ['/admin/website/pages/privacy'],
      routePath: '/website/pages/:slug',
      authProvider: providerWithPermissions(['website.pages.view', 'website.pages.create', 'website.pages.update', 'website.pages.publish', 'website.pages.delete']),
    });

    expect(await screen.findByRole('button', { name: /^publish$/i })).toBeDisabled();
    expect(await screen.findByText('Not ready to publish')).toBeInTheDocument();
    expect(screen.getByText(/at least 200 characters/i)).toBeInTheDocument();
  });

  it('saves with the version it loaded, so a concurrent edit is caught by the API', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return jsonResponse(200, { data: terms });
    }) as typeof fetch;

    renderWithProviders(<PageEditorPage />, {
      initialEntries: ['/admin/website/pages/terms'],
      routePath: '/website/pages/:slug',
      authProvider: providerWithPermissions(['website.pages.view', 'website.pages.create', 'website.pages.update', 'website.pages.publish', 'website.pages.delete']),
    });

    // Nothing to save until something changes.
    const update = await screen.findByRole('button', { name: /update page/i });
    expect(update).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^title/i), ' 2026');
    await userEvent.click(update);
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    const put = calls.find((call) => call.method === 'PUT')!;
    expect(put.url).toContain('/admin/pages/terms');
    expect(put.body).toMatchObject({ expectedVersion: 3, title: 'Terms of Use 2026', sections: [{ id: 'text-1', type: 'text' }] });
  });

  it('offers a new page, and shows which rows belong to the product', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { data: [terms, privacy, custom] })) as typeof fetch;
    renderWithProviders(<PagesPage />, { initialEntries: ['/admin/website/pages'], authProvider: providerWithPermissions(['website.pages.view', 'website.pages.create', 'website.pages.update', 'website.pages.publish', 'website.pages.delete']) });

    expect(await screen.findByRole('link', { name: /new page/i })).toHaveAttribute('href', '/admin/website/pages/new');
    expect(screen.getAllByText('Part of the product')).toHaveLength(2);
    expect(screen.getByText('Added by an editor')).toBeInTheDocument();
    // Only the editor's own page offers deletion.
    expect(screen.getAllByRole('button', { name: /^delete/i })).toHaveLength(1);
  });

  it('will not offer to delete a published page, and says why', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { data: [{ ...custom, status: 'published', canDelete: false }] })) as typeof fetch;
    renderWithProviders(<PagesPage />, { initialEntries: ['/admin/website/pages'], authProvider: providerWithPermissions(['website.pages.view', 'website.pages.create', 'website.pages.update', 'website.pages.publish', 'website.pages.delete']) });

    const remove = await screen.findByRole('button', { name: /delete community guidelines/i });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute('title', 'Unpublish it first');
  });

  it('confirms a deletion before sending it, saying what is lost', async () => {
    const calls: { url: string; method: string }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      return init?.method === 'DELETE' ? jsonResponse(204, {}) : jsonResponse(200, { data: [custom] });
    }) as typeof fetch;
    renderWithProviders(<PagesPage />, { initialEntries: ['/admin/website/pages'], authProvider: providerWithPermissions(['website.pages.view', 'website.pages.create', 'website.pages.update', 'website.pages.publish', 'website.pages.delete']) });

    await userEvent.click(await screen.findByRole('button', { name: /delete community guidelines/i }));
    expect(await screen.findByText(/cannot be undone/i)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^delete$/i }).at(-1)!);
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
    expect(calls.find((call) => call.method === 'DELETE')!.url).toContain('/admin/pages/community-guidelines');
  });

  it('suggests an address from the title, lets it be overridden, and sends what was typed', async () => {
    const posted: { url: string; body: unknown }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push({ url: String(input), body: JSON.parse(String(init.body)) });
        return jsonResponse(201, { data: custom });
      }
      return jsonResponse(200, { data: [] });
    }) as typeof fetch;
    renderWithProviders(<PageCreatePage />, { initialEntries: ['/admin/website/pages/new'], authProvider: providerWithPermissions(['website.pages.view', 'website.pages.create', 'website.pages.update', 'website.pages.publish', 'website.pages.delete']) });

    const title = await screen.findByLabelText(/^title/i);
    // Read-only until the server has confirmed the create permission.
    await waitFor(() => expect(title).toBeEnabled());
    await userEvent.type(title, 'Community Guidelines');
    // The suggestion is a starting point, not a decision: it is shown, not typed.
    expect(await screen.findByText('/community-guidelines')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const address = screen.getByLabelText('Web address');
    await userEvent.clear(address);
    await userEvent.type(address, 'house-rules');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await userEvent.type(screen.getByLabelText(/^title/i), '!');
    // Once the editor has written an address, the title stops overwriting it.
    expect(await screen.findByText('/house-rules')).toBeInTheDocument();

    // The information template: a page header, then text.
    await userEvent.type(screen.getByLabelText('Text for section 2'), 'Say what you would say to a neighbour.');
    await userEvent.click(screen.getByRole('button', { name: /create page/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.body).toMatchObject({ slug: 'house-rules', title: 'Community Guidelines!', sections: [{ type: 'header' }, { type: 'text', html: 'Say what you would say to a neighbour.' }] });
  });

  it('builds a page from sections: add, hide, move and remove with undo', async () => {
    const custom2 = { ...custom, sections: [{ id: 'a', type: 'text', hidden: false, html: '<p>First</p>' }] };
    globalThis.fetch = (async () => jsonResponse(200, { data: custom2 })) as typeof fetch;
    renderWithProviders(<PageEditorPage />, {
      initialEntries: ['/admin/website/pages/community-guidelines'],
      routePath: '/website/pages/:slug',
      authProvider: providerWithPermissions(['website.pages.view', 'website.pages.update', 'website.pages.publish', 'media.view']),
    });

    await userEvent.click(await screen.findByRole('button', { name: /add section/i }));
    await userEvent.click(await screen.findByRole('button', { name: /questions and answers/i }));
    expect(await screen.findByText('2. Questions and answers')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /hide questions and answers/i }));
    expect(screen.getByText('Hidden')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /move questions and answers up/i }));
    expect(await screen.findByText('1. Questions and answers')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /remove questions and answers/i }));
    expect(screen.queryByText('1. Questions and answers')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /^undo$/i }));
    expect(await screen.findByText('1. Questions and answers')).toBeInTheDocument();
    // Edited, so publishing waits for a save.
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeDisabled();
  });

  it('keeps a policy page plain and puts a section error on its section', async () => {
    const calls: { method: string }[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET' });
      if (init?.method === 'PUT') {
        return jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { 'sections[0].html': ['This text is too long'] }, requestId: 'r' } });
      }
      return jsonResponse(200, { data: { ...privacy, version: 2 } });
    }) as typeof fetch;
    renderWithProviders(<PageEditorPage />, {
      initialEntries: ['/admin/website/pages/privacy'],
      routePath: '/website/pages/:slug',
      authProvider: providerWithPermissions(['website.pages.view', 'website.pages.update']),
    });

    expect(await screen.findByText('This page stays plain')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add section/i }));
    expect(await screen.findByRole('button', { name: /questions and answers/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /feature cards/i })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await userEvent.type(screen.getByLabelText(/^title/i), '!');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect(await screen.findByText('This text is too long')).toBeInTheDocument();
    expect(screen.getByText('1 problem')).toBeInTheDocument();
  });

  it('offers the unsaved copy kept from an earlier visit, and the history of saved versions', async () => {
    const draftPage = { ...custom, version: 4, sections: [{ id: 'a', type: 'text', hidden: false, html: '<p>Saved words</p>' }] };
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/autosave')) {
        return jsonResponse(200, { data: { title: 'Kept title', sections: [{ id: 'a', type: 'text', hidden: false, html: '<p>Kept words</p>' }], baseVersion: 3, savedAt: '2026-09-15T01:00:00.000Z', stale: true } });
      }
      if (url.endsWith('/revisions')) {
        return jsonResponse(200, { data: [{ id: 'r1', version: 3, title: 'Older title', reason: 'Fixed a typo', actorName: 'Sam Editor', createdAt: '2026-09-14T01:00:00.000Z' }] });
      }
      return jsonResponse(200, { data: draftPage });
    }) as typeof fetch;
    renderWithProviders(<PageEditorPage />, {
      initialEntries: ['/admin/website/pages/community-guidelines'],
      routePath: '/website/pages/:slug',
      authProvider: providerWithPermissions(['website.pages.view', 'website.pages.update', 'website.pages.publish']),
    });

    expect(await screen.findByText(/you have unsaved changes from/i)).toBeInTheDocument();
    // Saved since the copy was made, so the editor says so before anything is replaced.
    expect(screen.getByText(/the page was saved since then/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /restore them/i }));
    expect(await screen.findByDisplayValue('Kept title')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^history$/i }));
    expect(await screen.findByText(/Sam Editor · Fixed a typo/)).toBeInTheDocument();
  });

  it('cannot preview or show history for a page that has never been saved', async () => {
    globalThis.fetch = (async () => jsonResponse(200, { data: privacy })) as typeof fetch;
    renderWithProviders(<PageEditorPage />, {
      initialEntries: ['/admin/website/pages/privacy'],
      routePath: '/website/pages/:slug',
      authProvider: providerWithPermissions(['website.pages.view', 'website.pages.update', 'website.pages.publish']),
    });

    const preview = await screen.findByRole('button', { name: /^preview$/i });
    expect(preview).toBeDisabled();
    expect(preview).toHaveAttribute('title', 'Save the page once first.');
    expect(screen.queryByRole('button', { name: /^history$/i })).not.toBeInTheDocument();
  });

  it('schedules a ready page in Adelaide time and offers to cancel it', async () => {
    const ready = { ...custom, version: 2, publicationBlockers: [] };
    const calls: { url: string; method: string; body: unknown }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/autosave')) return jsonResponse(200, { data: null });
      if (url.endsWith('/schedule')) return jsonResponse(200, { data: { ...ready, status: 'scheduled', scheduledAt: '2030-01-01T00:00:00.000Z', version: 3 } });
      return jsonResponse(200, { data: ready });
    }) as typeof fetch;
    renderWithProviders(<PageEditorPage />, {
      initialEntries: ['/admin/website/pages/community-guidelines'],
      routePath: '/website/pages/:slug',
      authProvider: providerWithPermissions(['website.pages.view', 'website.pages.update', 'website.pages.publish']),
    });

    await userEvent.click(await screen.findByRole('button', { name: /^schedule$/i }));
    expect(await screen.findByText(/publish at \(adelaide time/i)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^schedule$/i }).at(-1)!);
    await waitFor(() => expect(calls.some((call) => call.url.endsWith('/schedule') && call.method === 'POST')).toBe(true));
    const scheduled = calls.find((call) => call.url.endsWith('/schedule'))!;
    expect(scheduled.body).toMatchObject({ expectedVersion: 2 });
    expect(new Date((scheduled.body as { scheduledAt: string }).scheduledAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('asks why before unpublishing', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => (String(input).endsWith('/autosave') ? jsonResponse(200, { data: null }) : jsonResponse(200, { data: terms }))) as typeof fetch;
    renderWithProviders(<PageEditorPage />, {
      initialEntries: ['/admin/website/pages/terms'],
      routePath: '/website/pages/:slug',
      authProvider: providerWithPermissions(['website.pages.view', 'website.pages.update', 'website.pages.publish']),
    });

    await userEvent.click(await screen.findByRole('button', { name: /^unpublish$/i }));
    const confirm = screen.getAllByRole('button', { name: /^unpublish$/i }).at(-1)!;
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/why is it being taken down/i), 'Replaced by new terms');
    expect(confirm).toBeEnabled();
  });

  it('explains the redirect before moving a published page, and never offers to move a policy', async () => {
    const live = { ...custom, status: 'published', canDelete: false, version: 5 };
    globalThis.fetch = (async (input: RequestInfo | URL) => (String(input).endsWith('/autosave') ? jsonResponse(200, { data: null }) : jsonResponse(200, { data: live }))) as typeof fetch;
    renderWithProviders(<PageEditorPage />, {
      initialEntries: ['/admin/website/pages/community-guidelines'],
      routePath: '/website/pages/:slug',
      authProvider: providerWithPermissions(['website.pages.view', 'website.pages.update', 'website.pages.publish']),
    });

    await userEvent.click(await screen.findByRole('button', { name: /change address/i }));
    expect(await screen.findByText(/sent to the new one automatically/i)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('New address'));
    await userEvent.type(screen.getByLabelText('New address'), 'Not An Address!');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^change address$/i }));
    expect(await screen.findByText(/lower-case letters, numbers and single hyphens, for example/i)).toBeInTheDocument();
  });

  it('duplicates a page from the list into a new draft', async () => {
    const posted: { url: string; body: unknown }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push({ url: String(input), body: JSON.parse(String(init.body)) });
        return jsonResponse(201, { data: { ...custom, slug: 'community-guidelines-copy', title: 'Community guidelines (copy)' } });
      }
      return jsonResponse(200, { data: [terms, custom] });
    }) as typeof fetch;
    renderWithProviders(<PagesPage />, { initialEntries: ['/admin/website/pages'], authProvider: providerWithPermissions(['website.pages.view', 'website.pages.create', 'website.pages.update']) });

    await userEvent.click(await screen.findByRole('button', { name: /duplicate community guidelines/i }));
    expect(await screen.findByDisplayValue('Community guidelines (copy)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /create copy/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.url).toContain('/admin/pages/community-guidelines/duplicate');
    expect(posted[0]!.body).toMatchObject({ slug: 'community-guidelines-copy', title: 'Community guidelines (copy)' });
  });

  it('puts the API’s refusal of an address on the address field', async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse(400, {
          error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid', fields: { slug: ['That address is used by the site itself, so a page there would never be seen'] }, requestId: 'r' },
        });
      }
      return jsonResponse(200, { data: [] });
    }) as typeof fetch;
    renderWithProviders(<PageCreatePage />, { initialEntries: ['/admin/website/pages/new'], authProvider: providerWithPermissions(['website.pages.view', 'website.pages.create', 'website.pages.update', 'website.pages.publish', 'website.pages.delete']) });

    const title = await screen.findByLabelText(/^title/i);
    await waitFor(() => expect(title).toBeEnabled());
    await userEvent.type(title, 'Blog');
    await userEvent.type(screen.getByLabelText('Text for section 2'), 'Something about the blog.');
    await userEvent.click(screen.getByRole('button', { name: /create page/i }));
    expect(await screen.findByText(/used by the site itself/i)).toBeInTheDocument();
  });
});
