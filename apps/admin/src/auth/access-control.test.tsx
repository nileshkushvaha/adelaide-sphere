import { screen, within } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { renderWithProviders, providerWithPermissions, providerWithPendingPermissions } from '@/test/render';
import { createAccessControlProvider } from './access-control';
import { holdsAll, permissionsForPath, PERMISSION } from './permissions';
import { jsonResponse } from '@/test/fetch-fakes';

describe('access control (SRS RBAC 010)', () => {
  describe('the mapping and provider', () => {
    it('maps a route to the permissions it needs, longest prefix first', () => {
      expect(permissionsForPath('/roles')).toEqual(['roles.view']);
      expect(permissionsForPath('/roles/abc123')).toEqual(['roles.view']);
      expect(permissionsForPath('/settings/general')).toEqual(['settings.general.view']);
      // Unmapped screens (dashboard, account) need a session only; the API still guards them.
      expect(permissionsForPath('/')).toEqual([]);
    });

    it('answers from the codes the server calculated, and refuses while they are unknown', async () => {
      const server: { held?: string[] } = {};
      const provider = createAccessControlProvider(() => server.held);
      // Before /me answers, nothing is permitted — the interface waits rather than guessing.
      expect(await provider.can({ resource: '/roles', action: 'list' })).toMatchObject({ can: false });
      server.held = [PERMISSION.rolesView];
      expect(await provider.can({ resource: '/roles', action: 'list' })).toMatchObject({ can: true });
      expect(await provider.can({ resource: '/permissions', action: 'list' })).toMatchObject({ can: false });
      // A capability can also be asked for directly by code.
      expect(await provider.can({ resource: 'anything', action: PERMISSION.rolesView })).toMatchObject({ can: true });
      expect(await provider.can({ resource: 'anything', action: PERMISSION.rolesDelete })).toMatchObject({ can: false });
    });

    it('requires every code when a screen needs more than one', () => {
      expect(holdsAll(['a', 'b'], ['a', 'b'])).toBe(true);
      expect(holdsAll(['a'], ['a', 'b'])).toBe(false);
      expect(holdsAll(undefined, ['a'])).toBe(false);
    });
  });

  describe('navigation and routes', () => {
    // Every screen these tests open is answered, so what they observe is the
    // permission decision — not a page reacting to a request that failed.
    // (Unanswered, the catalogue request failed mid-test and the page swapped
    // its content, which made "renders the page" flaky.)
    const originalFetch = globalThis.fetch;
    beforeEach(() => {
      globalThis.fetch = (async (input: RequestInfo | URL) =>
        String(input).includes('/admin/permissions') ? jsonResponse(200, { data: [] }) : jsonResponse(200, { data: [], meta: { page: 1, pageSize: 25, total: 0, pageCount: 1 } })) as typeof fetch;
    });
    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('shows only the navigation the administrator may use', async () => {
      renderWithProviders(<AppRoutes />, { authProvider: providerWithPermissions(['roles.view']) });
      const nav = await screen.findByRole('navigation', { name: /admin navigation/i });
      expect(await within(nav).findByRole('link', { name: 'Roles' })).toBeInTheDocument();
      expect(within(nav).queryByRole('link', { name: 'Administrators' })).not.toBeInTheDocument();
      expect(within(nav).queryByRole('link', { name: 'Activity log' })).not.toBeInTheDocument();
      expect(within(nav).queryByRole('link', { name: 'Media library' })).not.toBeInTheDocument();
    });

    it('renders the forbidden state for a route the administrator may not use', async () => {
      renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/roles'], authProvider: providerWithPermissions(['media.view']) });
      expect(await screen.findByRole('heading', { level: 1, name: /do not have permission/i })).toBeInTheDocument();
      // It says what happened and offers the way back, rather than pretending the page is missing.
      expect(screen.getByRole('link', { name: /back to dashboard/i })).toBeInTheDocument();
    });

    it('renders the page when the permission is held', async () => {
      renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/permissions'], authProvider: providerWithPermissions(['permissions.view']) });
      expect(await screen.findByRole('heading', { level: 1, name: /permission catalogue/i })).toBeInTheDocument();
      // Loaded, not just started: the heading stays once the data is in.
      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: /permission catalogue/i })).toBeInTheDocument();
    });

    it('keeps the page heading when its data cannot be loaded, and offers a retry', async () => {
      globalThis.fetch = (async () => jsonResponse(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.', fields: {}, requestId: 'r' } })) as typeof fetch;
      renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/permissions'], authProvider: providerWithPermissions(['permissions.view']) });
      expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: /permission catalogue/i })).toBeInTheDocument();
    });

    it('shows a waiting state instead of the page or the forbidden state while capabilities load', async () => {
      renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/roles'], authProvider: providerWithPendingPermissions() });
      expect(await screen.findByText(/checking your permissions/i)).toBeInTheDocument();
      // Neither outcome is shown before the answer arrives.
      expect(screen.queryByRole('heading', { name: /do not have permission/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /^roles$/i })).not.toBeInTheDocument();
    });
  });
});

