/**
 * The admin route inventory sweep (docs/audits/admin-ui-inventory.md).
 *
 * Opens every route registered in apps/admin/src/app/routes.tsx — including the
 * ones whose path carries an id, resolved from the database this run points at —
 * and records, per route:
 *
 *   - at 1440 px and 320 px: the axe result (WCAG 2.2 A/AA tags), sideways
 *     scroll, console errors and uncaught exceptions, exactly one h1, the main
 *     landmark, and whether the first Tab reaches the skip link;
 *   - as an administrator holding only moderation permissions: whether the route
 *     opened or showed the forbidden page, compared with what the admin's own
 *     route-permission table says it should do, and whether the navigation
 *     offered a link to it.
 *
 * It provisions its own administrators (the journeys' helper, which refuses any
 * database whose name does not end in _dev, _test or _e2e) and removes them
 * afterwards. Nothing is created, edited or deleted through the interface; where
 * an editor has no record to open, one unpublished draft is written directly for
 * the length of the run and deleted at the end.
 *
 *   DATABASE_URL=… OUT=/tmp/sweep node e2e/scripts/route-sweep.ts
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';
import { createDatabaseClient } from '@adelaide-sphere/database';
import { cleanUp, databaseUrl, provision, type ProvisionedAdmin } from '../specs/provisioning.ts';
import { holdsAll, permissionsForPath } from '../../apps/admin/src/auth/permissions.ts';

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://127.0.0.1:4002/admin';
const OUT = process.env.OUT ?? 'route-sweep';
const WIDTHS = [1440, 320];
const axeSource = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/** Every registered route, in the order routes.tsx declares them. */
const ROUTES = [
  '/', '/businesses', '/businesses/featured', '/businesses/featured/new', '/businesses/new', '/businesses/:business',
  '/categories', '/categories/new', '/categories/:category', '/services', '/services/new', '/services/:service',
  '/areas', '/areas/new', '/areas/:area', '/media', '/media/:media',
  '/posts', '/posts/new', '/posts/:post', '/authors', '/authors/new', '/authors/:author',
  '/blog-categories', '/blog-categories/new', '/blog-categories/:blogCategory', '/blog-tags', '/blog-tags/new', '/blog-tags/:blogTag',
  '/enquiries', '/comments', '/reviews', '/reports', '/settings/general', '/settings', '/redirects', '/redirects/new',
  '/admins', '/admins/new', '/admins/:admin', '/account', '/roles', '/roles/new', '/roles/:role', '/permissions', '/audit',
  '/system/email-logs', '/website/pages', '/website/pages/new', '/website/pages/:page', '/pages',
  '/website/faqs', '/website/faqs/new', '/website/faqs/:faq', '/website/service-alerts', '/website/service-alerts/new', '/website/service-alerts/:alert',
  '/website/testimonials', '/website/testimonials/new', '/website/testimonials/:testimonial',
  '/website/partners', '/website/partners/new', '/website/partners/:partner',
  '/security/settings', '/system/cache', '/system/queues', '/system/schedules', '/this-route-does-not-exist',
];

/** Signed-out routes, checked without a session. */
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password', '/accept-setup'];

/** Records this run created because the database had none, removed at the end. */
const TEMPORARY_PREFIX = 'Route sweep (temporary)';
const created: { blogTag?: string; testimonial?: string; partner?: string } = {};

/**
 * An editor with nothing to open cannot be checked. Where the database has no
 * record of a kind, the sweep writes one clearly labelled draft for the length
 * of the run and deletes it afterwards; nothing it creates is ever published.
 */
async function ensureRecords(): Promise<void> {
  const db = createDatabaseClient({ url: databaseUrl()!, connectionLimit: 2, allowPublicKeyRetrieval: true });
  try {
    if (!(await db.blogTag.findFirst({ select: { id: true } }))) {
      created.blogTag = (await db.blogTag.create({ data: { name: TEMPORARY_PREFIX, slug: `route-sweep-temporary-${Date.now()}`, active: false } })).id;
    }
    if (!(await db.testimonial.findFirst({ select: { id: true } }))) {
      created.testimonial = (await db.testimonial.create({ data: { displayName: TEMPORARY_PREFIX, quote: 'A draft written by the route sweep; it is deleted when the sweep ends.' } })).id;
    }
    if (!(await db.partnerOrganisation.findFirst({ select: { id: true } }))) {
      created.partner = (await db.partnerOrganisation.create({ data: { name: TEMPORARY_PREFIX } })).id;
    }
  } finally {
    await db.$disconnect();
  }
}

