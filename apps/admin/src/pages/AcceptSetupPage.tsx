import { Alert, Typography } from 'antd';
import { useSearchParams } from 'react-router';
import { accountApi } from '@/api/admins';
import { useGoToSignIn } from '@/auth/sign-in-notice';
import { NewPasswordForm } from '@/components/NewPasswordForm';
import { AuthScreen } from '@/layouts/AuthScreen';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

const ASK_FOR_A_NEW_LINK = <Typography.Text>Ask the administrator who invited you to send a new setup link.</Typography.Text>;

/**
 * First-time set-up from an invitation link (SRS ADM 003): the new
 * administrator chooses their own password and is then sent to sign in.
 */
export function AcceptSetupPage() {
  useDocumentTitle('Activate your account');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const goToSignIn = useGoToSignIn();

  return (
    <AuthScreen title="Activate your account" description={token ? 'Choose the password you will sign in with. Nobody else sees or sets it.' : undefined}>
      {!token ? (
        <Alert type="error" showIcon message="This setup link is incomplete" description={ASK_FOR_A_NEW_LINK} />
      ) : (
        <NewPasswordForm
          name="password"
          label="Choose a password"
          submitLabel="Activate account"
          onSubmit={(password) => accountApi.acceptSetup(token, password)}
          onDone={() => goToSignIn('account-activated')}
          deadLink={{ codes: ['INVALID_SETUP_TOKEN'], action: ASK_FOR_A_NEW_LINK }}
        />
      )}
    </AuthScreen>
  );
}
