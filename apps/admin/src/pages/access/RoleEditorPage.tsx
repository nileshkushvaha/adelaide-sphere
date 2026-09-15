import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Form, Input, Space, Switch } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router';
import { useOnError } from '@refinedev/core';
import { authorizationApi } from '@/api/authorization';
import { isApiError } from '@/api/errors';
import { toNamePath } from '@/api/businesses';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { errorMessage, fieldErrors, useAsync } from '@/shared/useAsync';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { PageHeader, PageLoader, Pill, SectionCard, StickyActions } from '@/components/ui';
import { PermissionMatrix } from './PermissionMatrix';
import { useUnsavedChanges } from '@/shared/useUnsavedChanges';

interface FormValues {
  key: string;
  name: string;
  description: string;
  isActive: boolean;
}

/**
 * Role editor (SRS RBAC 010): details plus the permission matrix grouped by
 * module. Details and permissions are saved as two explicit requests, each
 * carrying the version it was edited against, so a concurrent change is
 * reported rather than overwritten.
 *
 * A protected system role is shown read-only: its permissions are owned by the
 * catalogue synchronisation, and the API refuses to edit them (RBAC 011).
 */
export function RoleEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const api = useMemo(() => authorizationApi(), []);
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const { can } = useCapabilities();
  const [form] = Form.useForm<FormValues>();
  /**
   * The edit in progress, tagged with the role version it started from. Deriving
   * it during render rather than copying the record in an effect means a reload
   * (a new version) discards a stale draft on its own, and there is no render
   * pass where the matrix shows the previous role's permissions.
   */
  const [draft, setDraft] = useState<{ version: number; permissions: string[]; dirty: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [catalogState] = useAsync((signal) => api.permissions(signal), []);
  const [roleState, reloadRole] = useAsync((signal) => (isNew ? Promise.resolve(null) : api.getRole(id!, signal)), [id]);
  const role = roleState.status === 'ready' ? roleState.data : null;
  useDocumentTitle(isNew ? 'New role' : (role?.name ?? 'Role'));

  const version = role?.version ?? 0;
  const permissions = draft?.version === version ? draft.permissions : (role?.permissions ?? []);
  const dirty = draft?.version === version ? draft.dirty : false;
  const setPermissions = (next: string[]) => setDraft({ version, permissions: next, dirty: true });
  const setDirty = (value: boolean) => setDraft({ version, permissions, dirty: value });

  useEffect(() => {
    if (!role) return;
    form.setFieldsValue({ key: role.key, name: role.name, description: role.description, isActive: role.isActive });
  }, [role, form]);

  // A half-finished permission matrix is easy to lose by navigating away. The
  // shared guard also catches a click on a navigation item, which the
  // `beforeunload` this used to register never saw.
  useUnsavedChanges(dirty, 'This role has unsaved permission changes. Leave without saving?');

  const readOnly = role?.isSystem === true || !can(isNew ? PERMISSION.rolesCreate : PERMISSION.rolesUpdate);

  const submit = async (values: FormValues) => {
    setError(null);
    setSaving(true);
    try {
      if (isNew) {
        const created = await api.createRole({ key: values.key, name: values.name, description: values.description ?? '', permissions });
        message.success('Role created');
        setDirty(false);
        navigate(`/roles/${created.id}`);
        return;
      }
      const current = role!;
      await api.updateRole(current.id, { name: values.name, description: values.description ?? '', isActive: values.isActive, expectedVersion: current.version });
      // The permission set is replaced against the version the details write produced.
      const afterDetails = await api.getRole(current.id);
      const changed = permissions.join(',') !== afterDetails.permissions.join(',');
      if (changed) await api.replaceRolePermissions(current.id, { permissions, expectedVersion: afterDetails.version });
      message.success('Role saved');
      setDirty(false);
      reloadRole();
    } catch (err) {
      if (isApiError(err) && err.kind === 'unauthorized') onAuthError(err);
      else if (isApiError(err) && err.code === 'STALE_VERSION') setError('This role was changed by someone else. Reload before saving again.');
      else {
        const errors = fieldErrors(err);
        form.setFields(Object.entries(errors).map(([path, list]) => ({ name: toNamePath(path), errors: list })) as never);
        setError(Object.keys(errors).length > 0 ? 'Some values are invalid; check the highlighted fields.' : errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  if (roleState.status === 'error') {
    return <Alert type="error" showIcon message={roleState.message} description={roleState.reference} action={<Button onClick={reloadRole}>Retry</Button>} />;
  }
  if (!isNew && roleState.status === 'loading') return <PageLoader label="Loading this role…" />;

  return (
    <>
      <PageHeader
        actions={
          <Link to="/roles">
            <Button icon={<ArrowLeftOutlined aria-hidden="true" />}>All roles</Button>
          </Link>
        }
        crumbs={[{ label: 'Roles', href: '/roles' }, { label: isNew ? 'New role' : (role?.name ?? '') }]}
        title={isNew ? 'New role' : (role?.name ?? '')}
        description={
          role?.isSystem
            ? 'This is a protected system role. It always carries every permission and cannot be edited or deleted.'
            : 'A role carries permissions. Administrators inherit everything their active roles carry.'
        }
        meta={role?.isSystem ? <Pill tone="attention">System role</Pill> : undefined}
      />
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Form<FormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={submit}
        onValuesChange={() => setDirty(true)}
        disabled={readOnly}
        initialValues={{ isActive: true }}
      >
        <SectionCard title="Role details">
          <Form.Item
            label="Key"
            name="key"
            extra="Used in code and the activity log. It cannot be changed later."
            rules={[{ required: true, message: 'Enter a key' }]}
          >
            <Input maxLength={64} disabled={!isNew || readOnly} placeholder="editor" />
          </Form.Item>
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Enter a name' }]}>
            <Input maxLength={80} placeholder="e.g. Editor" />
          </Form.Item>
          <Form.Item label="Description" name="description" extra="What this role is for, so the next person choosing it knows.">
            <Input.TextArea maxLength={255} rows={2} showCount placeholder="e.g. Writes and publishes articles, and moderates comments." />
          </Form.Item>
          {!isNew && (
            <Form.Item label="Active" name="isActive" valuePropName="checked" extra="An inactive role grants nothing, and cannot be assigned.">
              <Switch disabled={readOnly || role?.isSystem} />
            </Form.Item>
          )}
        </SectionCard>

        <SectionCard title="Permissions" description="Everything an administrator holding this role can do.">
          {catalogState.status === 'loading' && <PageLoader label="Loading the permission catalogue…" />}
          {catalogState.status === 'ready' && (
            <PermissionMatrix catalog={catalogState.data} value={permissions} disabled={readOnly} onChange={setPermissions} />
          )}
        </SectionCard>

        {!readOnly && (
          <StickyActions>
            <Space>
              <Button onClick={() => navigate('/roles')}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={saving}>
                {isNew ? 'Create role' : 'Save role'}
              </Button>
            </Space>
          </StickyActions>
        )}
      </Form>
    </>
  );
}
