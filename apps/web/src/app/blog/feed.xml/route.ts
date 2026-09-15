import { fetchPosts, fetchSiteSettings } from '@/lib/api';
import { FEED_SIZE, blogFeedXml } from '@/lib/rss';

// Rendered per request with a short public cache, like the sitemap: the feed
// must show what is published now, and the build must not depend on the API.
// The article fetch itself is cached under the `posts` tag, so publishing
// refreshes it within the usual minute.
export const dynamic = 'force-dynamic';

/** The blog's RSS feed (SRS 1.10 BLOG 005): the newest 20 published articles. */
export async function GET(): Promise<Response> {
  let posts;
  const settingsPromise = fetchSiteSettings();
  try {
    posts = await fetchPosts({ page: 1, pageSize: FEED_SIZE });
  } catch {
    return new Response('Temporarily unavailable', { status: 503, headers: { 'Retry-After': '120', 'cache-control': 'no-store' } });
  }
  const settings = await settingsPromise;
  const xml = blogFeedXml({
    siteName: settings.name,
    description: 'Guides, local stories and practical advice about Adelaide’s businesses, neighbourhoods and city life, written by our editors.',
    posts: posts.data,
  });
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
}
