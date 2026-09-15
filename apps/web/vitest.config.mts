import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests for pure helpers (URL state, formatting, structured data) run in
 * Node; client components (`*.test.tsx`) run in jsdom so their markup and
 * accessibility can be checked. Server components are verified by the Next.js
 * build and at runtime.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    // Component tests opt into jsdom with a `@vitest-environment` docblock.
    alias: {
      // `server-only` is provided by the Next.js runtime; under Vitest it just
      // needs to resolve, since these tests already run server-side.
      'server-only': resolve(process.cwd(), 'src/test/server-only-stub.ts'),
      '@': resolve(process.cwd(), 'src'),
    },
  },
});
