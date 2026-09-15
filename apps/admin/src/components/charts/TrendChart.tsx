import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Segmented, Table } from 'antd';
import { brand, elevation } from '@/config/theme';
import { SR_ONLY, niceMax } from './chart-utils';

export interface TrendSeries {
  key: string;
  label: string;
  /** One value per day, aligned with `days`. */
  points: number[];
  /** A `--ms-series-*` variable, fixed per entity so a hidden series never repaints the others. */
  color: string;
}

const HEIGHT = 240;
const PAD = { top: 14, bottom: 30, left: 40 };
/** Room on the right for end labels, when the chart is wide enough to carry them. */
const LABEL_ROOM = 112;
const MIN_LABEL_GAP = 16;

const shortDay = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDay = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const count = new Intl.NumberFormat('en-AU');
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/**
 * Daily counts as lines, one per series (dataviz: trend over time → line).
 *
 * Every value is reachable three ways, so none of them gates it: the crosshair
 * tooltip under the pointer, the arrow keys when the chart has focus (read out
 * through a live region), and the table view. With two or more series a legend
 * is always present; end labels are added only when they do not collide.
 */
export function TrendChart({ days, series, label }: { days: string[]; series: TrendSeries[]; label: string }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const instructionsId = useId();

  useEffect(() => {
    const element = frameRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(Math.round(entry.contentRect.width), 240));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [view]);

  const n = days.length;
  const wide = width >= 520;
  const plotW = Math.max(width - PAD.left - (wide ? LABEL_ROOM : 12), 40);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const max = useMemo(() => niceMax(Math.max(0, ...series.flatMap((item) => item.points))), [series]);
  const x = (index: number) => PAD.left + (n <= 1 ? plotW / 2 : (index / (n - 1)) * plotW);
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const yTicks = [0, 1, 2, 3, 4].map((step) => (max / 4) * step);
  const xTicks = n <= 1 ? [0] : [...new Set(width >= 560 ? [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1))) : [0, Math.round((n - 1) / 2), n - 1])];

  // End labels ride the lines only while they stay apart; otherwise the legend
  // and the tooltip carry identity rather than labels nudged off their lines.
  const ends = series.map((item) => ({ item, y: y(item.points[n - 1] ?? 0) })).sort((a, b) => a.y - b.y);
  const labelsFit = wide && ends.every((end, index) => index === 0 || end.y - (ends[index - 1]?.y ?? 0) >= MIN_LABEL_GAP);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left - PAD.left) / plotW;
    setActive(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    if (event.key === 'Escape') {
      setActive(null);
      return;
    }
    const current = active ?? n - 1;
    const next = ({ ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: n - 1 } as Record<string, number>)[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(Math.min(n - 1, Math.max(0, next)));
  };

  const readout = active === null ? '' : `${longDay.format(asDate(days[active] ?? ''))}: ${series.map((item) => `${item.label} ${count.format(item.points[active] ?? 0)}`).join(', ')}`;
  const markerIndex = active ?? n - 1;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        {series.length > 1 ? (
          <ul aria-label="Legend" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', listStyle: 'none', margin: 0, padding: 0 }}>
            {series.map((item) => (
              <li key={item.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: brand.textMuted }}>
                <span aria-hidden="true" style={{ width: 16, height: 2, borderRadius: 1, background: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <Segmented
          size="small"
          value={view}
          onChange={(value) => setView(value as 'chart' | 'table')}
          options={[
            { label: 'Chart', value: 'chart' },
            { label: 'Table', value: 'table' },
          ]}
        />
      </div>

      {view === 'chart' ? (
        <div
          ref={frameRef}
          tabIndex={0}
          role="group"
          aria-label={label}
          aria-describedby={instructionsId}
          className="ms-chart-frame"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((current) => current ?? n - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
          style={{ position: 'relative', touchAction: 'pan-y', borderRadius: 8 }}
        >
          <span id={instructionsId} style={SR_ONLY}>
            Use the left and right arrow keys to read each day. The table view lists every value.
          </span>
          <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} aria-hidden="true" style={{ display: 'block', maxWidth: '100%' }}>
            {yTicks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? 'var(--ms-chart-axis)' : 'var(--ms-chart-grid)'} strokeWidth={1} />
                <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill={brand.textSubtle} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {count.format(tick)}
                </text>
              </g>
            ))}
            {xTicks.map((index) => (
              <text key={index} x={x(index)} y={HEIGHT - 8} textAnchor={index === 0 ? 'start' : index === n - 1 ? 'end' : 'middle'} fontSize={11} fill={brand.textSubtle}>
                {shortDay.format(asDate(days[index] ?? ''))}
              </text>
            ))}
            {active !== null && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--ms-chart-axis)" strokeWidth={1} />}
            {series.map((item) => (
              <path
                key={item.key}
                d={item.points.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join('')}
                fill="none"
                stroke={item.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {n > 0 &&
              series.map((item) => (
                <circle key={item.key} cx={x(markerIndex)} cy={y(item.points[markerIndex] ?? 0)} r={4} fill={item.color} stroke="var(--ms-surface-raised)" strokeWidth={2} />
              ))}
            {labelsFit &&
              active === null &&
              ends.map(({ item, y: endY }) => (
                <text key={item.key} x={PAD.left + plotW + 10} y={endY} dy="0.32em" fontSize={12} fill={brand.textMuted}>
                  {item.label.split(' ')[0]} {count.format(item.points[n - 1] ?? 0)}
                </text>
              ))}
          </svg>
          {active !== null && (
            <div
              style={{
                position: 'absolute',
                top: 4,
                left: Math.min(Math.max(x(active) + 12, 0), Math.max(width - 196, 0)),
                minWidth: 176,
                pointerEvents: 'none',
                background: brand.surfaceRaised,
                border: `1px solid ${brand.border}`,
                borderRadius: 8,
                boxShadow: elevation.raised,
                padding: '8px 10px',
                fontSize: 12,
              }}
            >
              <div style={{ color: brand.textMuted, marginBottom: 4 }}>{longDay.format(asDate(days[active] ?? ''))}</div>
              {series.map((item) => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.7 }}>
                  <span aria-hidden="true" style={{ width: 12, height: 2, background: item.color }} />
                  <strong style={{ color: brand.text, fontVariantNumeric: 'tabular-nums', minWidth: 20 }}>{count.format(item.points[active] ?? 0)}</strong>
                  <span style={{ color: brand.textMuted }}>{item.label}</span>
                </div>
              ))}
            </div>
          )}
          <div aria-live="polite" style={SR_ONLY}>
            {readout}
          </div>
        </div>
      ) : (
        <Table<Record<string, string>>
          size="small"
          pagination={false}
          scroll={{ y: 260 }}
          rowKey="day"
          columns={[{ title: 'Day', dataIndex: 'label', key: 'label' }, ...series.map((item) => ({ title: item.label, dataIndex: item.key, key: item.key, align: 'right' as const }))]}
          dataSource={days
            .map((day, index) => ({ day, label: longDay.format(asDate(day)), ...Object.fromEntries(series.map((item) => [item.key, count.format(item.points[index] ?? 0)])) }))
            .reverse()}
        />
      )}
    </div>
  );
}
