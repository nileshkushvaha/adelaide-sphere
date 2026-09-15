import { expect, test } from '@playwright/test';
import { stackIsUp } from './support.js';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:4001';

/**
 * Information pages on the public site (CFG 002, change log 1.17): a published
 * page has one main heading and describes itself to search engines, and the
 * private preview route refuses anything but a live link.
 */
test.describe('Information pages', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await stackIsUp(request)), 'The API and web app must be running');
  });

  test('a published page has one main heading and WebPage structured data', async ({ page, request }) => {
    const list = await request.get(`${API}/api/v1/pages`);
    const pages = ((await list.json()) as { data: { slug: string; title: string }[] }).data;
    test.skip(pages.length === 0, 'No published page in this environment');
    const first = pages[0]!;

    const response = await page.goto(`/${first.slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    const structured = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(structured.some((block) => block.includes('"WebPage"'))).toBe(true);
    // Nothing on the page is wider than the screen, at either project's width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });

  test('an unknown page and an invalid preview link are 404 and never indexed', async ({ page, request }) => {
    const unknown = await page.goto('/not-a-real-information-page');
    expect(unknown?.status()).toBe(404);

    const preview = await page.goto(`/preview/page/${'x'.repeat(32)}`);
    expect(preview?.status()).toBe(404);

    const api = await request.get(`${API}/api/v1/preview/pages/${'x'.repeat(32)}`);
    expect(api.status()).toBe(404);
    expect(api.headers()['cache-control']).toContain('no-store');
    expect(api.headers()['x-robots-tag']).toContain('noindex');
  });
});
