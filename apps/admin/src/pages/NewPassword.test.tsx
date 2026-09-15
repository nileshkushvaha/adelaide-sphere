import { screen } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { anonymousProvider, renderWithProviders, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const PASSWORD = 'a-long-new-passphrase-1';

/** The reset and set-up links: one form, one redirect, the server's refusals on the field. */
describe('choosing a password from a link', () => {
  const originalFetch = globalThis.fetch;
  let answer: () => Response;
  beforeEach(() => {
    answer = () => new Response(null, { status: 204 });
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/me')) return jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in', fields: {}, requestId: 'r' } });
      if (url.includes('/reset-password') || url.includes('/accept-setup')) return answer();
      return jsonResponse(200, { data: {} });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const choose = async (password = PASSWORD) => {
    const ui = user();
    const fields = await screen.findAllByPlaceholderText(/passphrase|same password/i);
    await ui.type(fields[0]!, password);
    await ui.type(fields[1]!, password);
    return ui;
  };

  it('sends the reader straight to sign in with a notice once the password is changed', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/reset-password?token=abc'], authProvider: anonymousProvider() });
    const ui = await choose();
    await ui.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByText(/your password has been changed/i)).toBeInTheDocument();
  });

  it('does the same after activating an account', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/accept-setup?token=abc'], authProvider: anonymousProvider() });
    const ui = await choose();
    await ui.click(screen.getByRole('button', { name: 'Activate account' }));
    expect(await screen.findByText(/your account is active/i)).toBeInTheDocument();
  });

  it('puts a refused reuse on the password field and stays on the page', async () => {
    answer = () =>
      jsonResponse(400, {
        error: { code: 'PASSWORD_REUSED', message: 'Choose a password that is different from your current one and the 3 before it.', fields: { newPassword: ['You have used this password recently. Choose a different one.'] }, requestId: 'r' },
      });
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/reset-password?token=abc'], authProvider: anonymousProvider() });
    const ui = await choose();
    await ui.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('You have used this password recently. Choose a different one.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Choose a new password' })).toBeInTheDocument();
  });

  it('offers a new link when the reset link is spent', async () => {
    answer = () => jsonResponse(400, { error: { code: 'INVALID_RESET_TOKEN', message: 'This reset link is invalid or has expired', fields: {}, requestId: 'r' } });
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/reset-password?token=abc'], authProvider: anonymousProvider() });
    const ui = await choose();
    await ui.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('This reset link is invalid or has expired')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Request a new reset link' }).length).toBeGreaterThan(0);
  });

  it('never shows notice text that is not one of its own', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: [{ pathname: '/admin/login', state: { notice: 'Your account is locked, call 0400 000 000' } }], authProvider: anonymousProvider() });
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText(/call 0400/)).not.toBeInTheDocument();
  });
});
