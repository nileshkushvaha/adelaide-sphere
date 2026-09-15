// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { COVER as cover, post } from '@/test/post-fixture';
import { FeaturedPostCard, PostCard } from './post-card';

describe('PostCard', () => {
  it('is one link with the headline as its accessible name, so the card is a single focus stop', () => {
    render(<PostCard post={post()} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Where to find laneway coffee');
    expect(links[0]).toHaveAttribute('href', '/blog/where-to-find-laneway-coffee');
  });

  it('shows the category, the publication date and the author', () => {
    const { container } = render(<PostCard post={post()} />);
    expect(screen.getByText('City guides')).toBeInTheDocument();
    expect(screen.getByText('7 September 2026')).toBeInTheDocument();
    // A machine-readable timestamp beside the words the reader sees.
    expect(container.querySelector('time')).toHaveAttribute('dateTime', '2026-09-07T01:00:00.000Z');
    expect(screen.getByText('Dev Editor')).toBeInTheDocument();
  });

  it('drops the category chip on an archive, where the heading above already names it', () => {
    render(<PostCard post={post()} showCategory={false} />);
    expect(screen.queryByText('City guides')).toBeNull();
    expect(screen.getByText('7 September 2026')).toBeInTheDocument();
  });

  it('claims no reading time, because a card carries no body to measure', () => {
    render(<PostCard post={post()} />);
    expect(screen.queryByText(/min read/i)).toBeNull();
  });

  it('places the headline at the level the page asks for, so the outline stays correct', () => {
    const { rerender } = render(<PostCard post={post()} headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
    rerender(<PostCard post={post()} headingLevel={2} />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('falls back to an initial, not a broken avatar, when the author has no photograph', () => {
    const { container } = render(<PostCard post={post()} />);
    expect(container.querySelector('img')).toBeNull();
    expect(within(container).getByText('D')).toBeInTheDocument();
  });

  it('reserves a fixed 16:9 frame in both variants, so a missing cover cannot stretch the card', () => {
    const standard = render(<PostCard post={post()} />);
    expect(standard.container.querySelector('.aspect-\\[16\\/9\\]')).toBeInTheDocument();
    standard.unmount();
    const featured = render(<FeaturedPostCard post={post()} />);
    expect(featured.container.querySelector('.aspect-\\[16\\/9\\]')).toBeInTheDocument();
  });
});

describe('FeaturedPostCard', () => {
  it('carries its standing label and still resolves to one link', () => {
    render(<FeaturedPostCard post={post({ cover })} label="Latest" />);
    expect(screen.getByText('Latest')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Where to find laneway coffee');
  });

  it('has no accessibility violations with or without a cover', async () => {
    for (const variant of [post(), post({ cover, coverAlt: 'A laneway roaster' })]) {
      const { container, unmount } = render(<FeaturedPostCard post={variant} label="Latest" />);
      const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'color-contrast': { enabled: false } } });
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
      unmount();
    }
  });
});