async function removeRecords(): Promise<void> {
  const db = createDatabaseClient({ url: databaseUrl()!, connectionLimit: 2, allowPublicKeyRetrieval: true });
  try {
    if (created.blogTag) await db.blogTag.delete({ where: { id: created.blogTag } });
    if (created.testimonial) await db.testimonial.delete({ where: { id: created.testimonial } });
    if (created.partner) await db.partnerOrganisation.delete({ where: { id: created.partner } });
  } finally {
    await db.$disconnect();
  }
}

/** Finds a record for each id-carrying route; a route with none is reported, not failed. */
async function resolveIds(): Promise<Record<string, string | null>> {
  const db = createDatabaseClient({ url: databaseUrl()!, connectionLimit: 2, allowPublicKeyRetrieval: true });
  try {
    const first = async <T extends { id?: string; slug?: string }>(query: Promise<T | null>, field: 'id' | 'slug' = 'id') => ((await query) as Record<string, string> | null)?.[field] ?? null;
    return {
      business: await first(db.business.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } })),
      category: await first(db.category.findFirst({ select: { id: true } })),
      service: await first(db.service.findFirst({ select: { id: true } })),
      area: await first(db.localArea.findFirst({ select: { id: true } })),
      media: await first(db.mediaAsset.findFirst({ select: { id: true }, where: { status: 'ready' } })),
      post: await first(db.post.findFirst({ select: { id: true } })),
      author: await first(db.author.findFirst({ select: { id: true } })),
      blogCategory: await first(db.blogCategory.findFirst({ select: { id: true } })),
      blogTag: await first(db.blogTag.findFirst({ select: { id: true } })),
      admin: await first(db.adminUser.findFirst({ select: { id: true }, where: { email: { not: { startsWith: 'e2e-' } } } })),
      role: await first(db.role.findFirst({ select: { id: true }, where: { key: { not: { startsWith: 'e2e_' } } } })),
      page: await first(db.staticPage.findFirst({ select: { slug: true } }), 'slug'),
      faq: await first(db.faq.findFirst({ select: { id: true } })),
      alert: await first(db.serviceAlert.findFirst({ select: { id: true } })),
      testimonial: await first(db.testimonial.findFirst({ select: { id: true } })),
      partner: await first(db.partnerOrganisation.findFirst({ select: { id: true } })),
    };
  } finally {
    await db.$disconnect();
  }
}

async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axeSource });
  return page.evaluate(async () => {
    const results = await (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; nodes: { target: unknown[] }[] }[] }> } }).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    });
    return results.violations.map((violation) => `${violation.id} (${violation.nodes.length}; ${JSON.stringify(violation.nodes[0]?.target)})`);
  });
}

interface WidthResult {
  width: number;
  axe: string[];
  overflow: number;
  h1: number;
  main: boolean;
  skipLink: boolean;
  errors: string[];
}

interface RouteResult {
  route: string;
  path: string | null;
  note?: string;
  widths: WidthResult[];
  permission?: { expected: 'open' | 'forbidden'; actual: 'open' | 'forbidden' | 'other'; navOffered: boolean | null };
}

