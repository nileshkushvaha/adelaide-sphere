import { screen } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { createAuthProvider } from '@/auth/auth-provider';
import { renderWithProviders, user } from '@/test/render';
import { jsonResponse } from '@/test/fetch-fakes';

const principal = {
  admin: { id: 'a1', email: 'admin@example.com', displayName: 'Test Admin', roles: ['super_admin'], permissions: ['listings.read'], totpEnabled: true },
  session: { id: 's1', createdAt: '2026-09-06T00:00:00.000Z', idleExpiresAt: '2026-09-06T00:30:00.000Z', expiresAt: '2026-09-06T12:00:00.000Z' },
};

describe('login with a second factor', () => {
  const originalFetch = globalThis.fetch;
  let authenticated = false;
  beforeEach(() => {
    authenticated = false;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/v1/admin/auth/me') return authenticated ? jsonResponse(200, { data: principal }) : jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue', fields: {}, requestId: 'r' } });
      if (url === '/api/v1/admin/auth/login') return jsonResponse(202, { data: { requires: 'totp', challenge: 'c'.repeat(43), expiresAt: '2026-09-06T00:05:00.000Z' } });
      if (url === '/api/v1/admin/auth/totp/challenge') {
        const body = JSON.parse(String(init?.body));
        if (body.code !== '123456') return jsonResponse(401, { error: { code: 'INVALID_TOTP_CODE', message: 'That code is not valid', fields: {}, requestId: 'r' } });
        authenticated = true;
        return jsonResponse(200, { data: principal });
      }
      return jsonResponse(200, { data: { status: 'ok' } });
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('shows the code step after the password, rejects a wrong code, then signs in', async () => {
    const ue = user();
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/login'], authProvider: createAuthProvider() });
    await ue.type(await screen.findByLabelText(/email/i), 'admin@example.com');
    await ue.type(screen.getByLabelText(/^password/i), 'correct-password-123');
    await ue.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /enter your verification code/i })).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/verification code/i), '000000');
    await ue.click(screen.getByRole('button', { name: /verify and sign in/i }));
    const alerts = await screen.findAllByRole('alert');
    // Told what to do about it, in the terms of the code step.
    expect(alerts.some((a) => /that code did not work/i.test(a.textContent ?? ''))).toBe(true);
    // The challenge itself never reaches the screen (Refine's own toast used to print it).
    expect(document.body.textContent).not.toContain('c'.repeat(43));
    await ue.clear(screen.getByLabelText(/verification code/i));
    await ue.type(screen.getByLabelText(/verification code/i), '123456');
    await ue.click(screen.getByRole('button', { name: /verify and sign in/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });
});
