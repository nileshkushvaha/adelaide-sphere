import { describe, expect, it } from 'vitest';
import type { PostCard } from './api';
import { blogFeedXml } from './rss';

function card(overrides: Partial<PostCard> = {}): PostCard {
  return {
    id: 'p1',
    title: 'Coffee & cake <on> "Smith" St',
    slug: 'coffee-and-cake',
    excerpt: 'A walk through Fitzroy’s best cafés.',
    category: { name: 'Food & drink', slug: 'food' },
    author: { displayName: 'Sam O’Neil', slug: 'sam' },
    tags: [],
    publishedAt: '2026-09-10T02:30:00.000Z',
    coverAlt: null,
    cover: [],
    shareImage: null,
    coverCredit: null,
    ...overrides,
  } as unknown as PostCard;
}

describe('blogFeedXml', () => {
  it('writes a valid RSS 2.0 channel with escaped item fields and canonical links', () => {
    const xml = blogFeedXml({ siteName: 'Adelaide Sphere', description: 'Stories & guides', posts: [card()] });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"')).toBe(true);
    expect(xml).toContain('<title>Adelaide Sphere blog</title>');
    expect(xml).toContain('<description>Stories &amp; guides</description>');
    expect(xml).toContain('rel="self" type="application/rss+xml"');
    expect(xml).toContain('<title>Coffee &amp; cake &lt;on&gt; &quot;Smith&quot; St</title>');
    expect(xml).toMatch(/<link>https?:\/\/[^<]+\/blog\/coffee-and-cake<\/link>/);
    expect(xml).toContain('<guid isPermaLink="true">');
    expect(xml).toContain('<pubDate>Thu, 10 Sep 2026 02:30:00 GMT</pubDate>');
    expect(xml).toContain('<lastBuildDate>Thu, 10 Sep 2026 02:30:00 GMT</lastBuildDate>');
    expect(xml).toContain('<category>Food &amp; drink</category>');
    expect(xml).not.toContain('');
  });

  it('is still a valid channel with no articles', () => {
    const xml = blogFeedXml({ siteName: 'Adelaide Sphere', description: 'Stories', posts: [] });
    expect(xml).not.toContain('<item>');
    expect(xml).not.toContain('lastBuildDate');
    expect(xml.trim().endsWith('</rss>')).toBe(true);
  });
});
