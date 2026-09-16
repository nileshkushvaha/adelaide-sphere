import { NextResponse, type NextRequest } from 'next/server';

/**
 * Applies the redirect table to public content paths (SRS SEO 004): a changed
 * slug answers 301 to the new address, a temporary move answers 302, and a
 * deliberately removed page answers 410. Unknown paths fall through so the page
 * itself renders its own 404 — a missing page is never redirected to the home
 * page.
 *
 * Resolutions are cached in memory for a short window so a busy path costs one
 * API call rather than one per request. This map is per process and cannot be
 * purged from anywhere — middleware runs outside the Next data cache — so the
 * window is short enough that switching a redirect off reaches visitors within
 * about ten seconds, which is what the admin screens promise.
 */
const CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 500;
/**
 * Every content request waits on this lookup, so a stalled API gives up
 * quickly and the page renders as if there were no redirect (its own data
 * fetches then show the error state).
 */
const LOOKUP_TIMEOUT_MS = 2_000;

interface Resolution {
  kind: 'permanent' | 'temporary' | 'gone';
  status: 301 | 302 | 410;
  targetPath: string | null;
}

const cache = new Map<string, { value: Resolution | null; expires: number }>();

const apiOrigin = (process.env.API_ORIGIN ?? 'http://127.0.0.1:4001').replace(/\/+$/, '');

async function resolve(pathname: string): Promise<Resolution | null> {
  const cached = cache.get(pathname);
  if (cached && cached.expires > Date.now()) return cached.value;
  let value: Resolution | null = null;
  try {
    const url = new URL(`${apiOrigin}/api/v1/seo/redirects/resolve`);
    url.searchParams.set('path', pathname);
    const response = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
    if (response.ok) {
      const body = (await response.json()) as { data?: Resolution };
      value = body.data ?? null;
    }
  } catch {
    // The API being unreachable or too slow must not take the site down: fall
    // through to normal rendering, which surfaces its own error state. Nothing
    // is cached, so the next request asks again.
    return null;
  }
  if (cache.size >= CACHE_MAX_ENTRIES) cache.clear();
  cache.set(pathname, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * The public directory moved from `/directory` to `/business` so the list, the
 * curated pages and the listing itself share one prefix (SRS UX 003, revision
 * 1.3). Old addresses answer 301 here rather than through the redirect table,
 * because they are a route rename rather than editorial content: every
 * `/directory…` address has a mechanical `/business…` equivalent, and shipping
 * them as data would leave the rename dependent on a seed having been run.
 */
function renamedDirectoryPath(pathname: string): string | null {
  if (pathname === '/directory') return '/business';
  return pathname.startsWith('/directory/') ? `/business/${pathname.slice('/directory/'.length)}` : null;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // Single-segment matches include files such as /favicon.ico, which are never redirected.
  if (pathname.includes('.')) return NextResponse.next();

  const renamed = renamedDirectoryPath(pathname.replace(/\/+$/, '') || '/');
  if (renamed) return NextResponse.redirect(new URL(`${renamed}${search}`, request.nextUrl.origin), 301);

  const resolution = await resolve(pathname.toLowerCase().replace(/\/+$/, '') || '/');
  if (!resolution) return NextResponse.next();
  if (resolution.kind === 'gone') {
    return new NextResponse('This page has been removed permanently.', {
      // Short, because a page that has come back should not stay gone for
      // whoever cached the 410.
      status: 410,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=60' },
    });
  }
  if (resolution.targetPath) {
    const target = new URL(`${resolution.targetPath}${search}`, request.nextUrl.origin);
    // The status comes from the rule rather than being assumed.
    const response = NextResponse.redirect(target, resolution.status === 302 ? 302 : 301);
    // A cached 302 behaves as a 301: the browser stops asking, and a temporary
    // move becomes permanent by accident.
    if (resolution.status === 302) response.headers.set('cache-control', 'no-store');
    return response;
  }
  return NextResponse.next();
}

/**
 * Only content routes are consulted; assets and API routes never are.
 * `/:slug` covers information pages (`/about-us`), whose address can be
 * changed in the admin and leaves a redirect from the old one behind.
 */
export const config = {
  matcher: ['/business/:path*', '/blog/:path*', '/directory/:path*', '/:slug'],
};
