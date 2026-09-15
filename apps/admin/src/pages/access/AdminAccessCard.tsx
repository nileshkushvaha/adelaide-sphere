import { useMemo, useState, type ReactNode } from 'react';
import { Alert, App, Button, Empty, Input, Select, Space, Table, Typography } from 'antd';
import { useGetIdentity, useOnError } from '@refinedev/core';
import { authorizationApi, type AdminAccessRecord, type PermissionCatalogEntry, type RoleListItem } from '@/api/authorization';
import { auditApi, type AuditEntry } from '@/api/admins';
import type { AdminSummary } from '@/api/auth';
import { isApiError } from '@/api/errors';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { brand } from '@/config/theme';
import { formatDateTime } from '@/shared/format';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { PageLoader, Pill, SectionCard } from '@/components/ui';
import { PermissionMatrix } from './PermissionMatrix';

/** The role the server refuses to hand out unless the acting administrator holds it. */
const SUPER_ADMIN_KEY = 'super_admin';

/** Access changes worth showing on this screen, in the words the reader will look for. */
const ACCESS_ACTIONS: Record<string, string> = {
  'authz.admin.roles': 'Roles changed',
  'authz.admin.permissions': 'Direct permissions changed',
  'admins.disable': 'Account disabled',
  'admins.enable': 'Account enabled',
  'admins.update': 'Account details changed',
  'admins.invite': 'Invited',
};

/** Lists names for a confirmation, so "3 changes" is never all the reader is told. */
function nameList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Administrator access editor (SRS RBAC 010/011): the roles they hold, the
 * permissions granted to them directly, and the effective set with the source of
 * each entry, so inherited and direct access are never confused.
 *
 * Three rules shape this screen:
 *
 *  * **Nothing here authorises anything.** The server refuses an administrator
 *    editing their own access, refuses granting a permission the actor does not
 *    hold, and refuses demoting the last super administrator. This screen stops
 *    *offering* those things so the reader is not led into a refusal, and reports
 *    the server's answer verbatim when one still arrives.
 *  * **A change is described before it is made.** The confirmation names what is
 *    being added and removed and says that every session ends, because a
 *    privilege change signs the person out everywhere.
 *  * **"Where it comes from" uses the role's name, not its key.** A reader
 *    deciding whether to remove a role needs to recognise the role.
 */
