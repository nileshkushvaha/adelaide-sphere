import type { ReactNode } from 'react';
import { Card, Typography } from 'antd';
import { Link } from 'react-router';
import { brand } from '@/config/theme';

export type StatTone = 'neutral' | 'attention' | 'critical';

const TONES: Record<StatTone, { fg: string; soft: string; border: string }> = {
  neutral: { fg: brand.primary, soft: brand.primarySoft, border: brand.border },
  attention: { fg: brand.warning, soft: brand.warningSoft, border: brand.warningBorder },
  critical: { fg: brand.danger, soft: brand.dangerSoft, border: brand.dangerBorder },
};

interface Props {
  label: string;
  value: number;
  href?: string;
  tone?: StatTone;
  icon?: ReactNode;
  /** Optional context line, e.g. "oldest waiting 3 days". */
  hint?: ReactNode;
}

/** A single number with its meaning, its severity and a way to act on it. */
export function StatCard({ label, value, href, tone = 'neutral', icon, hint }: Props) {
  const colours = TONES[tone];
  // A tone other than neutral means the number wants attention; the tint and the
  // border say so together, so it reads at a glance without shouting in colour alone.
  const needsAttention = tone !== 'neutral' && value > 0;
  const body = (
    <Card
      style={{ height: '100%', borderColor: needsAttention ? colours.border : undefined }}
      styles={{ body: { padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start' } }}
    >
      {icon && (
        <span
          aria-hidden="true"
          // A neutral figure gets the brand gradient from the stylesheet; one that
          // needs attention takes its status colour instead.
          className={needsAttention ? undefined : 'ms-stat-icon'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 12,
            ...(needsAttention ? { background: colours.soft, color: colours.fg } : {}),
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
      )}
      <span style={{ minWidth: 0 }}>
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
          {label}
        </Typography.Text>
        <Typography.Text
          style={{
            display: 'block',
            fontSize: 30,
            fontWeight: 660,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            color: needsAttention ? colours.fg : brand.text,
          }}
        >
          {value}
        </Typography.Text>
        {hint && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {hint}
          </Typography.Text>
        )}
      </span>
    </Card>
  );
  return href ? (
    <Link to={href} className="ms-card-link" style={{ display: 'block', height: '100%', color: 'inherit' }} aria-label={`${label}: ${value}`}>
      {body}
    </Link>
  ) : (
    body
  );
}
