import { defineConfig } from 'vitest/config';

/**
 * Integration tests: the real NestJS app against the real local MySQL test
 * database (`<dev db>_test`). Run explicitly with `pnpm test:integration`
 * after `pnpm infra:up`. Global setup applies migrations and guards the target.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    env: {
      NODE_ENV: 'test',
      DATABASE_ALLOW_PUBLIC_KEY_RETRIEVAL: 'true',
      APP_SECRET_KEY: 'integration-test-secret-key-0123456789abcdefghij',
      SESSION_COOKIE_SECURE: 'false',
      TRUSTED_ORIGINS: 'http://127.0.0.1:4002,http://localhost:4002',
      FIELD_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      MAIL_TRANSPORT: 'none',
    },
    root: './',
    include: ['test/**/*.integration-spec.ts'],
    globalSetup: ['./test/integration/global-setup.ts'],
    setupFiles: ['./test/integration/setup-env.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
