import { useState } from 'react';
import { Alert, Button, Input, Modal, Progress, Radio, Space, Typography, Upload } from 'antd';
import { InboxOutlined, PictureOutlined } from '@ant-design/icons';
import { mediaApi, uploadImage, variantUrl, type MediaAsset } from '@/api/media';
import { isApiError } from '@/api/errors';
import { MediaPicker } from '@/components/MediaPicker';
import { brand } from '@/config/theme';
import type { FigureAttributes, FigureSize } from './nodes';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';

interface Props {
  /** A file dropped or pasted into the editor, ready to upload. */
  initialFile?: File | null;
  /** Editing an image already in the article. */
  existing?: FigureAttributes | null;
  onCancel: () => void;
  onInsert: (attributes: FigureAttributes) => void;
}

type UploadState = { kind: 'idle' } | { kind: 'uploading'; percent: number } | { kind: 'processing' } | { kind: 'failed'; message: string };

/** How long to wait for the worker to prepare an upload before saying so. */
const PROCESSING_ATTEMPTS = 45;

/**
 * Adds a picture to the article: upload one here (or the one that was dropped
 * or pasted), or choose one from the media library. The description is asked
 * for first because every published image needs one (MED 003) and the library
 * stores it with the upload; the caption and size are optional.
 */
