import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTestDatabaseUrl } from './test-database-url.js';

const here = dirname(fileURLToPath(import.meta.url));
const databasePackage = resolve(here, '../../../../packages/database');

/** Applies the version-controlled migrations to the test database once per run. */
export default function globalSetup(): void {
  const url = resolveTestDatabaseUrl();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: databasePackage,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, SHADOW_DATABASE_URL: '' },
  });
}
