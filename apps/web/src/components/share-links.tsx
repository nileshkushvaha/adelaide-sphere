'use client';

import { useEffect, useRef, useState } from 'react';
import { LinkIcon } from 'lucide-react';
import { shareTargets } from '@/lib/share';
import { track } from '@/lib/track';
import { BrandIcon } from './brand-icon';

/**
 * Share controls (SRS BLOG 004): ordinary share URLs and a copy-link button —
 * no third-party social widgets, so nothing here loads code from another
 * origin. Which network was chosen is counted only with analytics consent
 * (SRS 1.10 BLOG 006).
 *
 * The destinations come from `shareTargets`, which is the one place that decides
 * which networks the product shares to; this component adds none of its own.
 */
export function ShareLinks({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const chip = 'border-border bg-surface-raised text-text-muted hover:border-border-strong hover:bg-sky-50 hover:text-link';
  const muted = 'text-text-muted';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      track('copy_link');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused (an insecure origin, a denied
      // permission). The address is in the address bar either way, so the
      // control simply does not claim to have copied it.
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className={muted}>Share:</span>
      <nav aria-label="Share this article" data-track="share">
        <ul className="flex flex-wrap items-center gap-2">
          {shareTargets(url, title).map((target) => (
            <li key={target.label}>
              <a href={target.href} data-track-method={target.kind} target="_blank" rel="noopener noreferrer nofollow" title={target.label} className={`inline-flex size-11 items-center justify-center rounded-full border transition-colors ${chip}`}>
                <BrandIcon kind={target.kind} size={16} />
                {/* The mark is decorative; the full instruction stays the accessible name. */}
                <span className="sr-only">{target.label}</span>
              </a>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => void copy()} title="Copy link" className={`inline-flex size-11 items-center justify-center rounded-full border transition-colors ${chip}`}>
              <LinkIcon aria-hidden="true" className="size-4" />
              <span className="sr-only">Copy link to this article</span>
            </button>
          </li>
        </ul>
      </nav>
      {/* Announced as well as shown, so the confirmation is not visual only. */}
      <p role="status" aria-live="polite" className={`text-xs ${muted}`}>
        {copied ? 'Link copied' : ''}
      </p>
    </div>
  );
}
