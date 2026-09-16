import { useState } from 'react';
import { Alert, Button, Space, Typography, Upload } from 'antd';
import { DeleteOutlined, PictureOutlined } from '@ant-design/icons';
import { mediaApi, uploadImage, variantUrl, type MediaAsset } from '@/api/media';
import { isApiError } from '@/api/errors';
import { MediaPicker } from './MediaPicker';
import { brand } from '@/config/theme';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';

interface Props {
  /** The chosen asset's id. Supplied by `Form.Item` when used as a control. */
  value?: string | null;
  onChange?: (mediaId: string | null) => void;
  /** The image currently stored, resolved by the API, for the first render. */
  current?: { url: string; alt: string } | null;
  /** What the empty frame says, e.g. "No logo yet". */
  emptyLabel?: string;
  /** What removing it means, e.g. "Use the site image". Omit to say "Remove". */
  clearLabel?: string;
  disabled?: boolean;
  /** Frame proportions; a logo is squarer than a share card. */
  aspectRatio?: string;
  uploadAlt?: string;
}

/**
 * Chooses an image from the media library.
 *
 * Several screens asked an administrator to *paste an image reference* into a
 * text box — the asset's identifier, copied from another page. That is not
 * something anyone can be expected to know or type correctly, it gave no
 * indication of whether the reference was right, and it made an image field
 * the only part of the admin that could not be filled in by looking at it.
 *
 * The value is still the asset id, so nothing about the record changes; only
 * the way it is chosen does. What was picked in this session is remembered
 * separately from what the API resolved, so the preview is right before the
 * form has been saved and reloaded.
 */
export function MediaField({ value, onChange, current = null, emptyLabel = 'No image yet', clearLabel, disabled = false, aspectRatio = '16 / 9', uploadAlt }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<{ url: string; alt: string } | null>(null);
  // Cleared in this session: `chosen` is null either way, so the difference
  // between "nothing picked yet" and "the stored one was removed" is held here.
  const [cleared, setCleared] = useState(false);
  const shown = chosen ?? (cleared || !value ? null : current);
  // Choosing needs the Media library's View permission and uploading its Upload
  // permission; a screen's own permission does not imply either (change log 1.13).
  const { can } = useCapabilities();
  const mayChoose = can(PERMISSION.mediaView);
  const mayUpload = can(PERMISSION.mediaUpload);

  return (
    <>
      <Space align="start" wrap size={16} className="as-media-field">
        {shown ? (
          <img src={shown.url} alt={shown.alt} style={{ width: 220, aspectRatio, objectFit: uploadAlt ? 'contain' : 'cover', borderRadius: 8, border: `1px solid ${brand.border}`, display: 'block' }} />
        ) : (
          <div style={{ width: 220, aspectRatio, borderRadius: 8, border: `1px dashed ${brand.border}`, display: 'grid', placeItems: 'center', color: brand.textSubtle, fontSize: 13, textAlign: 'center', padding: 12 }}>
            <span>
              <PictureOutlined aria-hidden="true" style={{ fontSize: 22, display: 'block', marginBottom: 6 }} />
              {emptyLabel}
            </span>
          </div>
        )}
        <Space direction="vertical" size={8}>
          {mayChoose && (
            <Button icon={<PictureOutlined aria-hidden="true" />} onClick={() => setPicking(true)} disabled={disabled}>
              {shown ? 'Replace image' : 'Choose image'}
            </Button>
          )}
          {!mayChoose && !(uploadAlt && mayUpload) && (
            <Typography.Text type="secondary" style={{ fontSize: 12.5, maxWidth: 220 }}>
              Choosing an image needs access to the Media library.
            </Typography.Text>
          )}
          {uploadAlt && mayUpload && <Upload accept="image/png,image/jpeg,image/webp" showUploadList={false} disabled={disabled || uploading} beforeUpload={async (file) => {
            setUploading(true);
            setUploadError(null);
            try {
              const api = mediaApi();
              let asset = await uploadImage(file, uploadAlt, api);
              for (let attempt = 0; asset.status === 'quarantined' && attempt < 30; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                asset = await api.get(asset.id);
              }
              const url = variantUrl(asset);
              if (asset.status !== 'ready' || !url) {
                setUploadError('Image is not ready yet. Check the media library, then choose it when processing finishes.');
                return false;
              }
              setChosen({ url, alt: asset.altText ?? uploadAlt });
              setCleared(false);
              onChange?.(asset.id);
            } catch (error) {
              setUploadError(isApiError(error) ? error.userMessage : 'The upload did not finish. Try again.');
            } finally { setUploading(false); }
            return false;
          }}><Button loading={uploading} disabled={disabled}>{uploading ? 'Processing image' : 'Upload image'}</Button></Upload>}
          {uploadError && <Alert type="error" message={uploadError} />}
          {shown && (
            <Button
              icon={<DeleteOutlined aria-hidden="true" />}
              disabled={disabled}
              onClick={() => {
                setChosen(null);
                setCleared(true);
                onChange?.(null);
              }}
            >
              {clearLabel ?? 'Remove'}
            </Button>
          )}
          {shown?.alt ? (
            <Typography.Text type="secondary" style={{ fontSize: 12.5, maxWidth: 220 }}>
              {shown.alt}
            </Typography.Text>
          ) : (
            shown && (
              <Typography.Text type="danger" style={{ fontSize: 12.5, maxWidth: 220 }}>
                This image has no alternative text yet.
              </Typography.Text>
            )
          )}
        </Space>
      </Space>

      {/* Mounted only while it is open. A screen with several image fields
          otherwise carries one hidden dialog per field, which costs a
          measurable amount of render time for something nobody is looking at. */}
      {picking && (
      <MediaPicker
        open
        onCancel={() => setPicking(false)}
        onPick={(assets: MediaAsset[]) => {
          const asset = assets[0];
          setPicking(false);
          if (!asset) return;
          setCleared(false);
          setChosen({ url: variantUrl(asset) ?? '', alt: asset.altText ?? '' });
          onChange?.(asset.id);
        }}
      />
      )}
    </>
  );
}
