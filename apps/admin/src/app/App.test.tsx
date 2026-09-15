import { screen } from '@testing-library/react';
import { AppRoutes } from './routes';
import { anonymousProvider, renderWithProviders } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

describe('admin application', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = (async () => jsonResponse(200, { data: { status: 'ok' } })) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders the dashboard at the /admin/ base path with landmarks, skip link and title', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/'] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('Test Admin')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('navigation', { name: /admin navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute('href', '#main-content');
    expect(await screen.findByText(/this interface can reach the api/i)).toBeInTheDocument();
    // Signing out lives in the account menu; opening it must expose the action.
    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: /account menu for test admin/i }));
    expect(await screen.findByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
    expect(document.title).toBe('Dashboard · Adelaide Sphere Admin');
  });

  it('shows the not-found page for unknown admin routes and links back to the dashboard', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/does-not-exist'] });
    expect(await screen.findByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i }).getAttribute('href')).toMatch(/^\/admin\/?$/);
    expect(document.title).toBe('Page not found · Adelaide Sphere Admin');
  });

  it('redirects anonymous visitors from the shell to the login page', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/'], authProvider: anonymousProvider() });
    expect(await screen.findByRole('heading', { level: 1, name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(document.title).toBe('Sign in · Adelaide Sphere Admin');
  });

  it('login page shows a safe message on failure and never stores anything in web storage', async () => {
    const provider = anonymousProvider();
    provider.login = async () => ({ success: false, error: { name: 'Sign-in failed', message: 'Invalid email or password' } });
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/login'], authProvider: provider });
    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.type(await screen.findByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'wrong-password-123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    const alerts = await screen.findAllByRole('alert');
    // The fake provider's error is not from the API client, so its text is not shown.
    expect(alerts.some((a) => /sign-in failed/i.test(a.textContent ?? ''))).toBe(true);
    expect(Object.keys(localStorage)).toHaveLength(0);
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });

  it('reset-password page refuses to render the form without a token', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/reset-password'], authProvider: anonymousProvider() });
    expect(await screen.findByText(/reset link is incomplete/i)).toBeInTheDocument();
  });
});
