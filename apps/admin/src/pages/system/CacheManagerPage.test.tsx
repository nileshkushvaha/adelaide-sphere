import { screen, within } from '@testing-library/react';
import { CacheManagerPage } from '@/pages/system/CacheManagerPage';
import { renderWithProviders, providerWithPermissions } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const status = {
  redis: { available: true, detail: 'Connected' },
  namespaces: [
    { key: 'search', label: 'Directory search results', description: 'Answers to search and filter queries.', ttlSeconds: 30, entries: 1234, approximate: true, lastClearedAt: null },
  ],
  tags: [{ key: 'alerts', label: 'Service alerts', description: 'The alert bar above the header.', lastClearedAt: '2026-09-07T10:00:00.000Z' }],
};

/**
 * The screen offers registered caches only, and never a way to clear
 * everything (SRS 1.2 CMGR 002/004).
 */
describe('CacheManagerPage', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = (async () => jsonResponse(200, { data: status })) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists the registered caches and marks entry counts as approximate', async () => {
    renderWithProviders(<CacheManagerPage />, {
      initialEntries: ['/admin/system/cache'],
      authProvider: providerWithPermissions(['system.cache.view', 'system.cache.invalidate']),
    });

    expect(await screen.findByRole('heading', { level: 1, name: 'Cache manager' })).toBeInTheDocument();
    expect(await screen.findByText('Directory search results')).toBeInTheDocument();
    expect(screen.getByText(/about 1,234/)).toBeInTheDocument();
    expect(screen.getByText(/approximate/i)).toBeInTheDocument();
  });

  it('offers no control that clears everything, and no field that takes a key or pattern', async () => {
    renderWithProviders(<CacheManagerPage />, {
      initialEntries: ['/admin/system/cache'],
      authProvider: providerWithPermissions(['system.cache.view', 'system.cache.invalidate']),
    });

    await screen.findByText('Directory search results');
    for (const forbidden of [/flush/i, /clear all/i, /clear everything/i, /^purge all/i]) {
      expect(screen.queryByRole('button', { name: forbidden })).not.toBeInTheDocument();
    }
    // No free-text input at all: every action names a registered cache.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('hides the clearing controls from an administrator who may only look', async () => {
    renderWithProviders(<CacheManagerPage />, {
      initialEntries: ['/admin/system/cache'],
      authProvider: providerWithPermissions(['system.cache.view']),
    });

    await screen.findByText('Directory search results');
    expect(screen.queryByRole('button', { name: /^clear$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^refresh$/i, hidden: false })).toBeInTheDocument(); // the page's own reload
    expect(screen.getByText(/see the caches but not clear them/i)).toBeInTheDocument();
  });

  it('says what an unavailable cache means for the site rather than only that it failed', async () => {
    globalThis.fetch = (async () =>
      jsonResponse(200, { data: { ...status, redis: { available: false, detail: 'Unavailable (ECONNREFUSED). Pages are served from the database instead.' } } })) as typeof fetch;
    renderWithProviders(<CacheManagerPage />, {
      initialEntries: ['/admin/system/cache'],
      authProvider: providerWithPermissions(['system.cache.view']),
    });

    const banner = await screen.findByText('Caching is unavailable');
    expect(within(banner.closest('.ant-alert') as HTMLElement).getByText(/the site is slower until this returns/i)).toBeInTheDocument();
    // The server's own detail carries a driver code; the screen says what it
    // means for the site instead.
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  });
});
