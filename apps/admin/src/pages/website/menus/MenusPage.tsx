import { useMemo, useState } from 'react';
import { Alert, App, Button, Col, Empty, Input, Modal, Row, Select, Space, Tabs, Tag, Tooltip, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router';
import { MENU_LIMITS, menuLocation, validateMenuTree, type MenuLocationKey } from '@adelaide-sphere/domain/menus';
import { menusApi, type MenuDetail } from '@/api/menus';
import { isApiError } from '@/api/errors';
import { PERMISSION } from '@/auth/permissions';
import { useCapabilities } from '@/auth/access-control';
import { ErrorState, PageHeader, PageLoader, SectionCard, StickyActions } from '@/components/ui';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { useBusy } from '@/shared/useBusy';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { useUnsavedChanges } from '@/shared/useUnsavedChanges';
import { MenuLocationsTab } from './MenuLocationsTab';
import { MenuSourcesPanel } from './MenuSourcesPanel';
import { MenuStructureEditor } from './MenuStructureEditor';
import { itemLabel, toSaveItems, type EditorItem } from './menu-tree';

/**
 * Website → Menus (SRS 1.9 MENU 002–003), laid out the way WordPress lays out
 * Appearance → Menus: content to add on the left, the menu's structure on the
 * right, locations on their own tab. The whole tree saves at once with the
 * version it was loaded at.
 */
export function MenusPage() {
  useDocumentTitle('Menus');
  const { can } = useCapabilities();
  const readOnly = !can(PERMISSION.websiteMenusManage);
  // Choosing where a menu is shown is its own permission (change log 1.13).
  const mayAssign = can(PERMISSION.websiteMenusAssign);
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'locations' ? 'locations' : 'edit';
  const [listState, reloadList] = useAsync(() => menusApi.list(), []);
  const menus = useMemo(() => (listState.status === 'ready' ? listState.data : []), [listState]);
  const selectedId = params.get('menu') ?? menus[0]?.id ?? null;
  const [detailState, reloadDetail] = useAsync(() => (selectedId ? menusApi.get(selectedId) : Promise.resolve(null)), [selectedId]);

  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNameError, setNewNameError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useUnsavedChanges(dirty);

  const confirmDiscard = () => !dirty || window.confirm('You have unsaved changes to this menu. Discard them?');

  const updateParams = (change: (next: URLSearchParams) => void) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      change(next);
      return next;
    });

  const selectMenu = (id: string) => {
    if (id === selectedId || !confirmDiscard()) return;
    setDirty(false);
    updateParams((next) => next.set('menu', id));
  };

  const setTab = (key: string) => {
    if (key === tab) return;
    if (key === 'locations') {
      if (!confirmDiscard()) return;
      setDirty(false);
    } else {
      // Assignments may have changed the depth this menu is held to.
      reloadDetail();
    }
    updateParams((next) => (key === 'locations' ? next.set('tab', 'locations') : next.delete('tab')));
  };

  const createMenu = async () => {
    const name = newName.trim();
    if (!name) {
      setNewNameError('Give the menu a name');
      return;
    }
    if (!confirmDiscard()) return;
    try {
      const created = await menusApi.create(name);
      setCreating(false);
      setNewName('');
      setNewNameError(null);
      setDirty(false);
      message.success(`${created.name} created`);
      reloadList();
      updateParams((next) => {
        next.set('menu', created.id);
        next.delete('tab');
      });
    } catch (error) {
      setNewNameError(isApiError(error) ? (error.fields.name?.join(' ') ?? error.userMessage) : errorMessage(error));
    }
  };

  if (listState.status === 'loading') return <PageLoader />;

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Website' }, { label: 'Menus' }]}
        title="Menus"
        description="Build the site navigation. Add items from the left; drag to reorder, or drag right to nest."
        actions={
          !readOnly ? (
            <Button type="primary" icon={<PlusOutlined aria-hidden="true" />} onClick={() => setCreating(true)}>
              Create a new menu
            </Button>
          ) : null
        }
      />
      {/* Additions and saves are announced once, politely, without moving focus. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {listState.status === 'error' && <ErrorState message={listState.message} reference={listState.reference} onRetry={reloadList} />}

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'edit', label: 'Edit menus' },
          { key: 'locations', label: 'Manage locations' },
        ]}
      />

      {tab === 'locations' ? (
        <MenuLocationsTab menus={menus} readOnly={!mayAssign} onChanged={reloadList} />
      ) : menus.length === 0 ? (
        <SectionCard>
          <Empty description="There are no menus yet.">
            {!readOnly && (
              <Button type="primary" onClick={() => setCreating(true)}>
                Create a new menu
              </Button>
            )}
          </Empty>
        </SectionCard>
      ) : (
        <>
          <div className="ms-menu-select-bar">
            <Space wrap align="center">
              <label htmlFor="menu-select" style={{ fontWeight: 500 }}>
                Select a menu to edit:
              </label>
              <Select
                id="menu-select"
                style={{ minWidth: 260 }}
                value={selectedId ?? undefined}
                onChange={selectMenu}
                options={menus.map((menu) => ({
                  value: menu.id,
                  label: menu.locations.length > 0 ? `${menu.name} (${menu.locations.map((key) => menuLocation(key)?.label ?? key).join(', ')})` : menu.name,
                }))}
              />
            </Space>
          </div>

          {readOnly && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="You can view menus but not change them." />}
          {detailState.status === 'error' && <ErrorState message={detailState.message} reference={detailState.reference} onRetry={reloadDetail} />}
          {detailState.status === 'loading' && <PageLoader />}
          {detailState.status === 'ready' && detailState.data && (
            <MenuEditor
              // A fresh editor for every loaded version: its draft starts from what the server holds.
              key={`${detailState.data.id}:${detailState.data.version}:${detailState.data.locations.join(',')}`}
              detail={detailState.data}
              readOnly={readOnly}
              dirty={dirty}
              setDirty={setDirty}
              announce={setAnnouncement}
              onSaved={reloadList}
              onReload={() => {
                setDirty(false);
                reloadDetail();
              }}
              onDeleted={() => {
                setDirty(false);
                updateParams((next) => next.delete('menu'));
                reloadList();
              }}
            />
          )}
        </>
      )}

      <Modal
        title="Create a new menu"
        open={creating}
        okText="Create menu"
        onOk={createMenu}
        onCancel={() => {
          setCreating(false);
          setNewNameError(null);
        }}
        destroyOnHidden
      >
        <label htmlFor="new-menu-name" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
          Menu name
        </label>
        <Input
          id="new-menu-name"
          autoFocus
          value={newName}
          maxLength={MENU_LIMITS.name}
          status={newNameError ? 'error' : undefined}
          aria-describedby={newNameError ? 'new-menu-name-error' : undefined}
          onChange={(event) => setNewName(event.target.value)}
          onPressEnter={createMenu}
        />
        {newNameError && (
          <Typography.Text type="danger" id="new-menu-name-error" style={{ display: 'block', fontSize: 12.5, marginTop: 4 }}>
            {newNameError}
          </Typography.Text>
        )}
      </Modal>
    </div>
  );
}

interface Draft {
  id: string;
  name: string;
  version: number;
  locations: MenuLocationKey[];
  items: EditorItem[];
}

interface EditorProps {
  detail: MenuDetail;
  readOnly: boolean;
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
  announce: (text: string) => void;
  onSaved: () => void;
  onReload: () => void;
  onDeleted: () => void;
}

function MenuEditor({ detail, readOnly, dirty, setDirty, announce, onSaved, onReload, onDeleted }: EditorProps) {
  const { message, modal } = App.useApp();
  const [draft, setDraft] = useState<Draft>(() => ({ id: detail.id, name: detail.name, version: detail.version, locations: detail.locations, items: detail.items }));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [stale, setStale] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, runSave] = useBusy();

  const maxDepth = Math.min(3, ...draft.locations.map((location) => menuLocation(location)?.maxDepth ?? 3));
  const locationNames = draft.locations.map((key) => menuLocation(key)?.label ?? key);

  const changeItems = (items: EditorItem[]) => {
    setDraft((current) => ({ ...current, items }));
    setDirty(true);
  };

  const addItems = (added: EditorItem[]) => {
    if (added.length === 0) return;
    if (draft.items.length + added.length > MENU_LIMITS.items) {
      message.error(`A menu holds at most ${MENU_LIMITS.items} items.`);
      return;
    }
    changeItems([...draft.items, ...added]);
    const text = added.length === 1 ? `“${itemLabel(added[0]!)}” added to ${draft.name}.` : `${added.length} items added to ${draft.name}.`;
    announce(text);
    message.success(text);
  };

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const focusFirstError = (fields: Record<string, string[]>) => {
    const first = Object.keys(fields).find((path) => /^items\[\d+\]\./.test(path));
    if (!first) return;
    const [, index, field] = /^items\[(\d+)\]\.(\w+)/.exec(first) ?? [];
    const item = draft.items[Number(index)];
    if (!item) return;
    setExpanded((current) => new Set(current).add(item.key));
    window.setTimeout(() => {
      const control = document.getElementById(`menu-item-${item.key}-${field}`);
      if (control) control.focus();
      else document.getElementById(`menu-item-${item.key}`)?.scrollIntoView({ block: 'center' });
    }, 50);
  };

  const save = () =>
    runSave(async () => {
      const items = toSaveItems(draft.items);
      const fields = validateMenuTree(items, draft.locations);
      if (!draft.name.trim()) fields.name = ['Give the menu a name'];
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        message.error('Some menu items need attention.');
        focusFirstError(fields);
        return;
      }
      try {
        const saved = await menusApi.save(draft.id, { name: draft.name.trim(), expectedVersion: draft.version, items });
        setDraft({ id: saved.id, name: saved.name, version: saved.version, locations: saved.locations, items: saved.items });
        setDirty(false);
        setErrors({});
        setExpanded(new Set());
        message.success('Menu saved');
        announce(`${saved.name} saved.`);
        onSaved();
      } catch (error) {
        if (isApiError(error) && error.code === 'STALE_VERSION') {
          setStale(true);
          return;
        }
        if (isApiError(error) && Object.keys(error.fields).length > 0) {
          setErrors(error.fields);
          focusFirstError(error.fields);
        }
        message.error(errorMessage(error));
      }
    });

  const deleteMenu = () => {
    modal.confirm({
      title: `Delete ${draft.name}?`,
      content: 'The menu and all of its items are deleted. This cannot be undone.',
      okText: 'Delete menu',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await menusApi.remove(draft.id);
          message.success('Menu deleted');
          onDeleted();
        } catch (error) {
          message.error(errorMessage(error));
        }
      },
    });
  };

  return (
    <Row gutter={[20, 20]} align="top">
      {!readOnly && (
        <Col xs={24} lg={9} xl={8}>
          <SectionCard title="Add menu items" description="Tick what to add, then choose Add to menu." bodyPadding={0}>
            <MenuSourcesPanel items={draft.items} onAdd={addItems} disabled={saving} />
          </SectionCard>
        </Col>
      )}
      <Col xs={24} lg={readOnly ? 24 : 15} xl={readOnly ? 24 : 16}>
        <SectionCard
          title="Menu structure"
          description={
            draft.locations.length > 0
              ? `Shown in ${locationNames.join(' and ')}; items can be nested ${maxDepth === 1 ? 'only at the top level' : `up to ${maxDepth} levels deep`}.`
              : 'Not shown anywhere yet. Assign it on the Manage locations tab.'
          }
          extra={
            <Space size={4} wrap>
              {locationNames.map((name) => (
                <Tag key={name} color="blue">
                  {name}
                </Tag>
              ))}
              <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                {draft.items.length} of {MENU_LIMITS.items} items
              </Typography.Text>
            </Space>
          }
        >
          {stale && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Someone else saved this menu while you were editing it."
              description="Reload to see their version. Your unsaved changes will be lost."
              action={
                <Button size="small" onClick={onReload}>
                  Reload menu
                </Button>
              }
            />
          )}
          {errors.items && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={errors.items.join(' ')} />}

          <div style={{ marginBottom: 16, maxWidth: 420 }}>
            <label htmlFor="menu-name" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
              Menu name
            </label>
            <Input
              id="menu-name"
              value={draft.name}
              maxLength={MENU_LIMITS.name}
              disabled={readOnly}
              status={errors.name ? 'error' : undefined}
              aria-describedby={errors.name ? 'menu-name-error' : undefined}
              onChange={(event) => {
                setDraft({ ...draft, name: event.target.value });
                setDirty(true);
              }}
            />
            {errors.name && (
              <Typography.Text type="danger" id="menu-name-error" style={{ display: 'block', fontSize: 12.5, marginTop: 4 }}>
                {errors.name.join(' ')}
              </Typography.Text>
            )}
          </div>

          <MenuStructureEditor items={draft.items} onChange={changeItems} maxDepth={maxDepth} readOnly={readOnly} errors={errors} expanded={expanded} onToggle={toggle} />
        </SectionCard>

        {!readOnly && (
          <StickyActions status={dirty ? 'You have unsaved changes.' : 'All changes saved.'}>
            <Tooltip title={draft.locations.length > 0 ? 'Assign another menu to its locations before deleting it.' : undefined}>
              <Button danger disabled={draft.locations.length > 0 || saving} onClick={deleteMenu}>
                Delete menu
              </Button>
            </Tooltip>
            <Button type="primary" loading={saving} disabled={!dirty} onClick={save}>
              Save menu
            </Button>
          </StickyActions>
        )}
      </Col>
    </Row>
  );
}
