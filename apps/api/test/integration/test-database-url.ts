import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const databaseEnvFile = resolve(here, '../../../../packages/database/.env');

/**
 * Resolves the URL of the dedicated test database. Order:
 *  1. DATABASE_URL_TEST from the environment (CI);
 *  2. DATABASE_URL from the environment, else from packages/database/.env,
 *     with its database name switched from "<name>_dev" to "<name>_test".
 * The result MUST end in "_test"; anything else is refused so tests can never
 * truncate a development or production database.
 */
export function resolveTestDatabaseUrl(): string {
  let url = process.env.DATABASE_URL_TEST;
  if (!url) {
    let base = process.env.DATABASE_URL;
    if (!base && existsSync(databaseEnvFile)) {
      process.loadEnvFile(databaseEnvFile);
      base = process.env.DATABASE_URL;
    }
    if (!base) throw new Error('Integration tests need DATABASE_URL_TEST or DATABASE_URL (see packages/database/.env.example)');
    const parsed = new URL(base);
    parsed.pathname = parsed.pathname.replace(/_dev$/, '_test');
    url = parsed.toString();
  }
  const name = new URL(url).pathname.replace(/^\/+/, '');
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run integration tests against database "${name}": the name must end with _test`);
  }
  return url;
}
