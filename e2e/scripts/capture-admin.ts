/**
 * Screenshots every admin screen, for design review.
 *
 * Provisions its own administrator with a generated single-use password (the
 * same helper the journeys use, which refuses any database whose name does not
 * end in _dev, _test or _e2e), signs in, captures each route, then removes the
 * account and its session. No credential is typed by hand, printed or stored.
 *
 *   ADMIN_URL=http://127.0.0.1:4002/admin OUT=/tmp/shots node e2e/scripts/capture-admin.ts
 *   (ROUTES=a,b limits the routes; WIDTH/HEIGHT set the viewport; FULL_PAGE=1 captures the whole page;
 *   THEME=dark uses the dark theme)
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { cleanUp, provision } from '../specs/provisioning.ts';

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://127.0.0.1:4002/admin';
const OUT = process.env.OUT ?? 'admin-shots';
const WIDTH = Number(process.env.WIDTH ?? 1440);
const HEIGHT = Number(process.env.HEIGHT ?? 1000);
/** FULL_PAGE=1 captures the whole scroll height rather than the first screen. */
const FULL_PAGE = process.env.FULL_PAGE === '1';
/** THEME=dark opens every screen in the dark theme (the admin's own stored preference). */
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';

// The real routes, as registered in apps/admin/src/app/routes.tsx. A path that
// does not exist screenshots the not-found page, which looks like a working
// screen in a review and is how three routes went unreviewed.
const ROUTES = ((process.env.ROUTES ?? '') !== '' ? process.env.ROUTES! : [
  '', 'businesses', 'businesses/featured', 'categories', 'services', 'areas', 'media',
  'posts', 'authors', 'blog-categories', 'blog-tags',
  'enquiries', 'reviews', 'comments', 'reports',
  'settings/general', 'settings', 'redirects',
  'website/pages', 'website/faqs', 'website/service-alerts', 'website/testimonials', 'website/partners',
  'admins', 'roles', 'permissions', 'account', 'security/settings',
  'system/queues', 'system/schedules', 'system/email-logs', 'system/cache', 'audit',
].join(',')).split(',').filter(Boolean);

mkdirSync(OUT, { recursive: true });
const { fixture, dispose } = await provision();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
// The same key the theme toggle writes, set before any page script runs.
await page.addInitScript((theme) => window.localStorage.setItem('as.admin.theme', theme), THEME);

try {
  await page.goto(`${ADMIN_URL}/login`);
  await page.screenshot({ path: `${OUT}/00-login.png`, fullPage: true });
  await page.getByLabel(/email/i).fill(fixture.superAdmin.email);
  await page.getByLabel(/^password/i).fill(fixture.superAdmin.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('heading', { level: 1, name: /dashboard/i }).waitFor({ timeout: 30_000 });
  // The dashboard is a route like any other, but its path is empty and would be
  // filtered out of the list; capture it here so it is never skipped.
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/01-dashboard.png`, fullPage: true });

  let index = 1;
  for (const route of ROUTES) {
    const name = `${String(index).padStart(2, '0')}-${(route || 'dashboard').replace(/\//g, '-')}`;
    try {
      await page.goto(`${ADMIN_URL}/${route}`, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: FULL_PAGE });
      console.log(`captured ${name}`);
    } catch (error) {
      console.log(`FAILED ${name}: ${String(error).split('\n')[0]}`);
    }
    index += 1;
  }
} finally {
  await browser.close();
  await dispose();
  await cleanUp();
  console.log('provisioned administrator removed');
}
