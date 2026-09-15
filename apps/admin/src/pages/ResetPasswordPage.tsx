import { Alert } from 'antd';
import { Link, useSearchParams } from 'react-router';
import { authApi } from '@/api/auth';
import { useGoToSignIn } from '@/auth/sign-in-notice';
import { NewPasswordForm } from '@/components/NewPasswordForm';
import { AuthScreen } from '@/layouts/AuthScreen';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

/**
 * Choosing a new password from a reset link (SRS AUTH 001). On success the
 * reader is sent straight to sign in, with a notice saying what happened — the
 * link is spent, so there is nothing left to do on this page.
 */
export function ResetPasswordPage() {
  useDocumentTitle('Choose a new password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const goToSignIn = useGoToSignIn();

  return (
    <AuthScreen title="Choose a new password" description={token ? 'Choosing a new password signs you out everywhere you are signed in.' : undefined}>
      {!token ? (
        <Alert type="error" showIcon message="This reset link is incomplete" description={<Link to="/forgot-password">Request a new reset link</Link>} />
      ) : (
        <NewPasswordForm
          name="newPassword"
          label="New password"
          submitLabel="Change password"
          onSubmit={(password) => authApi.resetPassword(token, password)}
          onDone={() => goToSignIn('password-changed')}
          deadLink={{ codes: ['INVALID_RESET_TOKEN'], action: <Link to="/forgot-password">Request a new reset link</Link> }}
        />
      )}
      <div className="ms-auth-secondary">
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthScreen>
  );
}
