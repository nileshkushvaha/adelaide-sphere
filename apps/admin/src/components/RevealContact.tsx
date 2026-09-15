import { useState } from 'react';
import { App, Button, Typography } from 'antd';
import { errorMessage } from '@/shared/useAsync';
import { useBusy } from '@/shared/useBusy';
import { useCapabilities } from '@/auth/access-control';
import type { PermissionCode } from '@/auth/permissions';

interface Props {
  /** The masked value the list already carries, e.g. `s•••m@example.com`. */
  masked: string | null;
  /** Fetches the real value. The server records that it was read. */
  reveal: () => Promise<string | null>;
  /** What is being revealed, for the button and the confirmation. */
  what?: string;
  /** The screen's own reveal permission, e.g. `reviews.email.view` (change log 1.13). */
  permission: PermissionCode;
}

/**
 * Shows a visitor's contact detail only when someone asks for it.
 *
 * The moderation queues displayed every visitor's address as soon as a row was
 * expanded, and the API decrypted all twenty on a page whether or not anyone
 * looked — so reading a queue read everyone's contact details, and nothing
 * recorded that it had happened. SRS ENQ 007 asks for these "with restricted
 * permissions"; a permission that gates the whole screen does not do that.
 *
 * The masked form is enough to tell two visitors apart, which is what a queue
 * needs. Revealing the whole address is a separate permission and a separate
 * request, and the server writes an audit entry for it — the same shape the
 * email log already uses for recipients.
 */
export function RevealContact({ masked, reveal, what = 'address', permission }: Props) {
  const { can } = useCapabilities();
  const { message, modal } = App.useApp();
  const [shown, setShown] = useState<string | null>(null);
  const [busy, run] = useBusy();

  if (!masked) return <Typography.Text type="secondary">Not given</Typography.Text>;
  if (shown) return <Typography.Text copyable>{shown}</Typography.Text>;
  if (!can(permission)) return <Typography.Text>{masked}</Typography.Text>;

  const ask = () =>
    modal.confirm({
      title: `Show this ${what}?`,
      content: `It is hidden because a queue does not need it. Showing it is recorded in the activity log against your account.`,
      okText: `Show the ${what}`,
      onOk: () =>
        run(async () => {
          try {
            setShown(await reveal());
          } catch (error) {
            message.error(errorMessage(error));
          }
        }),
    });

  return (
    <Typography.Text>
      {masked}{' '}
      <Button type="link" size="small" style={{ paddingInline: 0 }} loading={busy} onClick={ask}>
        Show
      </Button>
    </Typography.Text>
  );
}
