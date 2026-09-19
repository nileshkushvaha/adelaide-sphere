import { useEffect, useState } from 'react';
import { TermSelect } from '@/components/TermSelect';
import { Alert, App, Button, Col, Form, Input, InputNumber, List, Modal, Row, Select, Space, Switch, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LinkOutlined } from '@ant-design/icons';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useInvalidate, useOnError, useOne } from '@refinedev/core';
import { Link, useNavigate, useParams } from 'react-router';
import { ACTIONS_BY_STATUS, businessesApi, LINK_KINDS, toNamePath, type BusinessAction, type BusinessRecord, type CreateBusinessInput, type UpdateBusinessInput } from '@/api/businesses';
import { GalleryEditor } from './GalleryEditor';
import { HoursEditor } from './HoursEditor';
import { isApiError } from '@/api/errors';
import { formatDateTime } from '@/shared/format';
import { errorMessage, fieldErrors } from '@/shared/useAsync';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { BrandOptionLabel } from '@/components/BrandIcon';
import { brandLabel } from '@/shared/brands';
import { DangerZone, PageHeader, PageLoader, RecordMetadata, SectionCard, StatusTag, StickyActions } from '@/components/ui';
import { PermalinkField } from '@/components/PermalinkField';
import { brand } from '@/config/theme';
import { useUnsavedChanges } from '@/shared/useUnsavedChanges';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';
import { MediaField } from '@/components/MediaField';

const ACTION_LABELS: Record<BusinessAction, { label: string; title: string; hint: string; danger?: boolean }> = {
  publish: {
    label: 'Publish business',
    title: 'Publish this listing?',
    hint: 'Anyone can find it in the directory and in search results from now on, and visitors can send it enquiries. You can unpublish it again at any time.',
  },
  unpublish: {
    label: 'Unpublish business',
    title: 'Unpublish this listing?',
    hint: 'It returns to draft: visitors can no longer find it and its page stops working. Nothing is deleted, and enquiries already received are kept.',
    danger: true,
  },
  archive: {
    label: 'Archive business',
    title: 'Archive this listing?',
    hint: 'It is hidden everywhere and becomes read-only. Restore it to edit it again.',
    danger: true,
  },
  restore: { label: 'Restore business', title: 'Restore this listing to draft?', hint: 'It becomes editable again and stays private until you publish it.' },
};

type FormValues = Omit<CreateBusinessInput, 'address' | 'contentRightsReviewed'> & {
  hasAddress: boolean;
  address?: { line1?: string; line2?: string | null; suburb?: string; postcode?: string; latitude?: number | null; longitude?: number | null };
  contentRightsReviewed?: boolean;
  links?: { kind: (typeof LINK_KINDS)[number]; url: string; label?: string | null }[];
};

/** Field names as the form labels them, for the error summary. */
const FIELD_LABELS: Record<string, string> = {
  name: 'the business name',
  description: 'the description',
  primaryCategoryId: 'the primary category',
  localAreaId: 'the local area',
  address: 'the address',
  publicPhone: 'the public phone',
  publicEmail: 'the public email',
  publicUrl: 'the website',
  privateEnquiryEmail: 'the enquiry address',
  links: 'the social links',
  slug: 'the web address',
  seoTitle: 'the SEO title',
  seoDescription: 'the meta description',
  seoKeywords: 'the keywords',
  ogImageMediaId: 'the share image',
};

const toForm = (b: BusinessRecord): FormValues => ({
  name: b.name,
  slug: b.slug,
  description: b.description,
  establishedYear: b.establishedYear,
  seoTitle: b.seoTitle,
  seoDescription: b.seoDescription,
  seoKeywords: b.seoKeywords,
  ogImageMediaId: b.ogImageMediaId,
  primaryCategoryId: b.primaryCategoryId,
  secondaryCategoryIds: b.secondaryCategoryIds,
  serviceIds: b.serviceIds,
  localAreaId: b.localAreaId,
  publicPhone: b.publicPhone,
  publicEmail: b.publicEmail,
  publicUrl: b.publicUrl,
  addressVisibility: b.addressVisibility,
  hasAddress: b.address !== null,
  address: b.address ?? undefined,
  privateEnquiryEmail: b.privateEnquiryEmail ?? undefined,
  eligibilitySource: b.eligibilitySource,
  contentRightsReviewed: b.contentRightsReviewedAt !== null,
  contentRightsNote: b.contentRightsNote,
  links: b.links.map((l) => ({ kind: l.kind, url: l.url, label: l.label ?? '' })),
});

