// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostCard } from '@/lib/api';
import { ArticleMedia } from './article-media';

type Renditions = PostCard['cover'];

const renditions: Renditions = [
  { kind: 'thumbnail', url: 'https://media.example/thumb.webp', width: 320, height: 180 },
  { kind: 'card', url: 'https://media.example/card.webp', width: 800, height: 450 },
  { kind: 'hero', url: 'https://media.example/hero.webp', width: 1600, height: 900 },
];

const props = { categorySlug: 'city-guides', ratio: '16/9' as const, sizes: '100vw' };

/** The fallback is one `aria-hidden` panel carrying the brand mark and no words. */
const fallbackOf = (container: HTMLElement) => container.querySelector('[aria-hidden="true"] svg');

/** next/image rewrites `src` through the optimiser, so assertions read the original off the query string. */
const sourceOf = (image: HTMLImageElement) => decodeURIComponent(image.getAttribute('src') ?? '');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ArticleMedia renditions', () => {
  it('asks for the card rendition on a card and the hero rendition on a hero', () => {
    const { rerender } = render(<ArticleMedia {...props} cover={renditions} coverAlt="Laneway coffee" prefer="card" />);
    expect(sourceOf(screen.getByRole('img', { name: 'Laneway coffee' }) as HTMLImageElement)).toContain('card.webp');

    rerender(<ArticleMedia {...props} cover={renditions} coverAlt="Laneway coffee" prefer="hero" />);
    expect(sourceOf(screen.getByRole('img', { name: 'Laneway coffee' }) as HTMLImageElement)).toContain('hero.webp');
  });

  it('falls back to the nearest processed size rather than to no picture at all', () => {
    const partial: Renditions = [renditions[0]!];
    render(<ArticleMedia {...props} cover={partial} coverAlt="Laneway coffee" prefer="hero" />);
    expect(sourceOf(screen.getByRole('img', { name: 'Laneway coffee' }) as HTMLImageElement)).toContain('thumb.webp');
  });

  it('treats a cover with no alternative text as decorative instead of inventing one', () => {
    const { container } = render(<ArticleMedia {...props} cover={renditions} coverAlt={null} />);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });
});

describe('ArticleMedia without a usable cover', () => {
  it('shows the branded fallback when the article has no processed cover', () => {
    const { container } = render(<ArticleMedia {...props} cover={[]} coverAlt={null} />);
    expect(container.querySelector('img')).toBeNull();
    // The panel is a brand graphic, not a photograph, and carries nothing a
    // reader needs, so it stays out of the accessibility tree.
    expect(fallbackOf(container)).toBeInTheDocument();
    // And no words: the category and the headline are already stated beside it.
    expect(container.textContent).toBe('');
  });

  it('paints one category the same way everywhere and different categories differently', () => {
    const guides = render(<ArticleMedia {...props} cover={[]} coverAlt={null} />);
    const guidesStyle = (guides.container.querySelector('[aria-hidden="true"]') as HTMLElement).style.background;
    guides.unmount();
    const again = render(<ArticleMedia {...props} cover={[]} coverAlt={null} />);
    expect((again.container.querySelector('[aria-hidden="true"]') as HTMLElement).style.background).toBe(guidesStyle);
    again.unmount();
    const interviews = render(<ArticleMedia {...props} categorySlug="interviews" cover={[]} coverAlt={null} />);
    expect((interviews.container.querySelector('[aria-hidden="true"]') as HTMLElement).style.background).not.toBe(guidesStyle);
  });

  it('swaps a broken rendition for the same fallback and records the address that failed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(<ArticleMedia {...props} cover={renditions} coverAlt="Laneway coffee" />);

    fireEvent.error(container.querySelector('img')!);

    // The reader gets the fallback: no broken-image glyph, no error text, and
    // no bare dark rectangle where the picture used to be.
    expect(container.querySelector('img')).toBeNull();
    expect(fallbackOf(container)).toBeInTheDocument();
    expect(screen.queryByText(/failed|error/i)).toBeNull();
    // Whoever is looking at the console can still tell a broken media URL from
    // an article that never had a cover.
    expect(warn.mock.calls[0]?.[0]).toContain('card.webp');
  });

  it('reserves the same space whether the cover loads or not, so nothing shifts', () => {
    const withCover = render(<ArticleMedia {...props} cover={renditions} coverAlt="Laneway coffee" />);
    const framed = withCover.container.firstElementChild!.className;
    withCover.unmount();
    const withoutCover = render(<ArticleMedia {...props} cover={[]} coverAlt={null} />);
    expect(withoutCover.container.firstElementChild!.className).toBe(framed);
    expect(framed).toContain('aspect-[16/9]');
  });

  it('has no accessibility violations in either state', async () => {
    for (const cover of [renditions, [] as Renditions]) {
      const { container, unmount } = render(<ArticleMedia {...props} cover={cover} coverAlt={cover.length > 0 ? 'Laneway coffee' : null} />);
      const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
      unmount();
    }
  });
});
