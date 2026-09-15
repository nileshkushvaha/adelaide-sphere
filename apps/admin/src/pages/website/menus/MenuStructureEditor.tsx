import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Button, Checkbox, Empty, Input, Radio, Space, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, DownOutlined, HolderOutlined, RightOutlined } from '@ant-design/icons';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MENU_ITEM_TYPES, MENU_LIMITS } from '@adelaide-sphere/domain/menus';
import { MenuIconPicker } from '@/components/MenuIconPicker';
import { usePrefersReducedMotion } from '@/shared/usePrefersReducedMotion';
import type { MenuSourceState } from '@/api/menus';
import {
  applyDrop,
  applyMove,
  availableMoves,
  getProjection,
  itemLabel,
  removeItem,
  subtreeHeight,
  withDepths,
  type DepthItem,
  type EditorItem,
  type MoveAction,
} from './menu-tree';

const INDENT = 32;

const STATE_TAG: Record<Exclude<MenuSourceState, 'ok'>, { color: string; text: string; help: string }> = {
  unpublished: { color: 'orange', text: 'Unpublished', help: 'Hidden on the site until what it links to is published.' },
  scheduled: { color: 'blue', text: 'Scheduled', help: 'Appears on the site once the post is published.' },
  inactive: { color: 'default', text: 'Inactive', help: 'Hidden on the site while what it links to is inactive.' },
  missing: { color: 'red', text: 'Missing', help: 'What this item linked to was deleted. Remove the item.' },
};

interface Props {
  items: EditorItem[];
  onChange: (items: EditorItem[]) => void;
  /** Deepest level allowed by the locations this menu is shown in. */
  maxDepth: number;
  readOnly: boolean;
  /** Server or client errors keyed `items[i].field`, in display order. */
  errors: Record<string, string[]>;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}

/**
 * The "Menu structure" column: a nested sortable list where dragging an item
 * to the right nests it under the item above, as in WordPress. Every drag has a
 * keyboard equivalent — the drag handle works with space and the arrow keys,
 * and each item's Move links change its level without a pointer (WCAG 2.5.7).
 */
export function MenuStructureEditor({ items, onChange, maxDepth, readOnly, errors, expanded, onToggle }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const depthItems = useMemo(() => withDepths(items), [items]);
  const indexOf = useMemo(() => new Map(items.map((item, index) => [item.key, index])), [items]);

  // While dragging, the dragged item's children travel with it and are hidden.
  const visible = useMemo(() => {
    if (!activeKey) return depthItems;
    const active = depthItems.findIndex((item) => item.key === activeKey);
    const depth = depthItems[active]?.depth ?? 0;
    let end = active + 1;
    while (end < depthItems.length && depthItems[end]!.depth > depth) end += 1;
    return [...depthItems.slice(0, active + 1), ...depthItems.slice(end)];
  }, [depthItems, activeKey]);

  const activeHeight = activeKey ? subtreeHeight(depthItems, activeKey) : 0;
  const projection = activeKey && overKey ? getProjection(visible, activeKey, overKey, offsetX, INDENT, maxDepth, activeHeight) : null;

  const labelOf = (key: string | number | undefined) => {
    const item = depthItems.find((entry) => entry.key === key);
    return item ? itemLabel(item) : 'item';
  };

  const reset = () => {
    setActiveKey(null);
    setOverKey(null);
    setOffsetX(0);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}.`,
    onDragMove: ({ active, over }) => (over ? `${labelOf(active.id)} is over ${labelOf(over.id)}${projection ? `, level ${projection.depth + 1}` : ''}.` : undefined),
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.id)} is over ${labelOf(over.id)}${projection ? `, level ${projection.depth + 1}` : ''}.` : `${labelOf(active.id)} is no longer over an item.`),
    onDragEnd: ({ active, over }) => (over && projection ? `${labelOf(active.id)} was dropped at level ${projection.depth + 1}.` : `${labelOf(active.id)} was put back.`),
    onDragCancel: ({ active }) => `Moving ${labelOf(active.id)} was cancelled.`,
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveKey(String(active.id));
    setOverKey(String(active.id));
  };
  const onDragMove = ({ delta }: DragMoveEvent) => setOffsetX(delta.x);
  const onDragOver = ({ over }: DragOverEvent) => setOverKey(over ? String(over.id) : null);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && projection) onChange(applyDrop(items, String(active.id), String(over.id), projection.parentKey));
    reset();
  };

  const update = (key: string, patch: Partial<EditorItem>) => onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const move = (key: string, action: MoveAction) => onChange(applyMove(items, key, action, maxDepth));
  const remove = (key: string) => onChange(removeItem(items, key));

  if (items.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={readOnly ? 'This menu has no items.' : 'This menu is empty. Tick pages, posts or categories on the left and choose “Add to menu”, or add a custom link.'}
      />
    );
  }

  const active = activeKey ? depthItems.find((item) => item.key === activeKey) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: 'To reorder, press space or enter to pick the item up, use the arrow keys to move it, then press space or enter to drop it. To change its level, use the Move links inside the item.',
        },
      }}
    >
      <SortableContext items={visible.map((item) => item.key)} strategy={verticalListSortingStrategy}>
        <ol className="ms-menu-tree" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((item) => (
            <SortableItem
              key={item.key}
              item={item}
              depth={item.key === activeKey && projection ? projection.depth : item.depth}
              readOnly={readOnly}
              reducedMotion={reducedMotion}
            >
              {(handle) => (
                <MenuItemCard
                  item={item}
                  index={indexOf.get(item.key) ?? 0}
                  handle={handle}
                  expanded={expanded.has(item.key)}
                  onToggle={() => onToggle(item.key)}
                  readOnly={readOnly}
                  errors={errors}
                  moves={availableMoves(items, item.key, maxDepth)}
                  onUpdate={(patch) => update(item.key, patch)}
                  onMove={(action) => move(item.key, action)}
                  onRemove={() => remove(item.key)}
                />
              )}
            </SortableItem>
          ))}
        </ol>
      </SortableContext>
      <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
        {active ? (
          <div className="ms-menu-card ms-menu-card--overlay" style={{ padding: '10px 14px' }}>
            <Typography.Text strong>{itemLabel(active)}</Typography.Text>
            {activeHeight > 0 && <Typography.Text type="secondary"> and the items under it</Typography.Text>}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableItem({ item, depth, readOnly, reducedMotion, children }: { item: DepthItem; depth: number; readOnly: boolean; reducedMotion: boolean; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.key, disabled: readOnly });
  const label = itemLabel(item);
  const handle = readOnly ? null : (
    <button type="button" ref={setActivatorNodeRef} className="ms-menu-handle" aria-label={`Reorder ${label}`} {...attributes} {...listeners}>
      <HolderOutlined aria-hidden="true" />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{
        marginLeft: depth * INDENT,
        transform: CSS.Translate.toString(transform),
        transition: reducedMotion ? undefined : transition,
        opacity: isDragging ? 0.45 : 1,
      }}
    >
      {children(handle)}
    </li>
  );
}

