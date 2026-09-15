import { screen } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { anonymousProvider, renderWithProviders, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

describe('accept-setup page', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('refuses without a token and activates with a matching password pair', async () => {
    const ue = user();
    let posted: string | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/v1/admin/auth/accept-setup') {
        posted = String(init?.body);
        return new Response(null, { status: 204 });
      }
      return jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'x', fields: {}, requestId: 'r' } });
    }) as typeof fetch;
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/accept-setup'], authProvider: anonymousProvider() });
    expect(await screen.findByText(/setup link is incomplete/i)).toBeInTheDocument();

    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/accept-setup?token=' + 'x'.repeat(43)], authProvider: anonymousProvider() });
    const pw = await screen.findByLabelText(/choose a password/i);
    await ue.type(pw, 'a-long-enough-password-1');
    await ue.type(screen.getByLabelText(/confirm password/i), 'a-long-enough-password-2');
    await ue.click(screen.getByRole('button', { name: /activate account/i }));
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    await ue.clear(screen.getByLabelText(/confirm password/i));
    await ue.type(screen.getByLabelText(/confirm password/i), 'a-long-enough-password-1');
    await ue.click(screen.getByRole('button', { name: /activate account/i }));
    expect(await screen.findByText(/your account is active/i)).toBeInTheDocument();
    expect(JSON.parse(posted!)).toEqual({ token: 'x'.repeat(43), password: 'a-long-enough-password-1' });
  });
});
