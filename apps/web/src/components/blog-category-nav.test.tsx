// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import type { BlogTerm } from '@/lib/api';
import { BlogCategoryNav } from './blog-category-nav';

const terms: BlogTerm[] = [
  { name: 'City guides', slug: 'city-guides', landingContent: null, seoTitle: null, seoDescription: null, seoKeywords: null, shareImage: null, postCount: 1 },
  { name: 'Interviews', slug: 'interviews', landingContent: null, seoTitle: null, seoDescription: null, seoKeywords: null, shareImage: null, postCount: 4 },
];

describe('BlogCategoryNav', () => {
  it('offers "All stories" beside the categories the API actually returned', () => {
    render(<BlogCategoryNav categories={terms} active="all" />);
    expect(screen.getByRole('link', { name: /All stories/ })).toHaveAttribute('href', '/blog');
    expect(screen.getByRole('link', { name: /City guides/ })).toHaveAttribute('href', '/blog/category/city-guides');
    expect(screen.getByRole('link', { name: /Interviews/ })).toHaveAttribute('href', '/blog/category/interviews');
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('shows each category`s article count', () => {
    render(<BlogCategoryNav categories={terms} active="all" />);
    expect(screen.getByRole('link', { name: /City guides/ })).toHaveTextContent('1');
    expect(screen.getByRole('link', { name: /Interviews/ })).toHaveTextContent('4');
  });

  it('marks the current chip for a screen reader, not by colour alone', () => {
    const { rerender } = render(<BlogCategoryNav categories={terms} active="all" />);
    expect(screen.getByRole('link', { name: /All stories/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /City guides/ })).not.toHaveAttribute('aria-current');

    rerender(<BlogCategoryNav categories={terms} active="city-guides" />);
    expect(screen.getByRole('link', { name: /City guides/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /All stories/ })).not.toHaveAttribute('aria-current');
  });

  it('is a named navigation landmark of ordinary links, so it works without JavaScript', () => {
    const { container } = render(<BlogCategoryNav categories={terms} active="all" />);
    expect(screen.getByRole('navigation', { name: 'Blog categories' })).toBeInTheDocument();
    expect(container.querySelector('button')).toBeNull();
  });

  it('disappears entirely when the blog has no stocked category', () => {
    const { container } = render(<BlogCategoryNav categories={[]} active="all" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('has no accessibility violations on either tone', async () => {
    for (const tone of ['dark', 'light'] as const) {
      const { container, unmount } = render(<BlogCategoryNav categories={terms} active="city-guides" tone={tone} />);
      const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, rules: { 'color-contrast': { enabled: false } } });
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
      unmount();
    }
  });
});
