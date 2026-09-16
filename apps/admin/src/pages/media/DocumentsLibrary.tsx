import { useRef, useState } from 'react';
import { Alert, App, Button, Form, Input, Progress, Select, Space, Typography } from 'antd';
import { CopyOutlined, DeleteOutlined, ExportOutlined, FilePdfOutlined, UploadOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { Link } from 'react-router';
import { readableFileSize } from '@adelaide-sphere/domain';
import { DOCUMENT_UPLOAD_RULES, localDocumentProblem, mediaApi, titleFromFileName, uploadFile, type MediaAsset, type MediaStatus } from '@/api/media';
import { isApiError } from '@/api/errors';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { ErrorState, ListEmpty, PageLoader, SectionCard, StatusTag, TableCard } from '@/components/ui';
import { useListParams } from '@/shared/useListParams';
import { formatDateTime } from '@/shared/format';
import { PERMISSION } from '@/auth/permissions';
import { useCapabilities } from '@/auth/access-control';

const FILTERS = ['q', 'status'] as const;

/** A document is published as its upload completes, so "quarantined" only means an upload that never finished. */
const STATUS_LABELS: Record<MediaStatus, string> = { quarantined: 'upload not finished', ready: 'ready', rejected: 'not accepted' };

/**
 * PDF documents in the media library (change log 1.16). A document is uploaded
 * with a title, checked from its bytes and published straight away as a
 * download — or refused, and the list says why.
 *
 * Uploading needs its own permission; viewing, copying a link and deleting use
 * the Media library's.
 */
export function DocumentsLibrary() {
  const api = mediaApi();
  const { message, modal } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const list = useListParams(FILTERS);
  const status = (list.get('status') as MediaStatus | null) ?? undefined;
  const q = list.get('q') ?? '';
  const page = list.page;
  const { can } = useCapabilities();
  const mayUpload = can(PERMISSION.mediaDocumentsUpload);
  const mayDelete = can(PERMISSION.mediaDelete);

  const [state, reload] = useAsync(
    (signal) => api.list({ kind: 'document', status, q: q || undefined, page, pageSize: 20 }, signal),
    [status, q, page],
  );

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [form] = Form.useForm<{ title: string }>();

  const choose = (file: File | undefined) => {
    if (!file) return;
    const problem = localDocumentProblem(file);
    setUploadError(problem);
    setPendingFile(problem ? null : file);
    if (!problem) form.setFieldsValue({ title: titleFromFileName(file.name) });
  };

  const upload = async () => {
    if (!pendingFile) return;
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setUploading(true);
    setProgress(0);
    setUploadError(null);
    try {
      const asset = await uploadFile(pendingFile, { title: values.title.trim() }, api, setProgress);
      if (asset.status === 'rejected') setUploadError(asset.rejectionReason ?? 'That document was not accepted');
      else {
        message.success('Uploaded. The document is ready to link.');
        setPendingFile(null);
        form.resetFields();
        if (fileInput.current) fileInput.current.value = '';
      }
      reload();
    } catch (error) {
      if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
      else setUploadError(errorMessage(error));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const copyLink = async (asset: MediaAsset) => {
    if (!asset.documentUrl) return;
    try {
      await navigator.clipboard.writeText(asset.documentUrl);
      message.success('Link copied');
    } catch {
      message.error('The link could not be copied');
    }
  };

  const remove = (asset: MediaAsset) => {
    modal.confirm({
      title: 'Delete this document?',
      content:
        asset.usages.length > 0 ? (
          <>
            <Typography.Paragraph style={{ marginBottom: 8 }}>It cannot be deleted while it is still linked from:</Typography.Paragraph>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {asset.usages.map((usage) => (
                <li key={`${usage.kind}:${usage.id}`}>{usage.label}</li>
              ))}
            </ul>
          </>
        ) : (
          'The PDF and its public link are removed. Anyone who saved the link will no longer be able to open it.'
        ),
      okText: 'Delete document',
      cancelText: 'Keep document',
      okButtonProps: { danger: true, disabled: asset.usages.length > 0 },
      onOk: async () => {
        try {
          await api.remove(asset.id);
          message.success('Document deleted');
          reload();
        } catch (error) {
          if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
          else message.error(errorMessage(error));
        }
      },
    });
  };

  const documents = state.status === 'ready' ? state.data.data : [];

  return (
    <div>
      {mayUpload && (
        <SectionCard title="Add a document" description={DOCUMENT_UPLOAD_RULES}>
          <div
            className={`as-doc-drop${dragging ? ' is-dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!uploading) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              if (!uploading) choose(event.dataTransfer.files?.[0]);
            }}
          >
            <FilePdfOutlined aria-hidden="true" className="as-doc-drop__icon" />
            <Typography.Paragraph style={{ margin: '6px 0 12px' }}>Drop a PDF here, or choose one from your computer.</Typography.Paragraph>
            <input id="document-file" ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-label="PDF to upload" onChange={(event) => choose(event.target.files?.[0])} />
            <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
              Choose a PDF
            </Button>
          </div>

          {pendingFile && (
            <Form form={form} layout="vertical" requiredMark={false} style={{ maxWidth: 560, marginTop: 16 }}>
              <Typography.Paragraph style={{ marginBottom: 12 }}>
                <strong>{pendingFile.name}</strong> <Typography.Text type="secondary">({readableFileSize(pendingFile.size)})</Typography.Text>
              </Typography.Paragraph>
              <Form.Item label="Title" name="title" extra="What visitors see when the document is linked from a page, an article or a menu." rules={[{ required: true, whitespace: true, message: 'Give the document a title' }]}>
                <Input maxLength={180} showCount placeholder="e.g. Business listing price list 2026" />
              </Form.Item>
              {uploading && <Progress percent={progress} status="active" format={(percent) => (percent === 100 ? 'Checking and publishing…' : `${percent}%`)} style={{ marginBottom: 12 }} />}
              <Space wrap>
                <Button type="primary" icon={<UploadOutlined aria-hidden="true" />} loading={uploading} onClick={() => void upload()}>
                  Upload document
                </Button>
                <Button
                  disabled={uploading}
                  onClick={() => {
                    setPendingFile(null);
                    form.resetFields();
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                >
                  Cancel
                </Button>
              </Space>
            </Form>
          )}
          {uploadError && <Alert type="error" showIcon role="alert" message={uploadError} style={{ marginTop: 12 }} />}
        </SectionCard>
      )}

      <TableCard
        toolbar={
          <>
            <Select
              aria-label="Filter by status"
              allowClear
              placeholder="All statuses"
              value={status}
              onChange={(value) => list.set('status', value)}
              style={{ width: 190 }}
              options={(['quarantined', 'ready', 'rejected'] as MediaStatus[]).map((value) => ({ value, label: STATUS_LABELS[value] }))}
            />
            <Input.Search allowClear aria-label="Search documents" placeholder="Search by title or file name" defaultValue={q} onSearch={(value) => list.set('q', value.trim() || undefined)} style={{ width: 260 }} />
          </>
        }
        actions={<Button onClick={reload}>Refresh</Button>}
        summary={state.status === 'ready' ? `${documents.length} of ${state.data.meta.total} document${state.data.meta.total === 1 ? '' : 's'}` : undefined}
      >
        {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
        {state.status === 'loading' && <PageLoader label="Loading documents…" />}
        {state.status === 'ready' && documents.length === 0 && (
          <div style={{ padding: 16 }}>
            <ListEmpty state={state} filtered={list.filtered} noun="documents" onClear={list.clear} empty={{ title: 'No documents yet', description: 'PDFs you add appear here, ready to link from pages, articles and menus.' }} />
          </div>
        )}
        {documents.length > 0 && (
          <ul className="as-doc-list">
            {documents.map((asset) => (
              <li key={asset.id} className={`as-doc-row${asset.status === 'rejected' ? ' is-rejected' : ''}`}>
                <span className="as-doc-row__icon" aria-hidden="true">
                  <FilePdfOutlined />
                </span>
                <div className="as-doc-row__body">
                  <Link to={`/media/${asset.id}`} className="as-doc-row__title">
                    {asset.title ?? asset.sourceName}
                  </Link>
                  <p className="as-doc-row__meta">
                    {[asset.sourceName, readableFileSize(asset.bytes), asset.pageCount ? `${asset.pageCount} page${asset.pageCount === 1 ? '' : 's'}` : null, `added ${formatDateTime(asset.createdAt)}`].filter(Boolean).join(' · ')}
                  </p>
                  {asset.rejectionReason && <p className="as-doc-row__reason">{asset.rejectionReason}</p>}
                </div>
                <div className="as-doc-row__state">
                  <StatusTag status={asset.status} label={STATUS_LABELS[asset.status]} />
                  {asset.usages.length > 0 && (
                    <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                      Linked in {asset.usages.length} place{asset.usages.length === 1 ? '' : 's'}
                    </Typography.Text>
                  )}
                </div>
                <div className="as-doc-row__actions">
                  {asset.documentUrl && (
                    <>
                      <Button size="small" icon={<CopyOutlined aria-hidden="true" />} onClick={() => void copyLink(asset)}>
                        Copy link
                      </Button>
                      <Button size="small" icon={<ExportOutlined aria-hidden="true" />} href={asset.documentUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${asset.title ?? asset.sourceName} in a new tab`}>
                        Open
                      </Button>
                    </>
                  )}
                  {mayDelete && <Button size="small" type="text" danger icon={<DeleteOutlined aria-hidden="true" />} aria-label={`Delete ${asset.title ?? asset.sourceName}`} onClick={() => remove(asset)} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </TableCard>

      {state.status === 'ready' && state.data.meta.pageCount > 1 && (
        <Space style={{ marginTop: 16 }}>
          <Button disabled={page <= 1} onClick={() => list.set('page', String(page - 1))}>
            Previous
          </Button>
          <Typography.Text>
            Page {state.data.meta.page} of {state.data.meta.pageCount}
          </Typography.Text>
          <Button disabled={page >= state.data.meta.pageCount} onClick={() => list.set('page', String(page + 1))}>
            Next
          </Button>
        </Space>
      )}
    </div>
  );
}
