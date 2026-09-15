import type { ReactNode } from 'react';
import { PALETTE, type StatusTone } from './statusTone';

/**
 * A small label that is not a status: "Featured", "System role", "Current
 * session". It shares the status palette so the admin has one set of tones
 * rather than two, but deliberately carries no dot — the dot is what marks a
 * state in `StatusTag`, and repeating it here would make a label look like a
 * lifecycle state the record does not have.
 *
 * This replaces Ant's `<Tag color="blue">`, whose colours come from Ant's own
 * palette: they ignore the admin's theme tokens, so they stayed bright in the
 * dark theme and did not match anything else on the screen.
 */
export function Pill({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  const colours = PALETTE[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 9px',
        borderRadius: 6,
        fontSize: 12.5,
        fontWeight: 500,
        lineHeight: 1.6,
        color: colours.fg,
        background: colours.bg,
        border: `1px solid ${colours.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
