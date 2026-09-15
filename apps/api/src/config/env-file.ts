import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

/**
 * Absolute path of apps/api/.env, resolved from this module's location rather
 * than process.cwd(), so behaviour is identical whether the API is launched from
 * the repository root (`pnpm dev:api`), from apps/api, or from dist/ in production.
 * Both src/config and dist/config are two directories below apps/api.
 */
export const API_ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
