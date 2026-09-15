import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guards the public palette (SRS UX 001, NFR 006/011). It exists because a
 * regression here is invisible in behavioural tests but obvious to a visitor:
 * the site once rendered every band in nearly the same navy, so the whole page
 * read as one flat field with no hierarchy.
 */
const css = readFileSync(resolve(process.cwd(), '../../packages/ui/src/styles.css'), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(css);
  if (!match) throw new Error(`token --${name} is not defined`);
  return match[1]!.toLowerCase();
}

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const [r, g, b] = (full.match(/.{2}/g) ?? []).map((c) => parseInt(c, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

/** An `rgba(r, g, b, a)` token, as the numbers a browser composites with. */
function rgbaToken(name: string): { rgb: [number, number, number]; alpha: number } {
  const match = new RegExp(`--${name}:\\s*rgba\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*([0-9.]+)\\s*\\)`).exec(css);
  if (!match) throw new Error(`token --${name} is not an rgba() colour`);
  return { rgb: [Number(match[1]), Number(match[2]), Number(match[3])], alpha: Number(match[4]) };
}

/** What the browser actually paints: a translucent layer over what is behind it. */
function composite(name: string, behind: string): string {
  const { rgb, alpha } = rgbaToken(name);
  const value = behind.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const under = (full.match(/.{2}/g) ?? []).map((c) => parseInt(c, 16));
  const mixed = rgb.map((channel, index) => Math.round(channel * alpha + under[index]! * (1 - alpha)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Glass panels are translucent, so their contrast is not the contrast of the
 * token underneath them: what a reader sees is the composite of the panel and
 * whatever band it is sitting on. Checking the opaque token alone passed while
 * the rendered card measured 4.02:1 — below AA — which is how a real contrast
 * failure reached the home page (audit F-04).
 */
describe('glass panels, composited over the surfaces they sit on', () => {
  const lightBehind = ['ms-surface', 'ms-surface-muted', 'ms-surface-sunken'];
  const darkBehind = ['ms-band', 'ms-band-deep'];

  it('keeps dark-glass text readable wherever a dark panel is used', () => {
    for (const behind of [...lightBehind, ...darkBehind]) {
      const background = composite('ms-glass-dark', token(behind));
      expect(contrast(token('ms-band-text'), background), `band text on dark glass over ${behind}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token('ms-band-muted'), background), `muted band text on dark glass over ${behind}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token('ms-band-link'), background), `band link on dark glass over ${behind}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  /**
   * Light glass is used in exactly one place — the hero search panel over the
   * banner photograph (`hero-search.tsx`) — where what composites through is a
   * photograph, not a token. Its readability is covered by the panel tokens in
   * "keeps the hero panel readable over photography"; what is asserted here is
   * that if it is ever placed on one of the light surfaces, it still reads.
   */
  it('keeps light-glass text readable on the light surfaces', () => {
    for (const behind of lightBehind) {
      const background = composite('ms-glass-light', token(behind));
      expect(contrast(token('ms-text'), background), `text on light glass over ${behind}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token('ms-text-muted'), background), `muted text on light glass over ${behind}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('light surfaces', () => {
  const backgrounds = ['ms-surface', 'ms-surface-muted', 'ms-surface-sunken'].map(token);

  it('meets WCAG AA for body text, muted text and links on every light background', () => {
    for (const background of backgrounds) {
      expect(contrast(token('ms-text'), background), `text on ${background}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token('ms-text-muted'), background), `muted text on ${background}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token('ms-link'), background), `link on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('separates cards from the page and the soft band', () => {
    // A card must be visibly distinct from whatever section it sits on.
    expect(Math.abs(luminance(token('ms-surface-raised')) - luminance(token('ms-surface-muted')))).toBeGreaterThan(0.004);
    expect(Math.abs(luminance(token('ms-surface-raised')) - luminance(token('ms-surface-sunken')))).toBeGreaterThan(0.004);
  });

  it('keeps borders visible against the surfaces they divide', () => {
    expect(Math.abs(luminance(token('ms-border')) - luminance(token('ms-surface')))).toBeGreaterThan(0.01);
  });

  it('keeps the keyboard focus indicator visible on every light surface', () => {
    for (const background of backgrounds) {
      expect(contrast(token('ms-focus'), background), `focus on ${background}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('dark bands', () => {
  const bands = ['ms-band', 'ms-band-deep', 'ms-band-raised'].map(token);

  it('meets WCAG AA for band text, muted text and links on every band shade', () => {
    for (const band of bands) {
      expect(contrast(token('ms-band-text'), band), `band text on ${band}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token('ms-band-muted'), band), `band muted text on ${band}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token('ms-band-link'), band), `band link on ${band}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is unmistakably darker than the light surfaces it alternates with', () => {
    // The light/dark rhythm is the composition; a band that drifts light
    // collapses the page back into one flat field.
    expect(luminance(token('ms-surface-muted')) - luminance(token('ms-band'))).toBeGreaterThan(0.5);
  });

  it('keeps the hero panel readable over photography', () => {
    expect(contrast(token('ms-panel-text'), token('ms-panel'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('ms-panel-text-muted'), token('ms-panel'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('ms-hero-text'), token('ms-band-deep'))).toBeGreaterThanOrEqual(4.5);
  });
});

it('does not reintroduce an operating-system dark scheme', () => {
  // The light/dark rhythm is designed per section. A `prefers-color-scheme`
  // override would repaint every band in the same colour again, which is the
  // exact defect this palette replaced; reintroducing one is a design decision
  // that has to be made deliberately, not by editing a token block.
  expect(css).not.toContain('prefers-color-scheme');
});


describe('ocean actions and teal selections', () => {
  it('keeps white button labels readable at rest and on hover', () => {
    for (const background of ['ms-sky-700', 'ms-sky-600']) {
      expect(contrast(token('ms-text-inverse'), token(background))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps teal labels and sky focus rings readable on their intended surfaces', () => {
    expect(contrast(token('ms-teal-700'), token('ms-teal-100'))).toBeGreaterThanOrEqual(4.5);
    for (const background of ['ms-surface', 'ms-surface-muted', 'ms-surface-sunken']) {
      expect(contrast(token('ms-teal-700'), token(background))).toBeGreaterThanOrEqual(4.5);
    }
    for (const background of ['ms-band', 'ms-band-deep', 'ms-band-raised']) {
      expect(contrast(token('ms-sky-400'), token(background))).toBeGreaterThanOrEqual(3);
    }
  });
});


it('keeps inverted area cards and gradient actions readable', () => {
  expect(contrast(token('ms-text'), token('ms-sky-100'))).toBeGreaterThanOrEqual(4.5);
  // Sample the full sRGB blue-to-teal gradient, not just its endpoints.
  const rgb = (hex: string) => hex.slice(1).match(/.{2}/g)!.map((part) => parseInt(part, 16));
  const start = rgb(token('ms-sky-700'));
  const end = rgb(token('ms-teal-700'));
  for (let step = 0; step <= 20; step++) {
    const background = '#' + start.map((value, i) => Math.round(value + (end[i]! - value) * step / 20).toString(16).padStart(2, '0')).join('');
    expect(contrast('#ffffff', background)).toBeGreaterThanOrEqual(4.5);
  }
});
