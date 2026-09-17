#!/usr/bin/env node
/**
 * Browser/release checks (audit F-09).
 *
 * `pnpm check` deliberately does not do this: it must stay fast and must not
 * require infrastructure, so the browser suite — the only thing that drives the
 * real admin application, the real public build and the axe scan — sat outside
 * every gate and was red for some time without anyone noticing.
 *
 * This runner owns the whole environment so the suite is deterministic:
 *   - refuses to start unless MySQL and Redis answer;
 *   - creates its own database (suffix `_e2e`, which the provisioning helper
 *     requires), migrates it from empty and seeds the minimum public content the
 *     journeys read;
 *   - generates a throwaway administrator password, never a hard-coded one;
 *   - starts an API, an admin preview and a production web server on ports it
 *     picked itself, so a developer's own servers are untouched;
 *   - stops only what it started, and drops its database, on success or failure;
 *   - fails when the suite reports zero tests or only skips.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const artefacts = mkdtempSync(join(tmpdir(), 'as-browser-'));
const started = [];
let databaseCreated = null;
let redisUsed = false;

const log = (line) => process.stdout.write(`[browser] ${line}\n`);
const fail = (line) => {
  process.stderr.write(`[browser] ${line}\n`);
  process.exitCode = 1;
};

/** Reads the developer's API environment without printing any of it. */
function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
}

function start(name, command, args, env) {
  // Detached, so the child leads its own process group. `pnpm --filter … exec`
  // spawns the real server as a grandchild; signalling only the child left the
  // server listening after the run, which is how ports from earlier runs stayed
  // occupied. The group is signalled in stopAll.
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const lines = [];
  child.stdout.on('data', (chunk) => lines.push(String(chunk)));
  child.stderr.on('data', (chunk) => lines.push(String(chunk)));
  started.push({ name, child, lines });
  return child;
}

