import { useEffect, useState } from 'react';
import { Alert, App, Avatar, Button, Col, Form, Input, Row, Select, Space, Typography } from 'antd';
import { DeleteOutlined, PictureOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { useNavigate, useParams } from 'react-router';
import { blogApi } from '@/api/blog';
import { toNamePath } from '@/api/businesses';
import type { MediaAsset } from '@/api/media';
import { isApiError } from '@/api/errors';
import { MediaPicker } from '@/components/MediaPicker';
import { RichTextEditorLazy } from '@/components/RichTextEditorLazy';
import { PageLoader, PageHeader, SectionCard, StatusTag, StickyActions, PageLoadError } from '@/components/ui';
import { formatDateTime } from '@/shared/format';
import { errorMessage, fieldErrors, useAsync } from '@/shared/useAsync';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { BrandOptionLabel } from '@/components/BrandIcon';
import { brandLabel } from '@/shared/brands';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { FormSelect } from '@/components/FormSelect';

/** Networks an author profile can link to; the API validates the host of each one. */
const LINK_KINDS = ['website', 'facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok', 'pinterest', 'threads', 'mastodon', 'github', 'other'] as const;

interface FormValues {
  displayName: string;
  role?: string | null;
  shortBio?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  location?: string | null;
  publicEmail?: string | null;
  websiteUrl?: string | null;
  expertise?: string[];
  links?: { kind: string; url: string; label?: string | null }[];
  imageMediaId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

function BioField({ value, onChange, disabled }: { value?: string; onChange?: (html: string) => void; disabled?: boolean }) {
  return <RichTextEditorLazy value={value ?? ''} onChange={(html) => onChange?.(html)} disabled={disabled} ariaLabel="Author biography" minHeight={200} />;
}

/**
 * Full author profile (SRS BLOG 001/004). Everything here is public
 * attribution: no credentials, no administrator email, and the long biography
 * is sanitised by the server before it is stored.
 */
export function AuthorEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined || id === 'new';
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const api = blogApi();
  const { can, loading: capabilitiesLoading } = useCapabilities();
  const canWrite = can(isNew ? PERMISSION.authorsCreate : PERMISSION.authorsUpdate);
  const [form] = Form.useForm<FormValues>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // null means "use the saved photo"; a value (including an explicit null inside) is the pending choice.
  const [photoDraft, setPhotoDraft] = useState<{ url: string; alt: string } | null | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  const [state, reload] = useAsync((signal) => (isNew ? Promise.resolve(null) : api.getAuthor(id!, signal)), [id, reloadKey]);
  const author = state.status === 'ready' ? state.data : null;
  useDocumentTitle(isNew ? 'New author' : (author?.displayName ?? 'Author'));

  useEffect(() => {
    if (!author) return;
    form.setFieldsValue({
      displayName: author.displayName,
      role: author.role,
      shortBio: author.shortBio,
      bio: author.bio,
      pronouns: author.pronouns,
      location: author.location,
      publicEmail: author.publicEmail,
      websiteUrl: author.websiteUrl,
      expertise: author.expertise,
      links: author.links.map((link) => ({ kind: link.kind, url: link.url, label: link.label })),
      imageMediaId: author.imageMediaId,
      seoTitle: author.seoTitle,
      seoDescription: author.seoDescription,
    });
  }, [author, form]);

  const handleError = (error: unknown) => {
    if (isApiError(error) && error.kind === 'unauthorized') {
      onAuthError(error);
      return;
    }
    if (isApiError(error) && error.code === 'STALE_VERSION') {
      setFormError('This author was changed by someone else. Reload to see the current version.');
      return;
    }
    const errors = fieldErrors(error);
    if (Object.keys(errors).length > 0) form.setFields(Object.entries(errors).map(([path, list]) => ({ name: toNamePath(path), errors: list })) as never);
    setFormError(Object.values(errors).flat()[0] ?? errorMessage(error));
  };

  const submit = async (values: FormValues) => {
    setFormError(null);
    setSaving(true);
    try {
      const body = { ...values, links: values.links ?? [], expertise: values.expertise ?? [] };
      if (isNew) {
        const created = await api.createAuthor(body);
        message.success('Author created');
        navigate(`/authors/${encodeURIComponent(created.id)}`);
      } else if (author) {
        await api.updateAuthor(author.id, { ...body, expectedVersion: author.version });
        message.success('Author saved');
        setPhotoDraft(undefined);
        setReloadKey((key) => key + 1);
      }
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  };

  const photo = photoDraft !== undefined ? photoDraft : (author?.image ? { url: author.image.url, alt: author.image.alt } : null);

  // The screen is empty until its record arrives; say so rather than showing a blank disabled form.
  // Capabilities decide whether this form is editable, so the screen waits for
  // them rather than rendering a form that is disabled and then is not
  // (SRS RBAC 010). Behind the route guard they are already known, so this is
  // normally invisible.
  if (capabilitiesLoading) return <PageLoader label="Checking your permissions…" />;

  if (!isNew && state.status === 'loading') return <PageLoader label="Loading this author…" />;
  if (state.status === 'error') return <PageLoadError title="Author" crumbs={[{ label: 'Editorial', href: '/posts' }, { label: 'Authors', href: '/authors' }]} message={state.message} reference={state.reference} onRetry={reload} />;
  if (!isNew && !author) return <p role="status">Loading author…</p>;
  const readOnly = !canWrite;

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Editorial', href: '/posts' }, { label: 'Authors', href: '/authors' }, { label: isNew ? 'New author' : (author?.displayName ?? '') }]}
        title={isNew ? 'New author' : author!.displayName}
        description="This profile appears in bylines and author cards on the public site."
        meta={author ? <StatusTag status={author.active ? 'active' : 'inactive'} /> : null}
      />
      {formError && <Alert type="error" showIcon role="alert" message={formError} style={{ marginBottom: 16 }} />}
      <Form<FormValues> form={form} layout="vertical" requiredMark="optional" onFinish={submit} disabled={readOnly} initialValues={{ links: [], expertise: [] }}>
        <Row gutter={24}>
          <Col xs={24} xl={16}>
            <SectionCard title="Identity" description="How the author is credited across the site.">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item label="Display name" name="displayName" rules={[{ required: true, min: 2, message: 'Display name is required' }]}>
                    <Input maxLength={120} placeholder="e.g. Priya Raman" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="Role" name="role" extra="Shown under the byline.">
                    <Input maxLength={120} placeholder="e.g. Food editor" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Pronouns" name="pronouns" extra="Shown on the author profile, if given.">
                    <Input maxLength={40} placeholder="e.g. they/them" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Based in" name="location" extra="An Adelaide suburb or area.">
                    <Input maxLength={120} placeholder="e.g. Prospect" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="Short biography" name="shortBio" extra="One or two sentences for the author card under each article." style={{ marginBottom: 0 }}>
                <Input.TextArea rows={2} maxLength={300} showCount placeholder="Who they are and what they write about." />
              </Form.Item>
            </SectionCard>

            <SectionCard title="Full biography" description="Shown on the author profile. Formatting is limited to the same allowlist as articles." bodyPadding={0}>
              <Form.Item name="bio" noStyle>
                <BioField disabled={readOnly} />
              </Form.Item>
            </SectionCard>

            <SectionCard title="Profile links" description="One link per network, http(s) only. The API checks each address belongs to that network.">
              <Form.List name="links">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Row key={field.key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                        <Col xs={24} md={6}>
                          <Form.Item name={[field.name, 'kind']} rules={[{ required: true, message: 'Choose a network' }]} style={{ marginBottom: 0 }}>
                            <FormSelect placeholder="Choose a network" optionLabelProp="title" options={LINK_KINDS.map((kind) => ({ value: kind, title: brandLabel(kind), label: <BrandOptionLabel kind={kind} /> }))} aria-label="Network" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={12}>
                          <Form.Item name={[field.name, 'url']} rules={[{ required: true, message: 'Enter the address' }]} style={{ marginBottom: 0 }}>
                            <Input placeholder="https://instagram.com/theirhandle" aria-label="Address" />
                          </Form.Item>
                        </Col>
                        <Col xs={20} md={5}>
                          <Form.Item name={[field.name, 'label']} style={{ marginBottom: 0 }}>
                            <Input placeholder="Shown instead of the network name" maxLength={60} aria-label="Label" />
                          </Form.Item>
                        </Col>
                        <Col xs={4} md={1}>
                          <Button type="text" danger icon={<DeleteOutlined aria-hidden="true" />} aria-label={`Remove link ${field.name + 1}`} onClick={() => remove(field.name)} />
                        </Col>
                      </Row>
                    ))}
                    <Button icon={<PlusOutlined aria-hidden="true" />} onClick={() => add({ kind: 'website', url: '' })} disabled={readOnly || fields.length >= 8}>
                      Add link
                    </Button>
                  </>
                )}
              </Form.List>
            </SectionCard>

            <SectionCard title="Search appearance" description="Used when the author profile is linked or shared.">
              <Form.Item label="SEO title" name="seoTitle" extra="Defaults to the display name.">
                <Input maxLength={180} placeholder="Shown as the headline in search results" />
              </Form.Item>
              <Form.Item label="Meta description" name="seoDescription" extra="Defaults to the short biography." style={{ marginBottom: 0 }}>
                <Input.TextArea rows={3} maxLength={300} showCount placeholder="The summary shown under the title in search results" />
              </Form.Item>
            </SectionCard>
          </Col>

          {/* The side column follows the reader down a long form, the same
              way the business editor's does. */}
          <Col xs={24} xl={8}>
            <div className="as-editor-sidebar as-editor-sidebar--xl">
            <SectionCard title="Photo" description="Choose a processed image from the media library.">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Avatar size={112} src={photo?.url} icon={<UserOutlined aria-hidden="true" />} alt="" />
                <Form.Item name="imageMediaId" hidden>
                  <Input />
                </Form.Item>
                <Space wrap>
                  <Button icon={<PictureOutlined aria-hidden="true" />} onClick={() => setPickerOpen(true)} disabled={readOnly}>
                    {photo ? 'Replace photo' : 'Choose photo'}
                  </Button>
                  {photo && (
                    <Button
                      danger
                      onClick={() => {
                        setPhotoDraft(null);
                        form.setFieldValue('imageMediaId', null);
                      }}
                      disabled={readOnly}
                    >
                      Remove
                    </Button>
                  )}
                </Space>
              </Space>
            </SectionCard>

            <SectionCard title="Contact" description="Public editorial contact only. This is never an administrator login.">
              <Form.Item label="Public email" name="publicEmail" extra="Shown on the public profile, if given.">
                <Input maxLength={255} inputMode="email" placeholder="priya@example.com.au" />
              </Form.Item>
              <Form.Item label="Website" name="websiteUrl" extra="Their own site, if they have one." style={{ marginBottom: 0 }}>
                <Input maxLength={500} placeholder="https://example.com.au" />
              </Form.Item>
            </SectionCard>

            <SectionCard title="Topics" description="Up to eight labels shown on the author card.">
              <Form.Item name="expertise" style={{ marginBottom: 0 }}>
                <Select mode="tags" tokenSeparators={[',']} placeholder="Coffee, markets, transport" maxCount={8} aria-label="Topics" />
              </Form.Item>
            </SectionCard>

            {author && (
              <SectionCard title="Usage">
                <Typography.Paragraph style={{ marginBottom: 4 }}>
                  {author.publishedPostCount} published, {author.postCount} total articles
                </Typography.Paragraph>
                <Typography.Text type="secondary">Last updated {formatDateTime(author.updatedAt)}</Typography.Text>
              </SectionCard>
            )}
            </div>
          </Col>
        </Row>

        {!readOnly && (
          <StickyActions status={author ? `Version ${author.version}` : 'Not saved yet'}>
            <Button onClick={() => navigate('/authors')}>Back to authors</Button>
            <Button type="primary" htmlType="submit" loading={saving}>
              {isNew ? 'Create author' : 'Save changes'}
            </Button>
          </StickyActions>
        )}
      </Form>

      <MediaPicker
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        onPick={(assets: MediaAsset[]) => {
          const asset = assets[0];
          setPickerOpen(false);
          if (!asset) return;
          const url = asset.variants.find((variant) => variant.kind === 'thumbnail')?.url ?? asset.variants[0]?.url;
          form.setFieldValue('imageMediaId', asset.id);
          if (url) setPhotoDraft({ url, alt: asset.altText ?? '' });
        }}
      />
    </div>
  );
}
