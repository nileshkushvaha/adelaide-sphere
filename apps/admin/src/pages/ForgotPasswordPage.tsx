import { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { Link } from 'react-router';
import { authApi } from '@/api/auth';
import { isApiError } from '@/api/errors';
import { useGoToSignIn } from '@/auth/sign-in-notice';
import { AuthScreen } from '@/layouts/AuthScreen';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

/**
 * Requests a password reset link. Once the request is accepted the reader is
 * sent straight back to sign in, where the notice says a link is on its way —
 * the same answer whether or not the address has an account, so the screen
 * cannot be used to discover accounts. A failed request stays here, on the form.
 */
export function ForgotPasswordPage() {
  useDocumentTitle('Reset your password');
  const goToSignIn = useGoToSignIn();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <AuthScreen title="Reset your password">
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} role="alert" />}
      <Form<{ email: string }>
        layout="vertical"
        requiredMark={false}
        onFinish={async ({ email }) => {
          setBusy(true);
          setError(null);
          try {
            await authApi.forgotPassword(email);
            goToSignIn('reset-link-sent');
          } catch (failure) {
            setError(isApiError(failure) ? failure.userMessage : 'Something went wrong. Please try again.');
            setBusy(false);
          }
        }}
      >
        <Form.Item label="Email" name="email" rules={[{ required: true, message: 'Enter your email address' }, { type: 'email', message: 'Enter a valid email address' }]}>
          <Input size="large" type="email" autoComplete="username" inputMode="email" maxLength={254} placeholder="name@example.com" autoFocus spellCheck={false} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy} block>
          Send reset link
        </Button>
      </Form>
      <Typography.Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
        <Link to="/login">Back to sign in</Link>
      </Typography.Paragraph>
    </AuthScreen>
  );
}
