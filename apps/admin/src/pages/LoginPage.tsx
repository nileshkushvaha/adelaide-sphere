import { useEffect, useState, type KeyboardEvent } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { useLogin, type AuthActionResponse } from '@refinedev/core';
import { Link } from 'react-router';
import { AuthScreen } from '@/layouts/AuthScreen';
import { isSignInFailure, signInMessage, toSignInFailure, type SignInFailure } from '@/auth/sign-in-failure';
import { useSignInNotice } from '@/auth/sign-in-notice';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

interface LoginForm {
  email: string;
  password: string;
}

interface Challenge {
  challenge: string;
  expiresAt: string;
}

/** "1:05" for a wait on a button, where a sentence does not fit. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Sign-in (SRS AUTH 001–003): email and password, then a second step when the
 * account has two-step sign-in.
 *
 * Every failure is answered in its own terms — wrong details, too many
 * attempts (with the wait the server set, counted down on the button), the
 * throttle being unavailable, the network being down — rather than one generic
 * sentence. Wrong credentials never say which half was wrong, matching the
 * server, so the screen cannot be used to discover accounts.
 */
export function LoginPage() {
  useDocumentTitle('Sign in');
  const { mutate: login, isPending } = useLogin<LoginForm | { challenge: string; code: string }>();
  const [form] = Form.useForm<LoginForm>();
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [capsLock, setCapsLock] = useState(false);
  /** When a rate limit ends, and the clock the countdown reads; both set from events, never in render. */
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  // Sent here by another screen (a password just changed, an account just
  // activated); it gives way to anything that happens on this screen.
  const notice = useSignInNotice();

  // The countdown's clock ticks only while a lock is in force.
  useEffect(() => {
    if (lockedUntil === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        setLockedUntil(null);
        setFailure(null);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  const remaining = lockedUntil === null ? 0 : (lockedUntil - now) / 1000;
  const locked = lockedUntil !== null && remaining > 0;
  const step = challenge ? 'code' : 'password';

  const onResult = (result: AuthActionResponse) => {
    if (result.success) return;
    // Our provider answers with a plain Error (a SignInFailure, or the 'totp' marker).
    const error = result.error as Error | undefined;
    if (error?.name === 'totp' && error.message) {
      setFailure(null);
      try {
        setChallenge(JSON.parse(error.message) as Challenge);
      } catch {
        setFailure(toSignInFailure(null));
      }
      return;
    }
    const next = isSignInFailure(error) ? error : toSignInFailure(error);
    setFailure(next);
    // A field the server named goes back on that field, not only in the banner.
    if (next.kind === 'validation' && !challenge) {
      const named = (['email', 'password'] as const).filter((field) => next.fields[field]?.length);
      if (named.length > 0) form.setFields(named.map((field) => ({ name: field, errors: next.fields[field]! })));
    }
    if (next.kind === 'rate_limited' && next.retryAfterSeconds) {
      const start = Date.now();
      setNow(start);
      setLockedUntil(start + next.retryAfterSeconds * 1000);
    }
  };

  // Any failure refers to what was typed; typing again makes it out of date.
  // A rate limit is the exception: it stands until its time is up.
  const clearStaleFailure = () => {
    if (failure && failure.kind !== 'rate_limited') setFailure(null);
  };

  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    // getModifierState is missing on some synthetic and older events.
    setCapsLock(typeof event.getModifierState === 'function' && event.getModifierState('CapsLock'));
  };

  const message = failure ? signInMessage(failure, step) : null;
  const banner = message && (
    <Alert
      type={failure?.kind === 'rate_limited' || failure?.kind === 'unavailable' ? 'warning' : 'error'}
      showIcon
      role="alert"
      style={{ marginBottom: 18, borderRadius: 12 }}
      message={message.title}
      description={
        <>
          {message.detail}
          {message.showReference && failure?.reference && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
              Reference: {failure.reference}
            </Typography.Text>
          )}
        </>
      }
    />
  );

  if (challenge) {
    return (
      <AuthScreen title="Enter your verification code" description="Enter the 6-digit code from your authenticator app, or one of your recovery codes.">
        {banner}
        <Form<{ code: string }>
          layout="vertical"
          requiredMark={false}
          onValuesChange={clearStaleFailure}
          onFinish={({ code }) => login({ challenge: challenge.challenge, code: code.replace(/\s+/g, '') }, { onSuccess: onResult })}
        >
          <Form.Item
            label="Verification code"
            name="code"
            rules={[
              { required: true, message: 'Enter the code from your authenticator app' },
              { pattern: /^[\s0-9A-Za-z-]{6,24}$/, message: 'Enter the 6-digit code or a recovery code' },
            ]}
          >
            <Input size="large" inputMode="numeric" autoComplete="one-time-code" maxLength={24} placeholder="123456" autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={isPending} disabled={locked} block>
            {locked ? `Try again in ${clock(remaining)}` : isPending ? 'Checking…' : 'Verify and sign in'}
          </Button>
        </Form>
        <div className="ms-auth-secondary">
          <Button
            type="link"
            style={{ padding: 0, height: 'auto' }}
            onClick={() => {
              setChallenge(null);
              setFailure(null);
            }}
          >
            Use a different account
          </Button>
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Sign in" description="Use the email address your administrator invited. There is no self-registration.">
      {banner ?? (notice && <Alert type="success" showIcon role="status" style={{ marginBottom: 18, borderRadius: 12 }} message={notice} />)}
      <Form<LoginForm>
        form={form}
        layout="vertical"
        requiredMark={false}
        onValuesChange={clearStaleFailure}
        onFinish={(values) => login({ email: values.email.trim(), password: values.password }, { onSuccess: onResult })}
      >
        <Form.Item
          label="Email address"
          name="email"
          rules={[
            { required: true, message: 'Enter your email address' },
            { type: 'email', message: 'Enter an email address such as name@example.com' },
          ]}
        >
          <Input size="large" type="email" autoComplete="username" inputMode="email" maxLength={254} placeholder="name@example.com" autoFocus spellCheck={false} />
        </Form.Item>
        <Form.Item
          label="Password"
          name="password"
          rules={[{ required: true, message: 'Enter your password' }]}
          // Said while typing, not after a failed attempt: a password typed in
          // capitals is the commonest reason for "not right".
          extra={
            capsLock ? (
              <span className="ms-auth-hint" role="status">
                <WarningOutlined aria-hidden="true" /> Caps Lock is on
              </span>
            ) : undefined
          }
        >
          <Input.Password size="large" autoComplete="current-password" maxLength={256} placeholder="Your password" onKeyDown={trackCapsLock} onKeyUp={trackCapsLock} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={isPending} disabled={locked} block>
          {locked ? `Try again in ${clock(remaining)}` : isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </Form>
      <div className="ms-auth-secondary">
        <Link to="/forgot-password">Forgotten your password?</Link>
      </div>
    </AuthScreen>
  );
}
