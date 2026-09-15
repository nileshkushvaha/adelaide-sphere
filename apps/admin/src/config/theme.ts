import { theme as antTheme, type ThemeConfig } from 'antd';

/**
 * Design tokens for the admin interface (SRS UX 001), in a light and a dark
 * palette. Light is the default; dark is the reader's choice and is remembered
 * in their browser (`src/theme/theme-mode.ts`).
 *
 * One source, two consumers:
 *
 *  * **Ant Design** needs real colours — its dark algorithm and hover states are
 *    computed from them — so `createAdminTheme` reads the active palette.
 *  * **Everything else** reads `brand`, whose adaptive entries are CSS variables
 *    (`var(--ms-text)`), written onto the document from the same palette by
 *    `applyThemeVariables`. An inline style written as `brand.text` therefore
 *    follows the theme without the screen knowing a theme exists.
 *
 * Contrast is checked for both palettes in `theme.test.ts` (WCAG AA: 4.5:1 for
 * text on every surface it sits on, 3:1 for the focus ring and borders that
 * carry meaning).
 */

/** Colours that are the same in both themes: the navigation stays navy. */
const fixed = {
  navy: '#012169',
  /** Foot of the navigation gradient; a navy that has cooled, not a second colour. */
  navyDeep: '#00164A',
  navyRaised: '#0D2F80', // hover/rail surfaces on the dark navigation
  navyText: '#E6EEF8',
  navyMuted: '#A9BBDD',
  /** A fill that always carries white text (avatars, the logo mark): flag blue, 9:1 with white. */
  primarySolid: '#0B3AA4',
  primarySolidHover: '#1747B8',
} as const;

const lightPalette = {
  primary: '#0B3AA4', // flag blue: text, icons, accents
  primaryHover: '#1747B8',
  primaryActive: '#082C80',
  primarySoft: '#E5EBF8', // selected rows and soft badges
  primarySofter: '#F3F6FC', // tinted panels behind soft badges
  primaryBorder: '#C3D1F0',
  link: '#0B3AA4',
  surface: '#F4F7FB',
  surfaceSunken: '#EEF3F9', // the ground the content cards sit on
  surfaceRaised: '#FFFFFF', // cards, dialogs, inputs
  surfaceMuted: '#F8FAFC', // table headers, read-only descriptions, inset rows
  surfaceHover: '#F7FAFD',
  border: '#E2E8F0',
  borderSoft: '#EEF2F7',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textMuted: '#475569',
  textSubtle: '#5F6F85', // 4.8:1 on the page ground; #64748B was 4.4:1 there (breadcrumbs)
  success: '#15803D',
  successSoft: '#DCFCE7',
  successBorder: '#BBF7D0',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  warningBorder: '#FDE68A',
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  dangerBorder: '#FECACA',
  focus: '#B45309', // amber-700: >= 3:1 against both navy and white (WCAG 1.4.11)
  focusGap: '#FFFFFF', // the ring's inner gap, so the ring reads on any fill
  headerBg: 'rgba(255, 255, 255, 0.78)',
  stickyBg: 'rgba(255, 255, 255, 0.92)',
  // The ground: three soft glows (flag blue, indigo, flag red) over a cool gradient —
  // the same light the sign-in screen is lit by, turned down for daily work.
  glowSky: 'rgba(11, 58, 164, 0.10)',
  glowIndigo: 'rgba(99, 102, 241, 0.07)',
  glowTeal: 'rgba(228, 0, 43, 0.06)',
  layoutTop: '#F6F9FD',
  layoutBottom: '#EDF2F9',
  cardTop: '#FFFFFF',
  cardBottom: '#FBFCFE',
  siderTop: '#012169',
  siderMid: '#011C5C',
  siderBottom: '#00164A',
  siderEdge: 'rgba(255, 255, 255, 0.06)',
  titleFrom: '#012169', // page titles run flag blue → flag red; both ends >= 5.2:1 on the ground
  titleTo: '#C8102E',
  rowCritical: '#FEF2F2',
  rowCriticalHover: '#FEE2E2',
  rowAttention: '#FFFBEB',
  rowAttentionHover: '#FEF3C7',
  rowProgress: '#F3F6FC',
  rowProgressHover: '#E5EBF8',
  rowPositive: '#F0FDF4',
  rowPositiveHover: '#DCFCE7',
  placeholderFill: '#F1F5F9', // "no image yet" and similar empty frames
};

export type PaletteKey = keyof typeof lightPalette;
export type Palette = Record<PaletteKey, string>;
export type ThemeMode = 'light' | 'dark';