async function signIn(page: Page, admin: ProvisionedAdmin) {
  await page.goto(`${ADMIN_URL}/login`);
  await page.getByLabel(/email/i).fill(admin.email);
  await page.getByLabel(/^password/i).fill(admin.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('heading', { level: 1, name: /dashboard/i }).waitFor({ timeout: 30_000 });
}

async function inspect(page: Page, url: string, width: number, shell: boolean): Promise<WidthResult> {
  const errors: string[] = [];
  const onConsole = (message: { type: () => string; text: () => string }) => {
    if (message.type() !== 'error') return;
    // Signed out, the application asks the server whether a session exists and
    // is told no: the browser logs that 401 as a failed resource. It is the
    // answer, not a fault, and only on the signed-out screens.
    if (!shell && /status of 401/.test(message.text())) return;
    errors.push(message.text().slice(0, 200));
  };
  const onPageError = (error: Error) => errors.push(`uncaught: ${error.message.slice(0, 200)}`);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  try {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(300);
    const structure = await page.evaluate(() => ({
      h1: document.querySelectorAll('h1').length,
      main: Boolean(document.querySelector('main, [role="main"]')),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    let skipLink = !shell;
    if (shell) {
      // The first Tab from the top of the document must reach the skip link.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press('Tab');
      skipLink = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        return Boolean(active && /skip to main content/i.test(active.textContent ?? '') && active.getBoundingClientRect().height > 0);
      });
    }
    return { width, axe: await axeViolations(page), overflow: structure.overflow, h1: structure.h1, main: structure.main, skipLink, errors };
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }
}

mkdirSync(OUT, { recursive: true });
await ensureRecords();
const ids = await resolveIds();
const { fixture, dispose } = await provision();
const browser = await chromium.launch();
const results: RouteResult[] = [];

const concrete = (route: string): { path: string | null; note?: string } => {
  const match = /:([A-Za-z]+)$/.exec(route);
  if (!match) return { path: route };
  const id = ids[match[1]!];
  return id ? { path: route.replace(/:[A-Za-z]+$/, encodeURIComponent(id)) } : { path: null, note: `no ${match[1]} record in this database` };
};

try {
  // Signed out.
  const anonymous = await browser.newPage();
  for (const route of PUBLIC_ROUTES) {
    const widths: WidthResult[] = [];
    for (const width of WIDTHS) widths.push(await inspect(anonymous, `${ADMIN_URL}${route}`, width, false));
    results.push({ route, path: route, widths });
    console.log(`signed out ${route}`);
  }
  await anonymous.close();

  // Signed in with every permission.
  const page = await browser.newPage();
  await signIn(page, fixture.superAdmin);
  for (const route of ROUTES) {
    const { path, note } = concrete(route);
    if (!path) {
      results.push({ route, path: null, note, widths: [] });
      console.log(`skipped ${route}: ${note}`);
      continue;
    }
    const widths: WidthResult[] = [];
    for (const width of WIDTHS) widths.push(await inspect(page, `${ADMIN_URL}${path === '/' ? '/' : path}`, width, true));
    results.push({ route, path, note, widths });
    console.log(`checked ${route}`);
  }
  await page.close();

  // Signed in with moderation only: what opens, what is refused, what is offered.
  const limited = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await signIn(limited, fixture.roleLimited);
  const held = ['reviews.moderate', 'comments.moderate'];
  const normalise = (path: string) => path.replace(/\/+$/, '') || '/';
  const navHrefs = (await limited.evaluate(() => [...document.querySelectorAll('nav a[href]')].map((a) => new URL((a as HTMLAnchorElement).href).pathname))).map(normalise);
  // Reached from the account menu rather than the navigation, for everyone.
  const outsideNav = new Set(['/account']);
  for (const result of results) {
    if (!result.path || PUBLIC_ROUTES.includes(result.route) || result.route === '/this-route-does-not-exist' || result.route === '/pages') continue;
    const required = permissionsForPath(result.path);
    const expected = holdsAll(held, required) ? 'open' : 'forbidden';
    await limited.goto(`${ADMIN_URL}${result.path}`, { waitUntil: 'networkidle', timeout: 30_000 });
    await limited.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
    const heading = (await limited.getByRole('heading', { level: 1 }).first().textContent().catch(() => '')) ?? '';
    const actual = /do not have permission/i.test(heading) ? 'forbidden' : heading ? 'open' : 'other';
    const listRoute = !/\/(new|[^/]*[0-9][^/]*)$/.test(result.path) && result.route.split('/').length <= 3;
    result.permission = { expected, actual, navOffered: listRoute && !outsideNav.has(result.path) ? navHrefs.includes(normalise(`/admin${result.path}`)) : null };
  }
  await limited.close();
} finally {
  await browser.close();
  await dispose();
  await cleanUp();
  await removeRecords();
}

writeFileSync(`${OUT}/route-sweep.json`, JSON.stringify(results, null, 2));

// A compact table for the inventory: one row per route.
const cell = (ok: boolean) => (ok ? 'pass' : '**fail**');
const lines = ['| Route | 1440 axe | 320 axe | 320 fits | Console | One h1 + main | Skip link | Moderator |', '|---|---|---|---|---|---|---|---|'];
for (const result of results) {
  if (!result.path) {
    lines.push(`| \`${result.route}\` | — | — | — | — | — | — | not checked: ${result.note} |`);
    continue;
  }
  const [wide, narrow] = result.widths as [WidthResult, WidthResult];
  const permission = result.permission
    ? `${result.permission.actual === result.permission.expected ? result.permission.actual : `**${result.permission.actual}, expected ${result.permission.expected}**`}${result.permission.navOffered === null ? '' : result.permission.navOffered === (result.permission.expected === 'open') ? '' : ' **(nav disagrees)**'}`
    : 'n/a';
  lines.push(
    `| \`${result.route}\` | ${cell(wide.axe.length === 0)} | ${cell(narrow.axe.length === 0)} | ${cell(narrow.overflow <= 1)} | ${cell(wide.errors.length + narrow.errors.length === 0)} | ${cell(wide.h1 === 1 && narrow.h1 === 1 && wide.main)} | ${cell(wide.skipLink && narrow.skipLink)} | ${permission} |`,
  );
}
writeFileSync(`${OUT}/route-sweep.md`, `${lines.join('\n')}\n`);
const failures = results.filter((r) => r.widths.some((w) => w.axe.length > 0 || w.overflow > 1 || w.errors.length > 0 || w.h1 !== 1 || !w.main || !w.skipLink) || (r.permission && r.permission.actual !== r.permission.expected));
console.log(`\n${results.length} routes, ${results.filter((r) => !r.path).length} not checked, ${failures.length} with a finding`);
