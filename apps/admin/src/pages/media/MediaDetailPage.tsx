import { useEffect, useState } from 'react';
import { App, Form, Input, Space, Typography } from 'antd';
import { Link, useNavigate, useParams } from 'react-router';
import { mediaApi, variantUrl, type MediaAsset } from '@/api/media';
import { FocalPointPicker } from '@/components/FocalPointPicker';
import { RecordEditorPage, RecordMetadata, SectionCard, StatusTag } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { useAsync } from '@/shared/useAsync';
import { useRecordEditor } from '@/shared/useRecordEditor';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { brand } from '@/config/theme';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { DocumentDetail } from './DocumentDetail';
import { USAGE_LABELS } from './media-usage-labels';

interface Values {
  altText: string;
  credit: string;
}

/** Bytes an administrator can read, rather than a number they have to divide. */
function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


/**
 * One image's details (SRS MED 003). Alt text, credit and rights live on a page
 * beside the image itself, because judging whether a description is accurate
 * means looking at the picture while typing — which a dialog over the grid did
 * not allow.
 *
 * The focal point is set by clicking the picture rather than by typing two
 * numbers, and "used in 3 places" is replaced by the three places, because the
 * count is only useful when it is zero.
 */
export function MediaDetailPage() {
  const { id = '' } = useParams();
  const api = mediaApi();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { can } = useCapabilities();
  const mayUpdate = can(PERMISSION.mediaUpdate);
  const [form] = Form.useForm<Values>();
  const { saving, error, submit } = useRecordEditor<Values>(form);
  const [state, reload] = useAsync((signal) => api.get(id, signal), [id]);
  const asset: MediaAsset | null = state.status === 'ready' ? state.data : null;
  // The stored point is derived from the record; state holds only the change the
  // reader has made, so loading a record never has to write state from an effect.
  const [focalEdit, setFocalEdit] = useState<{ x: number; y: number } | null>(null);
  useDocumentTitle(asset?.sourceName ?? 'Image');

  useEffect(() => {
    if (asset) form.setFieldsValue({ altText: asset.altText ?? '', credit: asset.credit ?? '' });
  }, [asset, form]);

  // A PDF has a title, a link and a scan result rather than a picture to describe (change log 1.16).
  if (asset?.kind === 'document') return <DocumentDetail asset={asset} />;

  const storedFocal = asset && asset.focalX !== null && asset.focalY !== null ? { x: asset.focalX, y: asset.focalY } : null;
  const focal = focalEdit ?? storedFocal;

  const save = () =>
    submit(async (values) => {
      if (!asset) return;
      await api.update(asset.id, {
        expectedVersion: asset.version,
        altText: values.altText || null,
        credit: values.credit || null,
        ...(focal ? { focalX: focal.x, focalY: focal.y } : {}),
      });
      message.success('Image details saved');
    }).then((ok) => {
      if (ok) navigate('/media');
    });

  const preview = asset ? variantUrl(asset, 640) : null;
  const usages = asset?.usages ?? [];

  return (
    <RecordEditorPage<Values>
      crumbs={[{ label: 'Editorial' }, { label: 'Media library', href: '/media' }, { label: asset?.sourceName ?? 'Image' }]}
      title={asset?.sourceName ?? 'Image'}
      description="Describe what matters in the picture, not the file name."
      listHref="/media"
      listLabel="All images"
      form={form}
      loading={state.status === 'loading'}
      saving={saving}
      dirty={focalEdit !== null || undefined}
      error={error ?? (state.status === 'error' ? state.message : null)}
      status={asset ? `Version ${asset.version} · uploaded ${formatDateTime(asset.createdAt)}` : undefined}
      readOnlyReason={!mayUpdate ? 'You can view this image but not change its details.' : null}
      onSubmit={save}
      aside={
        asset ? (
          <div style={{ display: 'grid', gap: 20 }}>
            <SectionCard title="This image" description="How it was uploaded and what the site made from it.">
              {preview ? (
                <img src={preview} alt={asset.altText ?? ''} style={{ width: '100%', borderRadius: 10, marginBottom: 12 }} />
              ) : (
                <div style={{ aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', background: brand.placeholderFill, color: brand.textMuted, borderRadius: 10, marginBottom: 12 }}>
                  Still being processed
                </div>
              )}
              <Space size={8} wrap style={{ marginBottom: 10 }}>
                <StatusTag status={asset.status} />
              </Space>
              <RecordMetadata
                items={[
                  { label: 'Size', value: asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'Not known yet' },
                  { label: 'File', value: fileSize(asset.bytes) },
                  { label: 'Uploaded', value: formatDateTime(asset.createdAt) },
                ]}
              />
              {asset.variants.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                    Sizes the site serves:
                  </Typography.Text>
                  <RecordMetadata items={asset.variants.map((variant) => ({ label: variant.kind, value: `${variant.width} × ${variant.height}` }))} />
                </div>
              )}
              {asset.rejectionReason && (
                <Typography.Paragraph type="danger" style={{ marginTop: 12, marginBottom: 0 }}>
                  {asset.rejectionReason}
                </Typography.Paragraph>
              )}
            </SectionCard>

            <SectionCard title="Where it is used" description="An image cannot be deleted while something still shows it.">
              {usages.length === 0 ? (
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  Nothing was using this image when the page was opened. It can be deleted from the library.
                </Typography.Paragraph>
              ) : (
                <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                  {usages.map((usage) => {
                    const kind = USAGE_LABELS[usage.kind];
                    return (
                      <li key={`${usage.kind}:${usage.id}`} style={{ marginBottom: 4 }}>
                        {kind ? <Link to={kind.href(usage.id)}>{usage.label}</Link> : usage.label}{' '}
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {kind?.what ?? usage.kind}
                        </Typography.Text>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          </div>
        ) : undefined
      }
    >
      <Form.Item label="Alt text" name="altText" extra="Describe what the picture shows. Required before it can be used on a page.">
        <Input maxLength={255} showCount placeholder="e.g. A barista pouring milk into a takeaway cup" />
      </Form.Item>
      <Form.Item label="Credit" name="credit" extra="Shown with the image where the licence requires it.">
        <Input maxLength={255} placeholder="e.g. Photograph by Sam Lee" />
      </Form.Item>
      {preview && (
        <Form.Item
          label="Focal point"
          extra="Click the part that must stay in frame when cropped. Arrow keys work too."
          style={{ marginBottom: 0 }}
        >
          <FocalPointPicker
            src={preview}
            alt={asset?.altText ?? ''}
            x={focal?.x}
            y={focal?.y}
            onChange={setFocalEdit}
          />
        </Form.Item>
      )}

      {state.status === 'error' && (
        <Typography.Link onClick={reload} style={{ display: 'inline-block', marginTop: 12 }}>
          Try loading this image again
        </Typography.Link>
      )}
    </RecordEditorPage>
  );
}
