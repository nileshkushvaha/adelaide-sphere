/**
 * Helper text stays short (client instruction, 12 September 2026).
 *
 * A description under a page or section title is read once and should fit on a
 * line; a hint under a field is read while typing and should be shorter still.
 * Anything longer belongs in the documentation, not on every visit to a screen.
 * This reads the source, so a long string fails here before anyone sees it.
 */
const sources = import.meta.glob(['./**/*.tsx', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const LIMITS = { description: 110, extra: 90 } as const;
const ATTRIBUTE = /\b(description|extra)=(?:"([^"]+)"|\{`([^`]+)`\}|\{'([^']+)'\})/g;

describe('helper text', () => {
  it('keeps every description and field hint within its limit', () => {
    const tooLong: string[] = [];
    for (const [file, source] of Object.entries(sources)) {
      for (const match of source.matchAll(ATTRIBUTE)) {
        const kind = match[1] as keyof typeof LIMITS;
        const text = match[2] ?? match[3] ?? match[4] ?? '';
        if (text.length > LIMITS[kind]) tooLong.push(`${file} ${kind} (${text.length}): ${text.slice(0, 60)}…`);
      }
    }
    expect(tooLong).toEqual([]);
  });

  it('actually reads the screens it is checking', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });
});
