import { describe, expect, it } from 'vitest';
import { CACHE_TAGS, MAX_CACHE_TAGS, normaliseCacheTags } from './queue.js';

describe('cache tags', () => {
  it('builds the resource tags the web tier revalidates', () => {
    expect(CACHE_TAGS.business('little-collins')).toBe('business:little-collins');
    expect(CACHE_TAGS.post('filter-coffee')).toBe('post:filter-coffee');
    expect(CACHE_TAGS.page('privacy')).toBe('page:privacy');
    expect(CACHE_TAGS.reviewsFor('b1')).toBe('reviews:b1');
  });

  it('de-duplicates, trims and bounds a tag list', () => {
    expect(normaliseCacheTags([' businesses ', 'businesses', '', 'business:a'])).toEqual(['businesses', 'business:a']);
    expect(normaliseCacheTags(Array.from({ length: 40 }, (_, i) => `tag${i}`))).toHaveLength(MAX_CACHE_TAGS);
    expect(normaliseCacheTags(['x'.repeat(200)])).toEqual([]);
  });
});
