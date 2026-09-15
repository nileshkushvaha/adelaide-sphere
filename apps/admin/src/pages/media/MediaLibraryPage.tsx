import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Alert, App, Button, Form, Input, Progress, Segmented, Select, Space, Typography } from 'antd';
import { DeleteOutlined, FilePdfOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { Link } from 'react-router';
import { ALLOWED_TYPES, MEDIA_STATUSES, UPLOAD_RULES, localFileProblem, mediaApi, uploadImage, variantUrl, type MediaAsset, type MediaStatus } from '@/api/media';
import { isApiError } from '@/api/errors';
import { errorMessage, useAsync } from '@/shared/useAsync';
import { ErrorState, ListEmpty, PageHeader, PageLoader, SectionCard, StatusTag, TableCard } from '@/components/ui';
import { useListParams } from '@/shared/useListParams';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { brand } from '@/config/theme';
import { PERMISSION } from '@/auth/permissions';
import { useCapabilities } from '@/auth/access-control';
import { WorkerStoppedAlert } from '@/components/WorkerStoppedAlert';
import { DocumentsLibrary } from './DocumentsLibrary';

/** Processing takes seconds; longer than this means something is not running. */
const WAITING_TOO_LONG_MS = 2 * 60 * 1000;

const STATUS_LABELS: Record<MediaStatus, string> = { quarantined: 'processing', ready: 'ready', rejected: 'rejected' };

/** The parameters that narrow this list; everything else is sort or page. */
const FILTERS = ['q', 'status'] as const;

/**
 * Media library (SRS MED 001–004, change log 1.16): images and PDF documents,
 * one at a time behind a switch that lives in the address, so a link to the
 * documents opens on the documents.
 */
export function MediaLibraryPage() {
  useDocumentTitle('Media library');
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') === 'document' ? 'document' : 'image';
  return (
    <div>
      <PageHeader crumbs={[{ label: 'Editorial' }, { label: 'Media library' }]} title="Media library" description="Images used on listings and articles, and PDF documents linked from pages, articles and menus." />
      <Segmented
        aria-label="Show images or documents"
        value={kind}
        // Switching starts the other list afresh: filters and page belong to the list they were set on.
        onChange={(value) => setParams(value === 'document' ? { kind: 'document' } : {})}
        options={[
          { value: 'image', label: <span><PictureOutlined aria-hidden="true" /> Images</span> },
          { value: 'document', label: <span><FilePdfOutlined aria-hidden="true" /> Documents</span> },
        ]}
        style={{ marginBottom: 20 }}
      />
      {kind === 'document' ? <DocumentsLibrary /> : <ImagesLibrary />}
    </div>
  );
}

/**
 * Images. Uploads go straight to storage through a signed URL; the API
 * validates the bytes and the worker publishes the renditions, so an image only
 * becomes usable once it is processed.
 */
function ImagesLibrary() {
  const api = mediaApi();
  const { message, modal } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const list = useListParams(FILTERS);
  const status = (list.get('status') as MediaStatus | null) ?? undefined;
  const page = list.page;
  const { can } = useCapabilities();
  const mayViewQueues = can(PERMISSION.systemQueuesView);
  const mayUpload = can(PERMISSION.mediaUpload);
  const mayDelete = can(PERMISSION.mediaDelete);

  const [state, reload] = useAsync(
    // The clock is read where the data is fetched, not while rendering: a render
    // that reads the time answers differently every time React calls it.
    async (signal) => ({ ...(await api.list({ kind: 'image', status, page, pageSize: 24, q: list.get('q') ?? undefined }, signal)), loadedAt: Date.now() }),
    [status, page, list.get('q')],
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadForm] = Form.useForm<{ altText: string }>();


  const handleError = (error: unknown, setter: (msg: string) => void) => {
    if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
    else setter(errorMessage(error));
  };

  const onFileChosen = (file: File | undefined) => {
    if (!file) return;
    const problem = localFileProblem(file);
    setUploadError(problem);
    setPendingFile(problem ? null : file);
    if (!problem) uploadForm.setFieldsValue({ altText: '' });
  };

  const startUpload = async () => {
    if (!pendingFile) return;
    const values = await uploadForm.validateFields().catch(() => null);
    if (!values) return;
    setUploading(true);
    setProgress(0);
    setUploadError(null);
    try {
      const asset = await uploadImage(pendingFile, values.altText, api, setProgress);
      if (asset.status === 'rejected') message.error(asset.rejectionReason ?? 'That image was rejected');
      else message.success('Uploaded. Processing usually takes a few seconds.');
      setPendingFile(null);
      uploadForm.resetFields();
      if (fileInput.current) fileInput.current.value = '';
      reload();
    } catch (error) {
      handleError(error, setUploadError);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const remove = (asset: MediaAsset) => {
    modal.confirm({
      title: 'Delete this image?',
      content:
        asset.usages.length > 0 ? (
          <>
            <Typography.Paragraph style={{ marginBottom: 8 }}>It cannot be deleted while it is still in use:</Typography.Paragraph>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {asset.usages.map((usage) => (
                <li key={`${usage.kind}:${usage.id}`}>{usage.label}</li>
              ))}
            </ul>
            <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              Remove it from those first.
            </Typography.Paragraph>
          </>
        ) : (
          'The image and every size the site made from it are removed. This cannot be undone.'
        ),
      okText: 'Delete image',
      cancelText: 'Keep image',
      okButtonProps: { danger: true, disabled: asset.usages.length > 0 },
      onOk: async () => {
        try {
          await api.remove(asset.id);
          message.success('Image deleted');
          reload();
        } catch (error) {
          handleError(error, (msg) => message.error(msg));
        }
      },
    });
  };

  const assets = state.status === 'ready' ? state.data.data : [];
  /**
   * Images that have been waiting longer than processing takes. The clock is
   * read once per load rather than during render — a render that reads the time
   * gives a different answer every time React calls it.
   */
  const waiting = useMemo(() => {
    if (state.status !== 'ready') return [];
    const cutoff = state.data.loadedAt - WAITING_TOO_LONG_MS;
    return state.data.data.filter((asset) => asset.status === 'quarantined' && new Date(asset.createdAt).getTime() < cutoff);
  }, [state]);

  return (
    <div>
      {mayUpload && (
      <SectionCard title="Add an image" description={`${UPLOAD_RULES} Location data is removed and the site makes its own sizes.`}>
        {/* Drop target and file picker are the same control: dropping is a
            convenience, and the button is what makes it reachable from the
            keyboard (WCAG 2.1.1). */}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!uploading) onFileChosen(event.dataTransfer.files?.[0]);
          }}
          style={{
            border: `2px dashed ${dragging ? brand.primary : brand.border}`,
            background: dragging ? brand.primarySofter : brand.surfaceMuted,
            borderRadius: 12,
            padding: '20px 16px',
            textAlign: 'center',
            marginBottom: pendingFile || uploadError ? 16 : 0,
          }}
        >
          <UploadOutlined aria-hidden="true" style={{ fontSize: 22, color: brand.textMuted }} />
          <Typography.Paragraph style={{ margin: '8px 0 12px' }}>
            Drop an image here, or choose one from your computer.
          </Typography.Paragraph>
          {/* The visible button is the one keyboard stop; this input is what it
              opens. It is named anyway, and taken out of the tab order, so a
              keyboard user does not meet an unnamed second control for the same
              action (WCAG 4.1.2, 2.4.3). */}
          <input
            id="media-file"
            ref={fileInput}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-label="Image to upload"
            onChange={(e) => onFileChosen(e.target.files?.[0])}
          />
          <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
            Choose an image
          </Button>
        </div>

        {pendingFile && (
          <Form form={uploadForm} layout="vertical" style={{ maxWidth: 520 }}>
            <Typography.Paragraph style={{ marginBottom: 12 }}>
              <strong>{pendingFile.name}</strong>{' '}
              <Typography.Text type="secondary">({Math.max(1, Math.round(pendingFile.size / 1024))} KB)</Typography.Text>
            </Typography.Paragraph>
            <Form.Item
              label="Alt text"
              name="altText"
              extra="What the picture shows. Required before the image can be used."
              rules={[{ required: true, message: 'Describe the image before uploading it' }]}
            >
              <Input maxLength={255} showCount placeholder="e.g. A barista pouring milk into a takeaway cup" />
            </Form.Item>
            {uploading && (
              <Progress
                percent={progress}
                status={progress === 100 ? 'active' : 'normal'}
                format={(percent) => (percent === 100 ? 'Checking the image…' : `${percent}%`)}
                style={{ marginBottom: 12 }}
              />
            )}
            <Space wrap>
              <Button type="primary" icon={<UploadOutlined aria-hidden="true" />} loading={uploading} onClick={() => void startUpload()}>
                Upload image
              </Button>
              <Button
                disabled={uploading}
                onClick={() => {
                  setPendingFile(null);
                  setUploadError(null);
                  if (fileInput.current) fileInput.current.value = '';
                }}
              >
                Choose a different image
              </Button>
            </Space>
          </Form>
        )}
        {uploadError && <Alert type="error" showIcon role="alert" message={uploadError} style={{ marginTop: 12 }} />}
      </SectionCard>
      )}
      {/* An upload waits until the background worker makes its sizes. When
          nothing is consuming the queue that wait never ends, so the screen says
          so; otherwise, a slow wait still gets a softer hint. */}
      <WorkerStoppedAlert
        consequence="Images already uploaded are kept and will be prepared once it is running again; they cannot be used on a page until then."
        otherwise={
          waiting.length > 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 20 }}
              message={`${waiting.length} image${waiting.length === 1 ? '' : 's'} waiting longer than expected`}
              description={
                <>
                  This usually takes a few seconds; a long wait can mean background processing has stopped.{' '}
                  {mayViewQueues && <Link to="/system/queues">Check background processing</Link>}
                </>
              }
            />
          )
        }
      />

      <TableCard
        toolbar={
          <>
            <Select
              aria-label="Filter by status"
              allowClear
              placeholder="All statuses"
              value={status}
              onChange={(v) => list.set('status', v)}
              style={{ width: 190 }}
              options={MEDIA_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            />
            <Input.Search
              allowClear
              aria-label="Search images by name"
              placeholder="Search by file name"
              defaultValue={list.get('q') ?? ''}
              onSearch={(value) => list.set('q', value.trim() || undefined)}
              style={{ width: 240 }}
            />
          </>
        }
        actions={<Button onClick={reload}>Refresh</Button>}
        summary={state.status === 'ready' ? `${assets.length} of ${state.data.meta.total} image${state.data.meta.total === 1 ? '' : 's'}` : undefined}
      >
        <div style={{ padding: 16 }}>
          {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
          {/* The library is a grid rather than a table, so it says this itself
              rather than through a table's empty slot — but it must still tell
              "nothing here yet" apart from "nothing matches what you asked
              for", which it did not: a search with no hits claimed the library
              was empty. */}
          {state.status === 'loading' && <PageLoader label="Loading images…" />}
          {state.status === 'ready' && assets.length === 0 && (
            <ListEmpty
              state={state}
              filtered={list.filtered}
              noun="images"
              onClear={list.clear}
              empty={{ title: 'No images yet', description: 'Images you add appear here, ready to use on listings and articles.' }}
            />
          )}
          <ul style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', listStyle: 'none', margin: 0, padding: 0 }}>
            {assets.map((asset) => {
              const preview = variantUrl(asset, 320);
              return (
                <li key={asset.id}>
                  <div style={{ border: `1px solid ${brand.border}`, borderRadius: 12, overflow: 'hidden', background: brand.surfaceRaised, height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Link to={`/media/${asset.id}`} aria-label={`Details for ${asset.sourceName}`} style={{ display: 'block' }}>
                      {preview ? (
                        <img src={preview} alt={asset.altText ?? ''} style={{ aspectRatio: '4 / 3', objectFit: 'cover', width: '100%', display: 'block' }} />
                      ) : (
                        <div
                          style={{
                            aspectRatio: '4 / 3',
                            display: 'grid',
                            placeItems: 'center',
                            background: brand.surfaceMuted,
                            color: brand.textMuted,
                            fontSize: 13,
                            textAlign: 'center',
                            padding: 12,
                          }}
                        >
                          {asset.status === 'rejected' ? 'Not accepted' : 'Waiting to be processed'}
                        </div>
                      )}
                    </Link>
                    <div style={{ padding: '10px 12px', display: 'grid', gap: 6, flex: 1 }}>
                      <Typography.Text ellipsis title={asset.sourceName} style={{ fontWeight: 500 }}>
                        {asset.sourceName}
                      </Typography.Text>
                      <Space size={6} wrap>
                        <StatusTag status={asset.status} />
                        {asset.width && asset.height && (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {asset.width} × {asset.height}
                          </Typography.Text>
                        )}
                      </Space>
                      {asset.usages.length > 0 && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          Used in {asset.usages.length} place{asset.usages.length === 1 ? '' : 's'}
                        </Typography.Text>
                      )}
                      {!asset.altText && asset.status === 'ready' && (
                        <Typography.Text type="danger" style={{ fontSize: 12 }}>
                          Needs alt text before it can be used
                        </Typography.Text>
                      )}
                      {asset.rejectionReason && (
                        <Typography.Text type="danger" style={{ fontSize: 12 }}>
                          {asset.rejectionReason}
                        </Typography.Text>
                      )}
                    </div>
                    <div style={{ display: 'flex', borderTop: `1px solid ${brand.border}` }}>
                      <Link to={`/media/${asset.id}`} style={{ flex: 1, textAlign: 'center', padding: '8px 0' }}>
                        Details
                      </Link>
                      {mayDelete && (
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined aria-hidden="true" />}
                          aria-label={`Delete ${asset.sourceName}`}
                          onClick={() => remove(asset)}
                          style={{ borderLeft: `1px solid ${brand.border}`, borderRadius: 0, height: 'auto', padding: '8px 16px' }}
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
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
