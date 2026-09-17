import { useEffect, useState } from 'react';
import { Alert, App, Button, Col, Form, Input, Row, Select, Typography } from 'antd';
import { useOnError } from '@refinedev/core';
import { ROBOTS_DIRECTIVES, SEO_ROUTES } from '@adelaide-sphere/domain';
import { seoSettingsApi, type SeoSettings } from '@/api/settings';
import { isApiError } from '@/api/errors';
import { toNamePath } from '@/api/businesses';
import { formatDateTime } from '@/shared/format';
import { errorMessage, fieldErrors, useAsync } from '@/shared/useAsync';
import { useDocumentTitle } from '@/shared/useDocumentTitle';
import { MediaField } from '@/components/MediaField';
import { PageHeader, PageLoader, PageLoadError, SectionCard, StickyActions } from '@/components/ui';
import { useCapabilities } from '@/auth/access-control';
import { PERMISSION } from '@/auth/permissions';

/** How each directive is described to someone who does not write robots tags. */
const ROBOTS_LABELS: Record<(typeof ROBOTS_DIRECTIVES)[number], string> = {
  default: 'Use the site default',
  'index,follow': 'Show in search results',
  'noindex,follow': 'Hide from search results, follow links',
  'noindex,nofollow': 'Hide from search results, ignore links',
};

const CARD_TYPES = [
  { value: 'summary_large_image', label: 'Large image' },
  { value: 'summary', label: 'Small image beside the text' },
];

const LIMITS = { metaTitle: 70, metaDescription: 160, metaKeywords: 255 };

type RouteValues = {
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  canonicalUrl?: string | null;
  robots?: string;
  ogImageMediaId?: string | null;
};

interface FormValues {
  routes: Record<string, RouteValues>;
  twitterCard: string;
  verification: { googleSearchConsole?: string | null; googleAnalyticsId?: string | null; googleTagManagerId?: string | null; facebookPixelId?: string | null };
}

/**
 * Search and social metadata for the pages that have no record behind them
 * (SRS SEO 001).
 *
 * An article or a static page carries its own title and description, edited
 * where its words are edited. The home page, the directory, the blog index, the
 * FAQ page and the contact page are code rather than rows, so this is the only
 * place their metadata can be set — and deliberately the only place, so no
 * field is editable from two screens.
 *
 * One route is edited at a time, but the form holds every route: Ant keeps the
 * values of fields that are not mounted, so switching pages does not discard
 * what was typed, and Save writes the whole document in one versioned change.
 */
