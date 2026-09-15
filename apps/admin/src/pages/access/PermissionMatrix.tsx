import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Button, Checkbox, Empty, Grid, Input, Space, Switch, Tooltip, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import type { PermissionCatalogEntry } from '@/api/authorization';
import { brand } from '@/config/theme';

/**
 * The permission matrix (SRS RBAC 010, change log 1.13), laid out like the
 * sidebar: one section per sidebar group, one row per menu item, one column per
 * action. A person who should only look after SEO settings gets the SEO
 * settings row and nothing else.
 *
 * Every control is a real checkbox with a real label, so the whole grid is
 * keyboard operable and each cell is announced as "SEO settings: Update". Group
 * controls are buttons, not checkbox-like widgets, because they act on a
 * selection rather than carrying a state of their own.
 *
 * Ticking an action also ticks that row's View: a screen that cannot be opened
 * cannot be acted on. The server still accepts exactly what is sent.
 *
 * Retired permissions are listed only while a role still carries them, so an
 * older role shows what it holds without offering it for assignment.
 */
export interface PermissionAnnotation {
  /** Refuse this entry, because granting it would be refused by the server anyway. */
  disabled?: boolean;
  /** A line explaining the entry's situation. */
  note?: ReactNode;
}

const STANDARD_COLUMNS = ['View', 'Create', 'Update', 'Publish', 'Delete'] as const;

interface MenuRow {
  menuItem: string;
  entries: PermissionCatalogEntry[];
  view?: PermissionCatalogEntry;
  byAction: Map<string, PermissionCatalogEntry>;
  extras: PermissionCatalogEntry[];
}

