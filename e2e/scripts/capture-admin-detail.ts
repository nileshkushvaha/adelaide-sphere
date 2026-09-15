/**
 * Screenshots the administrator detail screen, which the route list cannot reach
 * because its path carries an id. Signs in with a provisioned account, opens the
 * first administrator in the list, and captures it at desktop and 320 px.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { cleanUp, provision } from '../specs/provisioning.ts';

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://127.0.0.1:4002/admin';
const OUT = process.env.OUT ?? 'admin-shots';

mkdirSync(OUT, { recursive: true });
const { fixture, dispose } = await provision();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  await page.goto(`${ADMIN_URL}/login`);
  await page.getByLabel(/email/i).fill(fixture.superAdmin.email);
  await page.getByLabel(/^password/i).fill(fixture.superAdmin.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('heading', { level: 1, name: /dashboard/i }).waitFor({ timeout: 30_000 });

  await page.goto(`${ADMIN_URL}/admins`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/admins-list.png`, fullPage: false });
  const link = page.locator('tbody a').first();
  await link.click();
  await page.getByRole('heading', { name: 'Roles' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/admin-detail-1440.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/admin-detail-320.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`horizontal overflow at 320px: ${overflow}px`);
  const culprits = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .slice(0, 12)
      .map((el) => `${el.tagName}.${(el.className || '').toString().split(' ').slice(0, 3).join('.')} right=${Math.round(el.getBoundingClientRect().right)} w=${Math.round(el.getBoundingClientRect().width)}`);
  });
  console.log(culprits.join('\n'));
} finally {
  await browser.close();
  await dispose();
  await cleanUp();
}
