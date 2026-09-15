import { useEffect } from 'react';
import { App, Button, Form, Input, Space, Typography } from 'antd';
import { CopyOutlined, ExportOutlined, FilePdfOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router';
import { readableFileSize } from '@adelaide-sphere/domain';
import { mediaApi, type MediaAsset } from '@/api/media';
import { RecordEditorPage, RecordMetadata, SectionCard, StatusTag } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { useRecordEditor } from '@/shared/useRecordEditor';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { USAGE_LABELS } from './media-usage-labels';

interface Values {
  title: string;
}

const LIST_HREF = '/media?kind=document';

/**
 * One PDF document (change log 1.16): its title, which is what visitors see
 * when it is linked; its public link; and
 * every page, article or menu that links it, which is also why it cannot be
 * deleted while any remain.
 */
export function DocumentDetail({ asset }: { asset: MediaAsset }) {
  const api = mediaApi();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { can } = useCapabilities();
  const mayUpdate = can(PERMISSION.mediaUpdate);
  const [form] = Form.useForm<Values>();
  const { saving, error, submit } = useRecordEditor<Values>(form);

  useEffect(() => {
    form.setFieldsValue({ title: asset.title ?? '' });
  }, [asset, form]);

  const save = () =>
    submit(async (values) => {
      await api.update(asset.id, { expectedVersion: asset.version, title: values.title.trim() });
      message.success('Document saved');
    }).then((ok) => {
      if (ok) navigate(LIST_HREF);
    });

  const copy = async () => {
    if (!asset.documentUrl) return;
    try {
      await navigator.clipboard.writeText(asset.documentUrl);
      message.success('Link copied');
    } catch {
      message.error('The link could not be copied');
    }
  };

  const name = asset.title ?? asset.sourceName;

  return (
    <RecordEditorPage<Values>
      crumbs={[{ label: 'Editorial' }, { label: 'Media library', href: LIST_HREF }, { label: name }]}
      title={name}
      description="The title is what visitors see when this document is linked."
      listHref={LIST_HREF}
      listLabel="All documents"
      form={form}
      saving={saving}
      error={error}
      status={`Version ${asset.version} · uploaded ${formatDateTime(asset.createdAt)}`}
      readOnlyReason={!mayUpdate ? 'You can view this document but not change its title.' : null}
      onSubmit={save}
      aside={
        <div style={{ display: 'grid', gap: 20 }}>
          <SectionCard title="This document" description="What was uploaded, and whether it passed the checks.">
            <div className="ms-doc-summary">
              <span className="ms-doc-row__icon" aria-hidden="true">
                <FilePdfOutlined />
              </span>
              <div>
                <Typography.Text strong style={{ display: 'block' }}>
                  {asset.sourceName}
                </Typography.Text>
                <StatusTag status={asset.status} label={asset.status === 'quarantined' ? 'upload not finished' : asset.status === 'rejected' ? 'not accepted' : 'ready'} />
              </div>
            </div>
            <RecordMetadata
              items={[
                { label: 'Size', value: readableFileSize(asset.bytes) },
                { label: 'Pages', value: asset.pageCount ? String(asset.pageCount) : 'Not known' },
                { label: 'Uploaded', value: formatDateTime(asset.createdAt) },
              ]}
            />
            {asset.rejectionReason && (
              <Typography.Paragraph type="danger" style={{ marginTop: 12, marginBottom: 0 }}>
                {asset.rejectionReason}
              </Typography.Paragraph>
            )}
          </SectionCard>

          {asset.documentUrl && (
            <SectionCard title="Public link" description="Downloads the PDF. Paste it anywhere, or add it from the editor or menu builder so it is tracked.">
              <Space.Compact style={{ width: '100%' }}>
                <Input readOnly value={asset.documentUrl} aria-label="Public link to this document" onFocus={(event) => event.target.select()} />
                <Button icon={<CopyOutlined aria-hidden="true" />} onClick={() => void copy()}>
                  Copy
                </Button>
              </Space.Compact>
              <Button type="link" icon={<ExportOutlined aria-hidden="true" />} href={asset.documentUrl} target="_blank" rel="noopener noreferrer" style={{ paddingInline: 0, marginTop: 8 }}>
                Open the PDF
              </Button>
            </SectionCard>
          )}

          <SectionCard title="Where it is linked" description="A document cannot be deleted while anything links it.">
            {asset.usages.length === 0 ? (
              <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                Nothing links this document yet. Unused documents are removed 30 days after they become ready.
              </Typography.Paragraph>
            ) : (
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {asset.usages.map((usage) => {
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
      }
    >
      <Form.Item label="Title" name="title" extra="Shown as the link text when the document is added to an article, a page or a menu." rules={[{ required: true, whitespace: true, message: 'Give the document a title' }]}>
        <Input maxLength={180} showCount />
      </Form.Item>
    </RecordEditorPage>
  );
}
