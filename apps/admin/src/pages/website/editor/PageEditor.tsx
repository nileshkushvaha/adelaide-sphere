import { useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Form, Input, Select, Space, Switch, Tabs, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { useNavigate } from 'react-router';
import { PAGE_SECTION_LIMITS, pageSectionBlockers, pageSectionsHtml, type PageSection } from '@adelaide-sphere/domain/page-sections';
import { pagesApi, type StaticPage, type StaticPageReferences } from '@/api/settings';
import { formatDateTime } from '@/shared/format';
import { useAsync } from '@/shared/useAsync';
import { isApiError } from '@/api/errors';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { MediaField } from '@/components/MediaField';
import { PermalinkField } from '@/components/PermalinkField';
import { SectionCard } from '@/components/ui';
import { slugify } from '@/shared/slug';
import { errorMessage } from '@/shared/useAsync';
import { useUnsavedChanges } from '@/shared/useUnsavedChanges';
import { seoChecks } from '@/pages/blog/editor/seoChecks';
import { AddSectionDialog } from './AddSectionDialog';
import { PagePublishBox } from './PagePublishBox';
import { PageRevisionsDrawer } from './PageRevisionsDrawer';
import { ChangeAddressDialog } from './ChangeAddressDialog';
import { describePageAutosave, usePageAutosave } from './usePageAutosave';
import { SectionList } from './SectionList';
import type { ReferenceUpdate } from './SectionFields';
import {
  PAGE_TEMPLATES,
  addableSectionTypes,
  insertSection,
  sectionIndexesWithErrors,
  sectionLabel,
  sectionsForTemplate,
  splitFieldErrors,
  type FieldErrors,
  type PageTemplate,
} from './page-sections-model';

export interface PageFormValues {
  title: string;
  slug: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  ogImageMediaId?: string | null;
  layout: StaticPage['layout'];
  noindex: boolean;
  revisionReason?: string;
}

const EMPTY_REFERENCES: StaticPageReferences = { images: {}, documents: {}, businesses: {} };
const FORM_TABS: Record<string, 'content' | 'search' | 'settings'> = { seoTitle: 'search', seoDescription: 'search', seoKeywords: 'search', ogImageMediaId: 'search', noindex: 'search', layout: 'settings', revisionReason: 'settings' };
const PUBLIC_SITE = ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '');
/** Where previews open: the public site's own origin in development, the admin's origin in production. */
const PREVIEW_ORIGIN = ((import.meta.env.VITE_PUBLIC_SITE_ORIGIN as string | undefined) ?? '').replace(/\/+$/, '') || window.location.origin;

const valuesFromPage = (page: StaticPage | null): PageFormValues => ({
  title: page?.title ?? '',
  slug: page?.slug ?? '',
  seoTitle: page?.seoTitle ?? null,
  seoDescription: page?.seoDescription ?? null,
  seoKeywords: page?.seoKeywords ?? null,
  ogImageMediaId: page?.ogImageMediaId ?? null,
  layout: page?.layout ?? 'rightSidebar',
  noindex: page?.noindex ?? false,
  revisionReason: '',
});

const sectionsOf = (page: StaticPage | null): PageSection[] => (page ? ((page.sections ?? []) as unknown as PageSection[]) : sectionsForTemplate(PAGE_TEMPLATES[0]!));

/** Short sections open, long pages start with only the first open so the list reads as an outline. */
const initiallyOpen = (sections: PageSection[]) => new Set((sections.length <= 2 ? sections : sections.slice(0, 1)).map((section) => section.id));

interface Props {
  /**
   * The page being edited, or null to create one. Render with a `key` of the
   * page's slug and version, so a saved version starts a fresh editor.
   */
  page: StaticPage | null;
  /** Re-reads the page after a save or a status change. */
  onReload?: () => void;
}

/**
 * The page builder (change log 1.17), for creating and editing information
 * pages. A page is a stack of ready-made sections — header, text, image and
 * text, cards, questions, businesses, contact, call to action — so it always
 * looks designed without anyone formatting it by hand.
 *
 * Title and address sit above three tabs: the content, how the page appears in
 * search and when shared, and the page's settings. The publish box on the
 * right says where the page stands and what is left to do. The API validates
 * and sanitises everything again; the checks here only save a round trip.
 */