const toBody = (v: FormValues, existing: BusinessRecord | null): CreateBusinessInput => {
  const nullable = (s: string | null | undefined) => (s === undefined ? undefined : s === '' ? null : s);
  const body: CreateBusinessInput = {
    name: v.name,
    description: v.description,
    establishedYear: v.establishedYear ?? null,
    seoTitle: nullable(v.seoTitle) ?? null,
    seoDescription: nullable(v.seoDescription) ?? null,
    seoKeywords: nullable(v.seoKeywords) ?? null,
    ogImageMediaId: v.ogImageMediaId ?? null,
    primaryCategoryId: v.primaryCategoryId,
    localAreaId: v.localAreaId,
    secondaryCategoryIds: v.secondaryCategoryIds ?? [],
    serviceIds: v.serviceIds ?? [],
    publicPhone: nullable(v.publicPhone) ?? null,
    publicEmail: nullable(v.publicEmail) ?? null,
    publicUrl: nullable(v.publicUrl) ?? null,
    addressVisibility: v.addressVisibility ?? 'full',
    address: v.hasAddress && v.address ? { line1: v.address.line1 ?? '', line2: nullable(v.address.line2) ?? null, suburb: v.address.suburb ?? '', postcode: v.address.postcode ?? '', latitude: v.address.latitude ?? null, longitude: v.address.longitude ?? null } : null,
    eligibilitySource: nullable(v.eligibilitySource) ?? null,
    contentRightsReviewed: v.contentRightsReviewed ?? false,
    contentRightsNote: nullable(v.contentRightsNote) ?? null,
    links: (v.links ?? []).map((l) => ({ kind: l.kind, url: l.url, label: nullable(l.label) ?? null })),
  };
  // The slug is server-generated on create and locked after first publication; only send it when the editor changed it.
  if (v.slug && v.slug !== existing?.slug) body.slug = v.slug;
  // Leaving the private email blank keeps the stored value; an explicit empty string clears it.
  if (v.privateEnquiryEmail !== undefined && v.privateEnquiryEmail !== (existing?.privateEnquiryEmail ?? undefined)) body.privateEnquiryEmail = v.privateEnquiryEmail === '' ? null : v.privateEnquiryEmail;
  return body;
};

/**
 * Create/edit screen for one business listing with its publication workflow
 * (SRS BUS 001–006, API 005 optimistic concurrency). Every write carries the
 * record version; conflicts, publication blockers and duplicate suspicion are
 * surfaced from the API envelope rather than re-implemented client side.
 */
