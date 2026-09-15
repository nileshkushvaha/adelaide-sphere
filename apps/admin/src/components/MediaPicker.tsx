import { useState } from 'react';
import { Card, Input, Modal, Pagination, Space, Typography } from 'antd';
import { mediaApi, variantUrl, type MediaAsset } from '@/api/media';
import { useAsync } from '@/shared/useAsync';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui';

const PAGE_SIZE = 24;

/**
 * Picks processed images from the library. Only assets that are ready and have
 * alt text can be chosen, because a page may not show an image without it
 * (SRS MED 003).
 *
 * It searches and pages against the API. It used to ask for the first 48 ready
 * assets and show whatever came back: beyond that, an image simply could not be
 * reached from any editor in the application, and nothing said so — the grid
 * just ended. Excluded images were then filtered out of that page in the
 * browser, so a gallery of eight could leave forty on screen and the
 * forty-ninth unreachable.
 */
export function MediaPicker({ open, onCancel, onPick, multiple = false, excludeIds = [] }: { open: boolean; onCancel: () => void; onPick: (assets: MediaAsset[]) => void; multiple?: boolean; excludeIds?: string[] }) {
  const api = mediaApi();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const [state, reload] = useAsync(
    (signal) =>
      open
        ? api.list({ kind: 'image', status: 'ready', q: query || undefined, page, pageSize: PAGE_SIZE }, signal)
        : Promise.resolve({ data: [], meta: { page: 1, pageSize: 0, total: 0, pageCount: 1 } }),
    [open, query, page],
  );
  // How many are still being prepared, so their absence can be explained rather
  // than read as "there are none".
  const [processing] = useAsync((signal) => (open ? api.list({ kind: 'image', status: 'quarantined', pageSize: 1 }, signal) : Promise.resolve(null)), [open]);

  const assets = (state.status === 'ready' ? state.data.data : []).filter((asset) => !excludeIds.includes(asset.id));
  const total = state.status === 'ready' ? state.data.meta.total : 0;
  const stillProcessing = processing.status === 'ready' ? (processing.data?.meta.total ?? 0) : 0;

  const toggle = (id: string) => setSelected((current) => (multiple ? (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]) : [id]));

  const close = () => {
    setSelected([]);
    setQuery('');
    setPage(1);
    onCancel();
  };

  const confirm = () => {
    onPick(assets.filter((asset) => selected.includes(asset.id)));
    setSelected([]);
  };

  return (
    <Modal
      open={open}
      title="Choose an image"
      width={860}
      okText={multiple ? 'Add selected' : 'Use image'}
      okButtonProps={{ disabled: selected.length === 0 }}
      onOk={confirm}
      onCancel={close}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Input.Search
          allowClear
          aria-label="Search images"
          placeholder="Search by file name or alt text"
          defaultValue={query}
          onSearch={(value) => {
            setPage(1);
            setQuery(value.trim());
          }}
          style={{ maxWidth: 360 }}
        />

        {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
        {state.status === 'loading' && <PageLoader label="Loading images…" />}

        {state.status === 'ready' && assets.length === 0 && (
          <EmptyState
            title={query ? 'No images match that search' : 'No images ready to use'}
            description={
              query
                ? 'Try a different word, or clear the search.'
                : stillProcessing > 0
                  ? `${stillProcessing} image${stillProcessing === 1 ? ' is' : 's are'} still being prepared. They can be chosen once that finishes.`
                  : 'Upload one in the Media library first. An image also needs alt text before it can be used.'
            }
            action={query ? { label: 'Clear search', onClick: () => setQuery('') } : undefined}
          />
        )}

        <ul style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', listStyle: 'none', margin: 0, padding: 0 }}>
          {assets.map((asset) => {
            const preview = variantUrl(asset, 320);
            const chosen = selected.includes(asset.id);
            const usable = Boolean(asset.altText);
            return (
              <li key={asset.id}>
                <Card
                  size="small"
                  hoverable={usable}
                  onClick={() => usable && toggle(asset.id)}
                  style={{ outline: chosen ? '3px solid #0B3AA4' : undefined, opacity: usable ? 1 : 0.5 }}
                  cover={preview ? <img src={preview} alt={asset.altText ?? ''} style={{ aspectRatio: '4 / 3', objectFit: 'cover' }} /> : undefined}
                >
                  <Space direction="vertical" size={0} style={{ width: '100%' }}>
                    <Typography.Text ellipsis title={asset.sourceName}>
                      {asset.sourceName}
                    </Typography.Text>
                    {!usable && <Typography.Text type="danger">Add alt text first</Typography.Text>}
                  </Space>
                </Card>
              </li>
            );
          })}
        </ul>

        {total > PAGE_SIZE && (
          <Pagination align="end" current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={setPage} />
        )}
        {state.status === 'ready' && stillProcessing > 0 && assets.length > 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {stillProcessing} more {stillProcessing === 1 ? 'image is' : 'images are'} still being prepared.
          </Typography.Text>
        )}
      </Space>
    </Modal>
  );
}