function stopAll() {
  for (const { name, child } of started) {
    if (child.exitCode === null) {
      try {
        // Negative pid: the whole group, which is what actually holds the port.
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
      log(`stopped ${name}`);
    }
  }
  // A server that ignores SIGTERM must not outlive the run either.
  const deadline = Date.now() + 5_000;
  while (started.some(({ child }) => child.exitCode === null) && Date.now() < deadline) {
    const wait = spawnSync('sleep', ['0.2']);
    if (wait.error) break;
  }
  for (const { name, child } of started) {
    if (child.exitCode === null) {
      try {
        process.kill(-child.pid, 'SIGKILL');
        log(`force-stopped ${name}`);
      } catch {
        // already gone
      }
    }
  }
}

/**
 * The run's Redis database, emptied on the way out. Without this the queue keys,
 * repeat-job entries and cache rows outlive the database they describe, and the
 * next run starts against someone else's leftovers.
 */
function flushRedis(api) {
  if (!redisUsed) return;
  const result = spawnSync('docker', ['exec', 'adelaide-sphere-redis', 'redis-cli', '-n', '9', 'flushdb'], {
    stdio: 'ignore',
    env: { ...process.env, REDISCLI_AUTH: api.redisPassword ?? '' },
  });
  if (result.status === 0) log('flushed the run\'s Redis database');
  redisUsed = false;
}

function dropDatabase(api) {
  if (!databaseCreated) return;
  const result = spawnSync('docker', ['exec', '-e', `MYSQL_PWD=${api.rootPassword}`, 'adelaide-sphere-mysql', 'mysql', '-uroot', '-hlocalhost', '--protocol=socket', '-e', `DROP DATABASE IF EXISTS \`${databaseCreated}\``], { stdio: 'ignore' });
  if (result.status === 0) log(`dropped ${databaseCreated}`);
  databaseCreated = null;
}

async function main() {
  const apiEnv = loadEnvFile(join(root, 'apps/api/.env'));
  const infraEnv = loadEnvFile(join(root, 'infrastructure/.env'));
  if (!apiEnv.DATABASE_URL || !apiEnv.REDIS_URL) throw new Error('apps/api/.env must define DATABASE_URL and REDIS_URL');

  // Required services first: a suite that starts without them fails for a
  // reason that has nothing to do with the product.
  log('checking MySQL and Redis');
  run('docker', ['exec', 'adelaide-sphere-mysql', 'mysqladmin', 'ping', '-h', '127.0.0.1', '--silent'], { stdio: 'ignore' });
  run('docker', ['exec', 'adelaide-sphere-redis', 'redis-cli', 'ping'], { stdio: 'ignore', env: { ...process.env, REDISCLI_AUTH: infraEnv.REDIS_PASSWORD ?? '' } });

  // The suffix has to be last: the provisioning helper refuses any database whose
  // name does not END in _dev, _test or _e2e, which is the guard that stops test
  // administrators being created somewhere real.
  const database = `adelaide_sphere_${randomBytes(3).toString('hex')}_e2e`;
  const databaseUrl = `${apiEnv.DATABASE_URL.slice(0, apiEnv.DATABASE_URL.lastIndexOf('/'))}/${database}`;
  const rootPassword = infraEnv.MYSQL_ROOT_PASSWORD ?? '';
  const appUser = infraEnv.MYSQL_USER ?? '';

  log(`creating ${database}`);
  run('docker', [
    'exec', '-e', `MYSQL_PWD=${rootPassword}`, 'adelaide-sphere-mysql', 'mysql', '-uroot', '-hlocalhost', '--protocol=socket', '-e',
    `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${appUser}'@'%'; FLUSH PRIVILEGES;`,
  ], { stdio: 'ignore' });
  databaseCreated = database;

  run('pnpm', ['--filter', '@adelaide-sphere/database', 'exec', 'prisma', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: databaseUrl } });
  // One published business and one published article, so the discovery and
  // editorial journeys have something real to reach. Without them those five
  // journeys skip themselves, and this runner treats a skip as a failure.
  // Run from the e2e workspace, which is the one that depends on the database
  // package; the repository root deliberately does not.
  // The script lives in the e2e workspace because that is where the database
  // package resolves from; the repository root deliberately does not depend on it.
  run('node', ['e2e/scripts/seed-public-fixtures.mjs'], { env: { ...process.env, DATABASE_URL: databaseUrl } });

  // A password that exists only for this run and is never written to the repo.
  const password = `e2e-${randomBytes(18).toString('base64url')}`;
  const email = 'browser-suite@adelaidesphere.test';
  run('pnpm', ['--filter', 'api', 'admin:bootstrap'], {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: databaseUrl, ADMIN_BOOTSTRAP_EMAIL: email, ADMIN_BOOTSTRAP_DISPLAY_NAME: 'Browser Suite', ADMIN_BOOTSTRAP_PASSWORD: password },
  });

  const [apiPort, adminPort, webPort] = await Promise.all([freePort(), freePort(), freePort()]);
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const adminUrl = `http://127.0.0.1:${adminPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;
  // Redis database 9 keeps this run's queue and cache away from a developer's.
  const redisUrl = `${apiEnv.REDIS_URL.slice(0, apiEnv.REDIS_URL.lastIndexOf('/'))}/9`;
  redisUsed = true;

  log(`api ${apiPort}, admin ${adminPort}, web ${webPort}`);
  start('api', 'node', ['apps/api/dist/main.js'], {
    ...apiEnv,
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    PORT: String(apiPort),
    TRUSTED_ORIGINS: `${adminUrl},${webUrl}`,
  });
  await waitFor(`${apiUrl}/api/v1/health`, 'api');

  start('admin', 'pnpm', ['--filter', 'admin', 'exec', 'vite', 'preview', '--port', String(adminPort), '--strictPort'], { ADMIN_API_PROXY_TARGET: apiUrl });
  await waitFor(`${adminUrl}/admin/`, 'admin');

  start('web', 'pnpm', ['--filter', 'web', 'exec', 'next', 'start', '-p', String(webPort)], { API_ORIGIN: apiUrl });
  await waitFor(webUrl, 'web');

  // Arguments are passed on to Playwright, so one spec or one -g pattern can be
  // run against the same provisioned stack while working on it. With none, the
  // whole suite runs, which is what the gate does.
  const selection = process.argv.slice(2);
  log(selection.length > 0 ? `running the browser suite (${selection.join(' ')})` : 'running the browser suite');
  const result = spawnSync('pnpm', ['--filter', '@adelaide-sphere/e2e', 'exec', 'playwright', 'test', '--reporter=list,json', ...selection], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      E2E_WEB_URL: webUrl,
      E2E_API_URL: apiUrl,
      E2E_ADMIN_URL: `${adminUrl}/admin`,
      E2E_ADMIN_EMAIL: email,
      E2E_ADMIN_PASSWORD: password,
      E2E_DATABASE_URL: databaseUrl,
      PLAYWRIGHT_JSON_OUTPUT_NAME: join(artefacts, 'results.json'),
    },
  });
  process.stdout.write(String(result.stdout ?? ''));

  // An unexplained skip is a failure: a suite that quietly skips everything
  // looks exactly like a suite that passed.
  const summary = existsSync(join(artefacts, 'results.json')) ? JSON.parse(readFileSync(join(artefacts, 'results.json'), 'utf8')) : null;
  const stats = summary?.stats ?? {};
  log(`expected=${stats.expected ?? '?'} unexpected=${stats.unexpected ?? '?'} skipped=${stats.skipped ?? '?'} flaky=${stats.flaky ?? '?'}`);
  if (result.status !== 0) throw new Error('the browser suite reported failures');
  if ((stats.expected ?? 0) === 0) throw new Error('the browser suite ran no tests');
  if ((stats.skipped ?? 0) > 0) throw new Error(`${stats.skipped} test(s) skipped; a skip must be explained, not silent`);
  log(`artefacts in ${artefacts}`);
}

const infraForCleanup = loadEnvFile(join(root, 'infrastructure/.env'));
const apiEnvForCleanup = { rootPassword: infraForCleanup.MYSQL_ROOT_PASSWORD ?? '', redisPassword: infraForCleanup.REDIS_PASSWORD ?? '' };
try {
  await main();
  log('passed');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
  for (const { name, lines } of started) {
    if (lines.length > 0) process.stderr.write(`[browser] --- ${name} (last output) ---\n${lines.slice(-12).join('')}\n`);
  }
} finally {
  stopAll();
  dropDatabase(apiEnvForCleanup);
  flushRedis(apiEnvForCleanup);
}
