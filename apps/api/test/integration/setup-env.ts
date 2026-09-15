import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { resolveTestDatabaseUrl } from './test-database-url.js';

// Runs in each test worker before the app modules are imported.
process.env.DATABASE_URL = resolveTestDatabaseUrl();

// Redis for throttling: REDIS_URL_TEST, else the developer's apps/api/.env
// REDIS_URL switched to logical database 1 so tests never touch dev keys.
if (!process.env.REDIS_URL) {
  let url = process.env.REDIS_URL_TEST;
  if (!url) {
    const apiEnv = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
    if (existsSync(apiEnv)) {
      const base = parseEnv(readFileSync(apiEnv, 'utf8')).REDIS_URL;
      if (base) {
        const parsed = new URL(base);
        parsed.pathname = '/1';
        url = parsed.toString();
      }
    }
  }
  if (!url) throw new Error('Integration tests need REDIS_URL_TEST or a REDIS_URL in apps/api/.env');
  process.env.REDIS_URL = url;
}
