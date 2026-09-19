import { useState } from 'react';
import { Alert, App, Button, Select, Table, Typography } from 'antd';
import { menusApi, type MenuLocationRow, type MenuSummary } from '@/api/menus';
import { ErrorState } from '@/components/ui';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { useBusy } from '@/shared/useBusy';

interface Props {
  menus: MenuSummary[];
  readOnly: boolean;
  /** Called after an assignment so the menu list and editor refresh their location tags. */
  onChanged: () => void;
}

/**
 * "Manage locations": which menu each place on the site shows. Each row saves
 * on its own with the version it was read at, so two editors assigning
 * different locations do not collide.
 */
export function MenuLocationsTab({ menus, readOnly, onChanged }: Props) {
  const { message } = App.useApp();
  const [state, reload] = useAsync(() => menusApi.locations(), []);
  const [choices, setChoices] = useState<Record<string, string | null>>({});
  const [busy, run] = useBusy();

  if (state.status === 'loading') return <Table loading dataSource={[]} columns={[]} />;
  if (state.status === 'error') return <ErrorState message={state.message} reference={state.reference} onRetry={reload} />;

  const rows = state.data;
  const choiceFor = (row: MenuLocationRow) => (row.location in choices ? choices[row.location]! : row.menuId);

  const save = (row: MenuLocationRow) =>
    run(async () => {
      try {
        await menusApi.assignLocation(row.location, { menuId: choiceFor(row), expectedVersion: row.version });
        message.success(`${row.label} updated`);
        setChoices((current) => {
          const next = { ...current };
          delete next[row.location];
          return next;
        });
        reload();
        onChanged();
      } catch (error) {
        message.error(errorMessage(error));
      }
    });

  return (
    <div>
      {rows.some((row) => row.location === 'primary' && !row.menuId) && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="No menu is assigned to the primary location, so the site header shows the built-in navigation." />
      )}
      <Table<MenuLocationRow>
        rowKey="location"
        size="middle"
        pagination={false}
        dataSource={rows}
        scroll={{ x: 720 }}
        columns={[
          {
            title: 'Theme location',
            dataIndex: 'label',
            render: (_: unknown, row) => (
              <div>
                <Typography.Text strong>{row.label}</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 12.5 }}>
                  {row.description} {row.maxDepth === 1 ? 'No dropdowns.' : `Up to ${row.maxDepth} levels.`}
                </Typography.Paragraph>
              </div>
            ),
          },
          {
            title: 'Assigned menu',
            width: 280,
            render: (_: unknown, row) => (
              <Select placeholder="No menu"
                aria-label={`Menu for ${row.label}`}
                style={{ width: '100%' }}
                disabled={readOnly || busy}
                value={choiceFor(row) ?? '__none__'}
                onChange={(value: string) => setChoices((current) => ({ ...current, [row.location]: value === '__none__' ? null : value }))}
                options={[
                  ...(row.location === 'primary' ? [] : [{ value: '__none__', label: '— Select a menu —' }]),
                  ...(row.location === 'primary' && !row.menuId ? [{ value: '__none__', label: '— Select a menu —', disabled: true }] : []),
                  ...menus.map((menu) => ({ value: menu.id, label: menu.name })),
                ]}
              />
            ),
          },
          {
            title: '',
            width: 110,
            render: (_: unknown, row) =>
              readOnly ? null : (
                <Button type="primary" ghost disabled={busy || choiceFor(row) === row.menuId} onClick={() => save(row)} aria-label={`Save ${row.label}`}>
                  Save
                </Button>
              ),
          },
        ]}
      />
    </div>
  );
}