export function BusinessEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { message } = App.useApp();
  const invalidate = useInvalidate();
  const { mutate: onAuthError } = useOnError();
  const api = businessesApi();
  const { can, loading: capabilitiesLoading } = useCapabilities();
  const canWrite = can(isNew ? PERMISSION.listingsCreate : PERMISSION.listingsUpdate);
  const canPublish = can(PERMISSION.listingsPublish);
  const [form] = Form.useForm<FormValues>();
  const hasAddress = Form.useWatch('hasAddress', form);
  const slugValue = Form.useWatch('slug', form);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: BusinessAction; blockers?: string[]; needsOverride?: boolean } | null>(null);
  const [actionForm] = Form.useForm<{ reason?: string; duplicateOverrideReason?: string }>();

  const record = useOne<BusinessRecord>({ resource: 'businesses', id: id ?? '', queryOptions: { enabled: !isNew, retry: false }, errorNotification: false });
  const business = isNew ? null : (record.result ?? null);
  useDocumentTitle(isNew ? 'New business' : (business?.name ?? 'Business'));

  // The primary category is not offered again among the secondary ones.
  const primaryCategoryId = Form.useWatch('primaryCategoryId', form) as string | undefined;

  useEffect(() => {
    if (business) form.setFieldsValue(toForm(business));
  }, [business, form]);

  // Nothing here saves on its own, so leaving with edits in the form loses them.
  useUnsavedChanges(dirty && !saving);

  const refresh = () => invalidate({ resource: 'businesses', invalidates: ['list', 'detail'], id });

  /**
   * Moving a published listing to a new address. The plain save refuses this
   * once a listing has been published, because the old address has to keep
   * working — this route is the one that leaves the redirect behind.
   */
  const changeAddress = async (slug: string) => {
    // Not published yet: the address is still part of the record being edited.
    if (!business?.firstPublishedAt) {
      form.setFieldValue('slug', slug);
      setDirty(true);
      return;
    }
    try {
      await api.changeSlug(business.id, { slug, expectedVersion: business.version });
      message.success('Address changed. The old one now sends visitors to the new page.');
      await refresh();
    } catch (error) {
      if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
      else message.error(errorMessage(error));
      throw error; // keeps the editor open with what was typed
    }
  };

  const submit = async (values: FormValues) => {
    if (saving) return; // a second click while the first request is in flight
    setFormError(null);
    setSaving(true);
    try {
      if (isNew) {
        const created = await api.create(toBody(values, null));
        message.success('Business created as a draft. It stays private until you publish it.');
        setDirty(false);
        await invalidate({ resource: 'businesses', invalidates: ['list'] });
        navigate(`/businesses/${encodeURIComponent(created.id)}`);
      } else if (business) {
        const body: UpdateBusinessInput = { ...toBody(values, business), expectedVersion: business.version };
        await api.update(business.id, body);
        message.success('Business saved');
        setDirty(false);
        await refresh();
      }
    } catch (error) {
      if (isApiError(error) && error.kind === 'unauthorized') {
        onAuthError(error); // session expired or revoked → auth provider redirects to sign in
      } else if (isApiError(error) && error.code === 'STALE_VERSION') {
        setFormError('This listing was changed by someone else. Reload to see the latest version before saving again.');
      } else if (isApiError(error) && error.code === 'SLUG_LOCKED') {
        form.setFields([{ name: 'slug', errors: [error.userMessage] }]);
        setFormError(error.userMessage);
      } else {
        const errors = fieldErrors(error);
        form.setFields(Object.entries(errors).map(([path, list]) => ({ name: toNamePath(path), errors: list })) as never);
        setFormError(errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  const runAction = async () => {
    if (!business || !pendingAction) return;
    const values = actionForm.getFieldsValue();
    try {
      const updated = await api.transition(business.id, pendingAction.action, { expectedVersion: business.version, reason: values.reason || undefined, duplicateOverrideReason: values.duplicateOverrideReason || undefined });
      message.success(`Listing ${updated.status}`);
      setPendingAction(null);
      actionForm.resetFields();
      await refresh();
    } catch (error) {
      if (isApiError(error) && error.kind === 'unauthorized') onAuthError(error);
      else if (isApiError(error) && error.code === 'PUBLICATION_BLOCKED') setPendingAction({ ...pendingAction, blockers: error.fields.publication ?? [error.userMessage] });
      else if (isApiError(error) && error.code === 'DUPLICATE_SUSPECTED') setPendingAction({ ...pendingAction, needsOverride: true, blockers: undefined });
      else if (isApiError(error) && error.code === 'STALE_VERSION') setPendingAction({ ...pendingAction, blockers: ['This listing was changed by someone else. Reload and try again.'] });
      else setPendingAction({ ...pendingAction, blockers: [errorMessage(error)] });
    }
  };

  if (!isNew && record.query.isError) {
    const error = record.query.error;
    return <Alert type="error" showIcon message={isApiError(error) ? error.userMessage : 'Could not load this business.'} description={isApiError(error) ? error.reference : null} action={<Link to="/businesses">Back to businesses</Link>} />;
  }
  // Capabilities decide whether this form is editable, so the screen waits for
  // them rather than rendering a form that is disabled and then is not
  // (SRS RBAC 010). Behind the route guard they are already known, so this is
  // normally invisible.
  if (capabilitiesLoading) return <PageLoader label="Checking your permissions…" />;
  if (!isNew && !business) return <PageLoader label="Loading this listing…" />;
  const readOnly = !canWrite || business?.status === 'archived';
  const allowed = business ? ACTIONS_BY_STATUS[business.status].filter((action) => (action === 'publish' || action === 'unpublish' ? canPublish : canWrite)) : [];
  // Publishing sits with the publishing state; archiving is destructive and sits
  // on its own, away from the save button.
  const publishActions = allowed.filter((action) => action === 'publish' || action === 'unpublish');
  const lifecycleActions = allowed.filter((action) => action === 'archive' || action === 'restore');
  /** Field names the form is currently unhappy about, for the error summary. */
  const invalidFields = form.getFieldsError().filter((field) => field.errors.length > 0).map((field) => FIELD_LABELS[String(field.name[0])] ?? String(field.name[0]));

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Business', href: '/businesses' }, { label: 'Businesses', href: '/businesses' }, { label: isNew ? 'New business' : business!.name }]}
        title={isNew ? 'Add business' : business!.name}
        description={isNew ? 'Create an Adelaide listing. It stays a private draft until you publish it.' : undefined}
        meta={
          business ? (
            <Space size={8} wrap>
              <StatusTag status={business.status} />
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                Updated {formatDateTime(business.updatedAt)}
              </Typography.Text>
            </Space>
          ) : null
        }
        actions={
          <Space wrap>
            <Link to="/businesses">
              <Button>All businesses</Button>
            </Link>
            {business?.status === 'published' && (
              <Button href={`${import.meta.env.VITE_PUBLIC_SITE_URL ?? ''}/business/${business.slug}`} target="_blank" rel="noreferrer noopener" icon={<LinkOutlined aria-hidden="true" />}>
                View listing
              </Button>
            )}
          </Space>
        }
      />
      {business && business.duplicateWarnings.length > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Possible duplicate" description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{business.duplicateWarnings.map((d) => <li key={d.businessId}><Link to={`/businesses/${encodeURIComponent(d.businessId)}`}>{d.name}</Link> ({d.slug}) — matched on {d.match.replace(/_/g, ' ')}</li>)}</ul>} />
      )}
      {business?.status === 'archived' && <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Archived listings are read-only. Restore it to make changes." />}
      {formError && (
        <Alert
          type="error"
          showIcon
          role="alert"
          style={{ marginBottom: 16 }}
          message={formError}
          description={invalidFields.length > 0 ? `Check ${invalidFields.join(', ')}. Nothing has been lost — your changes are still on this page.` : undefined}
          action={invalidFields.length > 0 ? <Button size="small" onClick={() => form.scrollToField(form.getFieldsError().find((f) => f.errors.length > 0)!.name, { behavior: 'smooth', block: 'center' })}>Go to the first problem</Button> : undefined}
        />
      )}
      <Form<FormValues> form={form} layout="vertical" onFinish={submit} onValuesChange={() => setDirty(true)} disabled={readOnly} initialValues={{ addressVisibility: 'full', hasAddress: true, secondaryCategoryIds: [], serviceIds: [], links: [] }}>
        <Row gutter={24}>
          <Col xs={24} lg={16}>
            <SectionCard title="Business identity" description="What visitors use to recognise this business.">
              <Form.Item label="Business name" name="name" rules={[{ required: true, message: 'Enter the business name' }, { min: 2, max: 120, message: 'Use between 2 and 120 characters' }]}>
                <Input maxLength={120} placeholder="e.g. Norwood Corner Bakery" />
              </Form.Item>
              {/* The address, shown the way a CMS shows it. Before the listing has
                  been published it is part of the form; afterwards it moves through
                  the endpoint that leaves a redirect behind (SRS SEO 004). */}
              {/* The address is part of the record, so it is still a field —
                  it is simply not one an editor types into. */}
              <Form.Item name="slug" hidden>
                <Input />
              </Form.Item>
              <PermalinkField
                base="/business"
                value={slugValue ?? business?.slug ?? ''}
                disabled={readOnly}
                onSave={changeAddress}
                note={
                  business?.firstPublishedAt
                    ? 'The old address will send visitors to the new one, so links already shared keep working.'
                    : 'Made from the name when left blank. It can be changed freely until the listing is published.'
                }
              />
              <Form.Item label="Description" name="description" extra="At least 40 characters are required to publish." rules={[{ required: true, message: 'Description is required' }]}>
                <Input.TextArea rows={6} maxLength={5000} showCount placeholder="What the business does, who it serves and what makes it worth visiting." />
              </Form.Item>
              <Form.Item label="Year established" name="establishedYear" extra="Shown on the listing as “n years in business”. Leave empty if the business has not said." style={{ marginBottom: 0 }}>
                <InputNumber min={1836} max={new Date().getFullYear()} precision={0} controls={false} style={{ width: 140 }} placeholder="e.g. 2012" />
              </Form.Item>
            </SectionCard>

            <SectionCard title="Categories and services" description="Where this business appears in directory search and browsing.">
              <Form.Item label="Primary category" name="primaryCategoryId" extra="Where it is classified first in the directory." rules={[{ required: true, message: 'Choose a primary category' }]}>
                <TermSelect kind="categories" placeholder="Search for a category" />
              </Form.Item>
              <Form.Item label="Secondary categories" name="secondaryCategoryIds">
                <TermSelect kind="categories" multiple placeholder="Search to add any that also apply" excludeIds={primaryCategoryId ? [primaryCategoryId] : []} />
              </Form.Item>
              <Form.Item label="Services" name="serviceIds">
                <TermSelect kind="services" multiple placeholder="Search to add the services offered" />
              </Form.Item>
            </SectionCard>

            <SectionCard
              title="Adelaide location"
              description="The directory covers Adelaide only. A listing outside the approved boundary cannot be published."
            >
              <Form.Item label="Local area" name="localAreaId" extra="The Adelaide area this business trades in." rules={[{ required: true, message: 'Choose a local area' }]}>
                <TermSelect kind="areas" placeholder="Search for an Adelaide area" />
              </Form.Item>
              <Form.Item label="Has a street address" name="hasAddress" valuePropName="checked" extra="Turn this off for a business that trades without a public premises.">
                <Switch />
              </Form.Item>
              {hasAddress && (
                <>
                  <Form.Item label="Address line 1" name={['address', 'line1']} rules={[{ required: true, message: 'Enter the street address' }]}><Input maxLength={120} placeholder="123 Grenfell Street" /></Form.Item>
                  <Form.Item label="Address line 2" name={['address', 'line2']}><Input maxLength={120} placeholder="Level 2, Suite 4 (optional)" /></Form.Item>
                  <Row gutter={16}>
                    <Col xs={24} md={12}><Form.Item label="Suburb" name={['address', 'suburb']} rules={[{ required: true, message: 'Enter the suburb' }]}><Input maxLength={80} placeholder="Norwood" /></Form.Item></Col>
                    <Col xs={24} md={12}><Form.Item label="Postcode" name={['address', 'postcode']} extra="A South Australian postcode." rules={[{ required: true, message: 'Enter the postcode' }, { pattern: /^5\d{3}$/, message: 'Enter a South Australian postcode' }]}><Input maxLength={4} inputMode="numeric" placeholder="3053" /></Form.Item></Col>
                    <Col xs={24} md={12}><Form.Item label="Latitude" name={['address', 'latitude']} extra="Optional. Places the pin on the map."><InputNumber style={{ width: '100%' }} min={-38.1} max={-26} step={0.000001} placeholder="-34.9285" /></Form.Item></Col>
                    <Col xs={24} md={12}><Form.Item label="Longitude" name={['address', 'longitude']} extra="Optional. Places the pin on the map."><InputNumber style={{ width: '100%' }} min={129} max={141} step={0.000001} placeholder="138.6007" /></Form.Item></Col>
                  </Row>
                  <Form.Item label="What visitors see" name="addressVisibility" extra="Choose the area only where a business works from home or by appointment." style={{ marginBottom: 0 }}>
                    <Select placeholder="Choose what visitors see" options={[{ value: 'full', label: 'The full street address' }, { value: 'areaOnly', label: 'The local area only' }]} />
                  </Form.Item>
                </>
              )}
            </SectionCard>

            <SectionCard title="Contact details" description="How visitors reach this business. At least one way to make contact is needed before it can be published.">
              <Row gutter={16}>
                <Col xs={24} md={8}><Form.Item label="Public phone" name="publicPhone"><Input maxLength={30} inputMode="tel" placeholder="03 9000 0000" /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item label="Public email" name="publicEmail"><Input maxLength={254} inputMode="email" placeholder="hello@example.com.au" /></Form.Item></Col>
                <Col xs={24} md={8}><Form.Item label="Website" name="publicUrl" extra="Must start with https:// or http://"><Input maxLength={500} inputMode="url" placeholder="https://example.com.au" /></Form.Item></Col>
              </Row>
              <Typography.Text strong>Social and other links</Typography.Text>
              <Form.List name="links">
                {(fields, { add, remove }) => (
                  <div style={{ marginTop: 8, marginBottom: 16 }}>
                    {fields.map((field) => (
                      <div key={field.key} className="as-field-row">
                        <Form.Item name={[field.name, 'kind']} style={{ marginBottom: 8, width: 150 }}>
                          <Select placeholder="Choose a link type" aria-label="Link type" style={{ width: '100%' }} optionLabelProp="title" options={LINK_KINDS.map((k) => ({ value: k, title: brandLabel(k), label: <BrandOptionLabel kind={k} /> }))} />
                        </Form.Item>
                        <Form.Item name={[field.name, 'url']} rules={[{ required: true, message: 'URL is required' }]} style={{ marginBottom: 8, width: 300 }}>
                          <Input aria-label="Link URL" placeholder="https://facebook.com/yourpage" maxLength={500} inputMode="url" />
                        </Form.Item>
                        <Form.Item name={[field.name, 'label']} style={{ marginBottom: 8, width: 160 }}>
                          <Input aria-label="Link label" placeholder="Shown instead of the network name" maxLength={60} />
                        </Form.Item>
                        <Button type="text" icon={<DeleteOutlined aria-hidden="true" />} aria-label="Remove link" onClick={() => remove(field.name)} />
                      </div>
                    ))}
                    {fields.length < 8 && (
                      <Button size="small" icon={<PlusOutlined aria-hidden="true" />} onClick={() => add({ kind: 'other', url: '', label: '' })} disabled={readOnly}>
                        Add link
                      </Button>
                    )}
                  </div>
                )}
              </Form.List>
            </SectionCard>

            {/* The private address is separated from the public ones deliberately:
                the two look identical in a form and mean opposite things. */}
            <SectionCard
              title="Private enquiry address"
              description="Where enquiries from this listing are forwarded. It is never shown on the site and never given out."
            >
              <Form.Item
                label="Send enquiries to"
                name="privateEnquiryEmail"
                extra={
                  business?.hasPrivateEnquiryEmail && !canWrite
                    ? 'An address is set. Your role cannot see or change it.'
                    : 'Visitors never see this address; their message is forwarded to it.'
                }
                style={{ marginBottom: 0 }}
              >
                <Input
                  maxLength={254}
                  inputMode="email"
                  placeholder={business?.hasPrivateEnquiryEmail ? 'An address is set — type a new one to replace it' : 'owner@example.com.au'}
                />
              </Form.Item>
            </SectionCard>

            <SectionCard
              title="Search appearance"
              description="How the listing looks in search and shares. Empty fields use its name, description and cover photo."
            >
              <Form.Item label="SEO title" name="seoTitle" extra="About 60 characters shows in full in search results.">
                <Input maxLength={180} showCount placeholder="e.g. Norwood Corner Bakery — sourdough bakery in Norwood, Adelaide" />
              </Form.Item>
              <Form.Item label="Meta description" name="seoDescription" extra="The summary under the title in search results; about 155 characters shows in full.">
                <Input.TextArea rows={3} maxLength={300} showCount placeholder="What the business does and where, in a sentence or two" />
              </Form.Item>
              <Form.Item label="Keywords" name="seoKeywords" extra="Comma separated. Search engines ignore this tag; it will not affect ranking.">
                <Input maxLength={255} placeholder="e.g. bakery, sourdough, norwood, adelaide" />
              </Form.Item>
              <Form.Item label="Share image" name="ogImageMediaId" extra="Used when the listing is shared. Empty uses the cover photograph, then the site image." style={{ marginBottom: 0 }}>
                <MediaField current={business?.ogImage ?? null} emptyLabel="The cover photograph is used" clearLabel="Use the cover photograph" aspectRatio="1.91 / 1" />
              </Form.Item>
            </SectionCard>
          </Col>

          <Col xs={24} lg={8}>
            <div className="as-editor-sidebar">
            {business && (
              <SectionCard title="Publishing" description="Where this listing stands, and what is still needed.">
                <Space size={8} wrap style={{ marginBottom: 12 }}>
                  <StatusTag status={business.status} />
                </Space>
                {/* The server decides what publication needs (SRS BUS 002); this
                    lists what it said, rather than checking the rule again here. */}
                {business.status === 'draft' && (
                  business.publicationBlockers.length > 0 ? (
                    <>
                      <Typography.Text strong style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                        {business.publicationBlockers.length} thing{business.publicationBlockers.length === 1 ? '' : 's'} to fix before publishing
                      </Typography.Text>
                      <List
                        size="small"
                        dataSource={business.publicationBlockers}
                        renderItem={(blocker) => (
                          <List.Item style={{ paddingInline: 0, alignItems: 'flex-start', gap: 8 }}>
                            <CloseCircleOutlined aria-hidden="true" style={{ color: brand.danger, marginTop: 4 }} />
                            <span style={{ flex: 1 }}>{blocker}</span>
                          </List.Item>
                        )}
                      />
                    </>
                  ) : (
                    <Typography.Paragraph style={{ marginBottom: 12 }}>
                      <CheckCircleOutlined aria-hidden="true" style={{ color: brand.success, marginRight: 8 }} />
                      Everything needed to publish is in place.
                    </Typography.Paragraph>
                  )
                )}
                <Space wrap style={{ marginTop: 12 }}>
                  {publishActions.map((action) => (
                    <Button
                      key={action}
                      type={action === 'publish' ? 'primary' : 'default'}
                      onClick={() => {
                        actionForm.resetFields();
                        setPendingAction({ action, needsOverride: action === 'publish' && business.duplicateWarnings.length > 0 });
                      }}
                    >
                      {ACTION_LABELS[action].label}
                    </Button>
                  ))}
                </Space>
              </SectionCard>
            )}

            <SectionCard title="Verification" description="Checks an editor makes once, recorded against the listing.">
              <Form.Item
                label="How the Adelaide address was checked"
                name="eligibilitySource"
                extra="The directory covers Adelaide only. Saving this records who confirmed it and when."
              >
                <Input maxLength={255} placeholder="e.g. Checked against the City of Adelaide business register" />
              </Form.Item>
              {business?.eligibilityVerifiedAt && (
                <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
                  Confirmed {formatDateTime(business.eligibilityVerifiedAt)}
                </Typography.Paragraph>
              )}
              <Form.Item
                label="The wording and images may be published"
                name="contentRightsReviewed"
                valuePropName="checked"
                extra="Confirm the business agreed to what appears on its listing."
              >
                <Switch />
              </Form.Item>
              <Form.Item label="Note about permission" name="contentRightsNote" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={3} maxLength={500} placeholder="Who supplied the description and images, and what they agreed to." />
              </Form.Item>
            </SectionCard>

            {business && (
              <SectionCard title="Record history" description="When this listing changed, and which version you are editing.">
                <RecordMetadata
                  items={[
                    { label: 'Added', value: formatDateTime(business.createdAt) },
                    { label: 'Last changed', value: formatDateTime(business.updatedAt) },
                    { label: 'Published', value: business.publishedAt ? formatDateTime(business.publishedAt) : 'Not published' },
                    { label: 'First published', value: business.firstPublishedAt ? formatDateTime(business.firstPublishedAt) : 'Never' },
                    { label: 'Version', value: String(business.version) },
                  ]}
                />
              </SectionCard>
            )}
            </div>
          </Col>
        </Row>
      </Form>

      {business && lifecycleActions.length > 0 && (
        <DangerZone title={business.status === 'archived' ? 'Restore this listing' : 'Archive this listing'}>
          <Typography.Paragraph style={{ marginBottom: 12 }}>
            {business.status === 'archived'
              ? 'Restoring returns it to draft. It stays out of the directory until it is published again.'
              : 'Archiving removes it from the directory and from search straight away. Nothing is deleted, and it can be restored.'}
          </Typography.Paragraph>
          <Space wrap>
            {lifecycleActions.map((action) => (
              <Button
                key={action}
                danger={ACTION_LABELS[action].danger}
                onClick={() => {
                  actionForm.resetFields();
                  setPendingAction({ action });
                }}
              >
                {ACTION_LABELS[action].label}
              </Button>
            ))}
          </Space>
        </DangerZone>
      )}

      {/* The gallery and the opening hours are saved through their own endpoints,
          so they keep their own buttons — but they belong to this record, so they
          sit inside the page above the save bar rather than below it. */}
      {business && (
        <>
          <GalleryEditor businessId={business.id} businessVersion={business.version} readOnly={readOnly} onSaved={() => void refresh()} />
          <HoursEditor businessId={business.id} businessVersion={business.version} readOnly={readOnly} onSaved={() => void refresh()} />
        </>
      )}

      {!readOnly && (
        <StickyActions
          status={
            saving
              ? 'Saving…'
              : dirty
              ? 'You have unsaved changes.'
              : business && business.status === 'draft' && business.publicationBlockers.length > 0
                ? `Saved. ${business.publicationBlockers.length} thing${business.publicationBlockers.length === 1 ? '' : 's'} still to fix before it can be published.`
                : business
                  ? `Saved. Version ${business.version}.`
                  : 'Not saved yet.'
          }
        >
          {!isNew && (
            <Button
              onClick={() => {
                // Put the saved values back. Refetching alone left the form as it
                // was: an unchanged record is the same object, so nothing reset.
                if (business) form.setFieldsValue(toForm(business));
                setFormError(null);
                setDirty(false);
              }}
              disabled={saving || !dirty}
            >
              Discard changes
            </Button>
          )}
          {/* Outside the <form>, so the bar can sit below the gallery and hours;
              submitting through the instance runs the same validation. */}
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {isNew ? 'Create draft' : 'Save changes'}
          </Button>
        </StickyActions>
      )}
      <Modal
        open={pendingAction !== null}
        title={pendingAction ? ACTION_LABELS[pendingAction.action].title : ''}
        okText={pendingAction ? ACTION_LABELS[pendingAction.action].label : 'OK'}
        okButtonProps={{ danger: pendingAction ? ACTION_LABELS[pendingAction.action].danger : false }}
        onOk={() => void runAction()}
        onCancel={() => setPendingAction(null)}
        destroyOnHidden
      >
        {pendingAction && <Typography.Paragraph>{ACTION_LABELS[pendingAction.action].hint}</Typography.Paragraph>}
        {pendingAction?.blockers && <Alert type="error" showIcon role="alert" style={{ marginBottom: 12 }} message="Cannot continue" description={<ul style={{ margin: 0, paddingInlineStart: 18 }}>{pendingAction.blockers.map((b) => <li key={b}>{b}</li>)}</ul>} />}
        <Form form={actionForm} layout="vertical" requiredMark={false}>
          {pendingAction?.needsOverride && (
            <Form.Item label="Duplicate override reason" name="duplicateOverrideReason" extra="Say why this is a different business. It is recorded in the activity log." rules={[{ required: true, min: 10, message: 'Give at least 10 characters' }]}>
              <Input.TextArea rows={3} maxLength={500} placeholder="e.g. Same owner, separate premises trading under its own name." />
            </Form.Item>
          )}
          <Form.Item label="Reason (optional, recorded in the audit log)" name="reason"><Input.TextArea rows={2} maxLength={500} placeholder="Why this change is being made (optional)" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
