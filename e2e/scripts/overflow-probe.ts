/**
 * Names the elements that push an admin route wider than the viewport, for
 * diagnosing a failure of the "no page scrolls sideways" check.
 *
 *   ROUTE=website/service-alerts/new WIDTH=320 node e2e/scripts/overflow-probe.ts
 */
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import { cleanUp, provision } from '../specs/provisioning.ts';

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://127.0.0.1:4002/admin';
const ROUTE = process.env.ROUTE ?? '';
const WIDTH = Number(process.env.WIDTH ?? 320);

const { fixture, dispose } = await provision();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  await page.goto(`${ADMIN_URL}/login`);
  await page.getByLabel(/email/i).fill(fixture.superAdmin.email);
  await page.getByLabel(/^password/i).fill(fixture.superAdmin.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('heading', { level: 1, name: /dashboard/i }).waitFor({ timeout: 30_000 });
  await page.goto(`${ADMIN_URL}/${ROUTE}`, { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: WIDTH, height: 900 });
  await page.waitForTimeout(500);
  const report = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - width;
    // Only the outermost offenders: an element whose parent also overflows is noise.
    const offenders = [...document.querySelectorAll('body *')].filter((el) => {
      const right = el.getBoundingClientRect().right;
      const parentRight = el.parentElement?.getBoundingClientRect().right ?? 0;
      return right > width + 1 && parentRight <= width + 1;
    });
    const describe = (el: Element) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.className).split(' ').slice(0, 3).join('.')} left=${Math.round(box.left)} width=${Math.round(box.width)} display=${style.display} max-width=${style.maxWidth}`;
    };
    // Each offender with its three nearest ancestors, which is usually where the
    // missing constraint is.
    return {
      overflow,
      offenders: offenders.slice(0, 5).map((el) => {
        const chain = [describe(el)];
        let parent = el.parentElement;
        for (let i = 0; i < 3 && parent; i += 1, parent = parent.parentElement) chain.push(`  ↑ ${describe(parent)}`);
        return chain.join('\n');
      }),
    };
  });
  console.log(`overflow at ${WIDTH}px: ${report.overflow}px`);
  console.log(report.offenders.join('\n'));
  // AXE=1 also prints each WCAG violation with the axe explanation of every node.
  if (process.env.AXE === '1') {
    await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core/axe.min.js') });
    const detail = await page.evaluate(async () => {
      const results = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; nodes: { html: string; failureSummary: string }[] }[] }> } }).axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      });
      return results.violations.flatMap((v) => v.nodes.slice(0, 3).map((n) => `${v.id}: ${n.html.slice(0, 160)}\n    ${n.failureSummary.replace(/\n/g, ' ').slice(0, 260)}`));
    });
    console.log(detail.join('\n'));
  }
} finally {
  await browser.close();
  await dispose();
  await cleanUp();
}
