import { useState } from 'react';
import { Alert, App, Button, Form, Input, Space, Table, Typography } from 'antd';
import { useGetIdentity } from '@refinedev/core';
import { Link, useParams } from 'react-router';
import { adminsApi, type SessionListItem } from '@/api/admins';
import type { AdminSummary } from '@/api/auth';
import { isApiError } from '@/api/errors';
import { formatDateTime } from '@/shared/format';
import { readableAddress, readableClient } from '@/shared/forensics';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { DangerZone, PageHeader, PageLoadError, PageLoader, Pill, RecordMetadata, SectionCard, StatusTag } from '@/components/ui';
import { AdminAccessCard } from '@/pages/access/AdminAccessCard';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';

/**
 * One administrator: who they are, what they can do, and where they are signed
 * in (SRS ADM 001, RBAC 010).
 *
 * Every control here says what it does to the person, not to the record — an
 * administrator reading this screen is deciding about a colleague's access, and
 * "they will be signed out everywhere" is the part they need before clicking,
 * not afterwards.
 */
export function AdminDetailPage() {
  const { id = '' } = useParams();
  const { message, modal } = App.useApp();
  const { data: me } = useGetIdentity<AdminSummary>();
  const { can } = useCapabilities();
  const mayRename = can(PERMISSION.adminsUpdate);
  const mayInvite = can(PERMISSION.adminsCreate);
  const mayChangeStatus = can(PERMISSION.adminsStatus);
  const mayViewSessions = can(PERMISSION.securitySessionsView);
  const mayRevokeSessions = can(PERMISSION.securitySessionsRevoke);
  const [state, reload] = useAsync(() => adminsApi.get(id), [id]);
  // Sessions are their own permission; without it they are never requested.
  const [sessions, reloadSessions] = useAsync(() => (mayViewSessions ? adminsApi.sessions(id) : Promise.resolve([] as SessionListItem[])), [id, mayViewSessions]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const admin = state.status === 'ready' ? state.data : null;
  useDocumentTitle(admin ? admin.displayName : 'Administrator');

  const mutate = async (fn: () => Promise<unknown>, success: string) => {
    setSaveError(null);
    try {
      await fn();
      message.success(success);
      reload();
      reloadSessions();
    } catch (error) {
      if (isApiError(error) && error.code === 'STALE_VERSION') {
        setSaveError('This administrator was changed by someone else. The latest values have been reloaded; review and try again.');
        reload();
      } else setSaveError(errorMessage(error));
    }
  };

  if (state.status === 'error') return <PageLoadError title="Administrator" crumbs={[{ label: 'Configuration' }, { label: 'Administrators', href: '/admins' }]} message={state.message} reference={state.reference} onRetry={reload} />;
  if (!admin) return <PageLoader label="Loading this administrator…" />;
  const isSelf = me?.id === admin.id;
  const activeSessions = sessions.status === 'ready' ? sessions.data : [];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Configuration' }, { label: 'Administrators', href: '/admins' }, { label: admin.displayName }]}
        title={admin.displayName}
        description={admin.email}
        actions={<Link to="/admins"><Button>All administrators</Button></Link>}
        meta={
          <Space size={8} wrap>
            <StatusTag status={admin.status} />
            {isSelf && <Pill>This is you</Pill>}
          </Space>
        }
      />
      {saveError && <Alert type="error" showIcon message={saveError} style={{ marginBottom: 16 }} role="alert" />}

      <SectionCard title="Account" description="Their name as it appears beside anything they change, and how they sign in.">
        <RecordMetadata
          items={[
            { label: 'Email address', value: admin.email },
            { label: 'Two-step sign-in', value: admin.totpEnabled ? 'On' : 'Off' },
            { label: 'Last signed in', value: admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : 'Never' },
            { label: 'Added', value: formatDateTime(admin.createdAt) },
          ]}
        />
        <Form<{ displayName: string }>
          layout="vertical"
          initialValues={{ displayName: admin.displayName }}
          key={admin.version}
          onFinish={(values) => mutate(() => adminsApi.update(admin.id, { expectedVersion: admin.version, displayName: values.displayName }), 'Name saved')}
          style={{ marginTop: 20, maxWidth: 420 }}
        >
          <Form.Item label="Display name" name="displayName" rules={[{ required: true, min: 2, max: 80, message: 'Between 2 and 80 characters' }]} extra="Shown beside their changes in the activity log.">
            <Input maxLength={80} placeholder="e.g. Sam Taylor" disabled={!mayRename} />
          </Form.Item>
          {mayRename && <Button htmlType="submit">Save name</Button>}
        </Form>
        {mayInvite && admin.status === 'invited' && (
          <div style={{ marginTop: 20 }}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              They have not set a password yet. A setup link expires, so send a new one if the first has passed.
            </Typography.Paragraph>
            <Button onClick={() => mutate(() => adminsApi.resendSetup(admin.id), 'A new setup link has been emailed')}>Send a new setup link</Button>
          </div>
        )}
      </SectionCard>

      {/* Roles, direct permissions and the effective set with its sources (SRS RBAC 010). */}
      <AdminAccessCard adminId={admin.id} isSelf={isSelf} />

      {mayViewSessions && (
      <SectionCard
        title="Where they are signed in"
        description="Each browser they are currently signed in on. Signing one out ends it immediately; they can sign in again."
        extra={
          mayRevokeSessions && activeSessions.length > 0 && (
            <Button
              danger
              onClick={() =>
                modal.confirm({
                  title: `Sign ${admin.displayName} out everywhere?`,
                  content: `This ends all ${activeSessions.length} of their current sessions at once. They can sign in again with their password.`,
                  okText: 'Sign them out',
                  cancelText: 'Cancel',
                  okButtonProps: { danger: true },
                  onOk: () => mutate(() => adminsApi.revokeAllSessions(admin.id), 'Signed out of every device'),
                })
              }
            >
              Sign out everywhere
            </Button>
          )
        }
      >
        <Table<SessionListItem>
          rowKey="id"
          size="small"
          className="ms-scroll-table"
          loading={sessions.status === 'loading'}
          dataSource={activeSessions}
          pagination={false}
          scroll={{ x: 720 }}
          columns={[
            { title: 'Signed in', dataIndex: 'createdAt', width: 180, render: formatDateTime },
            { title: 'Last used', dataIndex: 'lastSeenAt', width: 180, render: formatDateTime },
            { title: 'From', dataIndex: 'ipAddress', width: 200, render: (value: string | null) => readableAddress(value) },
            { title: 'Browser', dataIndex: 'userAgent', render: (value: string | null) => readableClient(value) },
            {
              title: <span className="sr-only">Actions</span>,
              width: 110,
              render: (_: unknown, session) =>
                session.current ? (
                  <Pill>This session</Pill>
                ) : !mayRevokeSessions ? null : (
                  <Button size="small" onClick={() => mutate(() => adminsApi.revokeSession(admin.id, session.id), 'Session signed out')}>
                    Sign out
                  </Button>
                ),
            },
          ]}
          locale={{ emptyText: 'They are not signed in anywhere at the moment.' }}
        />
      </SectionCard>
      )}

      {!isSelf && mayChangeStatus && (
        <DangerZone title="Account status">
          {admin.status === 'disabled' ? (
            <>
              <Typography.Paragraph style={{ marginBottom: 12 }}>
                This account is disabled. Enabling it restores the roles and permissions it already had.
              </Typography.Paragraph>
              <Button onClick={() => mutate(() => adminsApi.enable(admin.id, { expectedVersion: admin.version }), 'Account enabled')}>Enable this account</Button>
            </>
          ) : (
            <>
              <Typography.Paragraph style={{ marginBottom: 12 }}>
                Signs them out everywhere and blocks sign-in. Their access is kept for if you enable it again; nothing they wrote is removed.
              </Typography.Paragraph>
              <Button
                danger
                onClick={() =>
                  modal.confirm({
                    title: `Disable ${admin.displayName}?`,
                    content: 'They will be signed out everywhere immediately and cannot sign in until the account is enabled again.',
                    okText: 'Disable the account',
                    cancelText: 'Cancel',
                    okButtonProps: { danger: true },
                    onOk: () => mutate(() => adminsApi.disable(admin.id, { expectedVersion: admin.version }), 'Account disabled'),
                  })
                }
              >
                Disable this account
              </Button>
            </>
          )}
        </DangerZone>
      )}
    </div>
  );
}