const darkPalette: Palette = {
  primary: '#8FB0FF', // light flag blue: text and icons on dark surfaces
  primaryHover: '#B5CBFF',
  primaryActive: '#6F95F5',
  primarySoft: '#0F2150',
  primarySofter: '#0B1A40',
  primaryBorder: '#1E3C8A',
  link: '#8FB0FF',
  surface: '#0A1322',
  surfaceSunken: '#070E1B',
  surfaceRaised: '#101B2E',
  surfaceMuted: '#15223A',
  surfaceHover: '#172640',
  border: '#22324A',
  borderSoft: '#1B2A40',
  borderStrong: '#34465F',
  text: '#E6EDF5',
  textMuted: '#B3C0D1',
  textSubtle: '#8FA0B6',
  success: '#4ADE80',
  successSoft: '#0E2A1B',
  successBorder: '#166534',
  warning: '#FBBF24',
  warningSoft: '#2B2010',
  warningBorder: '#92400E',
  danger: '#F87171',
  dangerSoft: '#2C1316',
  dangerBorder: '#991B1B',
  focus: '#F59E0B',
  focusGap: '#0A1322',
  headerBg: 'rgba(10, 19, 34, 0.72)',
  stickyBg: 'rgba(16, 27, 46, 0.94)',
  glowSky: 'rgba(143, 176, 255, 0.12)',
  glowIndigo: 'rgba(99, 102, 241, 0.13)',
  glowTeal: 'rgba(228, 0, 43, 0.08)',
  layoutTop: '#0B1526',
  layoutBottom: '#070E1B',
  cardTop: '#13203A',
  cardBottom: '#0F1A2D',
  // Darker than the content, with a blue edge: in the dark theme the rail has to
  // be told apart from the page by depth, since both are navy.
  siderTop: '#070F1E',
  siderMid: '#060D1A',
  siderBottom: '#050A15',
  siderEdge: 'rgba(143, 176, 255, 0.14)',
  titleFrom: '#FFFFFF',
  titleTo: '#FFB8C2',
  rowCritical: '#2A1417',
  rowCriticalHover: '#351A1E',
  rowAttention: '#2A2111',
  rowAttentionHover: '#352A15',
  rowProgress: '#0E1F45',
  rowProgressHover: '#132857',
  rowPositive: '#0F2519',
  rowPositiveHover: '#143020',
  placeholderFill: '#15223A',
};

export const palettes: Record<ThemeMode, Palette> = { light: lightPalette, dark: darkPalette };

