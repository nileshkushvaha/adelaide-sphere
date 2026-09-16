import { useState } from 'react';
import { Alert, App, Button, Drawer, Skeleton, Space, Tag, Typography } from 'antd';
import { ExportOutlined, ReloadOutlined } from '@ant-design/icons';
import { blogApi, type Post } from '@/api/blog';
import { isApiError } from '@/api/errors';
import { ErrorState } from '@/components/ui';
import { errorMessage, useAsync } from '@/shared/useAsync';
import type { PostFormValues } from './types';

export interface PreviewSnapshot {
  /** Changes on every "Preview" or "Refresh", so the content is rendered again. */
  key: number;
  values: PostFormValues;
  bodyFormat: 'html' | 'markdown';
}

interface Props {
  snapshot: PreviewSnapshot;
  post: Post | null;
  dirty: boolean;
  onClose: () => void;
  onRefresh: () => void;
  /** Saves outstanding edits and returns the saved article, or null if saving was refused. */
  onSaveFirst: () => Promise<Post | null>;
}

/** Where the public site lives: its own origin in development, the same origin as the admin in production. */
const SITE_ORIGIN = ((import.meta.env.VITE_PUBLIC_SITE_ORIGIN as string | undefined) ?? '').replace(/\/+$/, '') || window.location.origin;

/**
 * "Preview" (SRS BLOG 003): what is typed right now, saved or not, rendered by
 * the server exactly as a save would store it. "Open on the website" then shows
 * the saved article in the public design through a private ten-minute link.
 */
export function PreviewDrawer({ snapshot, post, dirty, onClose, onRefresh, onSaveFirst }: Props) {
  const { message } = App.useApp();
  const [opening, setOpening] = useState(false);
  const { values, bodyFormat } = snapshot;
  const [state, reload] = useAsync(
    (signal) =>
      blogApi().renderPreview(
        { title: values.title, excerpt: values.excerpt, bodyMarkdown: values.bodyMarkdown, bodyFormat, authorId: values.authorId, categoryId: values.categoryId, coverMediaId: values.coverMediaId },
        signal,
      ),
    [snapshot.key],
  );

  const openOnSite = async () => {
    // Opened now, while the click still counts as the reader's, so the browser does not block it.
    const tab = window.open('about:blank', '_blank');
    setOpening(true);
    try {
      const saved = !post || dirty ? await onSaveFirst() : post;
      if (!saved) {
        tab?.close();
        return;
      }
      const link = await blogApi().createPreviewLink(saved.id);
      const url = `${SITE_ORIGIN}${link.path}`;
      if (tab) {
        tab.opener = null;
        tab.location.replace(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      tab?.close();
      message.error(isApiError(error) ? error.userMessage : errorMessage(error));
    } finally {
      setOpening(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width="min(920px, 100vw)"
      title="Preview"
      destroyOnHidden
      extra={
        <Space wrap>
          <Button icon={<ReloadOutlined aria-hidden="true" />} onClick={onRefresh}>
            Refresh
          </Button>
          <Button type="primary" icon={<ExportOutlined aria-hidden="true" />} loading={opening} onClick={() => void openOnSite()}>
            Open on the website
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        What you have typed, including unsaved changes. This preview is never shown publicly and is never indexed.
        {(dirty || !post) && ' Opening it on the website saves your changes first.'}
      </Typography.Paragraph>

      {state.status === 'loading' && <Skeleton active paragraph={{ rows: 10 }} />}
      {state.status === 'error' && <ErrorState message={state.message} reference={state.reference} onRetry={reload} />}
      {state.status === 'ready' && (
        <article style={{ maxWidth: 760, margin: '0 auto' }}>
          {state.data.categoryName && <Tag color="blue">{state.data.categoryName}</Tag>}
          <Typography.Title level={2} style={{ marginTop: 12, fontSize: 30, lineHeight: 1.2 }}>
            {state.data.title}
          </Typography.Title>
          {state.data.excerpt && (
            <Typography.Paragraph style={{ fontSize: 17 }}>
              {state.data.excerpt}
              {state.data.excerptGenerated && (
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12.5 }}>
                  Summary written from your opening paragraph.
                </Typography.Text>
              )}
            </Typography.Paragraph>
          )}
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            By {state.data.authorName ?? 'no author chosen yet'} in {state.data.categoryName ?? 'no category chosen yet'} · {state.data.readingMinutes} min read
          </Typography.Text>
          {state.data.cover ? (
            <img src={state.data.cover.url} alt={state.data.cover.alt} style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 12, marginBottom: 20 }} />
          ) : (
            values.coverMediaId && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="The featured image is still being processed and will appear once it is ready." />
          )}
          {state.data.sanitizedBody ? (
            // Sanitised by the API with the same allowlist a save uses (SRS SEC 001).
            <div className="as-prose" data-testid="post-preview" dangerouslySetInnerHTML={{ __html: state.data.sanitizedBody }} />
          ) : (
            <Typography.Text type="secondary">Nothing written yet.</Typography.Text>
          )}
        </article>
      )}
    </Drawer>
  );
}