export function PageEditor({ page, onReload }: Props) {
  const isNew = page === null;
  const api = pagesApi();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const { can } = useCapabilities();
  const canSave = isNew ? can(PERMISSION.websitePagesCreate) : can(PERMISSION.websitePagesUpdate);
  const canPublish = can(PERMISSION.websitePagesPublish);
  const system = page?.isSystem ?? false;

  const [form] = Form.useForm<PageFormValues>();
  // Built once: a new page's sections get fresh random ids, so building them a
  // second time for the open set would match none of the sections on screen.
  const [initialSections] = useState<PageSection[]>(() => sectionsOf(page));
  const [sections, setSections] = useState<PageSection[]>(initialSections);
  const [references, setReferences] = useState<StaticPageReferences>(page?.references ?? EMPTY_REFERENCES);
  const [expanded, setExpanded] = useState<Set<string>>(() => initiallyOpen(initialSections));
  const [template, setTemplate] = useState<PageTemplate['key']>(PAGE_TEMPLATES[0]!.key);
  const [sectionErrors, setSectionErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<'content' | 'search' | 'settings'>('content');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [movingAddress, setMovingAddress] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [recoveryHandled, setRecoveryHandled] = useState(false);
  /** Changes when content is replaced wholesale, so every rich-text editor starts again from the new text. */
  const [contentKey, setContentKey] = useState(0);
  const sectionsEdited = useRef(false);
  const lastTitle = useRef(page?.title ?? '');
  useUnsavedChanges(dirty && !saving);

  const saved = page !== null && page.version > 0;
  const autosave = usePageAutosave({
    slug: saved ? page.slug : null,
    baseVersion: page?.version ?? 0,
    dirty,
    enabled: canSave && !saving,
    read: () => ({ title: String(form.getFieldValue('title') ?? ''), sections }),
  });
  // A copy of unsaved changes from an earlier visit, offered once when the page opens.
  const [recovery] = useAsync((signal) => (saved && canSave ? pagesApi().getAutosave(page.slug, signal) : Promise.resolve(null)), [page?.slug, saved, canSave]);
  const recovered = recovery.status === 'ready' && recovery.data && !recoveryHandled ? recovery.data : null;

  const title = (Form.useWatch('title', form) as string | undefined) ?? page?.title ?? '';
  const slug = (Form.useWatch('slug', form) as string | undefined) ?? page?.slug ?? '';
  const seoTitle = (Form.useWatch('seoTitle', form) as string | null | undefined) ?? '';
  const seoDescription = (Form.useWatch('seoDescription', form) as string | null | undefined) ?? '';

  const changeSections = (next: PageSection[]) => {
    setSections(next);
    setDirty(true);
    sectionsEdited.current = true;
    // Positions move, so errors keyed by position no longer point at the right section.
    if (Object.keys(sectionErrors).length) setSectionErrors({});
  };

  const addReference = ({ document, business }: ReferenceUpdate) =>
    setReferences((current) => ({
      images: current.images,
      documents: document ? { ...current.documents, [document.id]: { title: document.title, url: document.url } } : current.documents,
      businesses: business ? { ...current.businesses, [business.id]: { name: business.name, slug: business.slug, status: business.status } } : current.businesses,
    }));

  const removeSection = (index: number) => {
    const removed = sections[index]!;
    const before = sections;
    changeSections(sections.filter((_, i) => i !== index));
    const key = `page-section-removed-${removed.id}`;
    message.open({
      key,
      type: 'info',
      duration: 8,
      content: (
        <span>
          {sectionLabel(removed)} removed.{' '}
          <Button
            type="link"
            size="small"
            style={{ padding: 0, height: 'auto' }}
            onClick={() => {
              changeSections(before);
              message.destroy(key);
            }}
          >
            Undo
          </Button>
        </span>
      ),
    });
  };

  const addSection = (type: PageSection['type']) => {
    const { sections: next, index } = insertSection(sections, type);
    changeSections(next);
    setExpanded((open) => new Set([...open, next[index]!.id]));
    setAdding(false);
  };

  const chooseTemplate = (key: PageTemplate['key']) => {
    const chosen = PAGE_TEMPLATES.find((entry) => entry.key === key)!;
    const apply = () => {
      const next = sectionsForTemplate(chosen);
      setTemplate(key);
      setSections(next);
      setExpanded(initiallyOpen(next));
      sectionsEdited.current = false;
    };
    if (!sectionsEdited.current) apply();
    else
      modal.confirm({
        title: `Start again from “${chosen.label}”?`,
        content: 'The sections you have changed are replaced with the empty sections of this template. The title and address stay.',
        okText: 'Replace sections',
        onOk: apply,
      });
  };

  /** What stops publication: the API's verdict on the saved page, or the section checks on what is typed. */
  const live = dirty || isNew;
  const blockers = useMemo(() => {
    if (!live && page) return page.publicationBlockers;
    return [...(title.trim().length < 3 ? ['Add a title of at least 3 characters'] : []), ...pageSectionBlockers(sections)];
  }, [live, page, title, sections]);

  const bodyHtml = useMemo(() => pageSectionsHtml(sections), [sections]);
  const advice = seoChecks({ title, seoTitle: seoTitle ?? '', seoDescription: seoDescription ?? '', slug, bodyHtml });

  const explain = (error: unknown) => {
    if (isApiError(error) && error.kind === 'unauthorized') {
      onAuthError(error);
      return;
    }
    if (isApiError(error) && error.code === 'STALE_VERSION') {
      setFormError('Someone else changed this page while you were editing. Copy anything you need, then reload the page.');
      return;
    }
    if (isApiError(error) && error.code === 'PUBLICATION_BLOCKED') {
      setFormError(`Not published yet: ${(error.fields.publication ?? [error.userMessage]).join(' · ')}`);
      return;
    }
    const fields = isApiError(error) ? error.fields : {};
    const { form: formFields, sections: listErrors } = splitFieldErrors(fields);
    if (Object.keys(formFields).length || Object.keys(listErrors).length) {
      form.setFields(Object.entries(formFields).map(([name, errors]) => ({ name: name as keyof PageFormValues, errors })));
      setSectionErrors(listErrors);
      const withErrors = sectionIndexesWithErrors(listErrors);
      if (withErrors.length) setExpanded((open) => new Set([...open, ...withErrors.map((index) => sections[index]?.id).filter((id): id is string => Boolean(id))]));
      const firstFormField = Object.keys(formFields)[0];
      if (Object.keys(listErrors).length) setTab('content');
      else if (firstFormField && FORM_TABS[firstFormField]) setTab(FORM_TABS[firstFormField]!);
      setFormError(listErrors.sections?.[0] ?? 'Some fields need attention. They are marked below.');
      return;
    }
    setFormError(errorMessage(error));
  };

  const save = async () => {
    setFormError(null);
    try {
      await form.validateFields();
    } catch {
      return;
    }
    const values = form.getFieldsValue(true) as PageFormValues;
    const payload = {
      title: values.title.trim(),
      sections,
      seoTitle: values.seoTitle?.trim() || null,
      seoDescription: values.seoDescription?.trim() || null,
      seoKeywords: values.seoKeywords?.trim() || null,
      ogImageMediaId: values.ogImageMediaId || null,
      layout: values.layout,
      noindex: Boolean(values.noindex),
    };
    setSaving(true);
    try {
      if (isNew) {
        const created = await api.create({ slug: values.slug, ...payload });
        setDirty(false);
        message.success('Page created as a draft. Nobody outside the admin can see it yet.');
        navigate(`/website/pages/${encodeURIComponent(created.slug)}`);
      } else {
        await api.save(page.slug, { ...payload, expectedVersion: page.version, revisionReason: values.revisionReason?.trim() || undefined });
        setDirty(false);
        message.success(page.status === 'published' ? 'Page updated. The live page shows your changes within a minute.' : 'Draft saved');
        onReload?.();
      }
    } catch (error) {
      explain(error);
    } finally {
      setSaving(false);
    }
  };

  /** Runs a state change on the saved page, then re-reads it; failures are explained where the editor is looking. */
  const runAction = async (work: (current: StaticPage) => Promise<unknown>, done: string) => {
    if (!page) return;
    setFormError(null);
    setChangingStatus(true);
    try {
      await work(page);
      message.success(done);
      onReload?.();
    } catch (error) {
      explain(error);
    } finally {
      setChangingStatus(false);
    }
  };

  const moveAddress = async (next: string, reason: string) => {
    if (!page) return;
    const moved = await api.changeAddress(page.slug, { slug: next, expectedVersion: page.version, ...(reason ? { reason } : {}) });
    setMovingAddress(false);
    message.success(page.status === 'published' ? `The page is now at /${moved.slug}. The old address sends visitors there.` : `The page's address is now /${moved.slug}.`);
    // The route follows the page; the old address no longer opens it.
    navigate(`/website/pages/${encodeURIComponent(moved.slug)}`, { replace: true });
  };

  const restoreRecovered = () => {
    if (!recovered) return;
    const next = recovered.sections as unknown as PageSection[];
    form.setFieldValue('title', recovered.title);
    setSections(next);
    setExpanded(initiallyOpen(next));
    setContentKey((key) => key + 1);
    setDirty(true);
    setRecoveryHandled(true);
    message.success('Your unsaved changes are back in the editor. Save to keep them.');
  };

  const discardRecovered = () => {
    if (page) void api.discardAutosave(page.slug).catch(() => undefined);
    setRecoveryHandled(true);
  };

  /** Keeps a copy of what is typed, then opens the private preview in a new tab. */
  const openPreview = async () => {
    if (!page) return;
    // Opened now, while the click still counts as the editor's, so the browser does not block it.
    const tab = window.open('about:blank', '_blank');
    setPreviewing(true);
    try {
      if (dirty && !(await autosave.flush())) throw new Error('not kept');
      const link = await api.createPreviewLink(page.slug);
      const url = `${PREVIEW_ORIGIN}${link.path}`;
      if (tab) {
        tab.opener = null;
        tab.location.replace(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      tab?.close();
      message.error(isApiError(error) ? error.userMessage : 'The preview could not be opened. Save your changes, then try again.');
    } finally {
      setPreviewing(false);
    }
  };

  const addable = addableSectionTypes(sections, system);
  const liveHref = page ? `${PUBLIC_SITE}/${page.slug}` : null;

  return (
    <Form<PageFormValues> form={form} layout="vertical" requiredMark="optional" initialValues={valuesFromPage(page)} onValuesChange={() => setDirty(true)} disabled={!canSave}>
      {formError && <Alert type="error" showIcon role="alert" message={formError} style={{ marginBottom: 16 }} closable onClose={() => setFormError(null)} />}
      {recovered && canSave && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`You have unsaved changes from ${formatDateTime(recovered.savedAt)}`}
          description={recovered.stale ? 'The page was saved since then. Restoring puts your older changes in the editor; nothing is saved until you choose to.' : 'Kept automatically while you were editing.'}
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
      {page?.status === 'draft' && page.publishFailure && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="This page was not published at its scheduled time" description={`It went back to draft because: ${page.publishFailure}`} />
      )}

      <div className="as-post-editor">
        <div className="as-post-editor__main">
          <SectionCard style={{ marginBottom: 16 }}>
            {isNew && (
              <fieldset className="as-page-templates">
                <legend>Start from</legend>
                <div className="as-page-templates__grid">
                  {PAGE_TEMPLATES.map((entry) => (
                    <label key={entry.key} className={`as-page-templates__option${template === entry.key ? ' is-selected' : ''}`}>
                      <input type="radio" name="page-template" value={entry.key} checked={template === entry.key} onChange={() => chooseTemplate(entry.key)} />
                      <span className="as-page-templates__label">{entry.label}</span>
                      <span className="as-page-templates__description">{entry.description}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <Form.Item label="Title" name="title" rules={[{ required: true, whitespace: true, message: 'Give the page a title' }, { min: 3, message: 'A title needs at least 3 characters' }]} extra="The page heading, and the name used in menus and search results.">
              <Input
                maxLength={180}
                showCount
                placeholder="e.g. Community guidelines"
                onChange={(event) => {
                  if (!isNew) return;
                  const next = event.target.value;
                  const current = String(form.getFieldValue('slug') ?? '');
                  // The address follows the title only while it still matches the title.
                  if (current === '' || current === slugify(lastTitle.current)) form.setFieldValue('slug', slugify(next));
                  lastTitle.current = next;
                }}
              />
            </Form.Item>
            {isNew ? (
              <Form.Item name="slug" rules={[{ required: true, message: 'An address is required' }]} style={{ marginBottom: 0 }}>
                <PermalinkField base="" source="title" note="Addresses the site already uses — blog, business, contact — are refused." />
              </Form.Item>
            ) : (
              <>
                <PermalinkField base="" value={page.slug} disabled note={page.isSystem ? 'The site links to this page by its address, so it cannot change.' : undefined} />
                {!page.isSystem && saved && canPublish && (
                  <Button size="small" style={{ marginTop: 8 }} onClick={() => setMovingAddress(true)} disabled={dirty} title={dirty ? 'Save your changes first.' : undefined}>
                    Change address
                  </Button>
                )}
              </>
            )}
          </SectionCard>

          <Tabs
            activeKey={tab}
            onChange={(key) => setTab(key as typeof tab)}
            items={[
              {
                key: 'content',
                label: 'Content',
                forceRender: true,
                children: (
                  <>
                    {system && (
                      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="This page stays plain" description="Legal and policy pages use text, questions, contact and a page header only, so they read as documents." />
                    )}
                    {sectionErrors.sections && <Alert type="error" showIcon style={{ marginBottom: 12 }} message={sectionErrors.sections.join(' ')} />}
                    {sections.length === 0 ? (
                      <SectionCard>
                        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                          This page has no sections yet. Add one to start.
                        </Typography.Paragraph>
                      </SectionCard>
                    ) : (
                      <SectionList
                        key={contentKey}
                        sections={sections}
                        onChange={changeSections}
                        onRemove={removeSection}
                        expanded={expanded}
                        onToggle={(id) => setExpanded((open) => (open.has(id) ? new Set([...open].filter((entry) => entry !== id)) : new Set([...open, id])))}
                        errors={sectionErrors}
                        references={references}
                        onReference={addReference}
                        pageTitle={title}
                        disabled={!canSave}
                      />
                    )}
                    {canSave && (
                      <Button type="dashed" block icon={<PlusOutlined aria-hidden="true" />} onClick={() => setAdding(true)} disabled={sections.length >= PAGE_SECTION_LIMITS.sections} style={{ marginTop: 12, height: 44 }}>
                        Add section
                      </Button>
                    )}
                    <AddSectionDialog open={adding} options={addable} note={system ? 'This is a policy page, so only plain sections are offered.' : undefined} onPick={addSection} onCancel={() => setAdding(false)} />
                  </>
                ),
              },
              {
                key: 'search',
                label: 'Search & sharing',
                forceRender: true,
                children: (
                  <SectionCard title="Search appearance" description="How this page shows in search results and shares. Empty fields use the page title and site image.">
                    <Form.Item label="SEO title" name="seoTitle" extra="Defaults to the page title. About 60 characters shows in full.">
                      <Input maxLength={180} showCount placeholder={title || 'e.g. Community guidelines'} />
                    </Form.Item>
                    <Form.Item label="Meta description" name="seoDescription" extra="The summary under the title in search results. About 150 characters.">
                      <Input.TextArea rows={3} maxLength={300} showCount placeholder="What a visitor will find on this page, in a sentence or two" />
                    </Form.Item>
                    <Form.Item label="Keywords" name="seoKeywords" extra="Comma separated. Search engines ignore this tag; it will not affect ranking.">
                      <Input maxLength={255} placeholder="e.g. guidelines, community, adelaide" />
                    </Form.Item>
                    <Form.Item label="Share image" name="ogImageMediaId" extra="Used when this page is shared. Empty uses the site image.">
                      <MediaField current={page?.ogImage ?? null} emptyLabel="The site image is used" clearLabel="Use the site image" aspectRatio="1.91 / 1" disabled={!canSave} />
                    </Form.Item>
                    <Form.Item label="Hide from search engines" name="noindex" valuePropName="checked" extra="Still open by link; search engines are asked not to list it, and it leaves the sitemap." style={{ marginBottom: 16 }}>
                      <Switch />
                    </Form.Item>
                    <section aria-labelledby="page-search-advice">
                      <Typography.Title level={3} id="page-search-advice" style={{ fontSize: 15, margin: '0 0 6px' }}>
                        Search advice
                      </Typography.Title>
                      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginBottom: 6 }}>
                        Advice only — it never stops you publishing.
                      </Typography.Text>
                      <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                        {advice.map((check) => (
                          <li key={check.code} style={{ fontSize: 13.5, padding: '2px 0' }}>
                            <span className="sr-only">{check.status === 'good' ? 'Good:' : 'Suggestion:'}</span>
                            <Typography.Text type={check.status === 'good' ? 'success' : undefined}>{check.message}</Typography.Text>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </SectionCard>
                ),
              },
              {
                key: 'settings',
                label: 'Page settings',
                forceRender: true,
                children: (
                  <SectionCard title="Page settings">
                    <Form.Item label="Sidebar" name="layout" extra="Plain-text pages only: where the contents and contact box sit. Other pages use full width.">
                      <Select placeholder="Choose a sidebar layout"
                        style={{ maxWidth: 360 }}
                        options={[
                          { value: 'rightSidebar', label: 'Sidebar on the right' },
                          { value: 'leftSidebar', label: 'Sidebar on the left' },
                          { value: 'fullWidth', label: 'No sidebar' },
                        ]}
                      />
                    </Form.Item>
                    {!isNew && (
                      <Form.Item label="Note about this change (optional)" name="revisionReason" extra="Kept with the previous version, so you can tell versions apart later.">
                        <Input maxLength={500} placeholder="e.g. Updated the opening hours" />
                      </Form.Item>
                    )}
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      To link this page from the header or footer, add it in Website → Menus once it is published.
                    </Typography.Paragraph>
                  </SectionCard>
                ),
              },
            ]}
          />
        </div>

        <div className="as-post-editor__top">
          <PagePublishBox
            page={page}
            blockers={blockers}
            blockersAreLive={live}
            dirty={dirty}
            saving={saving}
            changingStatus={changingStatus}
            canSave={canSave}
            canPublish={canPublish}
            onSave={() => void save()}
            onPublish={() => void runAction((current) => api.setStatus(current.slug, 'publish', { expectedVersion: current.version }), 'Page published. It is now live at its address.')}
            onUnpublish={(reason) => void runAction((current) => api.setStatus(current.slug, 'unpublish', { expectedVersion: current.version, reason }), 'Page unpublished')}
            onSchedule={(scheduledAt) => void runAction((current) => api.schedule(current.slug, { expectedVersion: current.version, scheduledAt }), 'Page scheduled. It goes live at the time you chose.')}
            onUnschedule={() => void runAction((current) => api.unschedule(current.slug, { expectedVersion: current.version }), 'Schedule cancelled. The page is a draft again.')}
            liveHref={liveHref}
            onPreview={() => void openPreview()}
            previewDisabledReason={!page ? 'Create the page first.' : !saved ? 'Save the page once first.' : null}
            previewing={previewing}
            onHistory={saved ? () => setHistoryOpen(true) : undefined}
            autosaveText={describePageAutosave(autosave.status)}
          />
        </div>

        <div className="as-post-editor__rest">
          <SectionCard title="How pages work">
            <ul className="as-page-help">
              <li>A page is a stack of sections. Open a section to edit it; drag or use the arrows to reorder.</li>
              <li>Hide a section to keep it without showing it to visitors.</li>
              <li>Everything is saved as a draft until you publish. Published pages update when you save.</li>
            </ul>
          </SectionCard>
        </div>
      </div>
      {movingAddress && page && <ChangeAddressDialog currentSlug={page.slug} live={page.status === 'published'} onCancel={() => setMovingAddress(false)} onSubmit={moveAddress} />}
      {historyOpen && page && (
        <PageRevisionsDrawer
          page={page}
          current={{ title, sections }}
          dirty={dirty}
          canRestore={canSave}
          onClose={() => setHistoryOpen(false)}
          onRestored={() => {
            setHistoryOpen(false);
            setDirty(false);
            onReload?.();
          }}
        />
      )}
    </Form>
  );
}
