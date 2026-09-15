import { expect, test, type Page } from '@playwright/test';
import { ADMIN_URL, WEB_URL, stackIsUp } from './support.js';
import { E2E_PAGE_PREFIX, canProvision, provision, provisioningBlocker, removeE2ePages, type ProvisionedAdmin, type ProvisionedFixture } from './provisioning.js';

/**
 * Page builder journey (CFG 002 and SEO 004 as amended in change log 1.17): an
 * administrator creates a page from a template, publishes it, sees it on the
 * site, moves it to a new address — the old one redirects — takes it down with
 * a reason and deletes it. The administrator is provisioned for the run and
 * every page the journey makes is removed afterwards, whatever happened.
 */
test.describe('Page builder', () => {
  let fixture: ProvisionedFixture;
  let dispose: () => Promise<void>;

  test.beforeAll(async () => {
    expect(canProvision(), provisioningBlocker()).toBe(true);
    await removeE2ePages();
    const provisioned = await provision();
    fixture = provisioned.fixture;
    dispose = provisioned.dispose;
  });

  test.afterAll(async () => {
    await removeE2ePages();
    if (dispose) await dispose();
  });

  // Desktop only: the mobile-320 project ignores this file (playwright.config.ts).
  test.beforeEach(async ({ request }) => {
    test.skip(!(await stackIsUp(request)), 'The API and web app must be running');
  });

  const signIn = async (page: Page, admin: ProvisionedAdmin) => {
    await page.goto(`${ADMIN_URL}/login`);
    await page.getByLabel(/email/i).fill(admin.email);
    await page.getByLabel(/^password/i).fill(admin.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('heading', { level: 1, name: /dashboard/i }).waitFor();
  };

  test('create from a template, publish, move with a redirect, unpublish with a reason and delete', async ({ page, request }) => {
    const stamp = Date.now().toString(36);
    const title = `E2E information page ${stamp}`;
    const slug = `${E2E_PAGE_PREFIX}${stamp}`;
    const moved = `${slug}-moved`;
    const copy = 'Adelaide Sphere lists local businesses that an editor has checked, with honest reviews and current opening hours. '.repeat(3);

    await signIn(page, fixture.superAdmin);
    await page.goto(`${ADMIN_URL}/website/pages/new`);
    await expect(page.getByRole('heading', { level: 1, name: 'New page' })).toBeVisible();

    // The information template: a page header, then text.
    await page.getByRole('radio', { name: /information page/i }).check();
    await page.getByLabel(/^title/i).fill(title);
    await page.getByRole('button', { name: /^edit$/i }).first().click();
    await page.getByLabel('Web address').fill(slug);
    await page.getByRole('button', { name: /^save$/i }).first().click();
    await page.getByLabel('Introduction').fill('Everything a local business needs to know about being listed.');
    const text = page.getByLabel('Text for section 2');
    await text.click();
    await page.keyboard.type(copy);

    await page.getByRole('button', { name: /create page/i }).click();
    await expect(page).toHaveURL(new RegExp(`/website/pages/${slug}$`));
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

    const publish = page.getByRole('button', { name: /^publish$/i });
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(page.getByRole('button', { name: /^unpublish$/i })).toBeVisible();

    const live = await request.get(`${WEB_URL}/${slug}`);
    expect(live.status()).toBe(200);

    // Move it: a published page leaves a permanent redirect from the old address.
    await page.getByRole('button', { name: /change address/i }).click();
    const addressDialog = page.getByRole('dialog', { name: /change this page/i });
    await expect(addressDialog.getByText(/sent to the new one automatically/i)).toBeVisible();
    await addressDialog.getByLabel('New address').fill(moved);
    await addressDialog.getByRole('button', { name: /^change address$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/website/pages/${moved}$`));

    // The public site caches redirect answers briefly, so the old address is polled.
    await expect
      .poll(async () => {
        const response = await request.get(`${WEB_URL}/${slug}`, { maxRedirects: 0 });
        return `${response.status()} ${response.headers()['location'] ?? ''}`;
      }, { timeout: 30_000, intervals: [1_000, 2_000, 5_000] })
      .toMatch(new RegExp(`^30[18] .*/${moved}$`));

    // Take it down, with the reason the confirmation asks for.
    await page.getByRole('button', { name: /^unpublish$/i }).click();
    const unpublishDialog = page.getByRole('dialog', { name: /unpublish this page/i });
    const confirm = unpublishDialog.getByRole('button', { name: /^unpublish$/i });
    await expect(confirm).toBeDisabled();
    await unpublishDialog.getByLabel(/why is it being taken down/i).fill('End-to-end journey finished');
    await confirm.click();
    await expect(page.getByRole('button', { name: /^publish$/i })).toBeVisible();

    // Delete it from the list.
    await page.goto(`${ADMIN_URL}/website/pages`);
    await page.getByRole('button', { name: `Delete ${title}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^delete$/i }).click();
    await expect(page.getByRole('link', { name: title })).toHaveCount(0);
  });
});
