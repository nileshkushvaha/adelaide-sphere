import type { APIRequestContext, Page } from '@playwright/test';

export const WEB_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:4000';
export const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:4001';
export const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:4002/admin';

/**
 * Admin credentials come from the environment only. Journeys that need an
 * authenticated administrator skip themselves when the environment does not
 * supply them, so the suite never contains a credential and never fails for a
 * reason unrelated to the product.
 */
export const ADMIN_CREDENTIALS =
  process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD
    ? { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD }
    : null;

/** True when the public site answers; used to skip with a clear message. */
export async function stackIsUp(request: APIRequestContext): Promise<boolean> {
  try {
    const [api, web] = await Promise.all([request.get(`${API_URL}/api/v1/health`), request.get(WEB_URL)]);
    return api.ok() && web.ok();
  } catch {
    return false;
  }
}

/**
 * True when the API answers. The admin journeys need the API and the admin
 * application, not the public site — requiring the whole stack made them skip
 * for a reason that had nothing to do with what they check.
 */
export async function adminStackIsUp(request: APIRequestContext): Promise<boolean> {
  try {
    const [api, admin] = await Promise.all([request.get(`${API_URL}/api/v1/health`), request.get(`${ADMIN_URL}/`)]);
    return api.ok() && admin.ok();
  } catch {
    return false;
  }
}

/** Slug of any published business, or null when the environment has none. */
export async function firstPublishedBusiness(request: APIRequestContext): Promise<{ slug: string; name: string } | null> {
  const response = await request.get(`${API_URL}/api/v1/businesses?pageSize=1`);
  if (!response.ok()) return null;
  const body = (await response.json()) as { data?: { slug: string; name: string }[] };
  return body.data?.[0] ?? null;
}

/** Slug of any published article, or null when the environment has none. */
export async function firstPublishedPost(request: APIRequestContext): Promise<{ slug: string; title: string } | null> {
  const response = await request.get(`${API_URL}/api/v1/posts?pageSize=1`);
  if (!response.ok()) return null;
  const body = (await response.json()) as { data?: { slug: string; title: string }[] };
  return body.data?.[0] ?? null;
}

/** Signs in to the admin application through its own form. */
export async function signInToAdmin(page: Page): Promise<void> {
  if (!ADMIN_CREDENTIALS) throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required for this journey');
  await page.goto(`${ADMIN_URL}/login`);
  await page.getByLabel(/email/i).fill(ADMIN_CREDENTIALS.email);
  await page.getByLabel(/^password/i).fill(ADMIN_CREDENTIALS.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('heading', { level: 1, name: /dashboard/i }).waitFor();
}
