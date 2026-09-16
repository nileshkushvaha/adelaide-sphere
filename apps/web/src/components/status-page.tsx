import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@adelaide-sphere/ui';

interface Props {
  /** The HTTP status this page stands for, shown as the eyebrow so the reason is never guessed. */
  status: '404' | '410' | '500' | '503';
  title: string;
  description: string;
  /** A support reference (Next's error digest, or the API's request id) when one exists. */
  reference?: string | null;
  /** Extra actions — a retry, for example — placed before the standard destinations. */
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * The one treatment for a page that could not be shown: 404, 410 and the error
 * boundaries. A dark title band above a light body, so a failure still looks
 * like this publication rather than a framework default, and every route out is
 * a real published destination (SRS UX 002, NFR 012: the interface says what
 * happened; it never presents a failure as an empty result).
 */
export function StatusPage({ status, title, description, reference, actions, children }: Props) {
  return (
    <div role={status === '500' || status === '503' ? 'alert' : undefined}>
      <section className="as-on-dark as-section bg-band-deep text-band-text">
        <div className="as-container-tight">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">Error {status}</p>
          <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-band-muted sm:text-lg">{description}</p>
          {reference && (
            // Printed so a visitor can quote it; it identifies the failure in the
            // logs and carries nothing about the request itself.
            <p className="mt-4 text-sm text-band-muted">
              Reference: <code className="rounded bg-white/10 px-1.5 py-0.5">{reference}</code>
            </p>
          )}
        </div>
      </section>
      <section className="as-section bg-surface-muted">
        <div className="as-container-tight">
          <div className="flex flex-wrap gap-3">
            {actions}
            <Button asChild>
              <Link href="/business">Browse businesses</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/blog">Read the blog</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/">Home</Link>
            </Button>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}
