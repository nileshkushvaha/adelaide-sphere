import { useState } from 'react';
import { Alert, Form, Input, Modal, Typography } from 'antd';
import { useOnError } from '@refinedev/core';
import { isApiError } from '@/api/errors';
import { errorMessage } from '@/shared/useAsync';

const ADDRESS = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface Props {
  currentSlug: string;
  /** A published page leaves a redirect behind; an unpublished one has nothing to redirect. */
  live: boolean;
  onCancel: () => void;
  /** Moves the page; rejects with the API's error so it can be shown on the field. */
  onSubmit: (slug: string, reason: string) => Promise<void>;
}

/**
 * Changes a page's address (change log 1.17). It says plainly what happens to
 * the old address before anything moves, because that is the part a
 * non-technical editor is right to worry about.
 */
export function ChangeAddressDialog({ currentSlug, live, onCancel, onSubmit }: Props) {
  const { mutate: onAuthError } = useOnError();
  const [slug, setSlug] = useState(currentSlug);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const next = slug.trim().toLowerCase();
    if (next === currentSlug) {
      setProblem('That is already this page’s address.');
      return;
    }
    if (next.length < 2 || !ADDRESS.test(next)) {
      setProblem('Use lower-case letters, numbers and single hyphens, for example community-guidelines.');
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      await onSubmit(next, reason.trim());
    } catch (error) {
      if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
      else setProblem(isApiError(error) ? (error.fields.slug?.[0] ?? error.userMessage) : errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title="Change this page’s address" okText="Change address" okButtonProps={{ loading: saving }} onOk={() => void submit()} onCancel={onCancel} destroyOnHidden>
      <Typography.Paragraph>
        {live
          ? `Anyone who uses the old address — a bookmark, a shared link or a search result — is sent to the new one automatically (a permanent redirect from /${currentSlug}).`
          : 'This page is not published, so nobody is using its address yet and no redirect is needed.'}{' '}
        Menus that link this page follow it on their own.
      </Typography.Paragraph>
      <Form layout="vertical" component={false}>
        <Form.Item label="New address" htmlFor="page-new-address" validateStatus={problem ? 'error' : undefined} help={problem ?? 'Lower-case letters, numbers and single hyphens.'}>
          <Input id="page-new-address" addonBefore="/" value={slug} maxLength={64} onChange={(event) => setSlug(event.target.value)} onPressEnter={() => void submit()} autoFocus />
        </Form.Item>
        <Form.Item label="Why? (optional)" htmlFor="page-address-reason" extra="Kept in the activity log.">
          <Input.TextArea id="page-address-reason" rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. A clearer name for the service" />
        </Form.Item>
      </Form>
      {live && <Alert type="info" showIcon message="Share the new address from now on. The old one keeps working, but the new one is what search engines will list." />}
    </Modal>
  );
}
