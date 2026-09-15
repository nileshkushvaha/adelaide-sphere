import { Typography } from 'antd';
import { alertPresentation, validateAlertLink } from '@adelaide-sphere/domain/alerts';
import { brand } from '@/config/theme';
import type { AlertPreviewInput } from './alert-preview-model';

/**
 * A preview of the public banner, drawn inside the admin.
 *
 * Two rules make this safe rather than merely useful:
 *
 *  * **The colours are not chosen here.** Background, foreground and tone come
 *    from `@adelaide-sphere/domain/alerts`, the same table the public banner
 *    reads, so the preview cannot flatter an alert the site will render
 *    differently. A parity test on each side pins both to that table.
 *  * **It is `aria-hidden`, and says so in words.** A live region inside an
 *    editor would re-announce itself on every keystroke — a worse accessibility
 *    defect than the one this preview exists to prevent — so the announcement
 *    behaviour is described in text beside it instead of performed.
 *
 * The public banner is a Tailwind component in another application and is
 * deliberately not imported: the admin is Ant Design, and dragging a second
 * design system into it to save thirty lines would cost more than it saves.
 */
export function ServiceAlertPreview({ alert, width = '100%' }: { alert: AlertPreviewInput; width?: number | string }) {
  const presentation = alertPresentation(alert.severity);
  // The same validator the server used when it accepted the link, so "opens in a
  // new tab" is the truth rather than a guess about a leading slash.
  const link = alert.linkUrl ? validateAlertLink(alert.linkUrl) : null;

  return (
    <div
      style={{
        width,
        maxWidth: '100%',
        border: `1px solid ${brand.border}`,
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {/* Hidden from assistive technology on purpose: this is a picture of a
          banner, not a banner. Its role and politeness are stated below. */}
      <div aria-hidden="true" data-tone={presentation.tone} style={{ background: presentation.background, color: presentation.foreground, padding: '10px 14px', fontSize: 13, lineHeight: 1.5 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ margin: 0, minWidth: 0 }}>
            <strong>{alert.title || 'Alert title'}</strong> <span>{alert.message || 'The message visitors will read.'}</span>
            {link && alert.linkLabel && (
              <>
                {' '}
                <span style={{ textDecoration: 'underline', textUnderlineOffset: 3, fontWeight: 600 }}>{alert.linkLabel}</span>
              </>
            )}
          </p>
          {alert.dismissible && <span style={{ flexShrink: 0 }}>×</span>}
        </div>
      </div>
      <div style={{ padding: '10px 14px', background: brand.surfaceMuted, fontSize: 12.5, lineHeight: 1.5 }}>
        <Typography.Text type="secondary" style={{ display: 'block' }}>
          {presentation.ariaLive === 'assertive'
            ? 'A screen reader interrupts what it is saying to read this out.'
            : 'A screen reader reads this out when it reaches a pause, without interrupting.'}
        </Typography.Text>
        {alert.linkUrl && (
          <Typography.Text type="secondary" style={{ display: 'block' }}>
            {link === null
              ? 'This link address will be refused when you save.'
              : link.external
                ? 'The link leaves this site, so it opens in a new tab.'
                : 'The link stays on this site.'}
          </Typography.Text>
        )}
        {alert.dismissible && (
          <Typography.Text type="secondary" style={{ display: 'block' }}>
            Visitors can close it. Editing the wording brings it back for everyone who closed the earlier version.
          </Typography.Text>
        )}
      </div>
    </div>
  );
}
