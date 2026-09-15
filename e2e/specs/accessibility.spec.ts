import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { firstPublishedBusiness, stackIsUp } from './support.js';

const axeSource = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/**
 * Runs axe against the page as it is currently rendered and returns one line
 * per violation. axe is injected from node_modules rather than a CDN so the
 * scan works offline and pins the same version the app tests use.
 */
async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axeSource });
  return page.evaluate(async () => {
    const results = await (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; help: string; nodes: { target: unknown[] }[] }[] }> } }).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    });
    return results.violations.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} node(s), first: ${JSON.stringify(violation.nodes[0]?.target)})`);
  });
}

/**
 * Keyboard and layout acceptance for the public pages (SRS NFR 006/011 and the
 * HERO acceptance widths). These are the checks a manual pass would repeat, run
 * automatically so a regression is caught before someone has to find it.
 */
test.describe('Public accessibility', () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await stackIsUp(request)), 'The web app must be running');
  });

  test('the skip link is the first stop and moves focus to the main region', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: /skip to main content/i });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
  });

  test('the hero search is reachable and submittable by keyboard alone', async ({ page }) => {
    await page.goto('/');
    const search = page.getByRole('combobox', { name: /what are you looking for/i });
    await search.focus();
    await search.fill('cafe');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/business\?/);
  });

  test('every page has exactly one h1 and a main landmark', async ({ page, request }) => {
    const business = await firstPublishedBusiness(request);
    const paths = ['/', '/business', '/blog', '/contact', ...(business ? [`/business/${business.slug}`] : [])];
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('h1'), path).toHaveCount(1);
    }
  });

  test('the home page does not scroll horizontally at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the directory does not scroll horizontally at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/business');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the public pages pass an automated WCAG 2.2 AA scan', async ({ page, request }) => {
    const business = await firstPublishedBusiness(request);
    const paths = ['/', '/business', '/blog', '/contact', ...(business ? [`/business/${business.slug}`] : [])];
    for (const path of paths) {
      await page.goto(path);
      // The hero photograph decodes asynchronously and contrast is measured
      // against the overlay, so wait for the images rather than for the network:
      // where a Turnstile key is configured the widget holds a connection open,
      // and 'networkidle' would never arrive.
      await page.waitForLoadState('load');
      // Lazy images below the fold do not load until scrolled to, so decode()
      // on them never settles; only the eagerly loaded ones (the hero) are awaited.
      await page.evaluate(() => Promise.all([...document.images].filter((image) => !image.complete && image.loading !== 'lazy').map((image) => image.decode().catch(() => undefined))));
      // The entrance motion fades text in from opacity 0 (≤ 1.3 s). Contrast is
      // judged on the settled page, as a reader sees it, not mid-fade; endless
      // animations (the route spinner) never finish, so only finite ones are awaited.
      await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))).map((animation) => animation.finished.catch(() => undefined))));
      expect(await axeViolations(page), path).toEqual([]);
    }
  });

  test('the mobile navigation menu is operable and labelled', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const compact = page.getByRole('navigation', { name: /main \(compact\)/i });
    await expect(compact.getByRole('link', { name: 'Businesses' })).toBeHidden();
    // A native modal <dialog> drawer (SRS 1.9 MENU 006): it opens from the
    // button, Escape closes it and focus returns to the button.
    const trigger = page.locator('button[aria-label="Menu"]');
    await trigger.click();
    await expect(compact.getByRole('link', { name: 'Businesses' })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(compact.getByRole('link', { name: 'Businesses' })).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('desktop submenus open from their button and close with Escape', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const main = page.getByRole('navigation', { name: 'Main' });
    const toggle = main.locator('button[aria-controls]').first();
    // Only a primary menu with children has submenus; the seeded default has none.
    test.skip((await toggle.count()) === 0, 'the primary menu has no submenus');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(`#${await toggle.getAttribute('aria-controls')}`)).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
  });

  test('the contact bar scrolls away while the navigation stays pinned', async ({ page }) => {
    // Client instruction, 7 September 2026: the top bar hides on scroll and the
    // navigation remains reachable. Sticky positioning, no scroll listener.
    await page.goto('/');
    const header = page.locator('header').first();
    await expect(header).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 2000));
    await page.waitForFunction(() => Math.round(document.querySelector('header')!.getBoundingClientRect().top) === 0);

    const contactBar = page.locator('[aria-label="Contact details"]');
    if ((await contactBar.count()) > 0) {
      const top = await contactBar.evaluate((element) => element.getBoundingClientRect().top);
      expect(top).toBeLessThan(0);
    }
    // The navigation is still usable from anywhere on the page. Below the
    // `lg` breakpoint it lives inside the menu drawer, so "usable" means the
    // control is there and opening it reveals the links — asserting the
    // desktop link at 320 px asserted the wrong thing and failed for a reason
    // that was never a defect (audit F-07).
    const menu = header.locator('button[aria-label="Menu"]');
    if ((await menu.count()) > 0 && (await menu.first().isVisible())) {
      await menu.first().click();
    }
    await expect(header.getByRole('link', { name: 'Businesses' }).first()).toBeVisible();
  });
});