interface CardProps {
  item: DepthItem;
  index: number;
  handle: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  readOnly: boolean;
  errors: Record<string, string[]>;
  moves: ReturnType<typeof availableMoves>;
  onUpdate: (patch: Partial<EditorItem>) => void;
  onMove: (action: MoveAction) => void;
  onRemove: () => void;
}

function MenuItemCard({ item, index, handle, expanded, onToggle, readOnly, errors, moves, onUpdate, onMove, onRemove }: CardProps) {
  const label = itemLabel(item);
  const typeLabel = MENU_ITEM_TYPES.find((definition) => definition.type === item.type)?.label ?? item.type;
  const bodyId = `menu-item-${item.key}`;
  const fieldId = (field: string) => `${bodyId}-${field}`;
  const errorFor = (field: string) => errors[`items[${index}].${field}`];
  const itemErrors = Object.entries(errors).filter(([path]) => path.startsWith(`items[${index}].`));
  // Problems with the item's place or target have no field of their own, so they are listed at the top of the card.
  const structuralErrors = ['parentKey', 'type', 'refId', 'routeKey'].flatMap((name) => errors[`items[${index}].${name}`] ?? []);
  const state = item.source.state !== 'ok' ? STATE_TAG[item.source.state] : null;
  const isHeading = item.type === 'heading';

  const field = (name: string, text: string, control: ReactNode, help?: string) => {
    const problem = errorFor(name);
    return (
      <div className="ms-menu-field">
        <label htmlFor={fieldId(name)} style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
          {text}
        </label>
        {control}
        {problem ? (
          <Typography.Text type="danger" id={`${fieldId(name)}-error`} style={{ display: 'block', fontSize: 12.5, marginTop: 4 }}>
            {problem.join(' ')}
          </Typography.Text>
        ) : help ? (
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginTop: 4 }}>
            {help}
          </Typography.Text>
        ) : null}
      </div>
    );
  };

  return (
    <div className={`ms-menu-card${itemErrors.length > 0 ? ' ms-menu-card--error' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 6px 6px' }}>
        {handle}
        <button type="button" className="ms-menu-toggle" aria-expanded={expanded} aria-controls={bodyId} onClick={onToggle}>
          <span style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{label}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {item.style === 'button' && <Tag color="geekblue">Button</Tag>}
            {state && (
              <Tooltip title={state.help}>
                <Tag color={state.color}>{state.text}</Tag>
              </Tooltip>
            )}
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              {typeLabel}
            </Typography.Text>
            {expanded ? <DownOutlined aria-hidden="true" style={{ fontSize: 11 }} /> : <RightOutlined aria-hidden="true" style={{ fontSize: 11 }} />}
          </span>
        </button>
      </div>

      {expanded && (
        <div id={bodyId} className="ms-menu-card-body">
          {item.source.state === 'missing' && state && <Alert type="error" showIcon style={{ marginBottom: 12 }} message={state.help} />}
          {structuralErrors.length > 0 && <Alert type="error" showIcon role="alert" style={{ marginBottom: 12 }} message={structuralErrors.join(' ')} />}
          <div className="ms-menu-fields">
            {field(
              'label',
              isHeading ? 'Heading text' : 'Navigation label',
              <Input
                id={fieldId('label')}
                value={item.label ?? ''}
                placeholder={item.source.title ?? undefined}
                maxLength={MENU_LIMITS.label}
                disabled={readOnly}
                status={errorFor('label') ? 'error' : undefined}
                aria-describedby={errorFor('label') ? `${fieldId('label')}-error` : undefined}
                onChange={(event) => onUpdate({ label: event.target.value })}
              />,
              item.source.title && !isHeading ? `Leave empty to use “${item.source.title}”.` : undefined,
            )}
            {item.type === 'custom' &&
              field(
                'url',
                'URL',
                <Input
                  id={fieldId('url')}
                  value={item.url ?? ''}
                  placeholder="/blog or https://example.com"
                  maxLength={MENU_LIMITS.url}
                  disabled={readOnly}
                  status={errorFor('url') ? 'error' : undefined}
                  aria-describedby={errorFor('url') ? `${fieldId('url')}-error` : undefined}
                  onChange={(event) => onUpdate({ url: event.target.value, source: { ...item.source, href: event.target.value } })}
                />,
                'A site path, a full https:// address, or a mailto: or tel: link.',
              )}
            {!isHeading &&
              field(
                'titleAttribute',
                'Title attribute',
                <Input id={fieldId('titleAttribute')} value={item.titleAttribute ?? ''} maxLength={MENU_LIMITS.titleAttribute} disabled={readOnly} onChange={(event) => onUpdate({ titleAttribute: event.target.value })} />,
                'Shown as a tooltip on hover. Optional.',
              )}
            {field(
              'description',
              'Description',
              <Input.TextArea
                id={fieldId('description')}
                value={item.description ?? ''}
                maxLength={MENU_LIMITS.description}
                autoSize={{ minRows: 1, maxRows: 3 }}
                disabled={readOnly}
                onChange={(event) => onUpdate({ description: event.target.value })}
              />,
              'Shown under the label in dropdowns and the mobile menu.',
            )}
            {field('icon', 'Icon', <MenuIconPicker id={fieldId('icon')} value={item.icon} disabled={readOnly} onChange={(icon) => onUpdate({ icon })} />)}
            {!isHeading &&
              field(
                'style',
                'Style',
                <Radio.Group
                  id={fieldId('style')}
                  value={item.style}
                  disabled={readOnly}
                  onChange={(event) => onUpdate({ style: event.target.value })}
                  options={[
                    { value: 'link', label: 'Link' },
                    { value: 'button', label: 'Button' },
                  ]}
                  optionType="button"
                />,
                'A button stands out as the call to action in the header.',
              )}
          </div>

          {!isHeading && (
            <Space wrap size={[16, 4]} style={{ marginTop: 10 }}>
              <Checkbox checked={item.openInNewTab} disabled={readOnly} onChange={(event) => onUpdate({ openInNewTab: event.target.checked })}>
                Open in a new tab
              </Checkbox>
              <Checkbox checked={item.relNofollow} disabled={readOnly} onChange={(event) => onUpdate({ relNofollow: event.target.checked })}>
                Ask search engines not to follow (nofollow)
              </Checkbox>
            </Space>
          )}

          {item.source.href && item.type !== 'custom' && (
            <Typography.Paragraph type="secondary" style={{ margin: '10px 0 0', fontSize: 12.5 }}>
              Original: {item.source.title ?? typeLabel} ·{' '}
              <a href={item.source.href} target="_blank" rel="noopener noreferrer">
                {item.source.href}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </Typography.Paragraph>
          )}

          {!readOnly && (
            <div className="ms-menu-card-actions">
              <Space wrap size={[4, 4]}>
                <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                  Move
                </Typography.Text>
                {moves.up && (
                  <Button size="small" type="link" onClick={() => onMove('up')}>
                    Up one
                  </Button>
                )}
                {moves.down && (
                  <Button size="small" type="link" onClick={() => onMove('down')}>
                    Down one
                  </Button>
                )}
                {moves.under && (
                  <Button size="small" type="link" onClick={() => onMove('under')}>
                    Under {moves.under}
                  </Button>
                )}
                {moves.out && (
                  <Button size="small" type="link" onClick={() => onMove('out')}>
                    Out from under {moves.out}
                  </Button>
                )}
                {moves.top && (
                  <Button size="small" type="link" onClick={() => onMove('top')}>
                    To the top
                  </Button>
                )}
              </Space>
              <Button size="small" danger type="text" icon={<DeleteOutlined aria-hidden="true" />} onClick={onRemove}>
                Remove
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
