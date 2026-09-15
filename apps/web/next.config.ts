import type { NextConfig } from "next";

/**
 * Server-only origin of the NestJS API. Read once when the Next.js server
 * starts (`next dev`, `next build`, `next start`), from the shell environment or
 * apps/web/.env* files. It is intentionally NOT a NEXT_PUBLIC_ variable: the
 * browser never sees it and only ever calls relative /api/v1 paths.
 */
const apiOrigin = (process.env.API_ORIGIN ?? "http://127.0.0.1:4001").replace(/\/+$/, "");

if (!/^https?:\/\/[^/\s]+$/.test(apiOrigin)) {
  throw new Error(
    "API_ORIGIN must be an http(s) origin without a path, e.g. http://127.0.0.1:4001",
  );
}

/**
 * Published media lives in object storage (or a CDN in production). Only that
 * origin is allowed as a remote image source, so the optimiser can never be
 * pointed at an arbitrary host.
 */
const mediaBaseUrl = (process.env.MEDIA_PUBLIC_BASE_URL ?? "").trim();

if (!mediaBaseUrl) {
  // Not fatal — a site with no media configured still builds — but it must not
  // be silent. Unset, `next/image` refuses every uploaded image, and a page
  // that shows one fails to render at all: the home page, the blog and every
  // business listing answered 500 with nothing in the log to explain why.
  console.warn(
    "[next.config] MEDIA_PUBLIC_BASE_URL is not set, so no uploaded image may be displayed.\n" +
      "              Set it to the published media origin, e.g. http://127.0.0.1:9020/adelaide-sphere-media",
  );
}

/**
 * Next 16 refuses to fetch a remote image whose hostname resolves to a private
 * or loopback address, because on a deployed server that is how an attacker
 * reaches internal services (SSRF). In local development the object store *is*
 * on loopback — MinIO on 127.0.0.1 — so every uploaded image is refused and the
 * page fails to render.
 *
 * The exception is therefore granted only when the configured media origin is
 * itself a loopback host. Production media lives on a real storage or CDN
 * hostname, so this stays false there and the protection remains in force; it
 * cannot be switched on by accident, because it is derived from the same
 * setting that decides where images come from.
 */
const LOOPBACK_HOST = /^(localhost|127(\.\d+){3}|\[::1\]|::1)$/i;
const mediaIsLoopback = mediaBaseUrl !== "" && LOOPBACK_HOST.test(new URL(mediaBaseUrl).hostname);

const remotePatterns = mediaBaseUrl
  ? [
      (() => {
        const url = new URL(mediaBaseUrl);
        return { protocol: url.protocol.replace(":", "") as "http" | "https", hostname: url.hostname, port: url.port, pathname: `${url.pathname.replace(/\/+$/, "")}/**` };
      })(),
    ]
  : [];

const nextConfig: NextConfig = {
  /**
   * Development only. Next blocks requests to its dev resources whose Origin is
   * a host it does not recognise as its own, which is what stops a page on
   * another site from reaching your dev server. It knows itself as `localhost`,
   * so opening the site at `http://127.0.0.1:4000` — the same machine, by its
   * IP — made every Hot Module Replacement socket fail: the page loaded, but no
   * edit ever reached the browser.
   *
   * These are the loopback names for this machine and nothing else. The setting
   * has no effect on `next build` or `next start`.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost", "[::1]"],
  experimental: {
    // Next 16 otherwise answers a 404 with a bare error document whose content
    // lives only in the flight payload, so the page renders blank. This routes
    // unmatched URLs to app/global-not-found.tsx, which is real server-rendered
    // HTML with the site shell.
    globalNotFound: true,
  },
  images: { remotePatterns, dangerouslyAllowLocalIP: mediaIsLoopback },
  // Source-only workspace package (SRS ARC 001 table: packages/ui).
  transpilePackages: ["@adelaide-sphere/ui"],
  async rewrites() {
    return [
      {
        // Same-origin API access (SRS ARC 004): the browser requests /api/v1/*
        // on this host and Next.js forwards it, path intact, to NestJS.
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
