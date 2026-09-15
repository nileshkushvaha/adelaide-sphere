import { defineConfig } from 'vitest/config';

/** Unit tests only: the worker's database and queue integration is exercised by the API integration suite. */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
