import { screen, waitFor } from '@testing-library/react';
import { DashboardPage } from './DashboardPage';
import { LoginPage } from './LoginPage';
import { AuthorEditorPage } from './blog/AuthorEditorPage';
import { RedirectsPage } from './seo/RedirectsPage';
import { RoleEditorPage } from './access/RoleEditorPage';
import { AdminAccessCard } from './access/AdminAccessCard';
import { anonymousProvider, renderWithProviders } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';
import { axeViolations, describeViolations } from '@/test/axe';

const dashboard = {
  metrics: [{ key: 'pendingReviews', label: 'Reviews awaiting moderation', value: 2, href: '/reviews', tone: 'attention' }],
  scheduledPosts: [{ id: 'p1', title: 'Winter markets', scheduledAt: '2026-09-08T09:00:00.000Z', overdue: false }],
  activity: [{ id: 'l1', action: 'blog.post.publish', actorName: 'Alex Editor', targetType: 'post', createdAt: '2026-09-06T00:00:00.000Z' }],
  generatedAt: '2026-09-06T01:00:00.000Z',
};

const redirect = {
  id: 'r1', sourcePath: '/business/old', targetPath: '/business/new', kind: 'permanent', reason: null,
  resourceType: 'business', resourceId: 'b1', createdByAdminId: 'a1', createdAt: '2026-09-06T00:00:00.000Z', updatedAt: '2026-09-06T00:00:00.000Z',
};

const catalogue = [
  { key: 'posts.update', label: 'Edit articles', description: 'Create and edit blog posts', module: 'Editorial', menuItem: 'Articles', action: 'Update', isActive: true, isSystem: true },
  { key: 'roles.view', label: 'View roles', description: 'View roles and the permissions they carry', module: 'Configuration', menuItem: 'Roles', action: 'View', isActive: true, isSystem: true },
];

const adminAccess = {
  adminId: 'a2', displayName: 'Second Admin', email: 'second@example.com', status: 'active', version: 2,
  roles: [{ id: 'r2', key: 'editor', name: 'Editor', isActive: true }],
  directPermissions: ['roles.view'], inheritedPermissions: ['posts.update'], effectivePermissions: ['posts.update', 'roles.view'],
  sources: { 'posts.update': ['editor'], 'roles.view': ['direct'] },
};

/** Automated WCAG checks on representative screens (SRS NFR 006/011). */
describe('accessibility', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/v1/admin/dashboard')) return jsonResponse(200, { data: dashboard });
      if (url.startsWith('/api/v1/admin/redirects')) return jsonResponse(200, { data: [redirect], meta: { page: 1, pageSize: 25, total: 1, pageCount: 1 } });
      if (url.startsWith('/api/v1/admin/authors')) return jsonResponse(200, { data: [] });
      if (url.startsWith('/api/v1/admin/permissions')) return jsonResponse(200, { data: catalogue });
      if (url.includes('/access')) return jsonResponse(200, { data: adminAccess });
      if (url.startsWith('/api/v1/admin/roles')) return jsonResponse(200, { data: [], meta: { page: 1, pageSize: 20, total: 0, pageCount: 1 } });
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const check = async (container: HTMLElement) => {
    const violations = await axeViolations(container);
    expect(describeViolations(violations)).toBe('');
  };

  it('dashboard has no automated violations', async () => {
    const { container } = renderWithProviders(<DashboardPage />, { initialEntries: ['/admin/'] });
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await check(container);
  });

  it('sign-in page has no automated violations', async () => {
    const { container } = renderWithProviders(<LoginPage />, { initialEntries: ['/admin/login'], authProvider: anonymousProvider() });
    await screen.findByRole('heading', { level: 1 });
    await check(container);
  });

  it('role editor, including the permission matrix, has no automated violations', async () => {
    const { container } = renderWithProviders(<RoleEditorPage />, { initialEntries: ['/admin/roles/new'], routePath: '/roles/new' });
    await screen.findByRole('heading', { level: 1, name: 'New role' });
    await screen.findByRole('checkbox', { name: /articles: update/i });
    await check(container);
  });

  it('administrator access editor has no automated violations', async () => {
    const { container } = renderWithProviders(<AdminAccessCard adminId="a2" isSelf={false} />, { initialEntries: ['/admin/admins/a2'] });
    // The permission matrix and the permissions-in-force table, both loaded.
    await waitFor(() => expect(screen.getAllByRole('table').length).toBeGreaterThanOrEqual(2));
    await screen.findByRole('checkbox', { name: /roles: view/i });
    await check(container);
  });

  it('author editor has no automated violations', async () => {
    const { container } = renderWithProviders(<AuthorEditorPage />, { initialEntries: ['/admin/authors/new'], routePath: '/authors/new' });
    await screen.findByRole('heading', { level: 1, name: 'New author' });
    await check(container);
  });

  it('redirects screen has no automated violations', async () => {
    const { container } = renderWithProviders(<RedirectsPage />, { initialEntries: ['/admin/redirects'] });
    await screen.findByRole('heading', { level: 1, name: 'SEO redirects' });
    await check(container);
  });
});
