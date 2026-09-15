import { defineConfig, devices } from '@playwright/test';

/**
 * UAT journeys (SRS QA 003). They run against an already-running stack — the
 * API on 4001, the public site on 4000 and the admin on 4002 — because those
 * services need the local MySQL and Redis. Start them with `pnpm dev:api`,
 * `pnpm dev:web` and `pnpm dev:admin`, or point the URLs at a deployed
 * environment.
 */
export default defineConfig({
  testDir: './specs',
  // Runs after every run, including an interrupted or failed one, so no
  // provisioned administrator, session or reset link outlives the journeys.
  globalTeardown: './global-teardown.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://127.0.0.1:4000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Journeys must work at a phone width; the SRS acceptance width is 320 px.
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // The page builder is an editing journey at desktop width; the public page is checked at 320 px by pages.spec.ts.
    { name: 'mobile-320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 720 } }, testIgnore: /page-builder\.spec\.ts$/ },
  ],
});
