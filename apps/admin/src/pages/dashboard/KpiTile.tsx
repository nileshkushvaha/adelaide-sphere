import type { ReactNode } from 'react';
import { Card, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, MinusOutlined } from '@ant-design/icons';
import { Link } from 'react-router';
import { Sparkline } from '@/components/charts';
import { brand } from '@/config/theme';

const count = new Intl.NumberFormat('en-AU');

/** Decorative accent families for the tiles; each is a gradient on the top edge, the icon and a soft glow. */
export type KpiAccent = 'sky' | 'violet' | 'teal' | 'amber' | 'rose' | 'indigo';

interface Props {
  label: string;
  accent?: KpiAccent;
  /** Pre-formatted, so a rating can show one decimal and a count a thousands separator. */
  value: string;
  icon?: ReactNode;
  href?: string;
  /** A sentence under the value, e.g. "+4 in the last 30 days". */
  detail?: string | null;
  /** Current and previous period, for a change figure in words and an arrow. */
  change?: { current: number; previous: number } | null;
  trend?: number[];
  color?: string;
}

/** The change in words: volume is not good or bad in itself, so the ink stays neutral and the arrow shows direction. */
function changeText({ current, previous }: { current: number; previous: number }): { text: string; icon: ReactNode } {
  if (previous === 0) return { text: current === 0 ? 'None in either period' : 'None in the previous 30 days', icon: <MinusOutlined /> };
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { text: 'Level with the previous 30 days', icon: <MinusOutlined /> };
  return { text: `${percent > 0 ? '+' : ''}${percent}% vs previous 30 days (${count.format(previous)})`, icon: percent > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined /> };
}

/** A headline figure (dataviz stat tile): label, value, change and an optional sparkline. */
export function KpiTile({ label, value, icon, href, detail, change, trend, color = 'var(--ms-series-1)', accent = 'sky' }: Props) {
  const delta = change ? changeText(change) : null;
  const body = (
    <Card className={`ms-kpi-tile ms-accent-${accent}`} style={{ height: '100%' }} styles={{ body: { padding: 18, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', position: 'relative' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon && (
          <span aria-hidden="true" className="ms-kpi-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 11, fontSize: 16 }}>
            {icon}
          </span>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {label}
        </Typography.Text>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 30, fontWeight: 660, lineHeight: 1.1, letterSpacing: '-0.02em', color: brand.text }}>{value}</span>
        {trend && <Sparkline points={trend} color={color} />}
      </div>
      {(delta || detail) && (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {delta && (
            <span aria-hidden="true" style={{ display: 'inline-flex', fontSize: 11 }}>
              {delta.icon}
            </span>
          )}
          {delta ? delta.text : detail}
        </Typography.Text>
      )}
    </Card>
  );
  return href ? (
    <Link to={href} className="ms-card-link" style={{ display: 'block', height: '100%', color: 'inherit' }}>
      {body}
    </Link>
  ) : (
    body
  );
}
