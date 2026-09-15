import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_URL, adminStackIsUp } from './support.js';
import { canProvision, provision, provisioningBlocker, type ProvisionedAdmin, type ProvisionedFixture } from './provisioning.js';

const axeSource = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axeSource });
  return page.evaluate(async () => {
    const results = await (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; help: string; nodes: { target: unknown[] }[] }[] }> } }).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    });
    return results.violations.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} node(s), first: ${JSON.stringify(violation.nodes[0]?.target)})`);
  });
}

/** One route per page family: a dashboard, a list, a settings screen, an editor, a queue, an operations screen. */
const FAMILIES = [
  { path: '', name: 'Dashboard' },
  { path: 'businesses', name: 'Businesses' },
  { path: 'security/settings', name: 'Security settings' },
  { path: 'roles', name: 'Roles' },
  { path: 'reviews', name: 'Reviews' },
  { path: 'system/queues', name: 'Queue monitor' },
  { path: 'account', name: 'Account security' },
  { path: 'media', name: 'Media library' },
  { path: 'redirects', name: 'Redirects' },
  { path: 'website/service-alerts/new', name: 'Service alert editor' },
];

/** The widths the redesign is accepted at, from the brief. */
const WIDTHS = [1440, 1280, 1024, 768, 390, 320];

/**
 * Admin interface acceptance (SRS NFR 006/011).
 *
 * The admin is an internal product, which is exactly why it is easy to leave
 * untested at 320 px or against a screen reader. These run the same checks a
 * manual pass would repeat: no page scrolls sideways, every family passes axe,
 * and the navigation is reachable from a phone.
 */
test.describe('Admin interface', () => {
  let fixture: ProvisionedFixture;
  let dispose: () => Promise<void>;

  test.beforeAll(async () => {
    expect(canProvision(), provisioningBlocker()).toBe(true);
    const provisioned = await provision();
    fixture = provisioned.fixture;
    dispose = provisioned.dispose;
  });

  test.afterAll(async () => {
    if (dispose) await dispose();
  });

  test.beforeEach(async ({ request }) => {
    test.skip(!(await adminStackIsUp(request)), 'The API and the admin application must be running');
  });

  const signIn = async (page: Page, admin: ProvisionedAdmin) => {
    await page.goto(`${ADMIN_URL}/login`);
    await page.getByLabel(/email/i).fill(admin.email);
    await page.getByLabel(/^password/i).fill(admin.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('heading', { level: 1, name: /dashboard/i }).waitFor();
  };

  test('every page family passes an accessibility scan', async ({ page }) => {
    await signIn(page, fixture.superAdmin);
    for (const family of FAMILIES) {
      await page.goto(`${ADMIN_URL}/${family.path}`);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      expect(await axeViolations(page), family.name).toEqual([]);
    }
  });

  test('every page family passes an accessibility scan in the dark theme too', async ({ page }) => {
    // The toggle's own storage key, set before any page script runs.
    await page.addInitScript(() => window.localStorage.setItem('ms.admin.theme', 'dark'));
    await signIn(page, fixture.superAdmin);
    for (const family of FAMILIES) {
      await page.goto(`${ADMIN_URL}/${family.path}`);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      expect(await page.evaluate(() => document.documentElement.dataset.theme), family.name).toBe('dark');
      expect(await axeViolations(page), `${family.name} (dark)`).toEqual([]);
    }
  });

  test('the theme toggle switches to dark and back, and is remembered', async ({ page }) => {
    await signIn(page, fixture.superAdmin);
    const toggle = page.getByRole('button', { name: 'Dark theme' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    await page.getByRole('button', { name: 'Dark theme' }).click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  });

  test('no page family scrolls sideways, from a wide desktop down to 320 px', async ({ page }) => {
    await signIn(page, fixture.superAdmin);
    for (const family of FAMILIES) {
      await page.goto(`${ADMIN_URL}/${family.path}`);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        // The layout reflows on the next frame, so measure once it has settled
        // rather than mid-reflow; a tolerance of one pixel covers sub-pixel
        // rounding, which is not a layout defect.
        await expect
          .poll(async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
            message: `${family.name} at ${width}px`,
            timeout: 3_000,
          })
          .toBeLessThanOrEqual(1);
      }
    }
  });

  test('the navigation is reachable on a phone and closes on Escape', async ({ page }) => {
    await signIn(page, fixture.superAdmin);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${ADMIN_URL}/businesses`);
    await page.getByRole('heading', { level: 1, name: /businesses/i }).waitFor();

    const open = page.getByRole('button', { name: /open navigation|menu/i }).first();
    await open.click();
    const drawerNav = page.getByRole('navigation', { name: /admin navigation/i });
    await expect(drawerNav.getByRole('link', { name: 'Reviews' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(drawerNav.getByRole('link', { name: 'Reviews' })).toBeHidden();
    expect(await axeViolations(page)).toEqual([]);
  });

  test('the save bar stays reachable without covering the last field', async ({ page }) => {
    await signIn(page, fixture.superAdmin);
    await page.goto(`${ADMIN_URL}/security/settings`);
    await page.getByRole('heading', { level: 1, name: /security settings/i }).waitFor();

    const save = page.getByRole('button', { name: /save security settings/i });
    await expect(save).toBeVisible();
    // Until something changes, saving is not offered — an enabled Save on an
    // untouched form invites a pointless write.
    await expect(save).toBeDisabled();

    const lastField = page.getByLabel('Temporary lock duration');
    await lastField.scrollIntoViewIfNeeded();
    const [field, bar] = await Promise.all([lastField.boundingBox(), save.boundingBox()]);
    expect(field, 'the last field is on screen').not.toBeNull();
    expect(bar, 'the save bar is on screen').not.toBeNull();
    expect(field!.y + field!.height, 'the save bar must not cover the last field').toBeLessThanOrEqual(bar!.y + 1);
  });

  test('the administrator access editor passes axe, fits 320 px and is operable from the keyboard', async ({ page }) => {
    await signIn(page, fixture.superAdmin);
    // The detail route carries an id, so it cannot sit in the family list; it is
    // reached the way an administrator reaches it.
    await page.goto(`${ADMIN_URL}/admins`);
    await page.getByRole('heading', { level: 1, name: /administrators/i }).waitFor();
    await page.locator('tbody a').first().click();
    await page.getByRole('heading', { name: 'Roles' }).waitFor();

    expect(await axeViolations(page), 'Administrator access').toEqual([]);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
          message: `Administrator access at ${width}px`,
          timeout: 3_000,
        })
        .toBeLessThanOrEqual(1);
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    // Every permission is a real checkbox, so the grid is operable without a
    // mouse; the group controls are buttons for the same reason.
    const search = page.getByLabel('Search permissions');
    await search.fill('listings');
    // The grid is one row per menu item and one column per action (SRS 1.13),
    // so listings.publish is the "Businesses" row's "Publish" checkbox.
    const checkbox = page.getByRole('checkbox', { name: 'Businesses: Publish', exact: true });
    await checkbox.focus();
    await expect(checkbox).toBeFocused();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    // Nothing is written until the change is confirmed, and the confirmation
    // says what it will do.
    await page.getByRole('button', { name: 'Save direct permissions' }).click();
    await expect(page.getByRole('dialog')).toContainText('signs');
    await page.getByRole('button', { name: 'Keep editing' }).click();
  });

  test('an administrator without a permission is not offered the screen behind it', async ({ page }, testInfo) => {
    await signIn(page, fixture.roleLimited);
    // Below the desktop breakpoint the navigation lives in a drawer, so "not
    // offered" has to be checked with the drawer open.
    if ((testInfo.project.use.viewport?.width ?? 1280) < 992) {
      await page.getByRole('button', { name: /open navigation/i }).first().click();
    }
    const nav = page.getByRole('navigation', { name: /admin navigation/i });
    await expect(nav.getByRole('link', { name: 'Reviews' })).toBeVisible();
    // Moderation only: the access screens are neither shown nor reachable.
    await expect(nav.getByRole('link', { name: 'Roles' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Security settings' })).toHaveCount(0);
  });
});
