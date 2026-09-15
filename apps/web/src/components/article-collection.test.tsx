// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PostCard as PostCardData } from '@/lib/api';
import { ArticleCollection, BlogEmptyState } from './article-collection';
import { cardGridColumns } from './page-shell';
import { post } from '@/test/post-fixture';

const many = (count: number): PostCardData[] => Array.from({ length: count }, (_, index) => post({ id: `p${index}`, slug: `article-${index}`, title: `Article ${index}` }));

describe('cardGridColumns', () => {
  it('reaches four columns on a wide screen and steps down to one on a phone', () => {
    expect(cardGridColumns).toContain('xl:grid-cols-4');
    expect(cardGridColumns).toContain('lg:grid-cols-3');
    expect(cardGridColumns).toContain('sm:grid-cols-2');
    expect(cardGridColumns).toContain('grid-cols-1');
  });
});

describe('ArticleCollection', () => {
  it('uses the same four-column grid whatever the article count is', () => {
    // The row must not change shape as an archive fills up, and a lone card
    // must not widen to fill the section — a full-width card is what turned a
    // missing cover into an 850px-tall block.
    for (const count of [1, 2, 3, 7]) {
      const { unmount } = render(<ArticleCollection posts={many(count)} label="Articles" />);
      const list = screen.getByRole('list', { name: 'Articles' });
      expect(list.className).toContain(cardGridColumns);
      expect(list.querySelectorAll('li')).toHaveLength(count);
      unmount();
    }
  });

  it('keeps a single article in the grid, with its heading at the level the page asked for', () => {
    render(<ArticleCollection posts={many(1)} label="Articles" headingLevel={2} />);
    expect(screen.getByRole('list', { name: 'Articles' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Article 0');
  });

  it('passes the archive`s "do not repeat the category" rule through to every card', () => {
    render(<ArticleCollection posts={many(3)} label="Articles" showCategory={false} />);
    expect(screen.queryByText('City guides')).toBeNull();
  });

  it('renders nothing at all when there is nothing to list, so the caller decides what to say', () => {
    const { container } = render(<ArticleCollection posts={[]} label="Articles" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('BlogEmptyState', () => {
  it('states the case and offers a way onwards when there is one', () => {
    render(<BlogEmptyState message="No stories have been published in this category yet." action={{ href: '/blog', label: 'Browse all stories' }} />);
    expect(screen.getByText('No stories have been published in this category yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse all stories' })).toHaveAttribute('href', '/blog');
  });

  it('offers no action when there is nowhere useful to send the reader', () => {
    render(<BlogEmptyState message="No articles have been published yet." />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
