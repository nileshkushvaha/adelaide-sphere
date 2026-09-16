import { useEffect, useMemo, useState, useRef } from 'react';
import { Alert, App, Button, DatePicker, Form, Input, Modal, Space, Typography } from 'antd';
import { useOnError } from '@refinedev/core';
import { Link, useNavigate, useParams } from 'react-router';
import dayjs from 'dayjs';
import { deriveExcerpt, postPublicationChecklist, type PostRequirement } from '@adelaide-sphere/domain/posts';
import { blogApi, adelaideLocalToUtc, adelaideOffsetLabel, utcToAdelaideLocal, type BlogTerm, type Post, type PostAction } from '@/api/blog';
import { toNamePath } from '@/api/businesses';
import { isApiError } from '@/api/errors';
import { formatDateTime } from '@/shared/format';
import { errorMessage, fieldErrors, useAsync } from '@/shared/useAsync';
import { useUnsavedChanges } from '@/shared/useUnsavedChanges';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { RichTextEditorLazy } from '@/components/RichTextEditorLazy';
import { PageLoader, PageHeader, SectionCard, StatusTag, StickyActions, PageLoadError } from '@/components/ui';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { PermalinkField } from '@/components/PermalinkField';
import { slugify } from '@/shared/slug';
import { DetailsBox } from './editor/DetailsBox';
import { FeaturedImageBox } from './editor/FeaturedImageBox';
import { PreviewDrawer, type PreviewSnapshot } from './editor/PreviewDrawer';
import { RevisionsDrawer } from './editor/RevisionsDrawer';
import { describeAutosave, useAutosave } from './editor/useAutosave';
import { clearLocalDraft, readLocalDraft } from '@/shared/postDrafts';
import { PublishBox } from './editor/PublishBox';
import { SearchSharingPanel } from './editor/SearchSharingPanel';
import { ACTION_DONE, ACTION_LABELS, valuesFromPost, type PostActionFormValues, type PostFormValues } from './editor/types';

/**
 * Form.Item injects value/onChange; this wrapper keeps them optional for the
 * type checker, and swallows the editor's opening note.
 *
 * The editor normalises the HTML it is given and reports the result, so it
 * emits a change as soon as it mounts — with nothing typed. A value identical
 * to the one we handed it is not a change.
 */
function RichTextEditorField({ value, onChange, disabled, resetKey }: { value?: string; onChange?: (html: string) => void; disabled?: boolean; resetKey?: number }) {
  const current = value ?? '';
  return <RichTextEditorLazy value={current} onChange={(html) => { if (html !== current) onChange?.(html); }} disabled={disabled} resetKey={resetKey} />;
}

/** Recovered work is only offered to someone who can still edit the article. */
const readOnlyForRecovery = (post: Post | null, canWrite: boolean) => !canWrite || post?.status === 'archived';

/** A schedule the picker shows by default: an hour from now, on the hour. */
const defaultScheduleValue = () => dayjs(utcToAdelaideLocal(new Date(Date.now() + 3_600_000))).minute(0);

/**
 * Article editor (SRS BLOG 001–003), laid out the way WordPress lays out a
 * post: the writing on the left — title, address, text, summary — and on the
 * right the Publish box, the details every article needs and its images.
 * Search and sharing settings are folded away because they start from the
 * title, summary and featured image.
 */
