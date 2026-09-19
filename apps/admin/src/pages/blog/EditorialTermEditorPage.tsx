import { useEffect } from 'react';
import { App, Form, Input } from 'antd';
import { MediaField } from '@/components/MediaField';
import { useNavigate, useParams } from 'react-router';
import { blogApi, type BlogTerm } from '@/api/blog';
import { RecordEditorPage } from '@/components/ui';
import { PermalinkField } from '@/components/PermalinkField';
import { slugify } from '@/shared/slug';
import { useAsync } from '@/shared/useAsync';
import { useRecordEditor } from '@/shared/useRecordEditor';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import type { EditorialTermsConfig } from './editorial-configs';
import { EDITORIAL_TERM_PERMISSIONS } from './editorial-configs';
import { useCapabilities } from '@/auth/access-control';

interface Values {
  name: string;
  slug?: string;
  landingContent?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  ogImageMediaId?: string | null;
}

/**
 * One blog category or tag on its own route (SRS BLOG 005). Landing content is
 * Markdown that decides whether the public landing page is indexable at all, so
 * it is written on a page with room rather than in a dialog.
 */
export function EditorialTermEditorPage({ config }: { config: EditorialTermsConfig }) {
  const { id } = useParams();
  const creating = id === undefined;
  const api = blogApi();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { can } = useCapabilities();
  const mayUpdate = can(EDITORIAL_TERM_PERMISSIONS[config.kind].update);
  const [form] = Form.useForm<Values>();
  const { saving, error, submit } = useRecordEditor<Values>(form);
  // What the address will be if one has not been chosen, shown before saving.
  const typedName = Form.useWatch('name', form) ?? '';
  const listHref = `/${config.kind}`;
  // Categories and tags both have a search appearance (change log 1.15).
  const noun = config.singular.toLowerCase();

  // The API lists terms rather than serving one, which is the cheaper contract
  // for a set this small; the record is picked out of that list.
  const [state] = useAsync<BlogTerm | null>((signal) => (creating ? Promise.resolve(null) : api.listTerms(config.kind, {}, signal).then((rows) => rows.find((row) => row.id === id) ?? null)), [config.kind, id]);
  const term = state.status === 'ready' ? state.data : null;
  const title = creating ? `Add ${config.singular.toLowerCase()}` : (term?.name ?? config.singular);
  useDocumentTitle(title);

  useEffect(() => {
    if (!term) return;
    form.setFieldsValue({
      name: term.name,
      slug: term.slug,
      landingContent: term.landingContent ?? '',
      seoTitle: term.seoTitle ?? '',
      seoDescription: term.seoDescription ?? '',
      seoKeywords: term.seoKeywords ?? '',
      ogImageMediaId: term.ogImageMediaId,
    });
  }, [term, form]);

  const save = () =>
    submit(async (values) => {
      const body = {
        name: values.name,
        ...(values.slug ? { slug: values.slug } : {}),
        landingContent: values.landingContent || null,
        seoTitle: values.seoTitle || null,
        seoDescription: values.seoDescription || null,
        seoKeywords: values.seoKeywords || null,
        ogImageMediaId: values.ogImageMediaId || null,
      };
      if (creating) {
        await api.createTerm(config.kind, body);
        message.success(`${config.singular} created`);
      } else {
        await api.updateTerm(config.kind, id, { ...body, expectedVersion: term?.version ?? 0 });
        message.success(`${config.singular} saved`);
      }
    }).then((ok) => {
      if (ok) navigate(listHref);
    });

  return (
    <RecordEditorPage<Values>
      crumbs={[{ label: 'Editorial' }, { label: config.title, href: listHref }, { label: title }]}
      title={title}
      description={creating ? config.intro : undefined}
      listHref={listHref}
      listLabel={`All ${config.title.toLowerCase()}`}
      form={form}
      loading={!creating && state.status === 'loading'}
      saving={saving}
      error={error ?? (state.status === 'error' ? state.message : null)}
      status={term ? `Version ${term.version} · ${term.postCount} article${term.postCount === 1 ? '' : 's'}` : 'Not saved yet'}
      submitLabel={creating ? 'Create' : 'Save'}
      readOnlyReason={!creating && !mayUpdate ? `You can view this ${config.singular.toLowerCase()} but not change it.` : null}
      onSubmit={save}
    >
      <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name is required' }]}>
        <Input maxLength={80} placeholder="e.g. Food and drink" />
      </Form.Item>
      {/* A category and a tag each have a public landing page, so the address
          is shown here the way it is for a listing or an article. Changing it
          leaves a permanent redirect behind, so saved links keep working. */}
      <Form.Item name="slug" noStyle>
        <PermalinkField
          base={config.publicBase}
          source="name"
          placeholder={slugify(typedName)}
          note={creating ? undefined : 'The old address will redirect here.'}
        />
      </Form.Item>
      <Form.Item label="Landing content (Markdown)" name="landingContent" extra="Shown on the landing page. Without it the page is not indexed.">
        <Input.TextArea placeholder="Markdown shown on the landing page" rows={10} maxLength={5000} showCount />
      </Form.Item>
      <>
          {/* A real heading, so the group is announced as one — the same section the directory categories use. */}
          <div className="as-form-section">
            <h3>Search appearance</h3>
            <p>How this {noun} appears in search results and when shared. Each falls back to the composed title and description, and the site image, when empty.</p>
          </div>
          <Form.Item label="SEO title" name="seoTitle">
            <Input maxLength={180} showCount placeholder={config.kind === 'blog-tags' ? 'e.g. Coffee in Adelaide — roasters, cafés and laneway bars' : 'e.g. Adelaide city guides — walks, markets and laneways'} />
          </Form.Item>
          <Form.Item label="Meta description" name="seoDescription">
            <Input.TextArea rows={3} maxLength={300} showCount placeholder="The summary shown under the title in search results" />
          </Form.Item>
          <Form.Item label="Keywords" name="seoKeywords" extra="Comma separated. Search engines ignore this tag; it will not affect ranking.">
            <Input maxLength={255} placeholder={config.kind === 'blog-tags' ? 'e.g. adelaide coffee, cafés, roasters' : 'e.g. adelaide guides, walking tours, laneways'} />
          </Form.Item>
          <Form.Item label="Share image" name="ogImageMediaId" extra="Used when the landing page is shared. Empty uses the site image.">
            <MediaField current={term?.ogImage ?? null} emptyLabel="The site image is used" clearLabel="Use the site image" aspectRatio="1.91 / 1" />
          </Form.Item>
      </>
    </RecordEditorPage>
  );
}
