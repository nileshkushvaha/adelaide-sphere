import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    // Explicit so the .env file is never read during tests, regardless of runner defaults.
    // Port 1 never listens: readiness must report 503 quickly; no real database in unit/e2e runs.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://test:test@127.0.0.1:1/melbourne_sphere_test',
      REDIS_URL: 'redis://127.0.0.1:1/0',
      APP_SECRET_KEY: 'test-secret-key-for-unit-and-e2e-tests-only-0123456789',
      SESSION_COOKIE_SECURE: 'false',
      TRUSTED_ORIGINS: 'http://127.0.0.1:4002,http://localhost:4002',
      FIELD_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    },
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
