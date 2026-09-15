// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { HeroBanner, type HeroSlide } from './hero-banner';

const slide = (n: number): HeroSlide => ({
  url: `https://cdn.example/hero-${n}.webp`,
  previewUrl: `https://cdn.example/card-${n}.webp`,
  alt: `Melbourne scene ${n}`,
  caption: n === 1 ? 'Flinders Street' : null,
  focalX: 0.5,
  focalY: 0.4,
  width: 1600,
  height: 900,
});

const runAxe = async (container: HTMLElement) => {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n');
};

describe('HeroBanner', () => {
  it('renders the content and the solid fallback when there are no slides', async () => {
    const { container } = render(
      <HeroBanner slides={[]}>
        <h1>Discover Adelaide businesses</h1>
      </HeroBanner>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    // No controls without slides to step through.
    expect(screen.queryByRole('button', { name: /next banner image/i })).not.toBeInTheDocument();
    expect(await runAxe(container)).toBe('');
  });

  it('offers keyboard-reachable previous, next and per-image controls, and a pause control that is reachable but not part of the visual composition', async () => {
    const { container } = render(
      <HeroBanner slides={[slide(1), slide(2), slide(3)]}>
        <h1>Discover Adelaide businesses</h1>
      </HeroBanner>,
    );
    expect(screen.getByRole('button', { name: /previous banner image/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next banner image/i })).toBeInTheDocument();
    // Present in the accessibility tree and focusable — the WCAG 2.2 SC 2.2.2
    // mechanism — but rendered off-screen until it is focused, so the banner
    // carries no visible pause button (client instruction, 7 Sep 2026).
    const pause = screen.getByRole('button', { name: /pause the banner/i });
    expect(pause).toHaveAttribute('aria-pressed', 'false');
    expect(pause.className).toContain('sr-only');
    expect(pause.className).toContain('focus-visible:not-sr-only');
    const dots = screen.getAllByRole('button', { name: /show banner image \d of 3/i });
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Flinders Street')).toBeInTheDocument();
    expect(await runAxe(container)).toBe('');
  });

  it('marks the images decorative so the headline is the accessible content', () => {
    render(
      <HeroBanner slides={[slide(1), slide(2)]}>
        <h1>Discover Adelaide businesses</h1>
      </HeroBanner>,
    );
    // Background photography carries no information the text does not; empty alt
    // keeps it out of the accessibility tree (SRS HERO 001, NFR 011).
    for (const image of document.querySelectorAll('img')) expect(image.getAttribute('alt')).toBe('');
  });
});

describe('hero motion', () => {
  it('advances on its own while the page is visible and motion is allowed', async () => {
    vi.useFakeTimers();
    try {
      render(
        <HeroBanner slides={[slide(1), slide(2), slide(3)]}>
          <h1>Discover Adelaide businesses</h1>
        </HeroBanner>,
      );
      const currentDot = () => screen.getAllByRole('button', { name: /show banner image \d of 3/i }).findIndex((dot) => dot.getAttribute('aria-current') === 'true');
      expect(currentDot()).toBe(0);
      await act(async () => {
        vi.advanceTimersByTime(7100);
      });
      expect(currentDot()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops rotating once the visitor steps through the images', async () => {
    vi.useFakeTimers();
    try {
      render(
        <HeroBanner slides={[slide(1), slide(2), slide(3)]}>
          <h1>Discover Adelaide businesses</h1>
        </HeroBanner>,
      );
      const currentDot = () => screen.getAllByRole('button', { name: /show banner image \d of 3/i }).findIndex((dot) => dot.getAttribute('aria-current') === 'true');

      // Using a control is itself a request to stop the rotation, so a mouse
      // user has a way to stop it without a visible pause button.
      await act(async () => {
        screen.getByRole('button', { name: /next banner image/i }).click();
      });
      expect(currentDot()).toBe(1);
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      expect(currentDot()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
