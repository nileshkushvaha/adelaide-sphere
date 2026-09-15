import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma CLI configuration (Prisma 7 model: URLs live here, not in the schema).
 *
 * Environment loading is deterministic and independent of the working
 * directory: if DATABASE_URL is not already set in the process environment,
 * packages/database/.env (next to this file, git-ignored) is loaded with
 * Node's built-in loader. Real environment variables always take precedence,
 * which is what CI and deployment jobs rely on.
 */
const here = dirname(fileURLToPath(import.meta.url));
const localEnvFile = resolve(here, '.env');
if (!process.env.DATABASE_URL && existsSync(localEnvFile)) {
  process.loadEnvFile(localEnvFile);
}

export default defineConfig({
  schema: resolve(here, 'prisma/schema.prisma'),
  migrations: {
    path: resolve(here, 'prisma/migrations'),
  },
  datasource: {
    url: env('DATABASE_URL'),
    // Only needed by `prisma migrate dev` (creates/drops a scratch schema). The
    // application user has no CREATE DATABASE right, so a dedicated shadow
    // database is provisioned by infrastructure/mysql-init. Optional: unset in
    // CI/deploy where only `migrate deploy` / `migrate status` run.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: env('SHADOW_DATABASE_URL') }
      : {}),
  },
});
