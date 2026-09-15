import type { ReactNode } from 'react';
import { Breadcrumb, Space, Typography } from 'antd';
import { Link } from 'react-router';
import { brand } from '@/config/theme';

export interface Crumb {
  label: string;
  href?: string;
}

interface Props {
  title: string;
  /** One sentence explaining what the screen is for; shown under the title. */
  description?: ReactNode;
  crumbs?: Crumb[];
  /** Primary and secondary actions, right-aligned on wide screens. */
  actions?: ReactNode;
  /** Status chips or counts rendered beside the title. */
  meta?: ReactNode;
  /**
   * Counts an operator reads before acting, shown as a quiet strip under the
   * description — the numbers that decide whether this screen needs attention.
   */
  metrics?: { label: string; value: ReactNode }[];
}

/**
 * One page heading pattern for every screen: breadcrumbs, a single H1, an
 * optional explanation and the page actions. Consistency here is what makes the
 * admin feel like one product rather than a pile of forms.
 */
export function PageHeader({ title, description, crumbs, actions, meta, metrics }: Props) {
  return (
    // A plain div, not <header>: inside the page it must not become a second banner landmark.
    <div style={{ marginBottom: 22 }}>
      {crumbs && crumbs.length > 0 && (
        <Breadcrumb
          style={{ marginBottom: 10 }}
          items={crumbs.map((crumb) => ({ title: crumb.href ? <Link to={crumb.href}>{crumb.label}</Link> : crumb.label }))}
        />
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <Space align="center" size={10} wrap>
            <Typography.Title level={1} className="ms-page-title" style={{ fontSize: 28, fontWeight: 640, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {title}
            </Typography.Title>
            {meta}
          </Space>
          {description && (
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', maxWidth: 760, fontSize: 14 }}>
              {description}
            </Typography.Paragraph>
          )}
        </div>
        {actions && <Space wrap>{actions}</Space>}
      </div>
      {metrics && metrics.length > 0 && (
        <div className="ms-metric-strip" style={{ marginTop: 14 }}>
          {metrics.map((metric) => (
            <span
              key={metric.label}
              style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 999,
                background: brand.surfaceRaised,
                border: `1px solid ${brand.border}`,
                fontSize: 13,
              }}
            >
              <span style={{ color: brand.textSubtle }}>{metric.label}</span>
              <strong style={{ color: brand.text, fontVariantNumeric: 'tabular-nums' }}>{metric.value}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
