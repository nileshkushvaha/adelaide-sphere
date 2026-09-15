import { Collapse, Form, Input, Progress, Typography, theme } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { Post } from '@/api/blog';
import { MediaField } from '@/components/MediaField';
import { brand } from '@/config/theme';
import { seoChecks } from './seoChecks';

interface Props {
  post: Post | null;
  readOnly: boolean;
  resetKey: number;
}

/** A length meter for a search field: short, good, or long enough to be cut off. */
function LengthMeter({ length, min, max, what }: { length: number; min: number; max: number; what: string }) {
  const state = length === 0 ? 'empty' : length < min ? 'short' : length > max ? 'long' : 'good';
  const text = {
    empty: `Uses the ${what}.`,
    short: `${length} characters — a little short; around ${min}–${max} works best.`,
    long: `${length} characters — search engines may cut it off after about ${max}.`,
    good: `${length} characters — a good length.`,
  }[state];
  return (
    <div style={{ marginTop: 4 }}>
      <Progress
        percent={Math.min(100, Math.round((length / max) * 100))}
        showInfo={false}
        size="small"
        status={state === 'long' ? 'exception' : state === 'good' ? 'success' : 'normal'}
        aria-hidden="true"
      />
      <Typography.Text type={state === 'long' ? 'danger' : 'secondary'} style={{ fontSize: 12.5 }}>
        {text}
      </Typography.Text>
    </div>
  );
}

/** Advice from the focus phrase and the text as it stands; it never blocks publishing (SRS 1.10 BLOG 005). */
function SearchAdvice({ slug }: { slug: string }) {
  const { token } = theme.useToken();
  const focusPhrase = (Form.useWatch('seoKeywords') as string | null | undefined) ?? '';
  const title = (Form.useWatch('title') as string | undefined) ?? '';
  const seoTitle = (Form.useWatch('seoTitle') as string | null | undefined) ?? '';
  const summary = (Form.useWatch('excerpt') as string | undefined) ?? '';
  const seoDescription = (Form.useWatch('seoDescription') as string | null | undefined) ?? '';
  const bodyHtml = (Form.useWatch('bodyMarkdown') as string | undefined) ?? '';
  const checks = seoChecks({ focusPhrase, title, seoTitle, summary, seoDescription, slug, bodyHtml });
  const toImprove = checks.filter((check) => check.status === 'improve').length;
  return (
    <section aria-labelledby="search-advice-heading" style={{ marginTop: 12 }}>
      <Typography.Title level={3} id="search-advice-heading" style={{ fontSize: 15, margin: '0 0 2px' }}>
        Search advice
      </Typography.Title>
      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginBottom: 6 }}>
        {toImprove === 0 ? 'Looking good. ' : `${toImprove} ${toImprove === 1 ? 'suggestion' : 'suggestions'}. `}Advice only — it never stops you publishing.
      </Typography.Text>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {checks.map((check) => (
          <li key={check.code} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '3px 0', fontSize: 13.5 }}>
            {check.status === 'good' ? (
              <CheckCircleOutlined aria-hidden="true" style={{ color: token.colorSuccess, marginTop: 3 }} />
            ) : (
              <ExclamationCircleOutlined aria-hidden="true" style={{ color: token.colorWarning, marginTop: 3 }} />
            )}
            <span className="sr-only">{check.status === 'good' ? 'Good:' : 'Suggestion:'}</span>
            <span>{check.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * How the article looks in search results and when shared. Everything here is
 * optional and starts from the title, summary and featured image, so it is
 * folded away until someone wants to change it.
 */
export function SearchSharingPanel({ post, readOnly, resetKey }: Props) {
  const title = (Form.useWatch('title') as string | undefined) ?? '';
  const seoTitle = (Form.useWatch('seoTitle') as string | null | undefined) ?? '';
  const excerpt = (Form.useWatch('excerpt') as string | undefined) ?? '';
  const seoDescription = (Form.useWatch('seoDescription') as string | null | undefined) ?? '';
  const slug = (Form.useWatch('slug') as string | undefined) || post?.slug || 'article-address';
  const shownTitle = seoTitle || title || 'Article title';
  const shownDescription = seoDescription || excerpt || 'Your summary appears here.';
  const shareImage = post?.ogImage ?? post?.cover ?? null;

  return (
    <Collapse
      className="ms-search-sharing"
      style={{ marginBottom: 16 }}
      items={[
        {
          key: 'search',
          label: 'Search results and sharing',
          // Rendered while folded, so the previews stay current and findable.
          forceRender: true,
          children: (
            <div>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
                How this article is likely to look in search results.
              </Typography.Text>
              {/* Imitates a results page, which is light, so it stays light in both themes. */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 12, marginBottom: 16, background: '#FFFFFF' }}>
                <span style={{ color: '#1a0dab', fontSize: 16, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shownTitle}</span>
                <span style={{ color: '#4D5156', fontSize: 12, display: 'block' }}>adelaidesphere · /blog/{slug}</span>
                <span style={{ color: '#3C4043', fontSize: 13 }}>{shownDescription.slice(0, 160)}</span>
              </div>
              <Form.Item label="Title in search results" name="seoTitle" extra="Leave empty to use the article title." style={{ marginBottom: 12 }}>
                <Input maxLength={180} placeholder={title || 'Shown as the headline in search results'} />
              </Form.Item>
              <LengthMeter length={(seoTitle || title).length} min={30} max={60} what="article title" />
              <Form.Item label="Description in search results" name="seoDescription" extra="Leave empty to use the summary." style={{ margin: '16px 0 12px' }}>
                <Input.TextArea rows={3} maxLength={300} placeholder={excerpt || 'The summary shown under the title in search results'} />
              </Form.Item>
              <LengthMeter length={(seoDescription || excerpt).length} min={70} max={160} what="summary" />
              <Form.Item label="Focus phrase" name="seoKeywords" extra="The words people would search for, e.g. “Fitzroy walking tour”." style={{ margin: '16px 0 4px' }}>
                <Input maxLength={255} placeholder="e.g. laneway cafés" />
              </Form.Item>
              <SearchAdvice slug={slug} />

              <Typography.Title level={3} style={{ fontSize: 15, margin: '24px 0 4px' }}>
                When shared on social media
              </Typography.Title>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
                Leave the share image empty to use the featured image.
              </Typography.Text>
              <div style={{ border: `1px solid ${brand.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 12, maxWidth: 420 }}>
                {shareImage ? (
                  <img src={shareImage.url} alt="" style={{ width: '100%', aspectRatio: '1.91 / 1', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ aspectRatio: '1.91 / 1', background: brand.placeholderFill, display: 'flex', alignItems: 'center', justifyContent: 'center', color: brand.textMuted, fontSize: 13 }}>
                    No image chosen — most networks will show plain text
                  </div>
                )}
                <div style={{ padding: '10px 12px' }}>
                  <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, display: 'block' }}>
                    adelaidesphere
                  </Typography.Text>
                  <Typography.Text strong style={{ display: 'block' }} ellipsis>
                    {shownTitle}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {shownDescription.slice(0, 120)}
                  </Typography.Text>
                </div>
              </div>
              <Form.Item label="Share image" name="ogImageMediaId" style={{ marginBottom: 0 }}>
                <MediaField key={resetKey} current={post?.ogImage ?? null} aspectRatio="1.91 / 1" emptyLabel="Uses the featured image" clearLabel="Use the featured image" disabled={readOnly} />
              </Form.Item>
            </div>
          ),
        },
      ]}
    />
  );
}
