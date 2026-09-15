/**
 * Renders the footer copyright line from the template an administrator saved
 * (SRS CFG 001). The template is rendered on the client tier, not stored
 * rendered, so the year is correct even when the settings payload has been
 * cached across a new year.
 *
 * This mirrors `renderCopyright` in the API (`apps/api/src/settings/general-settings.ts`),
 * which validates that only these placeholders appear; `copyright.test.ts`
 * pins the two to the same behaviour.
 */
export function renderCopyright(template: string | null | undefined, context: { year: number; name: string }): string {
  const line = template && template.trim() !== '' ? template : '© {year} {name}. All rights reserved.';
  return line.replace(/\{(year|name)\}/g, (_match, key: string) => (key === 'year' ? String(context.year) : context.name));
}
