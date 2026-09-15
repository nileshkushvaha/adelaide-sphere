import { useRef, useState } from 'react';
import { Alert, Button, Empty, Input, Modal, Pagination, Progress, Radio, Skeleton, Space, Typography } from 'antd';
import { FilePdfOutlined, UploadOutlined } from '@ant-design/icons';
import { readableFileSize } from '@adelaide-sphere/domain';
import { DOCUMENT_UPLOAD_RULES, localDocumentProblem, mediaApi, titleFromFileName, uploadFile, type MediaAsset } from '@/api/media';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { errorMessage, useAsync } from '@/shared/useAsync';

export interface DocumentLink {
  mediaId: string;
  href: string;
  text: string;
}

/** "Price list (PDF, 1.2 MB)": the link says what it opens before anyone clicks it. */
function linkText(asset: MediaAsset): string {
  return `${asset.title ?? asset.sourceName} (PDF, ${readableFileSize(asset.bytes)})`;
}

/**
 * Links a PDF from the media library into the text (change log 1.16). Choose a
 * document, or upload one here; it is checked and published as the upload
 * completes. The link records the document's id, so the library knows the document
 * is in use and will not delete it.
 */
export function DocumentPickerDialog({ selectedText, onCancel, onInsert }: { selectedText: string; onCancel: () => void; onInsert: (link: DocumentLink) => void }) {
  const api = mediaApi();
  const { can } = useCapabilities();
  const mayUpload = can(PERMISSION.mediaDocumentsUpload);
  const mayChoose = can(PERMISSION.mediaView);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<MediaAsset | null>(null);
  const [text, setText] = useState(selectedText);
  const [list, reload] = useAsync((signal) => (mayChoose ? api.list({ kind: 'document', status: 'ready', q: query || undefined, page, pageSize: 10 }, signal) : Promise.resolve(null)), [query, page, mayChoose]);

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = (asset: MediaAsset) => {
    setChosen(asset);
    // The selected words stay the link text; otherwise the document names itself.
    if (!selectedText.trim()) setText(linkText(asset));
  };

  const upload = async () => {
    if (!file || !title.trim()) {
      setProblem(file ? 'Give the document a title' : 'Choose a PDF first');
      return;
    }
    setProblem(null);
    setUploading(true);
    try {
      const asset = await uploadFile(file, { title: title.trim() }, api, setPercent);
      if (asset.status !== 'ready') setProblem(asset.rejectionReason ?? 'That document was not accepted');
      else {
        pick(asset);
        setFile(null);
        setTitle('');
        reload();
      }
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setUploading(false);
      setPercent(0);
    }
  };

  const busy = uploading;
  const rows = list.status === 'ready' && list.data ? list.data.data : [];

  return (
    <Modal
      open
      title="Link a document"
      width={640}
      okText="Insert link"
      okButtonProps={{ disabled: !chosen?.documentUrl || !text.trim() || busy }}
      onOk={() => chosen?.documentUrl && onInsert({ mediaId: chosen.id, href: chosen.documentUrl, text: text.trim() })}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {mayChoose ? (
          <div>
            <Input.Search allowClear aria-label="Search documents" placeholder="Search by title or file name" onSearch={(value) => {
                setQuery(value.trim());
                setPage(1);
              }} style={{ marginBottom: 10 }} />
            {list.status === 'loading' && <Skeleton active title={false} paragraph={{ rows: 3 }} />}
            {list.status === 'ready' && rows.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? 'No documents match that search' : 'No documents are ready yet'} />}
            {rows.length > 0 && (
              <Radio.Group value={chosen?.id} onChange={(event) => pick(rows.find((row) => row.id === event.target.value)!)} style={{ width: '100%' }}>
                <ul className="ms-doc-picker">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <Radio value={row.id}>
                        <span className="ms-doc-picker__name">
                          <FilePdfOutlined aria-hidden="true" /> {row.title ?? row.sourceName}
                        </span>
                        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12.5 }}>
                          {[readableFileSize(row.bytes), row.pageCount ? `${row.pageCount} page${row.pageCount === 1 ? '' : 's'}` : null, row.sourceName].filter(Boolean).join(' · ')}
                        </Typography.Text>
                      </Radio>
                    </li>
                  ))}
                </ul>
              </Radio.Group>
            )}
            {list.status === 'ready' && list.data && list.data.meta.pageCount > 1 && (
              <Pagination size="small" simple current={page} pageSize={10} total={list.data.meta.total} onChange={setPage} style={{ marginTop: 8 }} />
            )}
          </div>
        ) : (
          <Alert type="info" showIcon message="Choosing a document needs access to the Media library." />
        )}

        {mayUpload && (
          <div className="ms-doc-picker__upload">
            <Typography.Text strong style={{ display: 'block' }}>
              Or upload a new PDF
            </Typography.Text>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginBottom: 8 }}>
              {DOCUMENT_UPLOAD_RULES}
            </Typography.Text>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              tabIndex={-1}
              aria-label="PDF to upload"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                const issue = next ? localDocumentProblem(next) : null;
                setProblem(issue);
                setFile(issue ? null : next);
                if (next && !issue) setTitle(titleFromFileName(next.name));
              }}
            />
            <Space wrap>
              <Button onClick={() => fileInput.current?.click()} disabled={busy}>
                {file ? 'Choose another PDF' : 'Choose a PDF'}
              </Button>
              {file && (
                <Typography.Text>
                  {file.name} <Typography.Text type="secondary">({readableFileSize(file.size)})</Typography.Text>
                </Typography.Text>
              )}
            </Space>
            {file && (
              <Space.Compact style={{ width: '100%', marginTop: 8 }}>
                <Input aria-label="Document title" placeholder="Title" maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} />
                <Button type="primary" icon={<UploadOutlined aria-hidden="true" />} loading={busy} onClick={() => void upload()}>
                  Upload
                </Button>
              </Space.Compact>
            )}
            {uploading && <Progress percent={percent} size="small" aria-label="Upload progress" style={{ marginTop: 8 }} />}
          </div>
        )}

        {problem && <Alert type="warning" showIcon role="alert" message={problem} />}

        <div>
          <label htmlFor="document-link-text" style={{ display: 'block', fontWeight: 500, marginBottom: 4 }}>
            Link text
          </label>
          <Input id="document-link-text" value={text} maxLength={200} placeholder="Choose a document to fill this in" onChange={(event) => setText(event.target.value)} />
          <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
            Say what the document is, not "click here". The file type and size help readers decide before they download.
          </Typography.Text>
        </div>
      </Space>
    </Modal>
  );
}