/** `textMuted` → `--ms-text-muted`. */
export const cssVariableName = (key: string) => `--ms-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;

/**
 * The tokens screens use. Adaptive colours are CSS variables, so they follow the
 * theme; the navigation colours and `primarySolid` are fixed.
 */
export const brand = {
  ...(Object.fromEntries((Object.keys(lightPalette) as PaletteKey[]).map((key) => [key, `var(${cssVariableName(key)})`])) as Record<PaletteKey, string>),
  ...fixed,
};

/** The CSS custom properties for a theme, as `[name, value]` pairs. */
export function themeVariables(mode: ThemeMode): [string, string][] {
  return (Object.entries(palettes[mode]) as [PaletteKey, string][]).map(([key, value]) => [cssVariableName(key), value]);
}

/**
 * Writes the theme onto the document: the variables `brand` refers to, a
 * `data-theme` attribute for stylesheet rules, and `color-scheme` so native
 * controls (scrollbars, date pickers) match.
 */
export function applyThemeVariables(mode: ThemeMode, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of themeVariables(mode)) root.style.setProperty(name, value);
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
}

/**
 * Shadows kept deliberately shallow: depth signals hierarchy, not decoration.
 * Each is two layers — a tight contact shadow and a wider ambient one — because
 * a single blurred shadow reads as a smudge at these radii.
 */
export const elevation = {
  card: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.05)',
  raised: '0 2px 4px rgba(15, 23, 42, 0.04), 0 8px 20px rgba(15, 23, 42, 0.08)',
  overlay: '0 4px 8px rgba(15, 23, 42, 0.06), 0 16px 40px rgba(15, 23, 42, 0.16)',
} as const;

const darkElevation = {
  card: '0 1px 2px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.3)',
} as const;

export const layoutDimensions = {
  headerHeight: 60,
  siderWidth: 260,
  siderCollapsedWidth: 76,
  contentMaxWidth: 1400,
} as const;

/**
 * Builds the Ant Design theme for a mode; motion is disabled when the user
 * prefers reduced motion. Reads real colours from the palette, never `brand`'s
 * CSS variables — Ant computes hover and active shades from these values.
 */
export function createAdminTheme(reducedMotion: boolean, mode: ThemeMode = 'light'): ThemeConfig {
  const p = palettes[mode];
  const shadow = mode === 'dark' ? darkElevation.card : elevation.card;
  return {
    cssVar: true,
    hashed: false,
    algorithm: mode === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      // Buttons carry white text in both themes, so the fill is the solid primary.
      colorPrimary: fixed.primarySolid,
      colorLink: p.link,
      colorLinkHover: p.primaryHover,
      colorInfo: fixed.primarySolid,
      colorSuccess: p.success,
      colorWarning: p.warning,
      colorError: p.danger,
      colorText: p.text,
      colorTextSecondary: p.textMuted,
      colorTextTertiary: p.textSubtle,
      // Ant's default placeholder is rgba(0,0,0,0.25) — about 2.3:1 on white,
      // which axe reports and a reader in daylight cannot see. A placeholder is
      // an example the reader is meant to read (WCAG 1.4.3).
      colorTextPlaceholder: p.textSubtle,
      colorBgLayout: p.surface,
      colorBgContainer: p.surfaceRaised,
      colorBgElevated: mode === 'dark' ? '#14223A' : '#FFFFFF',
      colorBorder: p.border,
      colorBorderSecondary: p.border,
      fontFamily: "'Inter var', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
      fontSize: 14,
      fontSizeHeading1: 28,
      fontSizeHeading2: 20,
      fontSizeHeading3: 17,
      lineHeight: 1.55,
      // 10/14 rather than 8/12: at admin density the extra radius is what
      // separates "a box" from "a card", and it is applied consistently.
      borderRadius: 10,
      borderRadiusLG: 14,
      borderRadiusSM: 8,
      controlHeight: 40,
      controlOutlineWidth: 3,
      controlOutline: mode === 'dark' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(180, 83, 9, 0.4)',
      motion: !reducedMotion,
      motionDurationMid: reducedMotion ? '0s' : '0.18s',
      padding: 16,
      margin: 16,
      boxShadowTertiary: shadow,
    },
    components: {
      Layout: {
        headerBg: p.surfaceRaised,
        headerColor: p.text,
        headerHeight: layoutDimensions.headerHeight,
        headerPadding: '0 20px',
        siderBg: 'transparent',
        bodyBg: 'transparent',
      },
      Menu: {
        darkItemBg: 'transparent',
        darkSubMenuItemBg: 'transparent',
        darkItemColor: fixed.navyText,
        darkItemHoverBg: 'rgba(255, 255, 255, 0.07)',
        darkItemHoverColor: '#FFFFFF',
        darkItemSelectedBg: 'rgba(228, 0, 43, 0.22)',
        darkItemSelectedColor: '#FFFFFF',
        darkGroupTitleColor: fixed.navyMuted,
        itemHeight: 40,
        itemMarginInline: 12,
        itemMarginBlock: 2,
        itemBorderRadius: 10,
        iconSize: 17,
        collapsedIconSize: 19,
        fontSize: 14,
      },
      Card: {
        borderRadiusLG: 14,
        boxShadowTertiary: shadow,
        headerFontSize: 16,
        headerHeight: 56,
        headerBg: 'transparent',
        paddingLG: 20,
      },
      Table: {
        headerBg: p.surfaceMuted,
        headerColor: p.textMuted,
        headerSplitColor: 'transparent',
        rowHoverBg: p.surfaceHover,
        rowSelectedBg: p.primarySoft,
        cellPaddingBlock: 15,
        cellPaddingInline: 16,
        borderRadiusLG: 14,
        footerBg: 'transparent',
      },
      Button: {
        controlHeight: 40,
        paddingInline: 18,
        fontWeight: 500,
        primaryShadow: '0 1px 2px rgba(11, 58, 164, 0.24)',
        defaultShadow: 'none',
        defaultBorderColor: p.borderStrong,
      },
      Input: { paddingBlock: 8, activeShadow: mode === 'dark' ? '0 0 0 3px rgba(143, 176, 255, 0.18)' : '0 0 0 3px rgba(11, 58, 164, 0.12)' },
      InputNumber: { paddingBlock: 8 },
      Select: { optionSelectedBg: p.primarySoft },
      Tag: { borderRadiusSM: 999, defaultBg: p.surfaceMuted, defaultColor: p.textMuted, fontSize: 12.5 },
      Descriptions: { labelBg: p.surfaceMuted, titleMarginBottom: 12, itemPaddingBottom: 12 },
      Tabs: { titleFontSize: 14, horizontalItemPadding: '12px 0', horizontalItemGutter: 26, inkBarColor: p.primary },
      Statistic: { contentFontSize: 30, titleFontSize: 13 },
      Segmented: { itemSelectedBg: p.surfaceRaised, trackBg: p.surfaceMuted, borderRadius: 10 },
      Modal: { borderRadiusLG: 16 },
      Drawer: { paddingLG: 20 },
      Alert: { borderRadiusLG: 12, withDescriptionPadding: '16px 18px' },
      Breadcrumb: { fontSize: 13, separatorMargin: 8, linkColor: p.textSubtle, itemColor: p.textSubtle },
      Form: { labelColor: p.text, labelFontSize: 13.5, verticalLabelPadding: '0 0 6px' },
      Pagination: { itemActiveBg: p.primarySoft },
      Tooltip: { borderRadius: 8 },
      Empty: { colorTextDescription: p.textSubtle },
    },
  };
}
