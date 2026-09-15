import { expect, test } from '@playwright/test';
import { API_URL, firstPublishedBusiness, stackIsUp } from './support.js';

/**
 * QA 003 journey 1: Home → search → business. The review submission half of the
 * journey needs Turnstile keys (decision D03) and is covered by the API
 * integration suite; here we prove the discovery path and the review form's
 * honest closed state.
 */
test.describe('Home → search → business', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await stackIsUp(request)), 'The API and web app must be running (pnpm dev:api, pnpm dev:web)');
  });

  test('a visitor reaches a business from the home page in three interactions', async ({ page, request }) => {
    const business = await firstPublishedBusiness(request);
    test.skip(!business, 'No published business in this environment');

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 1. type a keyword, 2. submit the hero search
    // The hero field is a combobox (it offers suggestions); the directory filter is a plain search box.
    await page.getByRole('combobox', { name: /what are you looking for/i }).fill(business!.name.split(' ')[0]!);
    await page.getByRole('button', { name: /^search$/i }).click();
    await expect(page).toHaveURL(/\/business\?/);

    // 3. open the listing
    await page.getByRole('link', { name: business!.name }).first().click();
    await expect(page).toHaveURL(new RegExp(`/business/${business!.slug}$`));
    await expect(page.getByRole('heading', { level: 1, name: business!.name })).toBeVisible();
  });

  test('search works without JavaScript', async ({ browser, request }) => {
    const business = await firstPublishedBusiness(request);
    test.skip(!business, 'No published business in this environment');
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByRole('combobox', { name: /what are you looking for/i }).fill(business!.name.split(' ')[0]!);
    await page.getByRole('button', { name: /^search$/i }).click();
    await expect(page).toHaveURL(/\/business\?/);
    await expect(page.getByRole('link', { name: business!.name }).first()).toBeVisible();
    await context.close();
  });

  test('the review form states plainly when submissions are closed', async ({ page, request }) => {
    const business = await firstPublishedBusiness(request);
    test.skip(!business, 'No published business in this environment');
    await page.goto(`/business/${business!.slug}`);
    const heading = page.getByRole('heading', { name: /write a review/i });
    await expect(heading).toBeVisible();
    // Either the form is usable, or it says why it is not — never a silent no-op.
    const submit = page.getByRole('button', { name: /submit review|post review|send/i });
    const closed = page.getByText(/closed|not available|temporarily/i);
    await expect(submit.or(closed).first()).toBeVisible();
  });

  test('an unknown listing is a real 404, not a redirect to the home page', async ({ page }) => {
    const response = await page.goto('/business/definitely-not-a-listing-slug');
    expect(response?.status()).toBe(404);
    // The address is unchanged and the page explains itself — a missing page is
    // never redirected to the home page (SRS SEO 004).
    expect(page.url()).toContain('/business/definitely-not-a-listing-slug');
    await expect(page.getByRole('heading', { level: 1, name: /not found/i })).toBeVisible();
    // The way back is by name, so the rename of /directory to /business (SRS
    // 1.3) is caught here rather than leaving the assertion looking for a link
    // that no longer exists (audit F-06).
    const back = page.getByRole('link', { name: /browse businesses/i }).first();
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/business(\?|$)/);
  });

  test('robots and the sitemap index describe only public content', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.ok()).toBeTruthy();
    const robotsBody = await robots.text();
    expect(robotsBody).toContain('Disallow: /admin');
    expect(robotsBody).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBeTruthy();
    const xml = await sitemap.text();
    expect(xml).toContain('<sitemapindex');
    expect(xml).not.toContain('/admin');

    const feed = await request.get(`${API_URL}/api/v1/seo/sitemap/businesses`);
    expect(feed.ok()).toBeTruthy();
  });
});
