import { describe, expect, it } from 'vitest';
import { BLOG_SEARCH_MAX_LENGTH, blogSearchHref, readSearchQuery } from './blog-search';

describe('blog search addresses', () => {
  it('tidies what was searched for', () => {
    expect(readSearchQuery(undefined)).toBe('');
    expect(readSearchQuery('  laneway   cafés ')).toBe('laneway cafés');
    expect(readSearchQuery(['first', 'second'])).toBe('first');
    expect(readSearchQuery('x'.repeat(200))).toHaveLength(BLOG_SEARCH_MAX_LENGTH);
  });

  it('encodes the query and adds the page only after the first', () => {
    expect(blogSearchHref('coffee & cake')).toBe('/blog/search?q=coffee+%26+cake');
    expect(blogSearchHref('tram', 2)).toBe('/blog/search?q=tram&page=2');
  });
});