export function PostEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const api = blogApi();
  const { can, loading: capabilitiesLoading } = useCapabilities();
  const canWrite = can(isNew ? PERMISSION.postsCreate : PERMISSION.postsUpdate);
  const canFeature = can(PERMISSION.postsFeature);
  const canPublish = can(PERMISSION.postsPublish);
  const [form] = Form.useForm<PostFormValues>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Nothing here saves on its own; leaving with edits in the form loses them.
  useUnsavedChanges(dirty && !saving);
  const [pending, setPending] = useState<{ action: PostAction; blockers?: string[] } | null>(null);
  const [actionForm] = Form.useForm<PostActionFormValues>();
  const [reloadKey, setReloadKey] = useState(0);
  const [featuring, setFeaturing] = useState(false);
  const [acting, setActing] = useState(false);
  // Null means "follow the article"; set when an older article is switched to the rich editor.
  const [formatOverride, setFormatOverride] = useState<'html' | 'markdown' | null>(null);
  // Bumped by "Discard changes" so the body editor and image pickers replace what is on screen.
  const [resetKey, setResetKey] = useState(0);
  const [createdTags, setCreatedTags] = useState<BlogTerm[]>([]);
  // What the preview renders: the form as it was when Preview (or Refresh) was pressed.
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // The saved-at time of the recovered work the writer has already restored or discarded.
  const [recoveryHandled, setRecoveryHandled] = useState<string | null>(null);

  const [state, reload, refresh] = useAsync((signal) => (isNew ? Promise.resolve(null) : api.getPost(id!, signal)), [id, reloadKey]);
  const post = state.status === 'ready' ? state.data : null;
  const [authors] = useAsync((signal) => api.listAuthors({}, signal), []);
  const [categories] = useAsync((signal) => api.listTerms('blog-categories', {}, signal), []);
  const [tags] = useAsync((signal) => api.listTerms('blog-tags', {}, signal), []);
  const [myAuthor, , refreshMyAuthor] = useAsync((signal) => api.getMyAuthor(signal).catch(() => null), []);
  // Unsaved work from an earlier visit: the private server copy, and this browser's copy.
  const [serverDraft] = useAsync((signal) => (isNew ? Promise.resolve(null) : api.getAutosave(id!, signal).catch(() => null)), [id, reloadKey]);
  // Re-read after every save or restore (`reloadKey`), which clears or replaces the stored copy.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- storage is outside React; reloadKey is the signal to read it again
  const localDraft = useMemo(() => readLocalDraft(id ?? null), [id, reloadKey]);
  useDocumentTitle(isNew ? 'New article' : (post?.title ?? 'Article'));

  // Read by the reload effect below without making it run again whenever the form becomes clean.
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    // A reload never overwrites unsaved edits (a save finishing while someone types, for example).
    if (post && !dirtyRef.current) form.setFieldsValue(valuesFromPost(post));
  }, [post, form]);

  // A new article is credited to the writer's own author profile until they choose otherwise.
  const defaultAuthorId = myAuthor.status === 'ready' && myAuthor.data?.author?.active ? myAuthor.data.authorId : null;
  useEffect(() => {
    if (isNew && defaultAuthorId && !form.getFieldValue('authorId')) form.setFieldValue('authorId', defaultAuthorId);
  }, [isNew, defaultAuthorId, form]);

  const watchedTitle = Form.useWatch('title', form) as string | undefined;
  const watchedExcerpt = Form.useWatch('excerpt', form) as string | undefined;
  const watchedSlug = Form.useWatch('slug', form) as string | undefined;
  const watchedBody = Form.useWatch('bodyMarkdown', form) as string | undefined;
  const watchedAuthorId = Form.useWatch('authorId', form) as string | undefined;
  const watchedCategoryId = Form.useWatch('categoryId', form) as string | undefined;
  const watchedSchedule = Form.useWatch('scheduledLocal', actionForm);

  const autosave = useAutosave({
    postId: post?.id ?? null,
    baseVersion: post?.version ?? 0,
    dirty,
    enabled: canWrite && post?.status !== 'archived',
    read: () => ({
      title: (form.getFieldValue('title') as string | undefined) ?? '',
      excerpt: (form.getFieldValue('excerpt') as string | undefined) ?? '',
      bodyMarkdown: (form.getFieldValue('bodyMarkdown') as string | undefined) ?? '',
      bodyFormat: formatOverride ?? (post?.bodyFormat === 'markdown' ? 'markdown' : 'html'),
    }),
  });

  // Offer the newest copy that holds something the saved article does not.
  const recovery = useMemo(() => {
    const server = serverDraft.status === 'ready' && serverDraft.data && typeof serverDraft.data.bodyMarkdown === 'string' ? { ...serverDraft.data, source: 'server' as const } : null;
    const local = localDraft ? { ...localDraft, stale: Boolean(post && localDraft.baseVersion > 0 && localDraft.baseVersion < post.version), source: 'browser' as const } : null;
    const newest = [server, local].filter((copy): copy is NonNullable<typeof copy> => copy !== null).sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
    if (!newest || recoveryHandled === newest.savedAt) return null;
    if (post && new Date(newest.savedAt).getTime() <= new Date(post.updatedAt).getTime()) return null;
    if (post && newest.bodyMarkdown === post.bodyMarkdown && newest.title === post.title && newest.excerpt === post.excerpt) return null;
    if (!post && !newest.bodyMarkdown.trim() && !newest.title.trim()) return null;
    return newest;
  }, [serverDraft, localDraft, post, recoveryHandled]);

  // New articles use the rich editor; existing Markdown articles stay Markdown until converted.
  const bodyFormat: 'html' | 'markdown' = formatOverride ?? (post?.bodyFormat === 'markdown' ? 'markdown' : 'html');
  const scheduledInstant = watchedSchedule ? adelaideLocalToUtc(watchedSchedule.format('YYYY-MM-DDTHH:mm')) : null;
  const offsetLabel = useMemo(() => adelaideOffsetLabel(new Date()), []);

  // The same requirements the server applies before publishing (BLOG 002),
  // evaluated on what is typed now rather than on the last save.
  const plainBody = useMemo(() => {
    const source = watchedBody ?? '';
    if (bodyFormat === 'markdown' || typeof DOMParser === 'undefined') return source;
    return new DOMParser().parseFromString(source, 'text/html').body.textContent ?? '';
  }, [watchedBody, bodyFormat]);
  const autoExcerpt = !watchedExcerpt?.trim() ? deriveExcerpt(plainBody) : '';
  const allTags = useMemo(() => [...(tags.status === 'ready' ? tags.data : []), ...createdTags.filter((tag) => tags.status !== 'ready' || !tags.data.some((known) => known.id === tag.id))], [tags, createdTags]);
  const checklist = postPublicationChecklist({
    title: watchedTitle ?? '',
    slug: watchedSlug || post?.slug || slugify(watchedTitle ?? ''),
    excerpt: watchedExcerpt?.trim() ? watchedExcerpt : autoExcerpt,
    plainBody,
    authorActive: authors.status === 'ready' && authors.data.some((author) => author.id === watchedAuthorId && author.active),
    categoryActive: categories.status === 'ready' && categories.data.some((category) => category.id === watchedCategoryId && category.active),
  }).map((requirement) => (requirement.code === 'excerpt' && requirement.met && autoExcerpt ? { ...requirement, message: 'Summary will be written from your opening paragraph' } : requirement));

  const handleError = (error: unknown, setter: (message: string) => void) => {
    if (isApiError(error) && error.kind === 'unauthorized') {
      onAuthError(error);
      return;
    }
    if (isApiError(error) && (error.code === 'STALE_VERSION' || error.code === 'SLUG_LOCKED' || error.code === 'INVALID_STATE')) {
      setter(`${error.userMessage} Reload to see the current version.`);
      return;
    }
    const errors = fieldErrors(error);
    if (Object.keys(errors).length > 0) form.setFields(Object.entries(errors).map(([path, list]) => ({ name: toNamePath(path), errors: list })) as never);
    setter(Object.values(errors).flat()[0] ?? errorMessage(error));
  };

  /** Back to the saved article, in place: the form, both images and the body editor. */
  const discardChanges = () => {
    if (!post) return;
    autosave.clear(post.id);
    void api.discardAutosave(post.id).catch(() => undefined);
    form.resetFields();
    form.setFieldsValue(valuesFromPost(post));
    setFormatOverride(null);
    setResetKey((key) => key + 1);
    setDirty(false);
    setFormError(null);
  };

  /**
   * Saves what is in the form and returns the saved article, or null when the
   * form or the server refused it (the reason is already shown). Publishing
   * goes through this first, so "Publish" never publishes an older saved copy.
   */
  const persist = async (): Promise<Post | null> => {
    const values = await form.validateFields().catch(() => null);
    if (!values) {
      setFormError('Some fields need attention before this can be saved.');
      return null;
    }
    setFormError(null);
    setSaving(true);
    try {
      const saved = isNew
        ? await api.createPost({ ...values, bodyFormat, tagIds: values.tagIds ?? [] })
        : post
          ? await api.updatePost(post.id, { ...values, bodyFormat, tagIds: values.tagIds ?? [], expectedVersion: post.version })
          : null;
      if (!saved) return null;
      setDirty(false);
      autosave.clear(saved.id);
      if (!values.excerpt?.trim() && saved.excerpt) message.info('A summary was written from your opening paragraph. Edit it if you like.');
      return saved;
    } catch (error) {
      handleError(error, setFormError);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    const saved = await persist();
    if (!saved) return;
    if (isNew) {
      message.success('Article saved as a draft. It stays private until you publish it.');
      navigate(`/posts/${encodeURIComponent(saved.id)}`);
    } else {
      message.success(saved.status === 'published' ? 'Article updated' : 'Draft saved');
      setReloadKey((k) => k + 1);
    }
  };

  const openAction = (action: PostAction) => {
    actionForm.resetFields();
    if (action === 'schedule') actionForm.setFieldsValue({ scheduledLocal: post?.scheduledAt ? dayjs(utcToAdelaideLocal(new Date(post.scheduledAt))) : defaultScheduleValue() });
    setPending({ action });
  };

  /** Featuring is its own action: it changes no text, so it is never mixed with a save. */
  const toggleFeatured = async (featured: boolean) => {
    if (!post) return;
    setFeaturing(true);
    try {
      await api.setFeatured(post.id, featured, post.version);
      message.success(featured ? 'Article featured on the home page and the blog.' : 'Article no longer featured.');
      setReloadKey((k) => k + 1);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setFeaturing(false);
    }
  };

  /** One action at a time: a second press while one is running would only fail as a stale edit. */
  const runAction = async () => {
    if (!pending || acting) return;
    setActing(true);
    try {
      await performAction();
    } finally {
      setActing(false);
    }
  };

  const performAction = async () => {
    if (!pending) return;
    const values = await actionForm.validateFields().catch(() => null);
    if (!values) return;
    // Unsaved edits are saved first, so what goes live is what is on screen.
    const needsSave = isNew || dirty;
    const target = needsSave ? await persist() : post;
    if (!target) {
      setPending(null);
      return;
    }
    try {
      const body: Record<string, unknown> & { expectedVersion: number } = { expectedVersion: target.version, reason: values.reason || undefined };
      if (pending.action === 'schedule') {
        const instant = values.scheduledLocal ? adelaideLocalToUtc(values.scheduledLocal.format('YYYY-MM-DDTHH:mm')) : null;
        if (!instant) {
          setPending({ ...pending, blockers: ['Choose a valid date and time'] });
          return;
        }
        body.scheduledAt = instant.toISOString();
      }
      await api.transition(target.id, pending.action, body);
      message.success(ACTION_DONE[pending.action]);
      setPending(null);
      actionForm.resetFields();
      if (isNew) navigate(`/posts/${encodeURIComponent(target.id)}`);
      else setReloadKey((k) => k + 1);
    } catch (error) {
      const blockers = isApiError(error) && error.code === 'PUBLICATION_BLOCKED' ? (error.fields.publication ?? [error.userMessage]) : null;
      if (isNew) {
        // Saved as a draft, but not published: continue on its own page.
        setPending(null);
        message.warning(blockers ? `Saved as a draft, not published yet: ${blockers.join(' ')}` : errorMessage(error));
        navigate(`/posts/${encodeURIComponent(target.id)}`);
        return;
      }
      // Keep the dialog and the data on screen while the saved version is re-read.
      if (needsSave) refresh();
      if (blockers) setPending({ ...pending, blockers });
      else handleError(error, (m) => setPending({ ...pending, blockers: [m] }));
    }
  };

  /**
   * Moves a published article. The address row awaits this, so a refusal has to
   * be rethrown: swallowing it would close the editor as though the move had
   * worked.
   */
  const changeSlug = async (slug: string) => {
    if (!post) return;
    setFormError(null);
    try {
      await api.changePostSlug(post.id, { slug, expectedVersion: post.version });
      message.success('Web address changed. The old address now forwards readers to the new one.');
      setReloadKey((k) => k + 1);
    } catch (error) {
      handleError(error, setFormError);
      throw error;
    }
  };

  const openPreview = () => setPreviewSnapshot({ key: Date.now(), values: form.getFieldsValue(true) as PostFormValues, bodyFormat });

  /** Saves before an on-site preview; a new article moves to its own page once it exists. */
  const saveForPreview = async (): Promise<Post | null> => {
    const saved = await persist();
    if (!saved) return null;
    if (isNew) navigate(`/posts/${encodeURIComponent(saved.id)}`);
    else refresh();
    return saved;
  };

  const restoreRecovered = () => {
    if (!recovery) return;
    form.setFieldsValue({ title: recovery.title, excerpt: recovery.excerpt, bodyMarkdown: recovery.bodyMarkdown });
    setFormatOverride(recovery.bodyFormat);
    setResetKey((key) => key + 1);
    setDirty(true);
    setRecoveryHandled(recovery.savedAt);
    message.success('Your unsaved changes are back in the editor. Save to keep them.');
  };

  const discardRecovered = () => {
    if (!recovery) return;
    clearLocalDraft(post?.id ?? null);
    if (post) void api.discardAutosave(post.id).catch(() => undefined);
    setRecoveryHandled(recovery.savedAt);
  };

  const focusField = (field: PostRequirement['field']) => {
    form.scrollToField(field, { focus: true, block: 'center' });
  };

  // Capabilities decide whether this form is editable, so the screen waits for
  // them rather than rendering a form that is disabled and then is not (SRS RBAC 010).
  if (capabilitiesLoading) return <PageLoader label="Checking your permissions…" />;
  if (!isNew && state.status === 'loading') return <PageLoader label="Loading this article…" />;
  if (state.status === 'error') return <PageLoadError title="Article" crumbs={[{ label: 'Editorial' }, { label: 'Articles', href: '/posts' }]} message={state.message} reference={state.reference} onRetry={reload} />;
  if (!isNew && !post) return <p role="status">Loading article…</p>;
  const readOnly = !canWrite || post?.status === 'archived';

  return (
    <div>
      <PageHeader
        crumbs={[
          { label: 'Editorial', href: '/posts' },
          { label: 'Articles', href: '/posts' },
          { label: isNew ? 'New article' : (post?.title ?? 'Article') },
        ]}
        title={isNew ? 'New article' : post!.title}
        description={isNew ? 'Write the article, then publish it or schedule it from the Publish box.' : undefined}
        meta={post ? <StatusTag status={post.status} /> : null}
        actions={
          <>
            <Link to="/posts">
              <Button>All articles</Button>
            </Link>
            {post?.status === 'published' && (
              <Button href={`/blog/${post.slug}`} target="_blank" rel="noreferrer noopener">
                View on site
              </Button>
            )}
          </>
        }
      />
      {post?.status === 'draft' && post.publishFailure && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="This article was not published at its scheduled time"
          description={`It went back to drafts because: ${post.publishFailure} Fix this, then publish or schedule it again.`}
        />
      )}
      {recovery && !readOnlyForRecovery(post, canWrite) && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`You have unsaved changes from ${formatDateTime(recovery.savedAt)}`}
          description={recovery.stale ? 'The article was saved since then. Restoring puts your older changes in the editor.' : 'Kept automatically while you were writing.'}
          action={
            <Space direction="vertical" size={6}>
              <Button size="small" type="primary" onClick={restoreRecovered}>
                Restore them
              </Button>
              <Button size="small" onClick={discardRecovered}>
                Discard
              </Button>
            </Space>
          }
        />
      )}
      {post?.status === 'archived' && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Archived articles are read-only. Restore it to make changes." />}
      {formError && <Alert type="error" showIcon role="alert" message={formError} style={{ marginBottom: 16 }} />}

      <Form<PostFormValues> form={form} layout="vertical" onFinish={() => void save()} onValuesChange={() => setDirty(true)} disabled={readOnly} initialValues={{ tagIds: [], commentsEnabled: true }}>
        <div className="as-post-editor">
          <div className="as-post-editor__main">
            <SectionCard>
              <Form.Item label="Title" name="title" className="as-post-title" rules={[{ required: true, message: 'Give the article a title' }, { min: 3, message: 'A title needs at least 3 characters' }]}>
                <Input maxLength={180} variant="borderless" placeholder="Add a title" />
              </Form.Item>
              {/* The address sits under the title, read-only until it is edited.
                  Before publication it is just a form value; afterwards saving it
                  goes through the API, which leaves a redirect behind (SEO 004). */}
              <Form.Item name="slug" style={{ marginBottom: 16 }}>
                <PermalinkField
                  base="/blog"
                  source="title"
                  disabled={readOnly || (Boolean(post?.firstPublishedAt) && (!canPublish || dirty))}
                  placeholder={watchedTitle ? slugify(watchedTitle) : undefined}
                  note={post?.firstPublishedAt ? 'If you change it, the old address will forward readers to the new one.' : 'Made from the title when left empty.'}
                  onSave={post?.firstPublishedAt ? changeSlug : undefined}
                />
              </Form.Item>

              {bodyFormat === 'markdown' && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="This older article uses a plain-text format."
                  description="You can keep editing it as it is, or switch to the normal editor."
                  action={
                    !readOnly ? (
                      <Button
                        size="small"
                        disabled={dirty}
                        title={dirty ? 'Save or discard your changes first' : undefined}
                        onClick={() => {
                          form.setFieldValue('bodyMarkdown', post?.sanitizedBody ?? '');
                          setFormatOverride('html');
                          setDirty(true);
                        }}
                      >
                        Switch to the normal editor
                      </Button>
                    ) : null
                  }
                />
              )}
              <Form.Item name="bodyMarkdown" label={bodyFormat === 'html' ? undefined : 'Article text'} rules={[{ required: true, message: 'Write the article before saving' }]} style={{ marginBottom: 16 }}>
                {bodyFormat === 'html' ? (
                  <RichTextEditorField disabled={readOnly} resetKey={resetKey} />
                ) : (
                  <Input.TextArea rows={18} maxLength={200_000} placeholder="Write the article here." />
                )}
              </Form.Item>

              <Form.Item label="Summary" name="excerpt" extra="Shown in lists, search and shares. Leave empty to use your opening paragraph." style={{ marginBottom: 0 }}>
                <Input.TextArea rows={3} maxLength={500} showCount placeholder={autoExcerpt || 'One or two sentences a reader would see before deciding to open the article.'} />
              </Form.Item>
            </SectionCard>

            <SearchSharingPanel post={post} readOnly={readOnly} resetKey={resetKey} />
          </div>

          <div className="as-post-editor__top">
            <PublishBox post={post} checklist={checklist} canWrite={canWrite} canPublish={canPublish} readOnly={readOnly} saving={saving} dirty={dirty} onSave={() => form.submit()} onAction={openAction} onFocusField={focusField} onPreview={openPreview} onHistory={() => setHistoryOpen(true)} onFeature={canFeature ? (featured) => void toggleFeatured(featured) : undefined} featuring={featuring} />
            <DetailsBox
              authors={authors.status === 'ready' ? authors.data : []}
              categories={categories.status === 'ready' ? categories.data : []}
              tags={allTags}
              onTagCreated={(tag) => {
                setCreatedTags((current) => [...current, tag]);
                setDirty(true);
              }}
              readOnly={readOnly}
              defaultAuthorId={myAuthor.status === 'ready' ? (myAuthor.data?.authorId ?? null) : undefined}
              onDefaultAuthorChanged={refreshMyAuthor}
            />
          </div>

          <div className="as-post-editor__rest">
            <FeaturedImageBox post={post} readOnly={readOnly} resetKey={resetKey} />
          </div>
        </div>

        {!readOnly && (
          <StickyActions status={dirty ? (describeAutosave(autosave.status) ?? 'You have unsaved changes. Save to keep them.') : post ? `All changes saved ${formatDateTime(post.updatedAt)}.` : 'Not saved yet.'}>
            {!isNew && (
              <Button onClick={discardChanges} disabled={saving || !dirty}>
                Discard changes
              </Button>
            )}
            <Button type="primary" htmlType="submit" loading={saving}>
              {isNew ? 'Save draft' : post?.status === 'published' ? 'Update article' : 'Save changes'}
            </Button>
          </StickyActions>
        )}
      </Form>

      {historyOpen && post && (
        <RevisionsDrawer
          post={post}
          current={{
            title: (form.getFieldValue('title') as string | undefined) ?? '',
            excerpt: (form.getFieldValue('excerpt') as string | undefined) ?? '',
            bodyMarkdown: (form.getFieldValue('bodyMarkdown') as string | undefined) ?? '',
            bodyFormat,
          }}
          dirty={dirty}
          onClose={() => setHistoryOpen(false)}
          onRestored={(restored) => {
            setHistoryOpen(false);
            autosave.clear(post.id);
            setFormatOverride(null);
            // The restored text replaces what is on screen, including the body editor.
            form.setFieldsValue(valuesFromPost(restored));
            setResetKey((key) => key + 1);
            setDirty(false);
            setReloadKey((key) => key + 1);
          }}
        />
      )}

      {previewSnapshot && (
        <PreviewDrawer snapshot={previewSnapshot} post={post} dirty={dirty} onClose={() => setPreviewSnapshot(null)} onRefresh={openPreview} onSaveFirst={saveForPreview} />
      )}

      <Modal
        open={pending !== null}
        title={pending ? ACTION_LABELS[pending.action].title : ''}
        okText={pending ? ACTION_LABELS[pending.action].label : 'OK'}
        okButtonProps={{ danger: pending ? ACTION_LABELS[pending.action].danger : false, loading: saving || acting }}
        onOk={() => void runAction()}
        onCancel={() => setPending(null)}
        destroyOnHidden
      >
        {pending && <Typography.Paragraph>{ACTION_LABELS[pending.action].hint}</Typography.Paragraph>}
        {pending && dirty && (pending.action === 'publish' || pending.action === 'schedule') && (
          <Typography.Paragraph type="secondary">Your unsaved changes are saved first.</Typography.Paragraph>
        )}
        {pending?.blockers && <Alert type="error" showIcon role="alert" style={{ marginBottom: 12 }} message="Cannot continue yet" description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{pending.blockers.map((b) => <li key={b}>{b}</li>)}</ul>} />}
        <Form form={actionForm} layout="vertical" requiredMark={false}>
          {pending?.action === 'schedule' && (
            <Form.Item
              label={`Publish at (Adelaide time, ${offsetLabel})`}
              name="scheduledLocal"
              rules={[{ required: true, message: 'Choose a date and time' }]}
              extra={
                scheduledInstant
                  ? `Goes live ${watchedSchedule!.format('dddd D MMMM YYYY [at] h:mm a')} Adelaide time (${adelaideOffsetLabel(scheduledInstant)}), whatever time zone this computer is in.`
                  : 'Type a date and time, or pick one from the calendar.'
              }
            >
              <DatePicker
                showTime={{ format: 'HH:mm', minuteStep: 5 }}
                format="YYYY-MM-DD HH:mm"
                needConfirm={false}
                disabledDate={(day) => day.isBefore(dayjs().startOf('day'))}
                style={{ width: '100%' }}
                placeholder="YYYY-MM-DD HH:mm"
              />
            </Form.Item>
          )}
          <Form.Item label="Note about this change (optional)" name="reason" extra="Kept in the site's activity history.">
            <Input.TextArea rows={2} maxLength={500} placeholder="e.g. Updated for the new opening hours" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
