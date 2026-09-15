import { defineConfig } from 'vitest/config';

/** Integration tests need a real MySQL; run explicitly with `pnpm test:integration`. */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.integration.spec.ts'],
    env: { NODE_ENV: 'test' },
    testTimeout: 20_000,
    fileParallelism: false,
  },
});