export function SeoSettingsPage() {
  useDocumentTitle('SEO settings');
  const api = seoSettingsApi();
  const { message } = App.useApp();
  const { mutate: onAuthError } = useOnError();
  const [form] = Form.useForm<FormValues>();
  const [state, reload] = useAsync((signal) => api.get(signal), []);
  const [saving, setSaving] = useState(false);
  const { can } = useCapabilities();
  const mayUpdate = can(PERMISSION.settingsSeoUpdate);
  const [error, setError] = useState<string | null>(null);
  const [routeKey, setRouteKey] = useState(SEO_ROUTES[0]!.key);

  const record: SeoSettings | null = state.status === 'ready' ? state.data : null;
  const route = SEO_ROUTES.find((entry) => entry.key === routeKey)!;

  useEffect(() => {
    if (!record) return;
    const routes: Record<string, RouteValues> = {};
    for (const entry of SEO_ROUTES) {
      const stored = record.routes[entry.key];
      routes[entry.key] = {
        metaTitle: stored?.metaTitle ?? '',
        metaDescription: stored?.metaDescription ?? '',
        metaKeywords: stored?.metaKeywords ?? '',
        canonicalUrl: stored?.canonicalUrl ?? '',
        robots: stored?.robots ?? 'default',
        ogImageMediaId: stored?.ogImageMediaId ?? null,
      };
    }
    form.setFieldsValue({
      routes,
      twitterCard: record.twitterCard,
      verification: {
        googleSearchConsole: record.verification?.googleSearchConsole ?? '',
        googleAnalyticsId: record.verification?.googleAnalyticsId ?? '',
        googleTagManagerId: record.verification?.googleTagManagerId ?? '',
        facebookPixelId: record.verification?.facebookPixelId ?? '',
      },
      // The document's own shape; Ant's generic form typing cannot express a map
      // keyed by route, so this is asserted once here rather than at every field.
    } as never);
  }, [record, form]);


  const submit = async (values: FormValues) => {
    if (!record) return;
    setError(null);
    setSaving(true);
    try {
      await api.put({
        routes: values.routes as never,
        twitterCard: values.twitterCard as 'summary' | 'summary_large_image',
        verification: values.verification as never,
        expectedVersion: record.version,
      });
      message.success('SEO settings saved.');
      reload();
    } catch (err) {
      if (isApiError(err) && err.kind === 'unauthorized') onAuthError(err);
      else if (isApiError(err) && err.code === 'STALE_VERSION') setError('These settings were changed by someone else. Reload before saving again.');
      else {
        const errors = fieldErrors(err);
        form.setFields(Object.entries(errors).map(([path, list]) => ({ name: toNamePath(path), errors: list })) as never);
        // A refusal may belong to a page that is not on screen, so say which.
        const firstPath = Object.keys(errors)[0];
        const named = firstPath?.startsWith('routes.') ? SEO_ROUTES.find((entry) => entry.key === firstPath.split('.')[1]) : undefined;
        setError(
          Object.keys(errors).length === 0
            ? errorMessage(err)
            : named
              ? `Some settings for ${named.label} are invalid; check the highlighted fields.`
              : 'Some settings are invalid; check the highlighted fields.',
        );
        if (named) setRouteKey(named.key);
      }
    } finally {
      setSaving(false);
    }
  };

  if (state.status === 'loading') return <PageLoader label="Loading SEO settings…" />;
  if (state.status === 'error') {
    return <PageLoadError title="SEO settings" crumbs={[{ label: 'Configuration' }, { label: 'SEO settings' }]} message={state.message} reference={state.reference} onRetry={reload} />;
  }

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Configuration' }, { label: 'SEO settings' }]}
        title="SEO settings"
        description="Search and social metadata for the pages that are not records."
      />

      {error && <Alert type="error" showIcon role="alert" message={error} style={{ marginBottom: 16 }} />}

      <Form<FormValues> form={form} layout="vertical" disabled={saving || !mayUpdate} onFinish={(values) => void submit(values)} requiredMark={false}>
        {!mayUpdate && <Alert type="info" showIcon message="You can view these settings but not change them." style={{ marginBottom: 16 }} />}
        <SectionCard
          title="Search and social metadata"
          description="What you set replaces the page's own text. Empty fields keep it."
        >
          <Form.Item label="Page" style={{ maxWidth: 520 }}>
            <Select
              value={routeKey}
              onChange={setRouteKey}
              aria-label="Page to edit"
              options={SEO_ROUTES.map((entry) => ({ value: entry.key, label: `${entry.label} · ${entry.path}` }))}
            />
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ marginTop: -8, fontSize: 13 }}>
            {route.description}
          </Typography.Paragraph>

          <Row gutter={20}>
            <Col xs={24} lg={12}>
              <Form.Item label="Meta title" name={['routes', routeKey, 'metaTitle']} extra={`Up to ${LIMITS.metaTitle} characters. The browser tab and the headline in search results.`}>
                <Input maxLength={LIMITS.metaTitle} showCount placeholder="e.g. Adelaide business directory" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item
                label="Meta keywords"
                name={['routes', routeKey, 'metaKeywords']}
                extra="Comma separated. Search engines ignore this tag; it will not affect ranking."
              >
                <Input maxLength={LIMITS.metaKeywords} placeholder="e.g. cafes, trades, adelaide" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Meta description" name={['routes', routeKey, 'metaDescription']} extra={`Up to ${LIMITS.metaDescription} characters. The snippet under the link in search results.`}>
            <Input.TextArea rows={3} maxLength={LIMITS.metaDescription} showCount placeholder="e.g. Browse cafes, trades and services across Adelaide, with hours and contact details." />
          </Form.Item>

          <Row gutter={20}>
            <Col xs={24} lg={12}>
              <Form.Item label="Canonical URL" name={['routes', routeKey, 'canonicalUrl']} extra="Leave empty to use the page's own address.">
                <Input placeholder="https://adelaidesphere.com/business" inputMode="url" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="Search engines" name={['routes', routeKey, 'robots']} extra="Hiding removes it from search results, not from the site.">
                <Select options={ROBOTS_DIRECTIVES.map((value) => ({ value, label: ROBOTS_LABELS[value] }))} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Share image" name={['routes', routeKey, 'ogImageMediaId']} extra="Shown when this page is shared. Ideally 1200 × 630. Empty uses the site image.">
            <MediaField current={record?.shareImages?.[routeKey] ?? null} emptyLabel="The site image is used" clearLabel="Use the site image" aspectRatio="1.91 / 1" />
          </Form.Item>
        </SectionCard>

        <SectionCard
          title="Verification and analytics"
          description="Identifiers for the tools this site is connected to. These are public values, not secrets."
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Analytics load only after a visitor accepts them"
            description="Visitors who decline are not tracked, so your totals will be lower than your traffic."
          />
          <Row gutter={20}>
            <Col xs={24}>
              <Form.Item label="Google Search Console verification" name={['verification', 'googleSearchConsole']} extra="The content value from the meta tag. Sets no cookie, so it is always published.">
                <Input placeholder="google-site-verification content value" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="Google Analytics ID" name={['verification', 'googleAnalyticsId']} extra="Loaded after a visitor accepts analytics cookies.">
                <Input placeholder="G-XXXXXXXXXX" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="Google Tag Manager ID" name={['verification', 'googleTagManagerId']} extra="Loaded after a visitor accepts analytics cookies.">
                <Input placeholder="GTM-XXXXXXX" />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item label="Meta Pixel ID" name={['verification', 'facebookPixelId']} extra="Loaded after a visitor accepts analytics cookies.">
                <Input placeholder="000000000000000" inputMode="numeric" />
              </Form.Item>
            </Col>
          </Row>
        </SectionCard>

        <SectionCard title="Sharing" description="How every page looks when it is shared, unless the page sets its own image above.">
          <Form.Item label="Card style" name="twitterCard" style={{ maxWidth: 380 }} extra="Used by X and honoured by several other platforms.">
            <Select options={CARD_TYPES} />
          </Form.Item>
        </SectionCard>

        {/* Version 0 means nothing has ever been saved, so there is no
            timestamp to show — the stored one is the epoch. */}
        <StickyActions status={record && record.version > 0 ? `Version ${record.version} · saved ${formatDateTime(record.updatedAt)}` : 'Nothing saved yet'}>
          {mayUpdate && (
            <Button type="primary" htmlType="submit" loading={saving}>
              Save SEO settings
            </Button>
          )}
        </StickyActions>
      </Form>

    </div>
  );
}
