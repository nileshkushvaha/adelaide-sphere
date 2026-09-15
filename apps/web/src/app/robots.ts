import type { MetadataRoute } from 'next';
import { siteNoindex, siteOrigin } from '@/lib/site';

/**
 * Crawl guidance (SRS SEO 002): the sitemap index plus the routes that should
 * never be crawled. This is guidance, not access control — authorisation is
 * enforced by the API on every request.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  if (siteNoindex()) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Filtered searches are noindex,follow; keeping crawlers out of the
        // query space stops them burning budget on infinite combinations. The
        // blog's numbered pages (`/blog?page=2`) are deliberately crawlable so
        // older articles stay reachable (SRS 1.10 BLOG 005); searches stay out.
        disallow: ['/admin', '/api/', '/preview/', '/business?', '/*?utm_', '/*?q='],
      },
    ],
    // `Host` is left out: it is a retired Yandex extension that Google and Bing
    // ignore, and the canonical origin is already declared on every page.
    sitemap: `${origin}/sitemap.xml`,
  };
}
