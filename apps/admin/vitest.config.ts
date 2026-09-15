import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // One React/React Router instance for app code and Refine's router bindings.
    dedupe: ['react', 'react-dom', 'react-router', '@tanstack/react-query'],
  },
  test: {
    server: {
      // Process Refine packages through Vite so they share the deduped modules above
      // instead of loading a second (CJS) copy of react-router via Node.
      deps: { inline: [/@refinedev\//] },
    },
    globals: true,
    environment: 'jsdom',
    // Ant Design tables with expandable rows plus modal dialogs are genuinely slow
    // to render in jsdom (~7 s per interaction-heavy spec), and the suite runs its
    // files in parallel. 30 s keeps those specs stable without masking failures.
    testTimeout: 30_000,
    // Ant Design in jsdom is CPU-bound, and one worker per core starves the
    // others: interaction-heavy specs then miss their own async windows and
    // fail in a full run while passing alone. Capping the pool trades a little
    // wall-clock for a suite whose result does not depend on the machine.
    maxWorkers: 4,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    env: { NODE_ENV: 'test' },
  },
});