export function InsertImageDialog({ initialFile = null, existing = null, onCancel, onInsert }: Props) {
  const [file, setFile] = useState<File | null>(initialFile);
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [description, setDescription] = useState(existing?.alt ?? '');
  const [caption, setCaption] = useState(existing?.caption ?? '');
  const [size, setSize] = useState<FigureSize>(existing?.size ?? 'normal');
  const [state, setState] = useState<UploadState>({ kind: 'idle' });
  const [picking, setPicking] = useState(false);
  const [triedInsert, setTriedInsert] = useState(false);
  const { can } = useCapabilities();
  const mayUpload = can(PERMISSION.mediaUpload);
  const mayChoose = can(PERMISSION.mediaView);

  const previewSrc = asset ? (variantUrl(asset, 800) ?? '') : (existing?.src ?? '');
  const readyToInsert = Boolean(description.trim()) && (asset !== null || existing !== null);
  const busy = state.kind === 'uploading' || state.kind === 'processing';

  const upload = async () => {
    if (!file) return;
    if (!description.trim()) {
      setTriedInsert(true);
      return;
    }
    setState({ kind: 'uploading', percent: 0 });
    try {
      const api = mediaApi();
      let uploaded = await uploadImage(file, description.trim(), api, (percent) => setState({ kind: 'uploading', percent }));
      setState({ kind: 'processing' });
      for (let attempt = 0; uploaded.status === 'quarantined' && attempt < PROCESSING_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        uploaded = await api.get(uploaded.id);
      }
      if (uploaded.status !== 'ready' || !variantUrl(uploaded)) {
        setState({
          kind: 'failed',
          message:
            uploaded.status === 'rejected'
              ? 'That file could not be used as an image. Try a JPEG, PNG or WebP picture.'
              : 'The picture was uploaded but is still being prepared. It will appear in the media library when processing finishes — choose it from there then.',
        });
        return;
      }
      setAsset(uploaded);
      setState({ kind: 'idle' });
    } catch (error) {
      setState({ kind: 'failed', message: isApiError(error) ? error.userMessage : 'The upload did not finish. Try again.' });
    }
  };

  const insert = async () => {
    setTriedInsert(true);
    if (!readyToInsert) return;
    // The rendition follows the size, including when an image already in the article changes size.
    let chosen = asset;
    if (!chosen && existing?.mediaId && existing.size !== size) chosen = await mediaApi().get(existing.mediaId).catch(() => null);
    const src = chosen ? (variantUrl(chosen, size === 'wide' ? 1600 : 800) ?? variantUrl(chosen) ?? existing?.src ?? '') : (existing?.src ?? '');
    onInsert({ src, alt: description.trim(), mediaId: chosen?.id ?? existing?.mediaId ?? null, caption: caption.trim(), size });
  };

  return (
    <Modal open title={existing ? 'Image settings' : 'Add an image'} okText={existing ? 'Update image' : 'Insert image'} onOk={() => void insert()} okButtonProps={{ disabled: busy }} onCancel={onCancel} destroyOnHidden width={620}>
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        <div>
          <label htmlFor="figure-description" style={{ display: 'block', fontWeight: 500, marginBottom: 4 }}>
            Image description <span aria-hidden="true">*</span>
          </label>
          <Input
            id="figure-description"
            value={description}
            maxLength={255}
            placeholder="e.g. The Adelaide Oval footbridge lit up at dusk"
            status={triedInsert && !description.trim() ? 'error' : undefined}
            aria-required="true"
            aria-describedby="figure-description-help"
            onChange={(event) => setDescription(event.target.value)}
          />
          <Typography.Text id="figure-description-help" type={triedInsert && !description.trim() ? 'danger' : 'secondary'} style={{ fontSize: 12.5 }}>
            What the picture shows, read aloud to people who cannot see it.
          </Typography.Text>
        </div>

        {!existing && !asset && (
          <>
            {mayUpload && (
            <Upload.Dragger
              accept="image/png,image/jpeg,image/webp"
              multiple={false}
              showUploadList={false}
              disabled={busy}
              beforeUpload={(chosen) => {
                setFile(chosen);
                setState({ kind: 'idle' });
                return false;
              }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined aria-hidden="true" />
              </p>
              <p className="ant-upload-text">{file ? file.name : 'Drop a picture here, or click to choose one'}</p>
              <p className="ant-upload-hint">JPEG, PNG or WebP.</p>
            </Upload.Dragger>
            )}
            <Space wrap>
              {mayUpload && (
                <Button type="primary" onClick={() => void upload()} disabled={!file || busy} loading={busy}>
                  {state.kind === 'processing' ? 'Preparing the picture…' : 'Upload this picture'}
                </Button>
              )}
              {mayChoose && (
                <Button icon={<PictureOutlined aria-hidden="true" />} onClick={() => setPicking(true)} disabled={busy}>
                  Choose from the media library
                </Button>
              )}
            </Space>
            {!mayUpload && !mayChoose && <Alert type="info" showIcon message="Adding a picture needs access to upload media or to the Media library." />}
            {state.kind === 'uploading' && <Progress percent={state.percent} size="small" aria-label="Upload progress" />}
            {state.kind === 'failed' && <Alert type="warning" showIcon message={state.message} />}
          </>
        )}

        {previewSrc && (asset || existing) && (
          <img src={previewSrc} alt="" style={{ width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 8, border: `1px solid ${brand.border}` }} />
        )}

        <div>
          <label htmlFor="figure-caption" style={{ display: 'block', fontWeight: 500, marginBottom: 4 }}>
            Caption (optional)
          </label>
          <Input id="figure-caption" value={caption} maxLength={200} placeholder="Shown under the picture" onChange={(event) => setCaption(event.target.value)} />
        </div>

        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 4 }} id="figure-size-label">
            Size
          </Typography.Text>
          <Radio.Group
            aria-labelledby="figure-size-label"
            value={size}
            onChange={(event) => setSize(event.target.value)}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'wide', label: 'Full width' },
            ]}
            optionType="button"
          />
        </div>
      </Space>

      {picking && (
        <MediaPicker
          open
          onCancel={() => setPicking(false)}
          onPick={(assets: MediaAsset[]) => {
            const chosen = assets[0];
            setPicking(false);
            if (!chosen) return;
            setAsset(chosen);
            if (!description.trim() && chosen.altText) setDescription(chosen.altText);
          }}
        />
      )}
    </Modal>
  );
}
