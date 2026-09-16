/**
 * A small trend line for a stat tile: the period in the de-emphasis ink with
 * today's point in the series colour. Decorative — the tile states the number
 * and its change in words, and the full chart has a table view.
 */
export function Sparkline({ points, color, width = 112, height = 32 }: { points: number[]; color: string; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const step = (width - 6) / (points.length - 1);
  const coordinates = points.map((value, index) => [3 + index * step, height - 4 - (value / max) * (height - 8)] as const);
  const last = coordinates.at(-1)!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={coordinates.map(([cx, cy]) => `${cx.toFixed(1)},${cy.toFixed(1)}`).join(' ')} fill="none" stroke="var(--as-chart-axis)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill={color} stroke="var(--as-surface-raised)" strokeWidth={2} />
    </svg>
  );
}
