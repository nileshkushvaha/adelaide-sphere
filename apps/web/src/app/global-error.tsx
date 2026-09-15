'use client';

import { useEffect } from 'react';
import './globals.css';

/**
 * Last-resort boundary: a failure in the root layout itself, where the shell,
 * fonts and providers may never have rendered. It replaces the whole document,
 * so it brings its own `<html>` and depends on nothing but the stylesheet —
 * anything richer could fail for the same reason the layout did.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en-AU" className="h-full">
      <body suppressHydrationWarning className="flex min-h-full flex-col items-center justify-center bg-surface-muted px-6 py-20 text-center font-sans text-text">
        <main role="alert" className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Error 500</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Adelaide Sphere is temporarily unavailable</h1>
          <p className="mt-4 text-base leading-relaxed text-text-muted">
            The site failed to start rendering this page. Please try again in a moment.
            {error.digest ? ` Reference: ${error.digest}` : ''}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => reset()} className="inline-flex min-h-11 items-center rounded-lg bg-sky-700 px-5 font-medium text-white transition-colors hover:bg-sky-800">
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the client router is part of what failed here; a full document load is the recovery. */}
            <a href="/" className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 font-medium transition-colors hover:bg-surface-sunken">
              Go to the home page
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
