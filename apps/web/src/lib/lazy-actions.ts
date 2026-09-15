'use server';

import { fetchPosts, fetchReviews, searchBusinesses, type BusinessCard, type PostCard, type PublicReview } from './api';
import { parseSearchParams } from './search-params';

/**
 * Server actions behind the "load more" lists on /business and /blog.
 *
 * A server action is a public endpoint, so nothing here trusts its arguments:
 * the query string goes back through the same tolerant parser the routes use,
 * the fixed category and area are checked against the slug shape, and the page
 * number is bounded. The worst a crafted call can do is read a page of the
 * public listing it could already have fetched by URL.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Far beyond any real result set; a bound, not a limit anybody reaches. */
const MAX_PAGE = 500;

const slug = (value: string | undefined): string | undefined => (value && SLUG.test(value) ? value : undefined);
const bounded = (page: number): number => (Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1);

/** One more page of directory results, with the filters the visitor already has. */
export async function loadBusinessPage(input: { query: string; category?: string; area?: string; page: number }): Promise<BusinessCard[]> {
  const state = parseSearchParams(Object.fromEntries(new URLSearchParams(input.query)));
  const { data } = await searchBusinesses({ ...state, page: bounded(input.page) }, { category: slug(input.category), area: slug(input.area) });
  return data;
}

/** Record ids as the API issues them (cuid). */
const ID = /^[a-z0-9]{20,40}$/;

/** One more page of a business's approved reviews. */
export async function loadReviewPage(input: { businessId: string; page: number }): Promise<PublicReview[]> {
  if (!ID.test(input.businessId)) return [];
  const { data } = await fetchReviews(input.businessId, bounded(input.page));
  return data;
}

/** One more page of articles for the blog index and its category and tag pages. */
export async function loadPostPage(input: { page: number; category?: string; tag?: string }): Promise<PostCard[]> {
  const { data } = await fetchPosts({ page: bounded(input.page), category: slug(input.category), tag: slug(input.tag) });
  return data;
}
