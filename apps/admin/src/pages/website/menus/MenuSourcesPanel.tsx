import { useState } from 'react';
import { Button, Checkbox, Collapse, Empty, Input, Pagination, Segmented, Skeleton, Space, Tag, Typography } from 'antd';
import { MENU_LIMITS, validateMenuLink } from '@adelaide-sphere/domain/menus';
import { menusApi, type MenuLinkSource, type MenuLinkSourceType } from '@/api/menus';
import { useAsync } from '@/shared/useAsync';
import { ErrorState } from '@/components/ui';
import { itemFromSource, newKey, type EditorItem } from './menu-tree';

const PANELS: { type: MenuLinkSourceType; label: string; noun: string }[] = [
  { type: 'page', label: 'Pages', noun: 'pages' },
  { type: 'post', label: 'Posts', noun: 'posts' },
  { type: 'blog_category', label: 'Blog categories', noun: 'blog categories' },
  { type: 'blog_tag', label: 'Blog tags', noun: 'blog tags' },
  { type: 'business_category', label: 'Business categories', noun: 'business categories' },
  { type: 'area', label: 'Local areas', noun: 'local areas' },
  { type: 'business', label: 'Businesses', noun: 'published businesses' },
  // PDFs from the media library (change log 1.16).
  { type: 'document', label: 'Documents', noun: 'documents' },
  { type: 'route', label: 'Site pages', noun: 'site pages' },
];

const STATE_TEXT = { unpublished: 'Draft', scheduled: 'Scheduled', inactive: 'Inactive', missing: 'Missing' } as const;

interface Props {
  items: EditorItem[];
  onAdd: (items: EditorItem[]) => void;
  disabled: boolean;
}

/**
 * The "Add menu items" column: one panel per kind of content, each with Most
 * recent, View all and Search, checkboxes and an "Add to menu" button — the
 * WordPress arrangement — plus a panel for custom links and headings.
 */
export function MenuSourcesPanel({ items, onAdd, disabled }: Props) {
  const [open, setOpen] = useState<string[]>(['page']);
  return (
    <Collapse
      accordion
      activeKey={open}
      onChange={(keys) => setOpen(Array.isArray(keys) ? keys : [keys])}
      items={[
        ...PANELS.map((panel) => ({
          key: panel.type,
          label: panel.label,
          // Mounted only when opened, so a closed panel costs no request.
          children: open.includes(panel.type) ? <SourceList type={panel.type} noun={panel.noun} items={items} onAdd={onAdd} disabled={disabled} /> : null,
        })),
        { key: 'custom', label: 'Custom links', children: <CustomLinkForm onAdd={onAdd} disabled={disabled} /> },
      ]}
    />
  );
}

