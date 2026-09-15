import axe, { type AxeResults, type RunOptions } from 'axe-core';

/**
 * Runs the axe accessibility rules over a rendered container (SRS NFR 011,
 * WCAG 2.2 AA). Automated rules never prove accessibility on their own, but
 * they catch the regressions a human review would find tedious: missing
 * labels, broken name/role/value, duplicate landmarks and contrast slips.
 */
const OPTIONS: RunOptions = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
  rules: {
    // jsdom has no layout, so colour contrast cannot be computed here; the
    // palette is verified separately in theme.test.ts.
    'color-contrast': { enabled: false },
    // Ant Design renders its own scrollable regions; keyboard access to them is
    // exercised by the interaction tests instead.
    'scrollable-region-focusable': { enabled: false },
  },
};

export async function axeViolations(container: HTMLElement): Promise<AxeResults['violations']> {
  const results = await axe.run(container, OPTIONS);
  return results.violations;
}

/** Formats violations so a failure names the rule and the offending markup. */
export function describeViolations(violations: AxeResults['violations']): string {
  return violations
    .map((violation) => `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n  ${violation.nodes.map((node) => node.html).join('\n  ')}`)
    .join('\n\n');
}
