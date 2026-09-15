import { chromium } from '@playwright/test';
import { provision } from '../specs/provisioning.ts';
const { fixture, dispose } = await provision();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://127.0.0.1:4002/admin/login');
await page.getByLabel(/email/i).fill(fixture.superAdmin.email);
await page.getByLabel(/^password/i).fill(fixture.superAdmin.password);
await page.getByRole('button', { name: /sign in/i }).click();
await page.getByRole('heading', { level: 1, name: /dashboard/i }).waitFor();
const target = process.env.ROUTE ?? '';
if (target) {
  await page.goto(`http://127.0.0.1:4002/admin/${target}`);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
}
await page.waitForTimeout(1200);
// Resize after load as well: a window that is dragged narrower must reflow, not
// leave the content sized for the wide layout.
for (const width of [1440, 1024, 768, 390, 320]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`after resize to ${width}: overflow ${overflow}`);
}
await page.setViewportSize({ width: 320, height: 844 });
await page.waitForTimeout(500);
const wide = await page.evaluate(() => {
  const limit = document.documentElement.clientWidth;
  return [...document.querySelectorAll('*')]
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => rect.right > limit + 1 && rect.width > 0)
    .slice(0, 14)
    .map(({ el, rect }) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').slice(0, 3).join('.')} right=${Math.round(rect.right)} width=${Math.round(rect.width)}`);
});
console.log('viewport', await page.evaluate(() => document.documentElement.clientWidth), 'scrollWidth', await page.evaluate(() => document.documentElement.scrollWidth));
console.log(wide.join('\n'));
await browser.close();
await dispose();
