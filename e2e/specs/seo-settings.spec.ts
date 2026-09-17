import { expect, test, type Page } from '@playwright/test';
import { ADMIN_URL, adminStackIsUp, signInToAdmin } from './support.js';

/**
 * SEO settings are edited one page at a time behind a picker (SRS SEO 001), so
 * every field on screen is bound to whichever route is selected. This journey
 * proves the binding: what is typed for one page is stored for that page, the
 * other pages keep what they had, and re-opening the screen shows each page its
 * own text — the failure to look for is one page's metadata appearing under, or
 * overwriting, another's.
 */
const TITLE_BY_PAGE = {
  home: 'Local Businesses & Guides in Adelaide',
  directory: 'Adelaide Business Directory',
} as const;

async function choosePage(page: Page, label: string, key: string): Promise<void> {
  // Ant lays its display span over the combobox input, so the wrapper is what
  // a person actually clicks; the options are rendered in a portal.
  const picker = page.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: 'Page to edit' }) });
  await picker.click();
  // `role=option` also matches rc-select's hidden accessibility node, which is
  // never clickable; the drawn option carries the label as its title.
  await page.locator(`.ant-select-item-option[title="${label}"]`).click();
  // The field ids carry the route key, so this asserts the fields on screen are
  // the ones bound to the page just chosen.
  await expect(page.locator(`#routes_${key}_metaTitle`)).toBeVisible();
}

test.describe('SEO settings, one page at a time', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await adminStackIsUp(request)), 'The admin stack is not running');
  });

  test('stores each page under its own key and shows it back', async ({ page }) => {
    await signInToAdmin(page);
    await page.goto(`${ADMIN_URL}/settings/seo`);
    await page.getByRole('heading', { level: 1, name: /seo settings/i }).waitFor();

    // Home first.
    await choosePage(page, 'Home · /', 'home');
    await page.locator('#routes_home_metaTitle').fill(TITLE_BY_PAGE.home);
    await page.locator('#routes_home_metaDescription').fill('Home description from the journey.');

    // Then the directory, without saving in between: switching pages must not
    // carry the text across.
    await choosePage(page, 'Businesses · /business', 'directory');
    // Whatever the directory holds, it is never what was just typed for the
    // home page: switching pages must not carry text across.
    await expect(page.locator('#routes_directory_metaTitle')).not.toHaveValue(TITLE_BY_PAGE.home);
    await page.locator('#routes_directory_metaTitle').fill(TITLE_BY_PAGE.directory);
    await page.locator('#routes_directory_metaDescription').fill('Directory description from the journey.');

    const saved = page.waitForResponse((response) => response.url().includes('/admin/settings/seo') && response.request().method() === 'PUT');
    await page.getByRole('button', { name: /save seo settings/i }).click();
    const body = (await (await saved).request().postDataJSON()) as { routes: Record<string, { metaTitle: string | null }> };
    expect(body.routes.home?.metaTitle).toBe(TITLE_BY_PAGE.home);
    expect(body.routes.directory?.metaTitle).toBe(TITLE_BY_PAGE.directory);

    // What the server stored, read back from a fresh load.
    await page.reload();
    await page.getByRole('heading', { level: 1, name: /seo settings/i }).waitFor();
    await choosePage(page, 'Home · /', 'home');
    await expect(page.locator('#routes_home_metaTitle')).toHaveValue(TITLE_BY_PAGE.home);
    await expect(page.locator('#routes_home_metaDescription')).toHaveValue('Home description from the journey.');

    await choosePage(page, 'Businesses · /business', 'directory');
    await expect(page.locator('#routes_directory_metaTitle')).toHaveValue(TITLE_BY_PAGE.directory);
    await expect(page.locator('#routes_directory_metaDescription')).toHaveValue('Directory description from the journey.');

    // Editing one page again leaves the other alone.
    await page.locator('#routes_directory_metaTitle').fill('Adelaide business directory (edited)');
    const resaved = page.waitForResponse((response) => response.url().includes('/admin/settings/seo') && response.request().method() === 'PUT');
    await page.getByRole('button', { name: /save seo settings/i }).click();
    const second = (await (await resaved).request().postDataJSON()) as { routes: Record<string, { metaTitle: string | null }> };
    expect(second.routes.directory?.metaTitle).toBe('Adelaide business directory (edited)');
    expect(second.routes.home?.metaTitle).toBe(TITLE_BY_PAGE.home);

    await page.reload();
    await page.getByRole('heading', { level: 1, name: /seo settings/i }).waitFor();
    await choosePage(page, 'Home · /', 'home');
    await expect(page.locator('#routes_home_metaTitle')).toHaveValue(TITLE_BY_PAGE.home);
  });
});
