import { expect, test, type Page } from '@playwright/test';
import { ADMIN_URL, API_URL, stackIsUp } from './support.js';
import { MODERATOR_PERMISSIONS, canProvision, provision, provisioningBlocker, setRolePermissions, type ProvisionedAdmin, type ProvisionedFixture } from './provisioning.js';

/**
 * Authorization journeys (SRS RBAC 006/010, QA 003 / audit closure item 2).
 *
 * These replace the four journeys that used to skip for want of credentials.
 * Administrators are provisioned for the run with random single-use passwords
 * and removed afterwards; nothing is read from a tracked file and no credential
 * reaches a log or a report.
 */
test.describe('Authorization journeys', () => {
  let fixture: ProvisionedFixture;
  let dispose: () => Promise<void>;

  test.beforeAll(async () => {
    // A missing or unsafe database is reported, never silently skipped.
    expect(canProvision(), provisioningBlocker()).toBe(true);
    const provisioned = await provision();
    fixture = provisioned.fixture;
    dispose = provisioned.dispose;
  });

  test.afterAll(async () => {
    // Runs even when a test failed, so nothing usable is left behind.
    if (dispose) await dispose();
  });

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

  /**
   * The navigation an administrator is actually offered. At narrow widths it
   * lives in a drawer, so this opens it first — the permissions must gate the
   * same entries on a phone as on a desktop.
   */
  const navigationLinks = async (page: Page): Promise<string[]> => {
    const opener = page.getByRole('button', { name: /open navigation/i });
    if (await opener.isVisible().catch(() => false)) await opener.click();
    const nav = page.getByRole('navigation', { name: /admin navigation/i }).last();
    await nav.waitFor();
    return (await nav.getByRole('link').allInnerTexts()).map((text) => text.trim()).filter(Boolean);
  };

  /**
   * Closes the drawer again so a following assertion sees the page itself.
   * Escape is used rather than the toggle: the drawer's own title overlays the
   * button, and the shell documents Escape as the way out (WCAG 2.1.2).
   */
  const closeNavigation = async (page: Page) => {
    const closer = page.getByRole('button', { name: /close navigation/i });
    if (await closer.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await closer.waitFor({ state: 'hidden' }).catch(() => undefined);
    }
  };

  test('a super administrator sees the whole navigation and can open the access screens', async ({ page }) => {
    await signIn(page, fixture.superAdmin);
    const links = await navigationLinks(page);
    for (const label of ['Dashboard', 'Businesses', 'Articles', 'Reviews', 'Roles', 'Permissions', 'Administrators', 'Activity log']) {
      expect(links, `expected "${label}" in the navigation`).toContain(label);
    }
    await closeNavigation(page);
    await page.goto(`${ADMIN_URL}/roles`);
    await expect(page.getByRole('heading', { level: 1, name: /^roles$/i })).toBeVisible();
    // A role-creating permission is held, so the control is offered.
    await expect(page.getByRole('button', { name: /new role/i })).toBeVisible();
  });

  test('a role-limited administrator sees only permitted navigation, and is refused elsewhere', async ({ page }) => {
    await signIn(page, fixture.roleLimited);
    const links = await navigationLinks(page);
    expect(links).toContain('Reviews');
    expect(links).toContain('Comments');
    for (const hidden of ['Roles', 'Permissions', 'Administrators', 'Activity log', 'Businesses', 'Media library']) {
      expect(links, `"${hidden}" must not be offered`).not.toContain(hidden);
    }
    await closeNavigation(page);

    // Typing the address directly reaches the forbidden state, not the page.
    await page.goto(`${ADMIN_URL}/roles`);
    await expect(page.getByRole('heading', { level: 1, name: /do not have permission/i })).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);

    // And the API refuses the same request whatever the interface rendered.
    const refused = await page.request.get(`${API_URL}/api/v1/admin/roles`);
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error.code).toBe('FORBIDDEN');
  });

  test('a direct permission alone grants access, and the actions it does not cover stay hidden', async ({ page }) => {
    await signIn(page, fixture.directOnly);
    const links = await navigationLinks(page);
    // The only grant is direct: listings.read. No role is involved at all.
    expect(links).toContain('Businesses');
    expect(links).not.toContain('Articles');
    await closeNavigation(page);

    await page.goto(`${ADMIN_URL}/businesses`);
    await expect(page.getByRole('heading', { level: 1, name: /businesses/i })).toBeVisible();
    // Reading is permitted; creating is not, so the control is absent.
    await expect(page.getByRole('button', { name: /new business/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /new business/i })).toHaveCount(0);

    // The principal endpoint shows where the capability came from.
    const me = await page.request.get(`${API_URL}/api/v1/admin/auth/me`);
    const body = await me.json();
    expect(body.data.admin.directPermissions).toEqual(['listings.read']);
    expect(body.data.admin.inheritedPermissions).toEqual([]);
    expect(body.data.admin.roles).toEqual([]);
  });

  test('revoking a permission during an active session ends that access at once', async ({ page }) => {
    await signIn(page, fixture.roleLimited);
    await page.goto(`${ADMIN_URL}/reviews`);
    await expect(page.getByRole('heading', { level: 1, name: /reviews/i })).toBeVisible();

    // The role loses moderation while the browser session is open.
    await setRolePermissions(fixture.moderatorRoleId, MODERATOR_PERMISSIONS.filter((key) => !key.startsWith('reviews.')));

    const refused = await page.request.get(`${API_URL}/api/v1/admin/reviews`);
    expect(refused.status(), 'the open session must not keep the withdrawn permission').toBe(403);

    await page.goto(`${ADMIN_URL}/reviews`);
    await expect(page.getByRole('heading', { level: 1, name: /do not have permission/i })).toBeVisible();
    // Restore the fixture for the remaining assertions in this file.
    await setRolePermissions(fixture.moderatorRoleId, [...MODERATOR_PERMISSIONS]);
  });

  test('signing out clears the session and the capabilities behind it', async ({ page }) => {
    await signIn(page, fixture.roleLimited);
    await page.getByRole('button', { name: /account menu/i }).click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();
    await expect(page.getByRole('heading', { level: 1, name: /sign in/i })).toBeVisible();

    // The server session is gone…
    const me = await page.request.get(`${API_URL}/api/v1/admin/auth/me`);
    expect(me.status()).toBe(401);
    // …and nothing about it was left in the browser.
    const stored = await page.evaluate(() => ({ local: Object.keys(localStorage).length, session: Object.keys(sessionStorage).length }));
    expect(stored).toEqual({ local: 0, session: 0 });

    // A protected address now goes to sign-in rather than rendering anything.
    await page.goto(`${ADMIN_URL}/reviews`);
    await expect(page.getByRole('heading', { level: 1, name: /sign in/i })).toBeVisible();
  });
});
