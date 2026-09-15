import type { PostCard as PostCardData } from '@/lib/api';

/**
 * A published article as the public API returns it, for the component tests.
 * It lives outside any `*.test.tsx` file so importing it does not drag another
 * file's suites into the run.
 */
export function post(overrides: Partial<PostCardData> = {}): PostCardData {
  return {
    id: 'p1',
    title: 'Where to find laneway coffee',
    slug: 'where-to-find-laneway-coffee',
    excerpt: 'The lanes off Flinders Lane hold more roasters than any block in the city.',
    category: { name: 'City guides', slug: 'city-guides' },
    author: { displayName: 'Dev Editor', slug: 'dev-editor', role: 'Editor', shortBio: null, bio: null, pronouns: null, location: null, websiteUrl: null, expertise: [], links: [], image: null, profilePath: null },
    tags: [],
    publishedAt: '2026-09-07T01:00:00.000Z',
    coverAlt: null,
    cover: [],
    shareImage: null,
    coverCredit: null,
    guestPost: false,
    ...overrides,
  };
}

/** Processed renditions of a cover, as `renditions()` publishes them. */
export const COVER: PostCardData['cover'] = [
  { kind: 'card', url: 'https://media.example/card.webp', width: 800, height: 450 },
  { kind: 'hero', url: 'https://media.example/hero.webp', width: 1600, height: 900 },
];
