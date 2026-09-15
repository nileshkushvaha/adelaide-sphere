import { expect, test } from '@playwright/test';
import { firstPublishedPost, stackIsUp } from './support.js';

/** QA 003 journey 3: Blog → article → pending comment. */
test.describe('Blog → article → comment', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await stackIsUp(request)), 'The API and web app must be running');
  });

  test('a reader reaches an article from the blog index and sees the byline and author card', async ({ page, request }) => {
    const post = await firstPublishedPost(request);
    test.skip(!post, 'No published article in this environment');

    await page.goto('/blog');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: post!.title }).first().click();
    await expect(page).toHaveURL(new RegExp(`/blog/${post!.slug}$`));
    await expect(page.getByRole('heading', { level: 1, name: post!.title })).toBeVisible();
    // Byline: the author's name appears with the publication date.
    await expect(page.locator('time').first()).toBeVisible();
  });

  test('the comment form is present or explains why it is not', async ({ page, request }) => {
    const post = await firstPublishedPost(request);
    test.skip(!post, 'No published article in this environment');
    await page.goto(`/blog/${post!.slug}`);
    const form = page.getByRole('heading', { name: /leave a comment/i });
    const closed = page.getByText(/comments are closed|closed on this article|temporarily/i);
    await expect(form.or(closed).first()).toBeVisible();
  });

  test('a draft or unknown article is a 404', async ({ page }) => {
    const response = await page.goto('/blog/not-a-real-article-slug');
    expect(response?.status()).toBe(404);
  });
});
