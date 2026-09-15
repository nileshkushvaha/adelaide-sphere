import { act, fireEvent, screen } from '@testing-library/react';
import { AppRoutes } from '@/app/routes';
import { ApiError } from '@/api/errors';
import { toSignInFailure } from '@/auth/sign-in-failure';
import { anonymousProvider, renderWithProviders, user } from '@/test/render';

/** A provider whose login answers with the given API failure. */
function failingWith(init: ConstructorParameters<typeof ApiError>[0]) {
  const provider = anonymousProvider();
  provider.login = async () => ({ success: false, error: toSignInFailure(new ApiError(init)) });
  return provider;
}

async function signIn(email = 'admin@example.com', password = 'wrong-password-123') {
  const ui = user();
  await ui.type(await screen.findByLabelText('Email address'), email);
  await ui.type(screen.getByLabelText('Password'), password);
  await ui.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  it('offers native placeholders that are examples, not the labels again', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/login'], authProvider: anonymousProvider() });
    expect(await screen.findByLabelText('Email address')).toHaveAttribute('placeholder', 'name@example.com');
    expect(screen.getByLabelText('Password')).toHaveAttribute('placeholder', 'Your password');
  });

  it('answers wrong details without saying which half was wrong', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/login'], authProvider: failingWith({ kind: 'unauthorized', status: 401, code: 'INVALID_CREDENTIALS', userMessage: 'Invalid email or password' }) });
    await signIn();
    expect(await screen.findByText('The email or password is not right')).toBeInTheDocument();
  });

  it('counts down a rate limit on the button and refuses to send until it ends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/login'], authProvider: failingWith({ kind: 'rate_limited', status: 429, code: 'RATE_LIMITED', userMessage: 'Too many attempts.', retryAfterSeconds: 3 }) });
      await signIn();
      expect(await screen.findByText('Too many attempts')).toBeInTheDocument();
      const button = screen.getByRole('button', { name: /try again in 0:0\d/i });
      expect(button).toBeDisabled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_000);
      });
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
      expect(screen.queryByText('Too many attempts')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts a field error from the server back on that field', async () => {
    renderWithProviders(<AppRoutes />, {
      initialEntries: ['/admin/login'],
      authProvider: failingWith({ kind: 'validation', status: 400, code: 'VALIDATION_ERROR', userMessage: 'Some details are invalid', fields: { email: ['That is not an address we can send to'] } }),
    });
    await signIn();
    expect(await screen.findByText('That is not an address we can send to')).toBeInTheDocument();
  });

  it('says so when the server cannot be reached', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/login'], authProvider: failingWith({ kind: 'network', status: null, code: null, userMessage: 'unreachable' }) });
    await signIn();
    expect(await screen.findByText('The server could not be reached')).toBeInTheDocument();
  });

  it('warns while typing when Caps Lock is on', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/admin/login'], authProvider: anonymousProvider() });
    const password = await screen.findByLabelText('Password');
    // jsdom reports Caps Lock through the standard KeyboardEvent init flag.
    fireEvent.keyDown(password, { key: 'A', modifierCapsLock: true });
    expect(await screen.findByText('Caps Lock is on')).toBeInTheDocument();
    fireEvent.keyDown(password, { key: 'a', modifierCapsLock: false });
    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument();
  });
});
