import { useLocation, useNavigate } from 'react-router';

/**
 * Messages the sign-in screen shows after another screen sends the reader there.
 *
 * Only a key travels in the navigation state, and only keys listed here are
 * shown: text in history state can be written by anything that can navigate,
 * so the screen never renders it directly.
 */
export const SIGN_IN_NOTICES = {
  'password-changed': 'Your password has been changed and every earlier session has been signed out. Sign in with your new password.',
  'account-activated': 'Your account is active. Sign in with the password you have just chosen.',
} as const;

export type SignInNotice = keyof typeof SIGN_IN_NOTICES;

const isNotice = (value: unknown): value is SignInNotice => typeof value === 'string' && Object.hasOwn(SIGN_IN_NOTICES, value);

/**
 * Sends the reader to the sign-in screen with a notice. `replace`, so Back does
 * not return to a page whose link has just been used up — and whose address
 * carries the single-use token.
 */
export function useGoToSignIn(): (notice: SignInNotice) => void {
  const navigate = useNavigate();
  return (notice) => navigate('/login', { replace: true, state: { notice } });
}

/** The notice the sign-in screen was opened with, if it is one we wrote. */
export function useSignInNotice(): string | null {
  const { state } = useLocation();
  const notice = (state as { notice?: unknown } | null)?.notice;
  return isNotice(notice) ? SIGN_IN_NOTICES[notice] : null;
}
