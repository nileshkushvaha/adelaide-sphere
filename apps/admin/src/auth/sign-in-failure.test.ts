import { ApiError } from '@/api/errors';
import { describeWait, signInMessage, toSignInFailure } from './sign-in-failure';

const failure = (kind: ConstructorParameters<typeof ApiError>[0]['kind'], extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  toSignInFailure(new ApiError({ kind, status: null, code: null, userMessage: 'Server words', ...extra }));

describe('sign-in failures', () => {
  it('never says which of email or password was wrong', () => {
    const message = signInMessage(failure('unauthorized'));
    expect(message.title).toBe('The email or password is not right');
    expect(`${message.title} ${message.detail}`).not.toMatch(/no account|not found|unknown email/i);
  });

  it('states the server’s wait in the unit a person would use', () => {
    expect(describeWait(45)).toBe('45 seconds');
    expect(describeWait(61)).toBe('about 2 minutes');
    expect(signInMessage(failure('rate_limited', { retryAfterSeconds: 300 })).detail).toMatch(/about 5 minutes/);
  });

  it('shows a support reference only for faults the reader cannot fix', () => {
    expect(signInMessage(failure('server', { requestId: 'req-1' })).showReference).toBe(true);
    expect(failure('server', { requestId: 'req-1' }).reference).toContain('req-1');
    expect(signInMessage(failure('unauthorized')).showReference).toBe(false);
    expect(signInMessage(failure('network')).showReference).toBe(false);
  });

  it('never shows the text of an error that did not come from the API client', () => {
    expect(toSignInFailure({ message: 'Invalid email or password' }).message).toBe('Sign-in failed. Please try again.');
    expect(toSignInFailure(new TypeError('Failed to fetch')).message).toBe('Sign-in failed. Please try again.');
    expect(toSignInFailure({ message: 'x'.repeat(500) }).message).toBe('Sign-in failed. Please try again.');
    expect(toSignInFailure({ message: { nested: true } }).message).toBe('Sign-in failed. Please try again.');
    expect(toSignInFailure(null).kind).toBe('unexpected');
  });
});
