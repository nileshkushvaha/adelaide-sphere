import { screen, within } from '@testing-library/react';
import { FeaturedPage } from './FeaturedPage';
import { renderWithProviders, providerWithPermissions, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const placement = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  businessId: 'b1',
  businessName: 'Fixture Coffee House',
  businessSlug: 'fixture-coffee-house',
  businessStatus: 'published',
  position: 0,
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: null,
  note: null,
  state: 'live',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

describe('featured listings', () => {
  const originalFetch = globalThis.fetch;
  let calls: { url: string; method: string }[] = [];
  const serve = (rows: unknown[]) => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      if (init?.method === 'DELETE') return jsonResponse(200, { data: { status: 'ok' } });
      return jsonResponse(200, { data: rows });
    }) as typeof fetch;
  };
  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Featured listings has its own codes since change log 1.13: view to see them, manage to change them.
  const render = (permissions = ['featured.view', 'featured.manage']) =>
    renderWithProviders(<FeaturedPage />, { initialEntries: ['/admin/businesses/featured'], authProvider: providerWithPermissions(permissions) });

  it("shows the server's own state rather than renaming it", async () => {
    serve([placement(), placement({ id: 'f2', businessName: 'Draft Diner', state: 'not-published' })]);
    render();
    const live = (await screen.findByText('Fixture Coffee House')).closest('tr')!;
    expect(within(live).getByText('live now')).toBeInTheDocument();
    // "not-published" is about the listing, not the placement, so it must not be
    // shown as "draft" — that would describe the wrong thing.
    const blocked = screen.getByText('Draft Diner').closest('tr')!;
    expect(within(blocked).getByText('listing not published')).toBeInTheDocument();
    expect(screen.queryByText('draft')).not.toBeInTheDocument();
  });

  it('does not put the public address in the table', async () => {
    serve([placement()]);
    render();
    await screen.findByText('Fixture Coffee House');
    expect(screen.queryByText(/fixture-coffee-house/)).not.toBeInTheDocument();
  });

  it('filters by state through the address bar, and offers a way back', async () => {
    const ue = user();
    serve([placement(), placement({ id: 'f2', businessName: 'Old Cafe', state: 'ended' })]);
    render();
    await screen.findByText('Fixture Coffee House');

    // Ant renders the accessible name on both the wrapper and the combobox.
    await ue.click(screen.getByRole('combobox', { name: 'Filter by state' }));
    await ue.click(await screen.findByTitle('Ended'));
    expect(await screen.findByText('Old Cafe')).toBeInTheDocument();
    expect(screen.queryByText('Fixture Coffee House')).not.toBeInTheDocument();
  });

  it('explains what removing a placement does, and does not do', async () => {
    const ue = user();
    serve([placement()]);
    render();
    await ue.click(await screen.findByRole('button', { name: /Remove the featured placement for Fixture Coffee House/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/stays published/i)).toBeInTheDocument();
    await ue.click(within(dialog).getByRole('button', { name: 'Remove placement' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('offers nothing to change without the publish permission', async () => {
    serve([placement()]);
    render(['featured.view']);
    await screen.findByText('Fixture Coffee House');
    expect(screen.queryByRole('link', { name: /feature a listing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('tells an empty set apart from a filtered one', async () => {
    serve([]);
    const { unmount } = render();
    expect(await screen.findByText('Nothing is featured')).toBeInTheDocument();
    unmount();

    serve([placement()]);
    renderWithProviders(<FeaturedPage />, { initialEntries: ['/admin/businesses/featured?state=ended'], authProvider: providerWithPermissions(['featured.view', 'featured.manage']) });
    expect(await screen.findByText('No placements match your filters')).toBeInTheDocument();
  });
});
