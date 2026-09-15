import { screen, waitFor, within } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { renderWithProviders, providerWithPermissions, user } from '@/test/render';

const ROLES = {
  data: [
    { id: 'r1', key: 'super_admin', name: 'Super Admin', description: 'Everything', isSystem: true, isActive: true, version: 1, adminCount: 1, permissionCount: 22, updatedAt: '2026-09-07T00:00:00.000Z' },
    { id: 'r2', key: 'editor', name: 'Editor', description: 'Writes articles', isSystem: false, isActive: true, version: 3, adminCount: 0, permissionCount: 3, updatedAt: '2026-09-07T00:00:00.000Z' },
  ],
  meta: { page: 1, pageSize: 20, total: 2, pageCount: 1 },
};

const CATALOG = [
  { key: 'posts.update', label: 'Edit articles', description: 'Create and edit blog posts', module: 'Editorial', menuItem: 'Articles', action: 'Update', isActive: true, isSystem: true },
  { key: 'posts.publish', label: 'Publish articles', description: 'Publish, schedule and archive blog posts', module: 'Editorial', menuItem: 'Articles', action: 'Publish', isActive: true, isSystem: true },
  { key: 'roles.view', label: 'View roles', description: 'View roles', module: 'Configuration', menuItem: 'Roles', action: 'View', isActive: true, isSystem: true },
];

function stubFetch(routes: Record<string, unknown>) {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const key = Object.keys(routes).find((path) => url.includes(path));
    if (!key) return Promise.resolve(new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } }));
    const body = key.includes('/roles?') || key === '/admin/roles' ? routes[key] : { data: routes[key] };
    void init;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  }) as typeof fetch;
}

describe('Roles screens', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists roles, marks the protected one and offers creation only with roles.create', async () => {
    globalThis.fetch = stubFetch({ '/admin/roles?': ROLES, '/admin/permissions': CATALOG });
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/roles'], authProvider: providerWithPermissions(['roles.view']) });

    expect(await screen.findByRole('heading', { level: 1, name: 'Roles' })).toBeInTheDocument();
    const table = await screen.findByRole('table');
    expect(await within(table).findByText('Super Admin')).toBeInTheDocument();
    // The protected role is labelled, so an editor knows why it cannot be changed.
    expect(within(table).getByText('Built in')).toBeInTheDocument();
    // Without roles.create there is no create control at all.
    expect(screen.queryByRole('button', { name: /new role/i })).not.toBeInTheDocument();
  });

  it('offers creation when the permission is held', async () => {
    globalThis.fetch = stubFetch({ '/admin/roles?': ROLES, '/admin/permissions': CATALOG });
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/roles'], authProvider: providerWithPermissions(['roles.view', 'roles.create']) });
    expect(await screen.findByRole('button', { name: /new role/i })).toBeInTheDocument();
  });

  it('shows a protected role read-only, with its permission matrix disabled', async () => {
    globalThis.fetch = stubFetch({
      '/admin/roles/r1': { ...ROLES.data[0], permissions: ['posts.update', 'roles.view'] },
      '/admin/permissions': CATALOG,
    });
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/roles/r1'], authProvider: providerWithPermissions(['roles.view', 'roles.update']) });

    expect(await screen.findByRole('heading', { level: 1, name: 'Super Admin' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /^articles: update$/i })).toBeDisabled());
    // Nothing to save: the protected role's permissions are owned by the catalogue.
    expect(screen.queryByRole('button', { name: /save role/i })).not.toBeInTheDocument();
  });

  it('lets an editable role be changed through the grouped matrix', async () => {
    const ue = user();
    globalThis.fetch = stubFetch({
      '/admin/roles/r2': { ...ROLES.data[1], permissions: ['posts.update'] },
      '/admin/permissions': CATALOG,
    });
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/roles/r2'], authProvider: providerWithPermissions(['roles.view', 'roles.update']) });

    const publish = await screen.findByRole('checkbox', { name: /^articles: publish$/i });
    expect(publish).not.toBeChecked();
    await ue.click(publish);
    expect(publish).toBeChecked();
    // Permissions are grouped by module with a keyboard-operable group control.
    expect(screen.getByRole('button', { name: /select all in editorial/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save role/i })).toBeInTheDocument();
  });
});
