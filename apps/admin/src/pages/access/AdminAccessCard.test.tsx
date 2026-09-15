import { screen, within } from '@testing-library/react';
import { AdminAccessCard } from '@/pages/access/AdminAccessCard';
import { renderWithProviders, providerWithPermissions, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const CATALOGUE = [
  { key: 'listings.read', label: 'See listings', description: 'View business listings.', module: 'Business', menuItem: 'Businesses', action: 'View', isActive: true, isSystem: true },
  { key: 'listings.publish', label: 'Publish listings', description: 'Make a listing public.', module: 'Business', menuItem: 'Businesses', action: 'Publish', isActive: true, isSystem: true },
  { key: 'admins.access.manage', label: 'Manage administrator access', description: 'Change roles and permissions.', module: 'Configuration', menuItem: 'Administrators', action: 'Assign access', isActive: true, isSystem: true },
];

const ROLES = {
  data: [
    { id: 'r1', key: 'editor', name: 'Content editor', description: 'Editorial', isSystem: false, isActive: true, version: 1, adminCount: 2, permissionCount: 2, updatedAt: '2026-09-01T00:00:00.000Z' },
    { id: 'r2', key: 'super_admin', name: 'Super Admin', description: 'Everything', isSystem: true, isActive: true, version: 1, adminCount: 1, permissionCount: 3, updatedAt: '2026-09-01T00:00:00.000Z' },
  ],
  meta: { page: 1, pageSize: 50, total: 2, pageCount: 1 },
};

const ACCESS = {
  adminId: 'a2',
  displayName: 'Sam Editor',
  email: 'sam@example.com',
  status: 'active',
  version: 4,
  roles: [{ id: 'r1', key: 'editor', name: 'Content editor', isActive: true }],
  directPermissions: ['listings.publish'],
  inheritedPermissions: ['listings.read'],
  effectivePermissions: ['listings.publish', 'listings.read'],
  sources: { 'listings.read': ['editor'], 'listings.publish': ['direct'] },
};

const written: { url: string; body: unknown }[] = [];

function install() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'PUT') {
      written.push({ url, body: JSON.parse(String(init?.body)) });
      return jsonResponse(200, { data: ACCESS });
    }
    if (url.includes('/access')) return jsonResponse(200, { data: ACCESS });
    if (url.includes('/admin/roles')) return jsonResponse(200, ROLES);
    if (url.includes('/admin/permissions')) return jsonResponse(200, { data: CATALOGUE });
    if (url.includes('/admin/activity')) return jsonResponse(200, { data: [], meta: { page: 1, pageSize: 10, total: 0, pageCount: 1 } });
    return jsonResponse(200, { data: [] });
  }) as typeof fetch;
}

/**
 * The access editor (SRS RBAC 010/011). What is checked here is what a reader
 * has to be able to trust: that "where it comes from" is accurate, that a change
 * is described before it happens, and that the screen never offers a grant the
 * server would refuse.
 */
describe('AdminAccessCard', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    written.length = 0;
    install();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const full = ['admins.access.manage', 'listings.read', 'listings.publish', 'activity.access_control.view'];

  it('names the role a permission is inherited from, and marks a direct grant as direct', async () => {
    renderWithProviders(<AdminAccessCard adminId="a2" isSelf={false} />, { authProvider: providerWithPermissions(full) });

    // Located by code, which appears only in the effective-permission table —
    // the label also appears on the checkbox above it.
    const row = (await screen.findByText('listings.read')).closest('tr') as HTMLElement;
    // The role's name, not its key: "editor" is not what the reader chose.
    expect(within(row).getByText(/Content editor/)).toBeInTheDocument();
    const directRow = screen.getByText('listings.publish').closest('tr') as HTMLElement;
    expect(within(directRow).getByText('Granted directly')).toBeInTheDocument();
  });

  it('says which role already grants a permission, so a redundant direct grant is visible', async () => {
    renderWithProviders(<AdminAccessCard adminId="a2" isSelf={false} />, { authProvider: providerWithPermissions(full) });
    expect(await screen.findByText('Already granted by Content editor.')).toBeInTheDocument();
  });

  it('describes the change and the sign-out before writing it', async () => {
    const ui = user();
    renderWithProviders(<AdminAccessCard adminId="a2" isSelf={false} />, { authProvider: providerWithPermissions(full) });

    const save = await screen.findByRole('button', { name: 'Save direct permissions' });
    // Nothing has changed yet, so there is nothing to save.
    expect(save).toBeDisabled();

    await ui.click(screen.getByRole('checkbox', { name: 'Businesses: View' }));
    expect(await screen.findByText('Not saved yet.')).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Save direct permissions' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/See listings/)).toBeInTheDocument();
    expect(within(dialog).getByText(/signs Sam Editor out of every device/)).toBeInTheDocument();

    await ui.click(within(dialog).getByRole('button', { name: 'Apply change' }));
    await screen.findByText(/Direct permissions updated/);
    expect(written).toEqual([
      { url: expect.stringContaining('/admin/admins/a2/permissions'), body: { permissions: ['listings.publish', 'listings.read'], expectedVersion: 4 } },
    ]);
  });

  it('offers no way to edit an administrator’s own access', async () => {
    renderWithProviders(<AdminAccessCard adminId="a2" isSelf />, { authProvider: providerWithPermissions(full) });
    expect(await screen.findByText('You cannot change your own access')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save roles' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save direct permissions' })).not.toBeInTheDocument();
  });

  // Narrowed capabilities last: the capability store is shared, so a test that
  // holds fewer permissions must not run before one that expects more.
  it('withholds a permission the acting administrator does not hold, and says why', async () => {
    renderWithProviders(<AdminAccessCard adminId="a2" isSelf={false} />, { authProvider: providerWithPermissions(['admins.access.manage', 'listings.read']) });

    const checkbox = await screen.findByRole('checkbox', { name: 'Businesses: Publish' });
    expect(checkbox).toBeDisabled();
    expect(screen.getByText('You do not hold this permission, so you cannot grant it.')).toBeInTheDocument();
  });

  it('does not offer the Super Admin role to an administrator who does not hold it', async () => {
    renderWithProviders(<AdminAccessCard adminId="a2" isSelf={false} />, {
      authProvider: providerWithPermissions(['admins.access.manage'], { getIdentity: async () => ({ id: 'a1', email: 'a@example.com', displayName: 'A', roles: ['editor'], permissions: ['admins.access.manage'], totpEnabled: false }) }),
    });

    const ui = user();
    await ui.click(await screen.findByRole('combobox', { name: 'Roles' }));
    const option = (await screen.findByText('Super Admin (only a Super Admin can grant this)')).closest('.ant-select-item') as HTMLElement;
    expect(option.className).toContain('ant-select-item-option-disabled');
  });
});
