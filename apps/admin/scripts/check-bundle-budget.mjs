#!/usr/bin/env node
/**
 * Bundle budget (SRS NFR 005/013). The admin is behind a login, so the budget
 * is generous, but it must not drift silently. Three caps, all uncompressed
 * bytes (roughly a third once gzipped). Run after `pnpm build`.
 *
 * - entry: the main chunk.
 * - firstLoad: every script `index.html` loads plus everything those import
 *   statically — what an administrator downloads before the first screen.
 *   A heavy module pulled into the shell (an editor, a chart library) fails here.
 * - total: every chunk, including screens loaded only when opened. Raised from
 *   2.6 MB to 3.2 MB on 15 Sep 2026 for the page builder, PDF documents, the
 *   activity log and per-menu permissions (SRS 1.13–1.17), when first load was
 *   1.64 MB; it catches unbounded growth, not what a visit costs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const dist = join(root, 'assets');
const BUDGETS = { entry: 1_100_000, firstLoad: 1_800_000, total: 3_200_000 };

let files;
let html;
try {
  files = readdirSync(dist).filter((name) => name.endsWith('.js'));
  html = readFileSync(join(root, 'index.html'), 'utf8');
} catch {
  console.error(`No build output at ${root}. Run "pnpm build" first.`);
  process.exit(1);
}

const size = (name) => statSync(join(dist, name)).size;
const sizes = files.map((name) => ({ name, bytes: size(name) })).sort((a, b) => b.bytes - a.bytes);
const entry = sizes.find((file) => file.name.startsWith('index-'));
const total = sizes.reduce((sum, file) => sum + file.bytes, 0);

// Scripts the page asks for, then their static imports; `import()` is a lazy screen and is not followed.
const STATIC_IMPORT = /(?:^|[;}\n])\s*import\s*(?:[^"'()]*?from\s*)?["']\.\/([^"']+\.js)["']/g;
const firstLoad = new Set();
const queue = [...html.matchAll(/(?:src|href)="[^"]*\/assets\/([^"]+\.js)"/g)].map((match) => match[1]);
while (queue.length > 0) {
  const name = queue.shift();
  if (firstLoad.has(name) || !files.includes(name)) continue;
  firstLoad.add(name);
  for (const match of readFileSync(join(dist, name), 'utf8').matchAll(STATIC_IMPORT)) queue.push(match[1]);
}
const firstLoadBytes = [...firstLoad].reduce((sum, name) => sum + size(name), 0);

const problems = [];
if (!entry) problems.push('no entry chunk (index-*.js) was produced');
else if (entry.bytes > BUDGETS.entry) problems.push(`entry chunk ${entry.name} is ${entry.bytes} bytes, over the ${BUDGETS.entry} budget`);
if (firstLoad.size === 0) problems.push('index.html loads no script from assets/, so first load could not be measured');
else if (firstLoadBytes > BUDGETS.firstLoad) problems.push(`first load is ${firstLoadBytes} bytes across ${firstLoad.size} files, over the ${BUDGETS.firstLoad} budget`);
if (total > BUDGETS.total) problems.push(`total JavaScript is ${total} bytes, over the ${BUDGETS.total} budget`);

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} kB`;
console.log(`Admin bundle: entry ${entry ? kb(entry.bytes) : 'missing'}, first load ${kb(firstLoadBytes)} in ${firstLoad.size} files, total ${kb(total)} across ${sizes.length} chunks`);
if (problems.length > 0) {
  console.error(`Bundle budget exceeded:\n${problems.map((p) => `  - ${p}`).join('\n')}\nSplit a route or move a dependency behind a lazy import.`);
  process.exit(1);
}
