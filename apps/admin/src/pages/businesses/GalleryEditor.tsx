import { useState } from 'react';
import { Alert, App, Button, Input, Space, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { MediaPicker } from '@/components/MediaPicker';
import { mediaApi, type GalleryEntry, type MediaAsset } from '@/api/media';
import { isApiError } from '@/api/errors';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { Pill, SectionCard } from '@/components/ui';
import { brand } from '@/config/theme';

interface Item {
  mediaId: string;
  alt: string;
  altOverride: string | null;
  caption: string | null;
  isCover: boolean;
  previewUrl: string | null;
}

const toItem = (entry: GalleryEntry): Item => ({
  mediaId: entry.mediaId,
  alt: entry.alt,
  altOverride: entry.alt,
  caption: entry.caption,
  isCover: entry.isCover,
  previewUrl: [...entry.variants].sort((a, b) => a.width - b.width)[0]?.url ?? null,
});

/**
 * Listing gallery (SRS MED 004): order, caption, contextual alt text and the
 * cover live on the usage, so the same image can appear elsewhere with
 * different wording.
 */
export function GalleryEditor({ businessId, businessVersion, readOnly, onSaved }: { businessId: string; businessVersion: number; readOnly: boolean; onSaved: () => void }) {
  const api = mediaApi();
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const [state, reload] = useAsync((signal) => api.gallery(businessId, signal), [businessId, businessVersion]);
  const [items, setItems] = useState<Item[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const current = items ?? (state.status === 'ready' ? state.data.map(toItem) : []);

  const update = (next: Item[]) => setItems(next.map((item, index) => ({ ...item, isCover: next.some((i) => i.isCover) ? item.isCover : index === 0 })));
  const move = (index: number, delta: number) => {
    const next = [...current];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    update(next);
  };

  const add = (assets: MediaAsset[]) => {
    setPicking(false);
    update([...current, ...assets.map((asset) => ({ mediaId: asset.id, alt: asset.altText ?? '', altOverride: null, caption: null, isCover: current.length === 0, previewUrl: [...asset.variants].sort((a, b) => a.width - b.width)[0]?.url ?? null }))]);
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await api.setGallery(businessId, {
        expectedVersion: businessVersion,
        items: current.map((item) => ({ mediaId: item.mediaId, caption: item.caption, altOverride: item.altOverride, isCover: item.isCover })),
      });
      message.success('Gallery saved');
      setItems(null);
      onSaved();
      reload();
    } catch (err) {
      if (isApiError(err) && err.kind === 'unauthorized') onAuthError(err);
      else if (isApiError(err) && err.code === 'STALE_VERSION') setError('This listing was changed by someone else. Reload before saving the gallery.');
      else setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (state.status === 'error') return <Alert type="error" showIcon message={state.message} action={<Button onClick={reload}>Retry</Button>} />;

  return (
    <SectionCard
      title="Gallery and media"
      description="Images shown on the public listing. The gallery is saved on its own, separately from the fields above."
      extra={
        <Typography.Text type="secondary">
          {current.length} image{current.length === 1 ? '' : 's'}
        </Typography.Text>
      }
    >
      {error && <Alert type="error" showIcon role="alert" message={error} style={{ marginBottom: 12 }} />}
      <Typography.Paragraph type="secondary">The first image is the cover unless you choose another. Leave alt text empty to use the library's.</Typography.Paragraph>
      {current.length === 0 && <Typography.Paragraph type="secondary">No images yet.</Typography.Paragraph>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {current.map((item, index) => (
          <li key={item.mediaId} style={{ borderBottom: `1px solid ${brand.borderSoft}`, padding: '12px 0' }}>
            <Space align="start" wrap>
              {item.previewUrl ? <img src={item.previewUrl} alt="" width={96} height={72} style={{ objectFit: 'cover', borderRadius: 6 }} /> : <div style={{ width: 96, height: 72, background: brand.placeholderFill, borderRadius: 6 }} />}
              <Space direction="vertical" size={4} style={{ minWidth: 260 }}>
                <Input aria-label={`Alt text for image ${index + 1}`} placeholder="Alt text" value={item.altOverride ?? ''} maxLength={255} disabled={readOnly} onChange={(e) => update(current.map((i, x) => (x === index ? { ...i, altOverride: e.target.value || null } : i)))} />
                <Input aria-label={`Caption for image ${index + 1}`} placeholder="Caption (optional)" value={item.caption ?? ''} maxLength={255} disabled={readOnly} onChange={(e) => update(current.map((i, x) => (x === index ? { ...i, caption: e.target.value || null } : i)))} />
              </Space>
              <Space direction="vertical" size={4}>
                {item.isCover ? <Pill tone="positive">Cover</Pill> : <Button size="small" disabled={readOnly} onClick={() => update(current.map((i, x) => ({ ...i, isCover: x === index })))}>Make cover</Button>}
                <Space>
                  <Button size="small" icon={<ArrowUpOutlined aria-hidden="true" />} aria-label={`Move image ${index + 1} up`} disabled={readOnly || index === 0} onClick={() => move(index, -1)} />
                  <Button size="small" icon={<ArrowDownOutlined aria-hidden="true" />} aria-label={`Move image ${index + 1} down`} disabled={readOnly || index === current.length - 1} onClick={() => move(index, 1)} />
                  <Button size="small" danger icon={<DeleteOutlined aria-hidden="true" />} aria-label={`Remove image ${index + 1}`} disabled={readOnly} onClick={() => update(current.filter((_, x) => x !== index))} />
                </Space>
              </Space>
            </Space>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <Space style={{ marginTop: 16 }}>
          <Button icon={<PlusOutlined aria-hidden="true" />} onClick={() => setPicking(true)}>
            Add images
          </Button>
          <Button type="primary" loading={saving} disabled={items === null} onClick={() => void save()}>
            Save gallery
          </Button>
        </Space>
      )}
      <MediaPicker open={picking} multiple excludeIds={current.map((item) => item.mediaId)} onCancel={() => setPicking(false)} onPick={add} />
    </SectionCard>
  );
}
