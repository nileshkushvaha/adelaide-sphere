import { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { Link } from 'react-router';
import { authApi } from '@/api/auth';
import { isApiError } from '@/api/errors';
import { AuthScreen } from '@/layouts/AuthScreen';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

export function ForgotPasswordPage() {
  useDocumentTitle('Reset your password');
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'sent' } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);

  return (
    <AuthScreen title="Reset your password">
        {state.kind === 'sent' ? (
          <Alert type="success" showIcon message="If that email belongs to an administrator account, a reset link has been sent. It is valid for 30 minutes." />
        ) : (
          <>
            {state.kind === 'error' && <Alert type="error" showIcon message={state.message} style={{ marginBottom: 16 }} role="alert" />}
            <Form<{ email: string }>
              layout="vertical"
              requiredMark={false}
              onFinish={async ({ email }) => {
                setBusy(true);
                try {
                  await authApi.forgotPassword(email);
                  setState({ kind: 'sent' });
                } catch (error) {
                  setState({ kind: 'error', message: isApiError(error) ? error.userMessage : 'Something went wrong. Please try again.' });
                } finally {
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
          </>
        )}
        <Typography.Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
          <Link to="/login">Back to sign in</Link>
        </Typography.Paragraph>
    </AuthScreen>
  );
}