function SourceList({ type, noun, items, onAdd, disabled }: { type: MenuLinkSourceType; noun: string; items: EditorItem[]; onAdd: (items: EditorItem[]) => void; disabled: boolean }) {
  const [mode, setMode] = useState<'recent' | 'all' | 'search'>(type === 'route' ? 'all' : 'recent');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<Map<string, MenuLinkSource>>(new Map());
  const query = mode === 'search' ? q.trim() : '';
  const [state, reload] = useAsync(
    (signal) => (mode === 'search' && !query ? Promise.resolve(null) : menusApi.linkSources({ type, q: query || undefined, page, pageSize: 10, sort: mode === 'recent' ? 'recent' : 'title' }, signal)),
    [type, mode, query, page],
  );

  const inMenu = new Set(items.map((item) => (type === 'route' ? (item.type === 'route' ? item.routeKey : null) : item.type === type ? item.refId : null)).filter(Boolean));
  const rows = state.status === 'ready' && state.data ? state.data.data : [];
  const allChecked = rows.length > 0 && rows.every((row) => checked.has(row.id));

  const toggle = (row: MenuLinkSource, on: boolean) =>
    setChecked((current) => {
      const next = new Map(current);
      if (on) next.set(row.id, row);
      else next.delete(row.id);
      return next;
    });

  const add = () => {
    onAdd([...checked.values()].map((source) => itemFromSource(type, source)));
    setChecked(new Map());
  };

  return (
    <div>
      {type !== 'route' && (
        <Segmented
          size="small"
          block
          value={mode}
          onChange={(value) => {
            setMode(value as typeof mode);
            setPage(1);
          }}
          options={[
            { value: 'recent', label: 'Most recent' },
            { value: 'all', label: 'View all' },
            { value: 'search', label: 'Search' },
          ]}
          style={{ marginBottom: 10 }}
        />
      )}
      {mode === 'search' && (
        <Input.Search
          aria-label={`Search ${noun}`}
          placeholder={`Search ${noun}`}
          allowClear
          defaultValue={q}
          onSearch={(value) => {
            setQ(value);
            setPage(1);
          }}
          style={{ marginBottom: 10 }}
        />
      )}

      {state.status === 'loading' && <Skeleton active paragraph={{ rows: 3 }} title={false} />}
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      {state.status === 'ready' && !state.data && <Typography.Text type="secondary">Type a word and press Enter.</Typography.Text>}
      {state.status === 'ready' && state.data && rows.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No ${noun} found`} />}

      {rows.length > 0 && (
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="sr-only">Choose {noun} to add</legend>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 280, overflowY: 'auto' }}>
            {rows.map((row) => (
              <li key={row.id} style={{ padding: '3px 0' }}>
                <Checkbox checked={checked.has(row.id)} disabled={disabled} onChange={(event) => toggle(row, event.target.checked)}>
                  <span>{row.title}</span>
                  {row.hint && type !== 'route' && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {' '}
                      {row.hint}
                    </Typography.Text>
                  )}
                  {row.state !== 'ok' && (
                    <Tag style={{ marginInlineStart: 6 }} color={row.state === 'scheduled' ? 'blue' : 'orange'}>
                      {STATE_TEXT[row.state]}
                    </Tag>
                  )}
                  {inMenu.has(row.id) && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {' '}
                      (in menu)
                    </Typography.Text>
                  )}
                </Checkbox>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {state.status === 'ready' && state.data && state.data.meta.pageCount > 1 && (
        <Pagination size="small" simple current={page} total={state.data.meta.total} pageSize={state.data.meta.pageSize} onChange={setPage} style={{ marginTop: 8 }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8 }}>
        <Checkbox
          checked={allChecked}
          indeterminate={!allChecked && rows.some((row) => checked.has(row.id))}
          disabled={disabled || rows.length === 0}
          onChange={(event) => rows.forEach((row) => toggle(row, event.target.checked))}
        >
          Select all
        </Checkbox>
        <Button onClick={add} disabled={disabled || checked.size === 0}>
          Add to menu{checked.size > 0 ? ` (${checked.size})` : ''}
        </Button>
      </div>
    </div>
  );
}

function CustomLinkForm({ onAdd, disabled }: { onAdd: (items: EditorItem[]) => void; disabled: boolean }) {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [heading, setHeading] = useState(false);
  const [problems, setProblems] = useState<{ url?: string; text?: string }>({});

  const add = () => {
    const next: typeof problems = {};
    if (!text.trim()) next.text = 'Enter the text to show';
    const link = heading ? null : validateMenuLink(url);
    if (!heading && !link) next.url = 'Enter a site path such as /blog, a full https:// address, or a mailto:/tel: link';
    setProblems(next);
    if (Object.keys(next).length > 0) return;
    onAdd([
      {
        key: newKey(),
        parentKey: null,
        type: heading ? 'heading' : 'custom',
        refId: null,
        routeKey: null,
        url: heading ? null : link!.url,
        label: text.trim(),
        titleAttribute: null,
        description: null,
        icon: null,
        style: 'link',
        openInNewTab: false,
        relNofollow: false,
        source: { state: 'ok', title: null, href: heading ? null : link!.url },
      },
    ]);
    setUrl('');
    setText('');
    setHeading(false);
  };

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Checkbox checked={heading} disabled={disabled} onChange={(event) => setHeading(event.target.checked)}>
        Heading only (groups the items under it, no link)
      </Checkbox>
      {!heading && (
        <div>
          <label htmlFor="menu-custom-url" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            URL
          </label>
          <Input
            id="menu-custom-url"
            value={url}
            placeholder="https://"
            maxLength={MENU_LIMITS.url}
            disabled={disabled}
            status={problems.url ? 'error' : undefined}
            aria-describedby={problems.url ? 'menu-custom-url-error' : undefined}
            onChange={(event) => setUrl(event.target.value)}
          />
          {problems.url && (
            <Typography.Text type="danger" id="menu-custom-url-error" style={{ display: 'block', fontSize: 12.5, marginTop: 4 }}>
              {problems.url}
            </Typography.Text>
          )}
        </div>
      )}
      <div>
        <label htmlFor="menu-custom-text" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
          {heading ? 'Heading text' : 'Link text'}
        </label>
        <Input placeholder="Link text"
          id="menu-custom-text"
          value={text}
          maxLength={MENU_LIMITS.label}
          disabled={disabled}
          status={problems.text ? 'error' : undefined}
          aria-describedby={problems.text ? 'menu-custom-text-error' : undefined}
          onChange={(event) => setText(event.target.value)}
          onPressEnter={add}
        />
        {problems.text && (
          <Typography.Text type="danger" id="menu-custom-text-error" style={{ display: 'block', fontSize: 12.5, marginTop: 4 }}>
            {problems.text}
          </Typography.Text>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <Button onClick={add} disabled={disabled}>
          Add to menu
        </Button>
      </div>
    </Space>
  );
}

