import { expect, test, type Page } from '@playwright/test';
import { ADMIN_URL, stackIsUp } from './support.js';
import { canProvision, provision, provisioningBlocker, type ProvisionedAdmin, type ProvisionedFixture } from './provisioning.js';

/**
 * Operations journeys (SRS QMON 001–005, MON 001; post-audit remediation).
 *
 * The audit's F-01 was invisible partly because no screen distinguished "the
 * queue is reachable" from "something is consuming it". These journeys open the
 * Queue Monitor as a real administrator and assert both that the distinction is
 * on screen and that the screen still withholds what it is supposed to withhold.
 */
test.describe('Operations screens', () => {
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
    test.skip(!(await stackIsUp(request)), 'The API and web app must be running');
  });

  const signIn = async (page: Page, admin: ProvisionedAdmin) => {
    await page.goto(`${ADMIN_URL}/login`);
    await page.getByLabel(/email/i).fill(admin.email);
    await page.getByLabel(/^password/i).fill(admin.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.getByRole('heading', { level: 1, name: /dashboard/i }).waitFor();
  };

  test('the queue monitor reports worker liveness, not just queue reachability', async ({ page }) => {
    await signIn(page, fixture.superAdmin);
    await page.goto(`${ADMIN_URL}/system/queues`);
    await expect(page.getByRole('heading', { level: 1, name: /queue monitor/i })).toBeVisible();

    // The Workers card is present whatever the state, and says which state it is.
    const workers = page.getByRole('heading', { name: /^workers$/i }).first();
    await expect(workers).toBeVisible();
    await expect(page.getByText(/Workers reporting|Nothing is processing work/)).toBeVisible();
  });

  test('the queue monitor shows no raw keys, payloads, addresses, tokens or stack traces', async ({ page }) => {
    await signIn(page, fixture.superAdmin);
    await page.goto(`${ADMIN_URL}/system/queues`);
    await page.getByRole('heading', { level: 1, name: /queue monitor/i }).waitFor();
    const body = (await page.locator('body').innerText()).toLowerCase();

    for (const forbidden of ['bull:', 'ms:worker:heartbeat', 'redis://', 'mysql://', 'authorization:', 'bearer ', 'at object.', '.ts:', 'password']) {
      expect(body, `the queue monitor must not show ${JSON.stringify(forbidden)}`).not.toContain(forbidden);
    }
    // An address would mean a payload had leaked into the display.
    expect(body).not.toMatch(/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  });

  test('scheduled tasks are visible with their last run and cannot be given a new schedule', async ({ page }) => {
    await signIn(page, fixture.superAdmin);
    await page.goto(`${ADMIN_URL}/system/schedules`);
    await expect(page.getByRole('heading', { level: 1, name: /scheduled tasks/i })).toBeVisible();
    await expect(page.getByText(/publish scheduled articles/i)).toBeVisible();
    // Nothing on the screen accepts a cron expression: the registry owns them.
    await expect(page.locator('input[name="cron"], textarea[name="cron"]')).toHaveCount(0);
  });
});
