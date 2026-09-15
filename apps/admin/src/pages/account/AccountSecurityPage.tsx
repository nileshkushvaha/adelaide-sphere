import { useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Space, Table, Typography } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import { useGetIdentity } from '@refinedev/core';
import { accountApi, type SessionListItem } from '@/api/admins';
import type { AdminSummary } from '@/api/auth';
import { isApiError } from '@/api/errors';
import { formatDateTime } from '@/shared/format';
import { readableAddress, readableClient } from '@/shared/forensics';
import { errorMessage, fieldErrors, useAsync } from '@/shared/useAsync';
import { ErrorState, PageHeader, Pill } from '@/components/ui';
import { useDocumentTitle } from '@/shared/useDocumentTitle';

type EnrolState = { step: 'idle' } | { step: 'scan'; otpauthUri: string; secret: string } | { step: 'done'; recoveryCodes: string[] };

export function AccountSecurityPage() {
  useDocumentTitle('Account security');
  const { message, modal } = App.useApp();
  const { data: me, refetch } = useGetIdentity<AdminSummary>();
  const [sessions, reloadSessions] = useAsync(() => accountApi.sessions(), []);
  const [pwForm] = Form.useForm();
  const [pwError, setPwError] = useState<string | null>(null);
  const [enrol, setEnrol] = useState<EnrolState>({ step: 'idle' });
  const [enrolError, setEnrolError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);

  const handleReauth = (error: unknown) => {
    if (isApiError(error) && error.code === 'REAUTHENTICATION_REQUIRED') {
      setNeedsPassword(true);
      setEnrolError('For security, confirm your current password to continue.');
      return true;
    }
    return false;
  };

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Your account' }, { label: 'Account security' }]}
        title="Account security"
        description="Your password, your second sign-in step, and where you are currently signed in."
      />
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <Card title="Change password">
          {pwError && <Alert type="error" showIcon message={pwError} style={{ marginBottom: 12 }} role="alert" />}
          <Form
            form={pwForm}
            layout="vertical"
            requiredMark={false}
            onFinish={async (v: { currentPassword: string; newPassword: string }) => {
              setPwError(null);
              try {
                await accountApi.changePassword(v.currentPassword, v.newPassword);
                pwForm.resetFields();
                message.success('Password changed. Other sessions were signed out.');
                reloadSessions();
              } catch (error) {
                pwForm.setFields(Object.entries(fieldErrors(error)).map(([name, errors]) => ({ name, errors })));
                setPwError(errorMessage(error));
              }
            }}
            style={{ maxWidth: 420 }}
          >
            <Form.Item label="Current password" name="currentPassword" rules={[{ required: true, message: 'Enter your current password' }]}>
              <Input.Password autoComplete="current-password" maxLength={256} />
            </Form.Item>
            <Form.Item label="New password" name="newPassword" extra="At least 12 characters." rules={[{ required: true, min: 12, max: 256, message: '12–256 characters' }]}>
              <Input.Password autoComplete="new-password" maxLength={256} />
            </Form.Item>
            <Button type="primary" htmlType="submit">Change password</Button>
          </Form>
        </Card>

        <Card title="Two-factor authentication">
          {me?.totpEnabled ? (
            <>
              <Alert type="success" showIcon message="Two-factor authentication is enabled" style={{ marginBottom: 12 }} />
              {enrolError && <Alert type="error" showIcon message={enrolError} style={{ marginBottom: 12 }} role="alert" />}
              <Form
                layout="vertical"
                requiredMark={false}
                onFinish={async (v: { code: string; currentPassword?: string }) => {
                  setEnrolError(null);
                  try {
                    await accountApi.totpDisable({ code: v.code, currentPassword: v.currentPassword });
                    message.success('Two-factor authentication disabled');
                    setNeedsPassword(false);
                    await refetch();
                  } catch (error) {
                    if (!handleReauth(error)) setEnrolError(errorMessage(error));
                  }
                }}
                style={{ maxWidth: 420 }}
              >
                <Form.Item label="Authenticator or recovery code" name="code" rules={[{ required: true, message: 'Enter a code' }]}>
                  <Input inputMode="numeric" autoComplete="one-time-code" maxLength={20} />
                </Form.Item>
                {needsPassword && (
                  <Form.Item label="Current password" name="currentPassword" rules={[{ required: true, message: 'Enter your current password' }]}>
                    <Input.Password autoComplete="current-password" maxLength={256} />
                  </Form.Item>
                )}
                <Button danger htmlType="submit">Disable two-factor</Button>
              </Form>
            </>
          ) : enrol.step === 'idle' ? (
            <>
              <Typography.Paragraph>Add a time-based one-time code from an authenticator app as a second sign-in step. You will receive recovery codes to keep safely.</Typography.Paragraph>
              {enrolError && <Alert type="error" showIcon message={enrolError} style={{ marginBottom: 12 }} role="alert" />}
              <Form
                layout="vertical"
                requiredMark={false}
                onFinish={async (v: { currentPassword?: string }) => {
                  setEnrolError(null);
                  try {
                    const result = await accountApi.totpEnroll(v.currentPassword);
                    setEnrol({ step: 'scan', ...result });
                    setNeedsPassword(false);
                  } catch (error) {
                    if (!handleReauth(error)) setEnrolError(errorMessage(error));
                  }
                }}
                style={{ maxWidth: 420 }}
              >
                {needsPassword && (
                  <Form.Item label="Current password" name="currentPassword" rules={[{ required: true, message: 'Enter your current password' }]}>
                    <Input.Password autoComplete="current-password" maxLength={256} />
                  </Form.Item>
                )}
                <Button type="primary" htmlType="submit">Set up two-factor</Button>
              </Form>
            </>
          ) : enrol.step === 'scan' ? (
            <>
              <Typography.Paragraph>Scan this QR code with your authenticator app, or enter the key manually, then confirm with the current 6-digit code.</Typography.Paragraph>
              <div style={{ background: '#fff', padding: 12, display: 'inline-block', borderRadius: 8 }}>
                <QRCodeSVG value={enrol.otpauthUri} size={196} aria-label="Authenticator enrolment QR code" role="img" />
              </div>
              <Typography.Paragraph style={{ marginTop: 12 }}>
                Manual key: <Typography.Text code copyable>{enrol.secret}</Typography.Text>
              </Typography.Paragraph>
              {enrolError && <Alert type="error" showIcon message={enrolError} style={{ marginBottom: 12 }} role="alert" />}
              <Form
                layout="inline"
                requiredMark={false}
                onFinish={async (v: { code: string }) => {
                  setEnrolError(null);
                  try {
                    const recoveryCodes = await accountApi.totpVerify(v.code);
                    setEnrol({ step: 'done', recoveryCodes });
                    await refetch();
                  } catch (error) {
                    setEnrolError(errorMessage(error));
                  }
                }}
              >
                <Form.Item label="6-digit code" name="code" rules={[{ required: true, pattern: /^\d{6}$/, message: 'Enter the 6-digit code' }]}>
                  <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} style={{ width: 140 }} />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit">Confirm</Button>
                </Form.Item>
              </Form>
            </>
          ) : (
            <>
              <Alert type="success" showIcon message="Two-factor authentication is now enabled" style={{ marginBottom: 12 }} />
              <Typography.Paragraph strong>Recovery codes (shown once). Store them somewhere safe; each works one time if you lose your authenticator.</Typography.Paragraph>
              <ul style={{ columns: 2, fontFamily: 'monospace', paddingInlineStart: 20 }}>
                {enrol.recoveryCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <Button onClick={() => setEnrol({ step: 'idle' })}>Done</Button>
            </>
          )}
        </Card>

        <Card title="Where you are signed in" extra={<Typography.Text type="secondary" style={{ fontSize: 13 }}>Signing out a device does not change your password.</Typography.Text>}>
          {/* Without this, a failed request left an empty table that reads as
              "you are signed in nowhere" — the opposite of the truth. */}
          {sessions.status === 'error' && <ErrorState message={sessions.message} reference={sessions.reference} onRetry={reloadSessions} />}
          <Table<SessionListItem>
            rowKey="id"
            size="small"
            loading={sessions.status === 'loading'}
            dataSource={sessions.status === 'ready' ? sessions.data : []}
            pagination={false}
            scroll={{ x: 640 }}
            columns={[
              { title: 'Started', dataIndex: 'createdAt', render: formatDateTime },
              { title: 'Last activity', dataIndex: 'lastSeenAt', render: formatDateTime },
              {
                title: 'Device',
                dataIndex: 'userAgent',
                render: (value: string | null, session) => (
                  <Space size={8} wrap>
                    {readableClient(value)}
                    {session.current && <Pill tone="progress">Current session</Pill>}
                  </Space>
                ),
              },
              { title: 'Signed in from', dataIndex: 'ipAddress', width: 220, render: (value: string | null) => readableAddress(value) },
              {
                title: <span className="sr-only">Actions</span>,
                width: 150,
                render: (_: unknown, s) =>
                  s.current ? (
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      In use now
                    </Typography.Text>
                  ) : (
                    <Button
                      size="small"
                      onClick={() =>
                        modal.confirm({
                          title: 'Sign this device out?',
                          content: 'Whoever is using it will have to sign in again. Your other sessions, including this one, are unaffected.',
                          okText: 'Sign it out',
                          cancelText: 'Leave it signed in',
                          onOk: async () => {
                            await accountApi.revokeSession(s.id);
                            reloadSessions();
                          },
                        })
                      }
                    >
                      Sign out
                    </Button>
                  ),
              },
            ]}
          />
        </Card>
      </Space>
    </div>
  );
}
