import { useState } from 'react';
import { Alert, Button, Empty, Input, List, Modal, Select, Space, Tabs, Tag, Typography } from 'antd';
import { EMBED_TITLE_MAX, parseEmbedUrl } from '@adelaide-sphere/domain/embeds';
import { blogApi } from '@/api/blog';
import { useAsync } from '@/shared/useAsync';
import type { EmbedAttributes } from './nodes';

/** Adds a YouTube video or a Google map from a pasted address (SRS 1.10 BLOG 004). */
export function EmbedDialog({ onCancel, onInsert }: { onCancel: () => void; onInsert: (attributes: EmbedAttributes) => void }) {
  const [address, setAddress] = useState('');
  const [title, setTitle] = useState('');
  const [tried, setTried] = useState(false);
  const parsed = address.trim() ? parseEmbedUrl(address) : null;

  const insert = () => {
    setTried(true);
    if (!parsed?.ok || !title.trim()) return;
    const embed = parsed.embed;
    onInsert({ provider: embed.provider, embedId: embed.provider === 'youtube' ? embed.id : null, src: embed.provider === 'map' ? embed.src : null, businessId: null, title: title.trim() });
  };

  return (
    <Modal open title="Add a video or map" okText="Insert" onOk={insert} onCancel={onCancel} destroyOnHidden>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <div>
          <label htmlFor="embed-address" style={{ display: 'block', fontWeight: 500, marginBottom: 4 }}>
            YouTube address or Google Maps embed
          </label>
          <Input.TextArea id="embed-address" rows={3} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="https://www.youtube.com/watch?v=… or the HTML from Google Maps → Share → Embed a map" aria-describedby="embed-address-status" />
          <div id="embed-address-status" aria-live="polite" style={{ marginTop: 6 }}>
            {parsed?.ok && <Tag color="green">{parsed.embed.provider === 'youtube' ? 'YouTube video found' : 'Google map found'}</Tag>}
            {parsed && !parsed.ok && <Typography.Text type="danger" style={{ fontSize: 12.5 }}>{parsed.reason}</Typography.Text>}
          </div>
        </div>
        <div>
          <label htmlFor="embed-title" style={{ display: 'block', fontWeight: 500, marginBottom: 4 }}>
            Title <span aria-hidden="true">*</span>
          </label>
          <Input id="embed-title" value={title} maxLength={EMBED_TITLE_MAX} status={tried && !title.trim() ? 'error' : undefined} aria-required="true" placeholder="e.g. A walk through Degraves Street" onChange={(event) => setTitle(event.target.value)} />
          <Typography.Text type={tried && !title.trim() ? 'danger' : 'secondary'} style={{ fontSize: 12.5 }}>
            Names the video or map for people using screen readers.
          </Typography.Text>
        </div>
        <Alert type="info" showIcon message="Readers see a placeholder first. The video or map loads from Google only when they choose to play it." />
      </Space>
    </Modal>
  );
}

/** Shows a published business as a card inside the article. */
export function BusinessCardDialog({ onCancel, onInsert }: { onCancel: () => void; onInsert: (attributes: EmbedAttributes) => void }) {
  const [query, setQuery] = useState('');
  const [results] = useAsync((signal) => blogApi().searchLinks('business', query, signal), [query]);
  return (
    <Modal open title="Add a business card" footer={null} onCancel={onCancel} destroyOnHidden>
      <Input.Search placeholder="Search published businesses" aria-label="Search published businesses" allowClear onSearch={setQuery} style={{ marginBottom: 12 }} />
      {results.status === 'ready' && results.data.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No published businesses match." />}
      {results.status === 'ready' && results.data.length > 0 && (
        <List
          size="small"
          bordered
          dataSource={results.data}
          renderItem={(item) => (
            <List.Item actions={[<Button key="add" size="small" onClick={() => onInsert({ provider: 'business', embedId: null, src: null, businessId: item.id, title: item.title })}>Add</Button>]}>
              <List.Item.Meta title={item.title} description={item.href} />
            </List.Item>
          )}
        />
      )}
      <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, marginTop: 12, marginBottom: 0 }}>
        If the business is unpublished later, its card disappears from the article automatically.
      </Typography.Paragraph>
    </Modal>
  );
}

const LINK_TYPES = [
  { value: 'post', label: 'Articles' },
  { value: 'page', label: 'Pages' },
  { value: 'business', label: 'Businesses' },
  { value: 'business_category', label: 'Business categories' },
  { value: 'area', label: 'Local areas' },
  { value: 'blog_category', label: 'Blog categories' },
] as const;

type LinkType = (typeof LINK_TYPES)[number]['value'];

/** The link box: type an address, or find a page on this site by name. Opens with Ctrl/Cmd+K. */
export function LinkDialog({ initialUrl, onCancel, onApply, onRemove }: { initialUrl: string; onCancel: () => void; onApply: (href: string) => void; onRemove: () => void }) {
  const [url, setUrl] = useState(initialUrl);
  const [tab, setTab] = useState('address');
  const [type, setType] = useState<LinkType>('post');
  const [query, setQuery] = useState('');
  const [results] = useAsync((signal) => (tab === 'site' ? blogApi().searchLinks(type, query, signal) : Promise.resolve([])), [tab, type, query]);

  return (
    <Modal
      open
      title="Link"
      okText="Apply link"
      onOk={() => onApply(url.trim())}
      onCancel={onCancel}
      destroyOnHidden
      footer={(_, { OkBtn, CancelBtn }) => (
        <Space>
          {initialUrl && <Button onClick={onRemove}>Remove link</Button>}
          <CancelBtn />
          <OkBtn />
        </Space>
      )}
    >
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'address',
            label: 'Web address',
            children: (
              <div>
                <label htmlFor="link-address" style={{ display: 'block', fontWeight: 500, marginBottom: 4 }}>
                  Web address
                </label>
                <Input id="link-address" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/page or /blog" autoFocus onPressEnter={() => onApply(url.trim())} />
                <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                  Links to other websites open in a new tab.
                </Typography.Text>
              </div>
            ),
          },
          {
            key: 'site',
            label: 'Find on this site',
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Select aria-label="What to find" value={type} onChange={setType} options={LINK_TYPES.map((option) => ({ value: option.value, label: option.label }))} style={{ width: 180 }} />
                  <Input.Search aria-label="Search by name" placeholder="Search by name" allowClear onSearch={setQuery} />
                </Space.Compact>
                {results.status === 'ready' && results.data.length === 0 && <Typography.Text type="secondary">Nothing found.</Typography.Text>}
                {results.status === 'ready' && results.data.length > 0 && (
                  <List
                    size="small"
                    bordered
                    dataSource={results.data}
                    renderItem={(item) => (
                      <List.Item>
                        <Button
                          type="link"
                          style={{ padding: 0, height: 'auto', textAlign: 'left', whiteSpace: 'normal' }}
                          onClick={() => {
                            setUrl(item.href);
                            setTab('address');
                          }}
                        >
                          {item.title}
                        </Button>
                        {item.state !== 'ok' && <Tag>{item.state === 'inactive' ? 'Inactive' : 'Not published'}</Tag>}
                      </List.Item>
                    )}
                  />
                )}
              </Space>
            ),
          },
        ]}
      />
    </Modal>
  );
}
