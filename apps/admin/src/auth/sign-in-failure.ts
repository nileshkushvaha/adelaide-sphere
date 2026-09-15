import { isApiError, type ApiErrorKind, type FieldErrors } from '@/api/errors';

/**
 * A failed sign-in, carried from the auth provider to the sign-in screen with
 * what the screen needs to respond properly — not just a sentence.
 *
 * Refine hands the login page an `Error`; this one keeps the failure's kind, the
 * server's wait time and any field errors on it, so the screen can tell "wrong
 * password" from "locked for a while" from "the server is unreachable" and say
 * something useful about each.
 *
 * Nothing here comes from the response body except the API's own user-safe
 * message and its request reference; credentials are never attached.
 */
export interface SignInFailure extends Error {
  kind: ApiErrorKind;
  retryAfterSeconds: number | null;
  fields: FieldErrors;
  reference: string | null;
}

export function toSignInFailure(error: unknown): SignInFailure {
  if (isApiError(error)) {
    return Object.assign(new Error(error.userMessage), {
      name: 'Sign-in failed',
      kind: error.kind,
      retryAfterSeconds: error.retryAfterSeconds,
      fields: error.fields,
      reference: error.requestId ? error.reference : null,
    });
  }
  // Anything else is not from our client (a browser or library error), so its
  // text is never shown.
  const safe = 'Sign-in failed. Please try again.';
  return Object.assign(new Error(safe), { name: 'Sign-in failed', kind: 'unexpected' as const, retryAfterSeconds: null, fields: {}, reference: null });
}

export function isSignInFailure(value: unknown): value is SignInFailure {
  return value instanceof Error && typeof (value as Partial<SignInFailure>).kind === 'string';
}

/** What the sign-in screen says about a failure: a headline and what to do next. */
export interface SignInMessage {
  title: string;
  detail: string;
  /** Show the support reference: only for faults the reader cannot fix themselves. */
  showReference: boolean;
}

/** "about 2 minutes" — a wait stated in the unit a person would use. */
export function describeWait(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} second${Math.round(seconds) === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * The words for each kind of failure. Wrong credentials are reported without
 * saying which of the two was wrong — the server does the same, so the screen
 * cannot be used to learn which email addresses have accounts.
 */
export function signInMessage(failure: SignInFailure, step: 'password' | 'code' = 'password'): SignInMessage {
  switch (failure.kind) {
    case 'unauthorized':
      return step === 'code'
        ? { title: 'That code did not work', detail: 'Codes change every 30 seconds. Enter the current code from your authenticator app, or a recovery code you have not used before.', showReference: false }
        : { title: 'The email or password is not right', detail: 'Check both and try again. After several failed attempts, signing in is paused for a while.', showReference: false };
    case 'rate_limited':
      return {
        title: 'Too many attempts',
        detail: failure.retryAfterSeconds
          ? `Signing in is paused for this account and network. Try again in ${describeWait(failure.retryAfterSeconds)}, or reset your password if you have forgotten it.`
          : 'Signing in is paused for this account and network. Wait a few minutes before trying again, or reset your password if you have forgotten it.',
        showReference: false,
      };
    case 'validation':
      return { title: 'Check the details you entered', detail: failure.message, showReference: false };
    case 'forbidden':
      return { title: 'Sign-in was refused', detail: failure.message, showReference: true };
    case 'unavailable':
      return { title: 'Sign-in is unavailable right now', detail: 'The service that checks sign-in attempts is not responding, so signing in is paused rather than left unprotected. Try again shortly.', showReference: true };
    case 'network':
      return { title: 'The server could not be reached', detail: 'Check your connection and try again. Nothing was sent that needs repeating.', showReference: false };
    case 'timeout':
      return { title: 'The server took too long to answer', detail: 'Try again in a moment.', showReference: false };
    case 'server':
      return { title: 'Something went wrong on the server', detail: 'Try again in a moment. If it keeps happening, give the reference below to whoever runs this site.', showReference: true };
    default:
      return { title: 'Sign-in did not complete', detail: failure.message || 'Please try again.', showReference: true };
  }
}