export function AdminAccessCard({ adminId, isSelf }: { adminId: string; isSelf: boolean }) {
  const api = useMemo(() => authorizationApi(), []);
  const { message, modal } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const { can, permissions: heldCodes } = useCapabilities();
  const { data: me } = useGetIdentity<AdminSummary>();
  const [accessState, reloadAccess] = useAsync((signal) => api.getAdminAccess(adminId, signal), [adminId]);
  const [rolesState] = useAsync((signal) => api.listAllRoles(signal), []);
  const [catalogState] = useAsync((signal) => api.permissions(signal), []);
  /** Edits in progress, tagged with the record version they started from, so a reload discards them. */
  const [draft, setDraft] = useState<{ version: number; roleIds: string[]; direct: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'roles' | 'permissions' | null>(null);
  const [effectiveQuery, setEffectiveQuery] = useState('');

  const access: AdminAccessRecord | null = accessState.status === 'ready' ? accessState.data : null;
  const version = access?.version ?? 0;
  const saved = useMemo(
    () => ({ roleIds: [...(access?.roles.map((role) => role.id) ?? [])].sort(), direct: [...(access?.directPermissions ?? [])].sort() }),
    [access],
  );
  const current = draft?.version === version ? draft : { version, ...saved };
  const { roleIds, direct } = current;
  const setRoleIds = (next: string[]) => setDraft({ ...current, roleIds: [...next].sort() });
  const setDirect = (next: string[]) => setDraft({ ...current, direct: [...next].sort() });

  const mayManage = can(PERMISSION.adminsAccessManage);
  const editable = mayManage && !isSelf;
  const held = useMemo(() => new Set(heldCodes ?? []), [heldCodes]);
  const actorIsSuperAdmin = (me?.roles ?? []).includes(SUPER_ADMIN_KEY);

  const catalog: PermissionCatalogEntry[] = catalogState.status === 'ready' ? catalogState.data : [];
  const allRoles: RoleListItem[] = rolesState.status === 'ready' ? rolesState.data.data : [];
  const labelOf = (code: string) => catalog.find((entry) => entry.key === code)?.label ?? code;
  /** Role names by key and by id, for sources and for the change summary. */
  const roleNameByKey = new Map<string, string>([
    ...allRoles.map((role) => [role.key, role.name] as const),
    ...(access?.roles ?? []).map((role) => [role.key, role.name] as const),
  ]);
  const roleNameById = new Map<string, string>([
    ...allRoles.map((role) => [role.id, role.name] as const),
    ...(access?.roles ?? []).map((role) => [role.id, role.name] as const),
  ]);

  /** Permission codes this administrator already has through a role, and which role. */
  const inheritedFrom = new Map<string, string[]>();
  for (const code of access?.inheritedPermissions ?? []) {
    inheritedFrom.set(
      code,
      (access?.sources[code] ?? []).filter((source) => source !== 'direct').map((key) => roleNameByKey.get(key) ?? key),
    );
  }

  const rolesDirty = roleIds.join('|') !== saved.roleIds.join('|');
  const permissionsDirty = direct.join('|') !== saved.direct.join('|');

  // Authorization history is access-control activity (change log 1.14).
  const mayReadAudit = can(PERMISSION.activityAccessControlView);
  const [auditState] = useAsync<AuditEntry[]>(
    () =>
      mayReadAudit
        ? auditApi.list({ targetType: 'admin_user', targetId: adminId, pageSize: 10, order: 'desc' }).then((page) => page.data)
        : Promise.resolve([]),
    [adminId, mayReadAudit],
  );

  const save = async (kind: 'roles' | 'permissions') => {
    if (!access) return;
    setError(null);
    setSaving(kind);
    try {
      if (kind === 'roles') await api.replaceAdminRoles(adminId, { roleIds, expectedVersion: access.version });
      else await api.replaceAdminPermissions(adminId, { permissions: direct, expectedVersion: access.version });
      message.success(kind === 'roles' ? 'Roles updated. They have been signed out everywhere.' : 'Direct permissions updated. They have been signed out everywhere.');
      setDraft(null);
      reloadAccess();
    } catch (err) {
      if (isApiError(err) && err.kind === 'unauthorized') onAuthError(err);
      else setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  /** The change, in names, so the reader confirms what they meant rather than a count. */
  const changeSummary = (kind: 'roles' | 'permissions'): ReactNode => {
    const [before, after, name] =
      kind === 'roles'
        ? [saved.roleIds, roleIds, (id: string) => roleNameById.get(id) ?? id]
        : [saved.direct, direct, labelOf];
    const added = after.filter((value) => !before.includes(value)).map(name);
    const removed = before.filter((value) => !after.includes(value)).map(name);
    return (
      <>
        {added.length > 0 && (
          <p style={{ marginTop: 0 }}>
            <strong>Adding:</strong> {nameList(added)}.
          </p>
        )}
        {removed.length > 0 && (
          <p>
            <strong>Removing:</strong> {nameList(removed)}.
          </p>
        )}
        <p style={{ marginBottom: 0 }}>
          This takes effect immediately, signs {access?.displayName ?? 'this administrator'} out of every device, and is recorded in the activity log.
        </p>
      </>
    );
  };

  const confirmAndSave = (kind: 'roles' | 'permissions') => {
    modal.confirm({
      title: kind === 'roles' ? 'Change this administrator’s roles?' : 'Change this administrator’s direct permissions?',
      content: changeSummary(kind),
      okText: 'Apply change',
      cancelText: 'Keep editing',
      onOk: () => save(kind),
    });
  };

  if (accessState.status === 'error') {
    return <Alert type="error" showIcon message={accessState.message} description={accessState.reference} action={<Button onClick={reloadAccess}>Retry</Button>} />;
  }
  if (!access) return <PageLoader label="Loading access…" />;

  const needle = effectiveQuery.trim().toLowerCase();
  const effectiveRows = access.effectivePermissions
    .map((code) => ({ key: code, label: labelOf(code), sources: access.sources[code] ?? [] }))
    .filter((row) => needle === '' || row.label.toLowerCase().includes(needle) || row.key.toLowerCase().includes(needle));

  return (
    <div>
      {error && <Alert type="error" showIcon message={error} role="alert" style={{ marginBottom: 20 }} />}
      {isSelf && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
          message="You cannot change your own access"
          description="Ask another administrator. The server refuses changes to your own access."
        />
      )}
      {!isSelf && !mayManage && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
          message="You can see this administrator’s access but not change it"
          description="Changing roles or permissions needs the “manage administrator access” permission."
        />
      )}

      <SectionCard
        title="Roles"
        description="Roles are the usual way to grant access."
      >
        <Select
          mode="multiple"
          aria-label="Roles"
          placeholder="Choose one or more roles"
          style={{ width: '100%', maxWidth: 560 }}
          value={roleIds}
          disabled={!editable || rolesState.status !== 'ready'}
          onChange={setRoleIds}
          optionFilterProp="label"
          options={allRoles.map((role) => {
            // Only a Super Admin may hand out the Super Admin role; offering it to
            // anyone else would only produce a refusal after they had confirmed.
            const withheld = role.key === SUPER_ADMIN_KEY && !actorIsSuperAdmin;
            return {
              value: role.id,
              label: withheld ? `${role.name} (only a Super Admin can grant this)` : role.isActive ? role.name : `${role.name} (inactive)`,
              disabled: !role.isActive || withheld,
            };
          })}
        />
        {access.roles.length === 0 && !rolesDirty && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 10, marginBottom: 0 }}>
            No roles. Anything this administrator can do comes from the direct permissions below.
          </Typography.Paragraph>
        )}
        {editable && (
          <Space style={{ marginTop: 14 }} wrap>
            <Button type="primary" loading={saving === 'roles'} disabled={!rolesDirty} onClick={() => confirmAndSave('roles')}>
              Save roles
            </Button>
            {rolesDirty && (
              <>
                <Button onClick={() => setDraft({ ...current, roleIds: saved.roleIds })}>Discard</Button>
                <Typography.Text style={{ color: brand.warning }}>Not saved yet.</Typography.Text>
              </>
            )}
          </Space>
        )}
      </SectionCard>

      <SectionCard
        title="Direct permissions"
        description="Extra permissions for this person only. Use sparingly."
      >
        {catalogState.status === 'loading' ? (
          <PageLoader label="Loading the permission catalogue…" />
        ) : (
          <>
            <PermissionMatrix
              catalog={catalog}
              value={direct}
              disabled={!editable}
              onChange={setDirect}
              annotate={(entry) => {
                // The server refuses to grant what the acting administrator does
                // not hold themselves (RBAC 011). Withholding the checkbox says so
                // before the click rather than after it.
                // A retired permission is already refused and already says so.
                if (!entry.isActive) return undefined;
                if (editable && heldCodes && !held.has(entry.key)) {
                  return {
                    disabled: true,
                    note: <span style={{ color: brand.textMuted }}>You do not hold this permission, so you cannot grant it.</span>,
                  };
                }
                const roles = inheritedFrom.get(entry.key);
                if (roles && roles.length > 0) {
                  return { note: <span style={{ color: brand.primaryActive }}>Already granted by {nameList(roles)}.</span> };
                }
                return undefined;
              }}
            />
            {editable && (
              <Space wrap>
                <Button type="primary" loading={saving === 'permissions'} disabled={!permissionsDirty} onClick={() => confirmAndSave('permissions')}>
                  Save direct permissions
                </Button>
                {permissionsDirty && (
                  <>
                    <Button onClick={() => setDraft({ ...current, direct: saved.direct })}>Discard</Button>
                    <Typography.Text style={{ color: brand.warning }}>Not saved yet.</Typography.Text>
                  </>
                )}
              </Space>
            )}
          </>
        )}
      </SectionCard>

      <SectionCard
        title="What this administrator can do now"
        description="The permissions in force and where each comes from."
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {access.effectivePermissions.length} of {catalog.length || access.effectivePermissions.length} permissions
          </Typography.Text>
        }
      >
        {/*
          An account that is not active grants nothing at all, whatever its roles
          say (SRS RBAC 005). Saying so is the difference between "nothing has
          been granted" and "nothing is in force yet".
        */}
        {access.status !== 'active' && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={`This administrator is ${access.status}, so none of the access below is in force`}
            description="Roles and direct permissions are kept and take effect as soon as the account becomes active."
          />
        )}
        {access.effectivePermissions.length === 0 ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {access.status === 'active'
              ? 'No permissions. This administrator can sign in and see their own account, and nothing else.'
              : 'Nothing is in force while the account is not active.'}
          </Typography.Paragraph>
        ) : (
          <>
            <Input.Search
              allowClear
              aria-label="Search these permissions"
              placeholder="Search these permissions"
              value={effectiveQuery}
              onChange={(event) => setEffectiveQuery(event.target.value)}
              style={{ width: 300, maxWidth: '100%', marginBottom: 14 }}
            />
            <Table
              rowKey="key"
              size="small"
              pagination={false}
              dataSource={effectiveRows}
              scroll={{ x: 520 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No permission in force matches “${effectiveQuery}”`} /> }}
              columns={[
                {
                  title: 'Permission',
                  dataIndex: 'label',
                  render: (label: string, row: { key: string }) => (
                    <span>
                      <span style={{ display: 'block', fontWeight: 500 }}>{label}</span>
                      <Typography.Text type="secondary" style={{ fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                        {row.key}
                      </Typography.Text>
                    </span>
                  ),
                },
                {
                  title: 'Where it comes from',
                  dataIndex: 'sources',
                  width: 280,
                  render: (sources: string[]) => (
                    <Space size={4} wrap>
                      {sources.map((source) =>
                        source === 'direct' ? (
                          <Pill key={source} tone="progress">
                            Granted directly
                          </Pill>
                        ) : (
                          <Pill key={source}>Role: {roleNameByKey.get(source) ?? source}</Pill>
                        ),
                      )}
                    </Space>
                  ),
                },
              ]}
            />
          </>
        )}
      </SectionCard>

      {mayReadAudit && (
        <SectionCard title="Recent changes to this account" description="From the activity log. The full log has the rest, including who made each change.">
          {auditState.status === 'loading' ? (
            <PageLoader label="Loading recent changes…" />
          ) : auditState.status === 'ready' && auditState.data.length > 0 ? (
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {auditState.data.map((entry) => (
                <li key={entry.id} style={{ marginBottom: 6 }}>
                  {ACCESS_ACTIONS[entry.action] ?? entry.domainLabel ?? entry.action}
                  {entry.actor && <> by {entry.actor.displayName}</>}{' '}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {formatDateTime(entry.createdAt)}
                  </Typography.Text>
                </li>
              ))}
            </ul>
          ) : auditState.status === 'error' ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Recent changes could not be loaded. The full activity log still has them.
            </Typography.Paragraph>
          ) : (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Nothing recorded against this account yet.
            </Typography.Paragraph>
          )}
        </SectionCard>
      )}
    </div>
  );
}