export function PermissionMatrix({
  catalog,
  value,
  onChange,
  disabled = false,
  annotate,
}: {
  catalog: PermissionCatalogEntry[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /**
   * Per-permission context from the screen using the matrix — the access editor
   * uses it to say what a role already grants and to withhold what the acting
   * administrator does not hold themselves.
   */
  annotate?: (entry: PermissionCatalogEntry) => PermissionAnnotation | undefined;
}) {
  const [query, setQuery] = useState('');
  // Narrows the grid to what the role or administrator already has.
  const [selectedOnly, setSelectedOnly] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);
  const screens = Grid.useBreakpoint();
  const stacked = screens.md === false;

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (entry: PermissionCatalogEntry) =>
      needle === '' ||
      [entry.label, entry.key, entry.description, entry.module, entry.menuItem].some((text) => (text ?? '').toLowerCase().includes(needle));

    const bySection = new Map<string, Map<string, MenuRow>>();
    for (const entry of catalog) {
      // A retired code is shown only where something still carries it.
      if (!entry.isActive && !selected.has(entry.key)) continue;
      if (!matches(entry)) continue;
      if (selectedOnly && !selected.has(entry.key)) continue;
      const section = entry.isActive ? entry.module : 'Retired';
      const rows = bySection.get(section) ?? new Map<string, MenuRow>();
      const menuItem = entry.menuItem ?? entry.module;
      const row: MenuRow = rows.get(menuItem) ?? { menuItem, entries: [], byAction: new Map(), extras: [] };
      row.entries.push(entry);
      if (entry.isActive && entry.action === 'View' && !row.view) row.view = entry;
      if (entry.isActive && (STANDARD_COLUMNS as readonly string[]).includes(entry.action) && !row.byAction.has(entry.action)) row.byAction.set(entry.action, entry);
      else if (entry.action !== 'View' || row.view !== entry) row.extras.push(entry);
      rows.set(menuItem, row);
      bySection.set(section, rows);
    }
    return [...bySection.entries()].map(([module, rows]) => ({ module, rows: [...rows.values()] }));
  }, [catalog, query, selectedOnly, selected]);

  // One count everywhere: active permissions only, with any retired ones a role still carries said separately.
  const activeCount = catalog.filter((entry) => entry.isActive).length;
  const selectedEntries = catalog.filter((entry) => selected.has(entry.key));
  const selectedActive = selectedEntries.filter((entry) => entry.isActive).length;
  const selectedRetired = selectedEntries.length - selectedActive;
  const assignable = (entry: PermissionCatalogEntry) => entry.isActive && !annotate?.(entry)?.disabled;

  /** Keys of the View code on each row an entry belongs to, so granting an action also opens its screen. */
  const viewFor = useMemo(() => {
    const map = new Map<string, string>();
    const views = new Map<string, string>();
    for (const entry of catalog) if (entry.isActive && entry.action === 'View') views.set(`${entry.module}::${entry.menuItem}`, entry.key);
    for (const entry of catalog) {
      const view = views.get(`${entry.module}::${entry.menuItem}`);
      if (view && view !== entry.key) map.set(entry.key, view);
    }
    return map;
  }, [catalog]);
  const actionsOn = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [action, view] of viewFor) map.set(view, [...(map.get(view) ?? []), action]);
    return map;
  }, [viewFor]);

  const commit = (next: Set<string>) => onChange([...next].sort());
  const toggle = (key: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) {
      next.add(key);
      const view = viewFor.get(key);
      const viewEntry = view ? catalog.find((entry) => entry.key === view) : undefined;
      if (view && viewEntry && assignable(viewEntry)) next.add(view);
    } else {
      next.delete(key);
      // Removing View removes the actions that depend on it, so no role holds an action on a screen it cannot open.
      for (const action of actionsOn.get(key) ?? []) next.delete(action);
    }
    commit(next);
  };
  const setMany = (entries: PermissionCatalogEntry[], checked: boolean) => {
    const next = new Set(selected);
    for (const entry of entries) {
      // "Select all" never grants what a single checkbox refuses to grant.
      if (!assignable(entry)) continue;
      if (checked) next.add(entry.key);
      else next.delete(entry.key);
    }
    commit(next);
  };

  const cell = (row: MenuRow, entry: PermissionCatalogEntry | undefined, columnLabel: string) => {
    if (!entry) return <span aria-hidden="true" style={{ color: brand.textSubtle }}>—</span>;
    const annotation = annotate?.(entry);
    const checkbox = (
      <Checkbox
        checked={selected.has(entry.key)}
        disabled={disabled || !entry.isActive || annotation?.disabled === true}
        onChange={(event) => toggle(entry.key, event.target.checked)}
        aria-label={`${row.menuItem}: ${columnLabel}`}
        aria-describedby={`perm-${entry.key.replace(/\W/g, '-')}`}
      />
    );
    return (
      <>
        <Tooltip title={<span>{entry.label}. {entry.description}</span>}>{checkbox}</Tooltip>
        <span id={`perm-${entry.key.replace(/\W/g, '-')}`} className="sr-only">
          {entry.description}
        </span>
      </>
    );
  };

  const extrasList = (row: MenuRow) =>
    row.extras.length === 0 ? null : (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {row.extras.map((entry) => {
          const annotation = annotate?.(entry);
          return (
            <span key={entry.key} style={{ display: 'inline-flex', flexDirection: 'column' }}>
              <Checkbox
                checked={selected.has(entry.key)}
                disabled={disabled || !entry.isActive || annotation?.disabled === true}
                onChange={(event) => toggle(entry.key, event.target.checked)}
              >
                <Tooltip title={entry.description}>
                  <span>{entry.isActive ? entry.action : entry.label}</span>
                </Tooltip>
              </Checkbox>
              {annotation?.note && <span style={{ fontSize: 12, lineHeight: 1.45, marginLeft: 24 }}>{annotation.note}</span>}
            </span>
          );
        })}
      </div>
    );

  /** Notes from the caller ("already granted by a role", "you cannot grant this") for the standard cells of a row. */
  const rowNotes = (row: MenuRow) => {
    const notes = [...row.byAction.values()]
      .map((entry) => ({ entry, note: annotate?.(entry)?.note }))
      .filter((item): item is { entry: PermissionCatalogEntry; note: ReactNode } => Boolean(item.note));
    if (notes.length === 0) return null;
    return (
      <div style={{ fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>
        {notes.map(({ entry, note }) => (
          <div key={entry.key}>
            <Typography.Text type="secondary">{entry.action}: </Typography.Text>
            {note}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      {/* A flex row rather than Space: a Space item is shrink-to-fit, so a fixed
          width on the field inside it cannot be capped by a percentage and the
          field pushes the page sideways at 320 px. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Input.Search
          allowClear
          aria-label="Search permissions"
          placeholder="Search menu items or permissions"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 320 }}
        />
        <Typography.Text strong role="status" style={{ fontSize: 13 }}>
          {selectedActive} of {activeCount} permissions selected
          {selectedRetired > 0 ? ` + ${selectedRetired} retired` : ''}
        </Typography.Text>
        <Space size={8} style={{ fontSize: 13 }}>
          <Switch size="small" checked={selectedOnly} onChange={setSelectedOnly} aria-label="Show selected only" />
          <Typography.Text style={{ fontSize: 13 }} aria-hidden="true">
            Show selected only
          </Typography.Text>
        </Space>
      </div>

      {/* The shape of the selection at a glance, without scrolling through every section. */}
      <section aria-label="Selected permissions" style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>
          Selected
        </Typography.Text>
        {selectedEntries.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            No permissions selected yet.
          </Typography.Text>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selectedEntries.map((entry) => (
              <li
                key={entry.key}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: `1px solid ${brand.border}`, borderRadius: 999, padding: disabled || !entry.isActive ? '2px 10px' : '2px 2px 2px 10px', fontSize: 13 }}
              >
                <span>
                  {entry.menuItem && entry.isActive ? `${entry.menuItem}: ${entry.action}` : entry.label}
                  {!entry.isActive && <Typography.Text type="secondary"> (retired)</Typography.Text>}
                </span>
                {!disabled && entry.isActive && (
                  <Button size="small" type="text" shape="circle" icon={<CloseOutlined aria-hidden="true" />} aria-label={`Remove ${entry.label}`} onClick={() => toggle(entry.key, false)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {sections.length === 0 && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectedOnly && query.trim() === '' ? 'No permissions selected yet' : `No permission matches “${query}”`} />
      )}

      {sections.map(({ module, rows }) => {
        const sectionEntries = rows.flatMap((row) => row.entries).filter(assignable);
        const chosen = sectionEntries.filter((entry) => selected.has(entry.key)).length;
        const allSelected = sectionEntries.length > 0 && chosen === sectionEntries.length;
        const retired = module === 'Retired';
        return (
          <fieldset key={module} style={{ border: `1px solid ${brand.border}`, borderRadius: 12, padding: '14px 18px 18px', marginBottom: 16, minInlineSize: 0 }}>
            <legend style={{ padding: '0 8px', fontWeight: 600, fontSize: 14 }}>
              {module}{' '}
              <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
                {retired ? '— no longer grant anything' : `— ${chosen} of ${sectionEntries.length} selected`}
              </Typography.Text>
            </legend>
            {!disabled && !retired && (
              // Wraps rather than overflowing: two long labels do not fit one line at 390 px.
              <Space wrap style={{ marginBottom: 10 }}>
                {/* The visible label is short because it sits under its section
                    heading; the accessible name carries the section, because a
                    screen reader reads the button out of that context. */}
                <Button size="small" aria-label={`Select all in ${module}`} onClick={() => setMany(sectionEntries, true)} disabled={allSelected}>
                  Select all
                </Button>
                <Button size="small" aria-label={`Clear ${module}`} onClick={() => setMany(sectionEntries, false)} disabled={chosen === 0}>
                  Clear
                </Button>
              </Space>
            )}

            {retired ? (
              extrasList({ menuItem: 'Retired', entries: [], byAction: new Map(), extras: rows.flatMap((row) => row.entries) })
            ) : stacked ? (
              // Phone width: one card per menu item, the actions as a wrapped list.
              <div style={{ display: 'grid', gap: 12 }}>
                {rows.map((row) => {
                  const rowEntries = row.entries.filter(assignable);
                  const rowAll = rowEntries.length > 0 && rowEntries.every((entry) => selected.has(entry.key));
                  return (
                    <div key={row.menuItem} style={{ borderTop: `1px solid ${brand.border}`, paddingTop: 10 }}>
                      <Checkbox
                        checked={rowAll}
                        indeterminate={!rowAll && rowEntries.some((entry) => selected.has(entry.key))}
                        disabled={disabled || rowEntries.length === 0}
                        onChange={(event) => setMany(rowEntries, event.target.checked)}
                        aria-label={`All of ${row.menuItem}`}
                      >
                        <strong>{row.menuItem}</strong>
                      </Checkbox>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 6, paddingLeft: 24 }}>
                        {STANDARD_COLUMNS.map((column) => {
                          const entry = row.byAction.get(column);
                          if (!entry) return null;
                          return (
                            <Checkbox key={column} checked={selected.has(entry.key)} disabled={disabled || annotate?.(entry)?.disabled === true} onChange={(event) => toggle(entry.key, event.target.checked)} aria-label={`${row.menuItem}: ${column}`}>
                              {column}
                            </Checkbox>
                          );
                        })}
                      </div>
                      {row.extras.length > 0 && <div style={{ marginTop: 6, paddingLeft: 24 }}>{extrasList(row)}</div>}
                      <div style={{ paddingLeft: 24 }}>{rowNotes(row)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <caption className="sr-only">{module} permissions by menu item</caption>
                  <thead>
                    <tr style={{ textAlign: 'left', color: brand.textMuted, fontSize: 12.5 }}>
                      <th scope="col" style={{ padding: '6px 8px', fontWeight: 600 }}>Menu item</th>
                      {STANDARD_COLUMNS.map((column) => (
                        <th key={column} scope="col" style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'center', width: 72 }}>
                          {column}
                        </th>
                      ))}
                      <th scope="col" style={{ padding: '6px 8px', fontWeight: 600 }}>Other actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const rowEntries = row.entries.filter(assignable);
                      const rowAll = rowEntries.length > 0 && rowEntries.every((entry) => selected.has(entry.key));
                      return (
                        <Fragment key={row.menuItem}>
                          <tr style={{ borderTop: `1px solid ${brand.border}`, verticalAlign: 'top' }}>
                            <th scope="row" style={{ padding: '10px 8px', fontWeight: 500, textAlign: 'left', minWidth: 180 }}>
                              <Checkbox
                                checked={rowAll}
                                indeterminate={!rowAll && rowEntries.some((entry) => selected.has(entry.key))}
                                disabled={disabled || rowEntries.length === 0}
                                onChange={(event) => setMany(rowEntries, event.target.checked)}
                                aria-label={`All of ${row.menuItem}`}
                              >
                                {row.menuItem}
                              </Checkbox>
                              {rowNotes(row)}
                            </th>
                            {STANDARD_COLUMNS.map((column) => (
                              <td key={column} style={{ padding: '10px 8px', textAlign: 'center' }}>
                                {cell(row, row.byAction.get(column), column)}
                              </td>
                            ))}
                            <td style={{ padding: '10px 8px' }}>{extrasList(row)}</td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
