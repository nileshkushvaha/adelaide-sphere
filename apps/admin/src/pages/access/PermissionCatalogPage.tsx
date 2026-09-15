import { useMemo } from 'react';
import { Input, Select, Table, Typography } from 'antd';
import { authorizationApi, type PermissionCatalogEntry } from '@/api/authorization';
import { useAsync } from '@/shared/useAsync';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { ListEmpty, PageHeader, PageLoadError, PageLoader, Pill, StatusTag, TableCard } from '@/components/ui';

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['q', 'module', 'state'] as const;

/**
 * The registered permission catalogue, read-only by design (SRS RBAC 002).
 * Codes are declared in application code and synchronised into the database, so
 * there is deliberately no way to invent one here: an unknown or misspelt code
 * could never be enforced, and offering to create one would suggest otherwise.
 *
 * The whole catalogue arrives in one response — it is a fixed list that grows
 * with a release, not a table — so searching and filtering happen here rather
 * than as query parameters the API does not accept. A reader looking for the
 * permission that covers one thing should not have to read a hundred rows.
 */
export function PermissionCatalogPage() {
  useDocumentTitle('Permission catalogue');
  const api = useMemo(() => authorizationApi(), []);
  const [state, reload] = useAsync((signal) => api.permissions(signal), []);
  const list = useListParams(FILTERS);
  const q = (list.get('q') ?? '').trim().toLowerCase();
  const module = list.get('module');
  const activeState = list.get('state');

  // Stable between renders so the filtering below is not redone on every one.
  const all = useMemo(() => (state.status === 'ready' ? state.data : []), [state]);
  const modules = useMemo(() => [...new Set(all.map((entry) => entry.module))].sort(), [all]);
  const rows = useMemo(
    () =>
      all.filter((entry) => {
        if (module && entry.module !== module) return false;
        if (activeState === 'active' && !entry.isActive) return false;
        if (activeState === 'retired' && entry.isActive) return false;
        if (!q) return true;
        // The code matters as much as the label here: an operator reading a role
        // definition or an error is holding the code, not the sentence.
        return `${entry.label} ${entry.key} ${entry.description ?? ''}`.toLowerCase().includes(q);
      }),
    [all, module, activeState, q],
  );

  if (state.status === 'error') {
    return <PageLoadError title="Permission catalogue" crumbs={[{ label: 'Configuration' }, { label: 'Permission catalogue' }]} message={state.message} reference={state.reference} onRetry={reload} />;
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Configuration' }, { label: 'Permission catalogue' }]}
        title="Permission catalogue"
        description="Every permission and what it allows. New permissions arrive with a release."
      />
      <TableCard
        toolbar={
          <>
            <Input.Search
              aria-label="Search permissions"
              placeholder="Search a permission or its code"
              allowClear
              defaultValue={list.get('q')}
              onSearch={(value) => list.set('q', value.trim() || undefined)}
              style={{ width: 300 }}
            />
            <Select
              aria-label="Filter by module"
              allowClear
              showSearch
              placeholder="Any module"
              value={module}
              onChange={(value) => list.set('module', value)}
              style={{ width: 200 }}
              options={modules.map((value) => ({ value, label: value }))}
            />
            <Select
              aria-label="Filter by state"
              allowClear
              placeholder="Any state"
              value={activeState}
              onChange={(value) => list.set('state', value)}
              style={{ width: 170 }}
              options={[
                { value: 'active', label: 'In use' },
                { value: 'retired', label: 'Retired' },
              ]}
            />
          </>
        }
        summary={state.status === 'ready' ? `${rows.length} of ${all.length} permission${all.length === 1 ? '' : 's'}` : undefined}
      >
        {state.status === 'loading' ? (
          <PageLoader label="Loading the catalogue…" />
        ) : (
          <Table<PermissionCatalogEntry>
            className="ms-scroll-table"
            scroll={{ x: 560 }}
            rowKey="key"
            dataSource={rows}
            pagination={false}
            locale={{
              emptyText: (
                <ListEmpty
                  state={state}
                  filtered={list.filtered}
                  noun="permissions"
                  onClear={list.clear}
                  empty={{ title: 'No permissions registered', description: 'Permissions are declared in application code and appear here after a release.' }}
                />
              ),
            }}
            columns={[
              { title: 'Permission', dataIndex: 'label', render: (label: string, entry) => (
                <div>
                  <Typography.Text strong>{label}</Typography.Text>
                  <br />
                  {/* Plain monospace rather than Ant's `code`, whose grey ground
                      under secondary text falls below 4.5:1. */}
                  <Typography.Text type="secondary" style={{ fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                    {entry.key}
                  </Typography.Text>
                </div>
              ) },
              { title: 'Module', dataIndex: 'module', width: 180 },
              { title: 'What it allows', dataIndex: 'description', responsive: ['md'] },
              {
                title: 'State',
                dataIndex: 'isActive',
                width: 190,
                render: (_value, entry) => (
                  <>
                    <StatusTag status={entry.isActive ? 'active' : 'retired'} />
                    {entry.isSystem && <Pill>Code-managed</Pill>}
                  </>
                ),
              },
            ]}
          />
        )}
      </TableCard>
    </>
  );
}
