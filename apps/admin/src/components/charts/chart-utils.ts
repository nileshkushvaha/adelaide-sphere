import type { CSSProperties } from 'react';

/** Visually hidden but read by assistive technology. */
export const SR_ONLY: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

/** A clean top for the y axis: four equal whole steps of 1, 2 or 5 × 10ⁿ. */
export function niceMax(value: number): number {
  const rough = Math.max(value, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((multiple) => multiple * magnitude).find((candidate) => candidate >= rough) ?? 10 * magnitude;
  return Math.max(step, 1) * 4;
}
