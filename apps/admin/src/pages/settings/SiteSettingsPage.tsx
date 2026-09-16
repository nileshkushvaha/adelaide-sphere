import { useEffect, useState } from 'react';
import { Alert, App, Button, Form, Input, InputNumber, Space, Switch, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons';
import { useOnError } from '@refinedev/core';
import { MAX_HERO_PHRASES, MIN_HERO_PHRASES, settingsApi, type HomeSettings } from '@/api/settings';
import { isApiError } from '@/api/errors';
import { toNamePath } from '@/api/businesses';
import { formatDateTime } from '@/shared/format';
import { errorMessage, fieldErrors, useAsync } from '@/shared/useAsync';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { MediaPicker } from '@/components/MediaPicker';
import { PageLoader, PageHeader, SectionCard, StickyActions, PageLoadError } from '@/components/ui';
import { FocalPointPicker } from '@/components/FocalPointPicker';
import { HeroPreview } from './HeroPreview';
import { useUnsavedChanges } from '@/shared/useUnsavedChanges';
import { variantUrl, type MediaAsset } from '@/api/media';
import { brand } from '@/config/theme';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';

interface HeroSlideValue {
  mediaId: string;
  caption?: string | null;
  focalX?: number;
  focalY?: number;
}

interface FormValues {
  heroHeadline: string;
  heroPhrases: string[];
  heroSlides: HeroSlideValue[];
  countersEnabled: boolean;
}

/** At most six banner slides (mirrors the API rule). */
const MAX_HERO_SLIDES = 6;

/**
 * Home/hero settings (SRS CFG 001, HERO 002/007). Edits carry the record
 * version; the API validates the document and audits every change.
 */
export function SiteSettingsPage() {
  useDocumentTitle('Home page settings');
  const api = settingsApi();
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const [form] = Form.useForm<FormValues>();
  const { can } = useCapabilities();
  const mayUpdate = can(PERMISSION.settingsHomeUpdate);
  const [state, reload] = useAsync((signal) => api.getHome(signal), []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Nothing here saves on its own; the banner is easy to lose to a stray click.
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [pickerOpen, setPickerOpen] = useState(false);
  // What the preview draws: the form as it is being typed, not the saved record.
  const watchedHeadline = (Form.useWatch('heroHeadline', form) as string | undefined) ?? '';
  const watchedPhrases = ((Form.useWatch('heroPhrases', form) as string[] | undefined) ?? []).filter((phrase) => typeof phrase === 'string' && phrase.trim() !== '');
  const watchedSlides = (Form.useWatch('heroSlides', form) as HeroSlideValue[] | undefined) ?? [];
  const watchedCounters = (Form.useWatch('countersEnabled', form) as boolean | undefined) ?? false;
  // Previews for images chosen in this session; saved slides come from the record.
  const [addedPreviews, setAddedPreviews] = useState<Record<string, { url: string; alt: string }>>({});
  const record: HomeSettings | null = state.status === 'ready' ? state.data : null;
  const previews: Record<string, { url: string; alt: string }> = {
    ...Object.fromEntries((record?.heroSlides ?? []).map((slide, index) => [slide.mediaId, { url: record?.heroSlidePreviews?.[index]?.previewUrl ?? '', alt: record?.heroSlidePreviews?.[index]?.alt ?? '' }])),
    ...addedPreviews,
  };

  useEffect(() => {
    if (!record) return;
    form.setFieldsValue({
      heroHeadline: record.heroHeadline,
      heroPhrases: record.heroPhrases,
      heroSlides: (record.heroSlides ?? []).map((slide) => ({ mediaId: slide.mediaId, caption: slide.caption ?? '', focalX: slide.focalX ?? 0.5, focalY: slide.focalY ?? 0.5 })),
      countersEnabled: record.countersEnabled,
    });
  }, [record, form]);

  const submit = async (values: FormValues) => {
    if (!record) return;
    setError(null);
    setSaving(true);
    try {
      await api.putHome({
        ...values,
        heroPhrases: values.heroPhrases ?? [],
        heroSlides: (values.heroSlides ?? []).map((slide) => ({ mediaId: slide.mediaId, caption: slide.caption || null, focalX: slide.focalX ?? 0.5, focalY: slide.focalY ?? 0.5 })),
        expectedVersion: record.version,
      });
      message.success('Settings saved');
      setDirty(false);
      reload();
    } catch (err) {
      if (isApiError(err) && err.kind === 'unauthorized') onAuthError(err);
      else if (isApiError(err) && err.code === 'STALE_VERSION') setError('These settings were changed by someone else. Reload before saving again.');
      else {
        const errors = fieldErrors(err);
        form.setFields(Object.entries(errors).map(([path, list]) => ({ name: toNamePath(path), errors: list })) as never);
        setError(Object.keys(errors).length > 0 ? 'Some settings are invalid; check the highlighted fields.' : errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  };

  // The screen is empty until its record arrives; say so rather than showing a blank disabled form.
  if (state.status === 'loading') return <PageLoader label="Loading home page settings…" />;
  if (state.status === 'error') return <PageLoadError title="Home page settings" crumbs={[{ label: 'Configuration' }, { label: 'Home page settings' }]} message={state.message} reference={state.reference} onRetry={reload} />;

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Configuration' }, { label: 'Home page settings' }]}
        title="Home page settings"
        description="The home page banner, headline and counters. Changes appear on the site within a minute."
      />
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} role="alert" />}
      <Form<FormValues> form={form} layout="vertical" requiredMark={false} onFinish={submit} onValuesChange={() => setDirty(true)} disabled={state.status !== 'ready' || !mayUpdate}>
        {!mayUpdate && <Alert type="info" showIcon message="You can view these settings but not change them." style={{ marginBottom: 16 }} />}
        <SectionCard title="Hero wording" description="The heading and the phrases that rotate beneath it.">
          <Form.Item label="Headline" name="heroHeadline" extra="Read by screen readers. Must make sense without the rotating phrases." rules={[{ required: true, message: 'Headline is required' }]}>
            <Input maxLength={80} showCount placeholder="e.g. Everything Adelaide, in one place" />
          </Form.Item>
          <Typography.Text strong>Rotating phrases</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
            Between {MIN_HERO_PHRASES} and {MAX_HERO_PHRASES} phrases, each shown for four seconds. Visitors can pause the rotation, and it stays still for anyone who prefers reduced motion.
          </Typography.Paragraph>
          <Form.List name="heroPhrases">
            {(fields, { add, remove }) => (
              <div>
                {fields.map((field) => (
                  <div key={field.key} className="as-field-row" style={{ flexWrap: 'nowrap' }}>
                    <Form.Item name={field.name} style={{ marginBottom: 8, flex: '1 1 auto', maxWidth: 420 }} rules={[{ required: true, message: 'Phrase is required' }]}>
                      <Input maxLength={60} aria-label={`Phrase ${field.name + 1}`} placeholder="e.g. find a local plumber" />
                    </Form.Item>
                    <Button type="text" icon={<DeleteOutlined aria-hidden="true" />} aria-label={`Remove phrase ${field.name + 1}`} onClick={() => remove(field.name)} disabled={fields.length <= MIN_HERO_PHRASES} />
                  </div>
                ))}
                {fields.length < MAX_HERO_PHRASES && (
                  <Button size="small" icon={<PlusOutlined aria-hidden="true" />} onClick={() => add('')}>
                    Add phrase
                  </Button>
                )}
              </div>
            )}
          </Form.List>
        </SectionCard>

        <SectionCard
          title="Home banner"
          description={`Up to ${MAX_HERO_SLIDES} hero photographs, in this order. With none, the built-in photographs show.`}
          extra={
            <Button icon={<PictureOutlined aria-hidden="true" />} onClick={() => setPickerOpen(true)}>
              Add image
            </Button>
          }
        >
          <Form.List name="heroSlides">
            {(fields, { move, remove }) => (
              <div>
                {fields.length === 0 && (
                  <Typography.Paragraph type="secondary">No banner images yet, so the home page shows the two built-in Adelaide photographs. Add an image from the media library to replace them.</Typography.Paragraph>
                )}
                {fields.map((field, position) => {
                  const mediaId = (form.getFieldValue(['heroSlides', field.name, 'mediaId']) ?? '') as string;
                  const preview = previews[mediaId];
                  return (
                    <div key={field.key} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '12px 0', borderTop: position === 0 ? undefined : '1px solid var(--ant-color-border)' }}>
                      <div style={{ width: 240, flex: '0 0 auto' }}>
                        {preview?.url ? (
                          // The point to keep in frame is chosen on the picture
                          // itself: "0.42, 0.31" is not something anyone can
                          // picture, and the same control already does this on
                          // the media screen.
                          <Form.Item noStyle shouldUpdate>
                            {({ getFieldValue, setFieldValue }) => (
                              <FocalPointPicker
                                src={preview.url}
                                alt={preview.alt}
                                x={getFieldValue(['heroSlides', field.name, 'focalX']) ?? undefined}
                                y={getFieldValue(['heroSlides', field.name, 'focalY']) ?? undefined}
                                onChange={({ x, y }) => {
                                  setFieldValue(['heroSlides', field.name, 'focalX'], x);
                                  setFieldValue(['heroSlides', field.name, 'focalY'], y);
                                  setDirty(true);
                                }}
                              />
                            )}
                          </Form.Item>
                        ) : (
                          <div style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 8, background: brand.placeholderFill, display: 'grid', placeItems: 'center' }}>
                            <PictureOutlined aria-hidden="true" />
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Form.Item name={[field.name, 'mediaId']} hidden>
                          <Input />
                        </Form.Item>
                        <Form.Item label="Caption" name={[field.name, 'caption']} style={{ marginBottom: 8 }} extra="Optional; a short place name shown under the banner controls.">
                          <Input maxLength={120} placeholder="e.g. The River Torrens at dusk" />
                        </Form.Item>
                        {/* Still part of the record, and still submitted; the
                            picture beside this is how they are set. */}
                        <Form.Item name={[field.name, 'focalX']} hidden>
                          <InputNumber />
                        </Form.Item>
                        <Form.Item name={[field.name, 'focalY']} hidden>
                          <InputNumber />
                        </Form.Item>
                      </div>
                      <Space direction="vertical">
                        <Button type="text" icon={<ArrowUpOutlined aria-hidden="true" />} aria-label={`Move image ${position + 1} earlier`} disabled={position === 0} onClick={() => move(position, position - 1)} />
                        <Button type="text" icon={<ArrowDownOutlined aria-hidden="true" />} aria-label={`Move image ${position + 1} later`} disabled={position === fields.length - 1} onClick={() => move(position, position + 1)} />
                        <Button type="text" danger icon={<DeleteOutlined aria-hidden="true" />} aria-label={`Remove image ${position + 1}`} onClick={() => remove(field.name)} />
                      </Space>
                    </div>
                  );
                })}
              </div>
            )}
          </Form.List>
        </SectionCard>

        <SectionCard title="How the hero will look" description="Drawn from what is on this screen right now, before it is saved.">
          <HeroPreview
            headline={watchedHeadline}
            phrases={watchedPhrases}
            slides={watchedSlides.filter((slide) => Boolean(previews[slide.mediaId]?.url)).map((slide) => ({ url: previews[slide.mediaId]!.url, alt: previews[slide.mediaId]!.alt, focalX: slide.focalX, focalY: slide.focalY }))}
            countersEnabled={watchedCounters}
          />
        </SectionCard>

        <SectionCard title="Counters" description="Optional totals under the hero.">
          <Form.Item label="Show counters on the home page" name="countersEnabled" valuePropName="checked" extra="Counts of businesses, categories and areas. Hidden if unavailable.">
            <Switch />
          </Form.Item>
        </SectionCard>
        <StickyActions status={record && record.version > 0 ? `Version ${record.version} · last changed ${formatDateTime(record.updatedAt)}` : 'Not saved yet'}>
          <Button onClick={reload}>Reload</Button>
          {mayUpdate && (
            <Button type="primary" htmlType="submit" loading={saving}>
              Save settings
            </Button>
          )}
        </StickyActions>
      </Form>
      <MediaPicker
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        onPick={(assets: MediaAsset[]) => {
          const asset = assets[0];
          setPickerOpen(false);
          if (!asset) return;
          const current = (form.getFieldValue('heroSlides') ?? []) as HeroSlideValue[];
          if (current.length >= MAX_HERO_SLIDES) {
            message.warning(`At most ${MAX_HERO_SLIDES} banner images`);
            return;
          }
          setAddedPreviews((existing) => ({ ...existing, [asset.id]: { url: variantUrl(asset, 800) ?? variantUrl(asset, 320) ?? '', alt: asset.altText ?? '' } }));
          form.setFieldValue('heroSlides', [...current, { mediaId: asset.id, caption: '', focalX: 0.5, focalY: 0.5 }]);
        }}
      />
    </div>
  );
}
