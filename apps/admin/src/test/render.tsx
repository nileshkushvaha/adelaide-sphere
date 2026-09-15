import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router';
import type { AuthProvider } from '@refinedev/core';
import { AppProviders } from '@/app/AppProviders';

interface Options extends Omit<RenderOptions, 'wrapper'> {
  /** Full URLs including the basename, e.g. '/admin/', or entries carrying navigation state. */
  initialEntries?: InitialEntry[];
  basename?: string;
  authProvider?: AuthProvider;
  /**
   * Renders `ui` under a single route so a page component sees its own
   * `useParams`, without mounting the whole route tree.
   */
  routePath?: string;
}

const principal = {
  admin: { id: 'a1', email: 'admin@example.com', displayName: 'Test Admin', roles: ['super_admin'], permissions: ['listings.read', 'listings.create', 'listings.update', 'listings.publish', 'featured.view', 'featured.manage', 'categories.view', 'categories.create', 'categories.update', 'services.view', 'services.create', 'services.update', 'areas.view', 'areas.create', 'areas.update', 'admins.view', 'admins.create', 'admins.update', 'admins.status', 'activity.authentication.view', 'activity.access_control.view', 'activity.content.view', 'activity.moderation.view', 'activity.communication.view', 'activity.configuration.view', 'activity.system.view', 'settings.general.view', 'settings.general.update', 'settings.home.view', 'settings.home.update', 'settings.seo.view', 'settings.seo.update', 'website.pages.view', 'website.pages.create', 'website.pages.update', 'website.pages.publish', 'website.pages.delete', 'reviews.view', 'reviews.moderate', 'reviews.redact', 'comments.view', 'comments.moderate', 'comments.redact', 'comments.reply', 'reports.view', 'reports.manage', 'enquiries.read', 'enquiries.manage', 'enquiries.retry', 'posts.view', 'posts.create', 'posts.update', 'posts.publish', 'posts.feature', 'authors.view', 'authors.create', 'authors.update', 'blog_categories.view', 'blog_categories.create', 'blog_categories.update', 'blog_tags.view', 'blog_tags.create', 'blog_tags.update', 'media.view', 'media.upload', 'media.update', 'media.delete', 'redirects.view', 'redirects.create', 'redirects.update', 'redirects.delete'], totpEnabled: false },
  session: { id: 's1', createdAt: '2026-09-06T00:00:00.000Z', idleExpiresAt: '2026-09-06T00:30:00.000Z', expiresAt: '2026-09-06T12:00:00.000Z' },
};

/** An always-authenticated provider for shell/page tests. */
export function authenticatedProvider(): AuthProvider {
  return {
    login: async () => ({ success: true, redirectTo: '/' }),
    logout: async () => ({ success: true, redirectTo: '/login' }),
    check: async () => ({ authenticated: true }),
    onError: async () => ({}),
    getIdentity: async () => principal.admin,
    getPermissions: async () => principal.admin.permissions,
  };
}

/**
 * A provider holding exactly the given permission codes, for access-control
 * tests. Anything not listed is absent, which is what the server would say.
 */
export function providerWithPermissions(permissions: string[], overrides: Partial<AuthProvider> = {}): AuthProvider {
  return {
    ...authenticatedProvider(),
    getIdentity: async () => ({ ...principal.admin, permissions }),
    getPermissions: async () => permissions,
    ...overrides,
  };
}

/** A provider whose permissions never resolve, for the "still loading" case. */
export function providerWithPendingPermissions(): AuthProvider {
  return { ...authenticatedProvider(), getPermissions: () => new Promise<string[]>(() => {}) };
}

export function anonymousProvider(): AuthProvider {
  return { ...authenticatedProvider(), check: async () => ({ authenticated: false, redirectTo: '/login', logout: false }), getIdentity: async () => null };
}

/** Renders inside the real provider stack with a memory router at the admin basename. */
export function renderWithProviders(ui: ReactElement, { initialEntries = ['/admin/'], basename = '/admin', authProvider = authenticatedProvider(), routePath, ...options }: Options = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter basename={basename} initialEntries={initialEntries}>
        <AppProviders authProvider={authProvider}>{routePath ? <Routes><Route path={routePath} element={children} /></Routes> : children}</AppProviders>
      </MemoryRouter>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}

/**
 * User-event instance without the per-keystroke delay. The default API waits
 * between keys, which makes dialog-heavy specs take tens of seconds; the
 * interactions themselves are unchanged.
 */
export function user() {
  return userEvent.setup({ delay: null });
}
