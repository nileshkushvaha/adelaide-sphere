import { useState, type ReactNode } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { isApiError } from '@/api/errors';
import { errorMessage } from '@/shared/useAsync';

interface Props {
  /** The field name the API reports errors against (`newPassword` for a reset, `password` for set-up). */
  name: 'newPassword' | 'password';
  label: string;
  submitLabel: string;
  /** Sends the password; resolves on success. Errors are the API's own. */
  onSubmit: (password: string) => Promise<void>;
  /** Called once the password has been accepted. */
  onDone: () => void;
  /** Error codes meaning the link itself is no good, and what to offer instead. */
  deadLink?: { codes: string[]; action: ReactNode };
}

const MIN = 12;
const MAX = 256;

/**
 * Choosing a password from a single-use link: the reset link and the first-time
 * set-up link. One form for both, because the rules are the same and two copies
 * had already started to differ in their wording and their error handling.
 *
 * The server decides everything that matters — length, reuse of the current or
 * a recent password — and its field errors land on the field. The checks here
 * only save a round trip for the obvious cases.
 */
export function NewPasswordForm({ name, label, submitLabel, onSubmit, onDone, deadLink }: Props) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; deadLink: boolean } | null>(null);

  const submit = async (values: Record<string, string>) => {
    setBusy(true);
    setProblem(null);
    try {
      await onSubmit(values[name]!);
      onDone();
    } catch (error) {
      const fields = isApiError(error) ? error.fields : {};
      // The API names the password field; anything else it names has no field
      // here, so it goes in the banner with the rest of the message.
      if (fields[name]?.length) form.setFields([{ name, errors: fields[name] }]);
      setProblem({ message: errorMessage(error), deadLink: Boolean(deadLink && isApiError(error) && error.code && deadLink.codes.includes(error.code)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {problem && (
        <Alert
          type="error"
          showIcon
          role="alert"
          style={{ marginBottom: 16, borderRadius: 12 }}
          message={problem.message}
          description={problem.deadLink ? deadLink?.action : undefined}
        />
      )}
      <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} onValuesChange={() => problem && !problem.deadLink && setProblem(null)}>
        <Form.Item
          label={label}
          name={name}
          extra={`At least ${MIN} characters. Not your current password or a recent one.`}
          rules={[
            { required: true, message: 'Enter a password' },
            { min: MIN, message: `Use at least ${MIN} characters` },
            { max: MAX, message: `Use at most ${MAX} characters` },
          ]}
        >
          <Input.Password size="large" autoComplete="new-password" maxLength={MAX} placeholder="A long passphrase" autoFocus />
        </Form.Item>
        <Form.Item
          label="Confirm password"
          name="confirm"
          dependencies={[name]}
          rules={[
            { required: true, message: 'Confirm the password' },
            ({ getFieldValue }) => ({
              validator: (_, value) => (!value || value === getFieldValue(name) ? Promise.resolve() : Promise.reject(new Error('Passwords do not match'))),
            }),
          ]}
        >
          <Input.Password size="large" autoComplete="new-password" maxLength={MAX} placeholder="The same password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={busy} block>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </Form>
    </>
  );
}
