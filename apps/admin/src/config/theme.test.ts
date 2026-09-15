import { applyThemeVariables, brand, createAdminTheme, cssVariableName, palettes, type ThemeMode } from './theme';

/** Relative luminance per WCAG 2.x. */
function luminance(hex: string): number {
  const [r, g, b] = hex
    .replace('#', '')
    .match(/.{2}/g)!
    .map((c) => parseInt(c, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

describe('theme', () => {
  it('keeps the fixed pairs readable', () => {
    expect(contrast('#FFFFFF', brand.primarySolid)).toBeGreaterThanOrEqual(4.5); // white text on primary buttons and avatars
    expect(contrast(brand.navyText, brand.navy)).toBeGreaterThanOrEqual(4.5); // nav text on navy
    expect(contrast(brand.navyMuted, brand.navy)).toBeGreaterThanOrEqual(4.5); // nav group titles
  });

  for (const mode of ['light', 'dark'] as ThemeMode[]) {
    const p = palettes[mode];
    it(`meets WCAG AA for text on every ${mode} surface it sits on`, () => {
      for (const surface of [p.surface, p.surfaceRaised, p.surfaceMuted, p.surfaceHover, p.cardTop, p.cardBottom, p.layoutTop, p.layoutBottom]) {
        expect(contrast(p.text, surface), `text on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.textMuted, surface), `muted on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.textSubtle, surface), `subtle on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.link, surface), `link on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.focus, surface), `focus ring on ${surface}`).toBeGreaterThanOrEqual(3);
      }
      // Page titles are drawn as a gradient; both ends must read on the ground.
      for (const end of [p.titleFrom, p.titleTo]) {
        expect(contrast(end, p.layoutTop), `title ${end}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(end, p.layoutBottom), `title ${end}`).toBeGreaterThanOrEqual(4.5);
      }
      // Status words on their own tinted fills.
      expect(contrast(p.success, p.successSoft)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.warning, p.warningSoft)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.danger, p.dangerSoft)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.primary, p.primarySoft)).toBeGreaterThanOrEqual(4.5);
      // Body text on every tinted table row.
      for (const row of [p.rowCritical, p.rowAttention, p.rowProgress, p.rowPositive, p.rowCriticalHover, p.rowAttentionHover, p.rowProgressHover, p.rowPositiveHover]) {
        expect(contrast(p.text, row), `text on row ${row}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('declares every colour in both palettes', () => {
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort());
  });

  it('writes the palette onto the document as the variables brand refers to', () => {
    applyThemeVariables('dark');
    const root = document.documentElement;
    expect(root.dataset.theme).toBe('dark');
    expect(brand.text).toBe(`var(${cssVariableName('text')})`);
    expect(root.style.getPropertyValue('--ms-text')).toBe(palettes.dark.text);
    applyThemeVariables('light');
    expect(root.style.getPropertyValue('--ms-text')).toBe(palettes.light.text);
    expect(root.dataset.theme).toBe('light');
  });

  it('gives Ant real colours, never CSS variables, and the dark algorithm only in dark', () => {
    const dark = createAdminTheme(false, 'dark');
    expect(JSON.stringify(dark.token)).not.toContain('var(');
    expect(JSON.stringify(dark.components)).not.toContain('var(');
    expect(dark.token?.colorBgContainer).toBe(palettes.dark.surfaceRaised);
    expect(createAdminTheme(false, 'light').token?.colorBgContainer).toBe(palettes.light.surfaceRaised);
    expect(dark.algorithm).not.toBe(createAdminTheme(false, 'light').algorithm);
  });

  it('disables motion when the user prefers reduced motion', () => {
    expect(createAdminTheme(true).token?.motion).toBe(false);
    expect(createAdminTheme(false).token?.motion).toBe(true);
  });
});
