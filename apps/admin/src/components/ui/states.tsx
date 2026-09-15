import type { ReactNode } from 'react';
import { Alert, Button, Card, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { brand } from '@/config/theme';
import { PageHeader, type Crumb } from './PageHeader';

/**
 * The three things a screen can be when it is not showing data: it failed, the
 * administrator may not see it, or there is nothing here yet. Each says what
 * happened and what to do next — never "Error" on its own.
 */

export function ErrorState({ message, reference, onRetry }: { message: string; reference?: string | null; onRetry?: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      role="alert"
      style={{ marginBottom: 20 }}
      message={message}
      description={
        reference ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Quote reference {reference} if you report this.
          </Typography.Text>
        ) : undefined
      }
      action={onRetry ? <Button onClick={onRetry}>Try again</Button> : undefined}
    />
  );
}

/**
 * A page whose data could not be loaded. It keeps the page's own heading and
 * breadcrumbs — a failed load is still that page, and without its h1 the reader
 * (and a screen reader) loses where they are — and offers the retry below.
 */
export function PageLoadError({ title, crumbs, message, reference, onRetry }: { title: string; crumbs?: Crumb[]; message: string; reference?: string | null; onRetry: () => void }) {
  return (
    <>
      <PageHeader title={title} crumbs={crumbs} />
      <ErrorState message={message} reference={reference} onRetry={onRetry} />
    </>
  );
}

/**
 * Shown where a screen or a section needs a permission the administrator does
 * not hold. It names the missing access rather than presenting an empty page,
 * and it is a courtesy only: the API refuses the request either way.
 */
export function PermissionDenied({ what, action = 'view' }: { what: string; action?: string }) {
  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span
          aria-hidden="true"
          style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 12, background: brand.surfaceMuted, color: brand.textMuted, alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}
        >
          <LockOutlined />
        </span>
        <div>
          <Typography.Text style={{ display: 'block', fontWeight: 600 }}>You do not have access to {action} {what}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Ask an administrator who manages access to grant it, then reload this page.
          </Typography.Text>
        </div>
      </div>
    </Card>
  );
}

/**
 * A bordered area for actions that cannot be undone, kept away from the ordinary
 * save path so the two are never adjacent by accident.
 */
export function DangerZone({ title = 'Irreversible actions', description, children }: { title?: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card
      style={{ marginBottom: 20, borderColor: brand.dangerBorder }}
      styles={{ header: { borderBottomColor: brand.dangerBorder } }}
      title={
        <div style={{ paddingBlock: 6 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: brand.danger }}>{title}</h2>
          {description && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 3, fontWeight: 400, fontSize: 13, whiteSpace: 'normal' }}>
              {description}
            </Typography.Text>
          )}
        </div>
      }
    >
      {children}
    </Card>
  );
}

/**
 * Who last changed a record and when. Shown on detail and edit screens so the
 * question "is this current?" has an answer on the page.
 */
export function RecordMetadata({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', margin: 0, fontSize: 13 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', gap: 6 }}>
          <dt style={{ color: brand.textSubtle, margin: 0 }}>{item.label}</dt>
          <dd style={{ color: brand.text, margin: 0, fontWeight: 500 }}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
