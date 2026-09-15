import { Typography } from 'antd';
import { Link } from 'react-router';
import { brand } from '@/config/theme';

export interface BarItem {
  key: string;
  label: string;
  value: number;
  href?: string;
}

const count = new Intl.NumberFormat('en-AU');

/**
 * Horizontal bars for comparing magnitude across a handful of named rows
 * (dataviz: compare magnitude → bar). One series, so every bar takes the same
 * hue and no legend box; the value is printed at the end of each row, so the
 * chart reads without hovering and needs no separate table.
 */
export function BarList({ items, label, emptyText, color = 'var(--ms-series-1)' }: { items: BarItem[]; label: string; emptyText: string; color?: string }) {
  if (items.length === 0 || items.every((item) => item.value === 0)) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {emptyText}
      </Typography.Text>
    );
  }
  const max = Math.max(...items.map((item) => item.value));
  return (
    <ul aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {items.map((item) => {
        const row = (
          <>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <span style={{ color: brand.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
              <span style={{ color: brand.text, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{count.format(item.value)}</span>
            </span>
            <span aria-hidden="true" style={{ display: 'block', marginTop: 6, height: 10, borderRadius: 4, background: 'var(--ms-chart-track)' }}>
              <span
                className="ms-bar"
                style={{ display: 'block', height: '100%', width: `${(item.value / max) * 100}%`, minWidth: item.value > 0 ? 4 : 0, borderRadius: '0 4px 4px 0', background: color }}
              />
            </span>
          </>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link to={item.href} className="ms-bar-row" style={{ display: 'block', color: 'inherit' }}>
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
