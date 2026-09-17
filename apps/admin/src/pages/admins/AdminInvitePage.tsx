import { App, Form, Input, Typography } from 'antd';
import { useGetIdentity } from '@refinedev/core';
import { useNavigate } from 'react-router';
import { adminsApi } from '@/api/admins';
import type { AdminSummary } from '@/api/auth';
import { authorizationApi } from '@/api/authorization';
import { RecordEditorPage } from '@/components/ui';
import { useAsync } from '@/shared/useAsync';
import { useRecordEditor } from '@/shared/useRecordEditor';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { FormSelect } from '@/components/FormSelect';

interface Values {
  email: string;
  displayName: string;
  roleKeys: string[];
}

/**
 * Invite an administrator (SRS ADM 003, RBAC 004).
 *
 * The roles are chosen here rather than assumed: an account created with the
 * highest role by default is a privilege the inviter never consciously granted,
 * and RBAC 004 exists precisely so that access is deliberate. At least one role
 * is required, because an administrator with none can sign in and do nothing,
 * which reads as a broken account rather than a restricted one.
 */
export function AdminInvitePage() {
  useDocumentTitle('New administrator');
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [form] = Form.useForm<Values>();
  const { saving, error, submit } = useRecordEditor<Values>(form);
  const [roles] = useAsync((signal) => authorizationApi().listAllRoles(signal), []);
  const { data: me } = useGetIdentity<AdminSummary>();
  // Only a Super Admin may hand out the Super Admin role (SRS RBAC 011). The
  // server refuses it either way; offering it would only produce a refusal after
  // the account had been named and the form submitted.
  const actorIsSuperAdmin = (me?.roles ?? []).includes('super_admin');

  const save = () =>
    submit(async (values) => {
      await adminsApi.create(values);
      message.success('Administrator created; setup link sent.');
    }).then((ok) => {
      if (ok) navigate('/admins');
    });

  return (
    <RecordEditorPage<Values>
      crumbs={[{ label: 'Configuration' }, { label: 'Administrators', href: '/admins' }, { label: 'New administrator' }]}
      title="New administrator"
      description="They get a single-use link, valid for 24 hours, to set their own password."
      listHref="/admins"
      listLabel="All administrators"
      form={form}
      initialValues={{ roleKeys: [] }}
      saving={saving}
      error={error ?? (roles.status === 'error' ? 'Roles could not be loaded, so this account cannot be given access yet.' : null)}
      submitLabel="Create and send setup link"
      onSubmit={save}
      aside={
        <div style={{ border: '1px solid var(--ant-color-border)', borderRadius: 8, padding: 16 }}>
          <Typography.Text strong>What happens next</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            The account appears as invited and becomes active once they set a password. You can change their roles at any time.
          </Typography.Paragraph>
        </div>
      }
    >
      <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email', message: 'Enter a valid email address' }]} extra="The setup link is sent here.">
        <Input type="email" maxLength={254} autoComplete="off" placeholder="e.g. sam@adelaidesphere.com" />
      </Form.Item>
      <Form.Item label="Display name" name="displayName" rules={[{ required: true, min: 2, max: 80, message: '2–80 characters' }]}>
        <Input maxLength={80} placeholder="e.g. Sam Taylor" />
      </Form.Item>
      <Form.Item
        label="Roles"
        name="roleKeys"
        rules={[{ required: true, message: 'Choose at least one role' }]}
        extra="Give the least access they need. You can change it later."
        style={{ marginBottom: 0 }}
      >
        <FormSelect
          mode="multiple"
          loading={roles.status === 'loading'}
          placeholder="Choose one or more roles"
          optionFilterProp="label"
          options={
            roles.status === 'ready'
              ? roles.data.data
                  .filter((role) => role.isActive)
                  .map((role) => {
                    const withheld = role.key === 'super_admin' && !actorIsSuperAdmin;
                    return {
                      value: role.key,
                      label: withheld ? `${role.name} — only a Super Admin can grant this` : `${role.name} — ${role.description}`,
                      disabled: withheld,
                    };
                  })
              : []
          }
        />
      </Form.Item>
    </RecordEditorPage>
  );
}
