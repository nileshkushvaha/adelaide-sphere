import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/** Production/public base path (SRS ARC 004: one origin, admin under /admin). */
export const ADMIN_BASE = '/admin/';
export const DEFAULT_API_PROXY_TARGET = 'http://127.0.0.1:4001';

/**
 * Validates the server-side development proxy target. It is read from
 * apps/admin/.env (or the shell) by this config only and never reaches the
 * browser bundle; the browser always calls relative /api/v1 URLs.
 */
export function resolveApiProxyTarget(raw: string | undefined): string {
  const value = (raw ?? DEFAULT_API_PROXY_TARGET).trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+$/.test(value)) {
    throw new Error(
      'ADMIN_API_PROXY_TARGET must be an http(s) origin without a path, e.g. http://127.0.0.1:4001',
    );
  }
  return value;
}

/**
 * Answers the bare base path (`/admin`) with a 301 to `/admin/`, as the
 * production edge already does (nginx redirects a prefix location's slash-less
 * form). The router writes `/admin` for the dashboard, so without this a reload
 * there showed Vite's "did you mean /admin/?" page instead of the admin.
 */
export function redirectBareBase(base = ADMIN_BASE): Plugin {
  const bare = base.replace(/\/+$/, '');
  const redirect: Connect.NextHandleFunction = (req, res, next) => {
    const [path, query] = (req.url ?? '').split('?', 2);
    if (path !== bare) return next();
    res.statusCode = 301;
    res.setHeader('Location', query ? `${base}?${query}` : base);
    res.end();
  };
  return {
    name: 'ms-redirect-bare-base',
    configureServer: (server) => void server.middlewares.use(redirect),
    configurePreviewServer: (server) => void server.middlewares.use(redirect),
  };
}

export default defineConfig(({ mode }) => {
  // Third argument '' loads all variables (not only VITE_*) for server-side use.
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '');
  const apiProxyTarget = resolveApiProxyTarget(env.ADMIN_API_PROXY_TARGET);

  return {
    base: ADMIN_BASE,
    plugins: [react(), redirectBareBase()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      host: '127.0.0.1',
      port: 4002,
      strictPort: true,
      proxy: {
        // Same-origin API access in development; the reverse proxy does this in production.
        '/api/v1': { target: apiProxyTarget, changeOrigin: false },
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 4002,
      strictPort: true,
      proxy: {
        '/api/v1': { target: apiProxyTarget, changeOrigin: false },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      // Keep vendor code in a stable chunk; product modules will add their own later.
      rolldownOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  };
});
