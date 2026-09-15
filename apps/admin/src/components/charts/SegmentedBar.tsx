import type { ReactNode } from 'react';
import { Tooltip, Typography } from 'antd';
import { CheckCircleFilled, ClockCircleFilled, CloseCircleFilled, ExclamationCircleFilled, MinusCircleFilled } from '@ant-design/icons';
import { brand } from '@/config/theme';

export type SegmentTone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral';

export interface Segment {
  key: string;
  label: string;
  value: number;
  tone: SegmentTone;
}

/** Status colours are reserved for state, and never carry meaning without an icon and a label. */
const TONES: Record<SegmentTone, { color: string; icon: ReactNode }> = {
  good: { color: 'var(--ms-status-good)', icon: <CheckCircleFilled /> },
  warning: { color: 'var(--ms-status-warning)', icon: <ClockCircleFilled /> },
  serious: { color: 'var(--ms-status-serious)', icon: <ExclamationCircleFilled /> },
  critical: { color: 'var(--ms-status-critical)', icon: <CloseCircleFilled /> },
  neutral: { color: 'var(--ms-status-neutral)', icon: <MinusCircleFilled /> },
};

const count = new Intl.NumberFormat('en-AU');

/**
 * Part-to-whole across states (dataviz: part-to-whole → stacked bar), with a
 * 2px surface gap between segments and a legend that repeats every value with
 * its icon, label and share — the tooltip only ever adds convenience.
 */
export function SegmentedBar({ segments, label, emptyText }: { segments: Segment[]; label: string; emptyText: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {emptyText}
      </Typography.Text>
    );
  }
  const share = (value: number) => `${Math.round((value / total) * 100)}%`;
  return (
    <div>
      <div aria-hidden="true" style={{ display: 'flex', gap: 2, height: 16, borderRadius: 4, overflow: 'hidden', background: brand.surfaceRaised }}>
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <Tooltip key={segment.key} title={`${segment.label}: ${count.format(segment.value)} (${share(segment.value)})`}>
              <span className="ms-segment" style={{ flexGrow: segment.value, flexBasis: 0, minWidth: 4, background: TONES[segment.tone].color }} />
            </Tooltip>
          ))}
      </div>
      <ul aria-label={label} style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px 16px' }}>
        {segments.map((segment) => (
          <li key={segment.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span aria-hidden="true" style={{ color: TONES[segment.tone].color, fontSize: 14, display: 'inline-flex' }}>
              {TONES[segment.tone].icon}
            </span>
            <span style={{ color: brand.textMuted, flex: 1, minWidth: 0 }}>{segment.label}</span>
            <span style={{ color: brand.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{count.format(segment.value)}</span>
            <span style={{ color: brand.textSubtle, fontVariantNumeric: 'tabular-nums', width: 36, textAlign: 'right' }}>{share(segment.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
