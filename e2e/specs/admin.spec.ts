import { expect, test } from '@playwright/test';
import { ADMIN_CREDENTIALS, ADMIN_URL, API_URL, signInToAdmin, stackIsUp } from './support.js';

/**
 * QA 003 journey 4: admin → approve/remove → public refresh, plus the
 * authorisation checks that must hold whatever the UI shows.
 */
test.describe('Administration', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await stackIsUp(request)), 'The API and web app must be running');
  });

  test('the admin API refuses anonymous callers on every surface', async ({ request }) => {
    for (const path of ['/api/v1/admin/businesses', '/api/v1/admin/dashboard', '/api/v1/admin/operations/status', '/api/v1/admin/redirects', '/api/v1/admin/pages']) {
      const response = await request.get(`${API_URL}${path}`);
      expect(response.status(), path).toBe(401);
    }
  });

  test('the admin application redirects an anonymous visitor to sign in', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/`);
    await expect(page.getByRole('heading', { level: 1, name: /sign in/i })).toBeVisible();
    // Nothing is stored in web storage before a session exists.
    const stored = await page.evaluate(() => ({ local: Object.keys(localStorage).length, session: Object.keys(sessionStorage).length }));
    expect(stored).toEqual({ local: 0, session: 0 });
  });

  // The authenticated journeys live in `authorization.spec.ts`, which provisions
  // its own administrators rather than skipping for want of credentials.
});
