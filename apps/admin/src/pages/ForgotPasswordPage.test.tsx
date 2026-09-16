import { screen } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { anonymousProvider, renderWithProviders, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

/** Requesting a reset link: a sent request returns to sign in with a notice; a failed one stays on the form. */
describe('requesting a password reset link', () => {
  const originalFetch = globalThis.fetch;
  let answer: () => Response;
  beforeEach(() => {
    answer = () => new Response(null, { status: 202 });
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/me')) return jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in', fields: {}, requestId: 'r' } });
      if (url.includes('/forgot-password')) return answer();
      return jsonResponse(200, { data: {} });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const request = async (email = 'someone@example.com') => {
    const ui = user();
    await ui.type(await screen.findByPlaceholderText('name@example.com'), email);
    await ui.click(screen.getByRole('button', { name: 'Send reset link' }));
  };

  it('sends the reader back to sign in with a notice once the link is requested', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/forgot-password'], authProvider: anonymousProvider() });
    await request();
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/a reset link has been sent\. It is valid for 30 minutes/i);
  });

  it('stays on the form and shows the error when the request fails', async () => {
    answer = () => jsonResponse(429, { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.', fields: {}, requestId: 'r' } });
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/forgot-password'], authProvider: anonymousProvider() });
    await request();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Sign in' })).not.toBeInTheDocument();
  });
});
