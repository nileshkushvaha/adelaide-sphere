'use client';

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { CheckIcon } from 'lucide-react';

interface TurnstileRenderOptions {
  sitekey: string;
  action: string;
  size: 'flexible' | 'compact';
  'response-field': boolean;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'timeout-callback': () => void;
  'error-callback': () => boolean;
}

interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileWidgetHandle {
  /** Discards the current token and issues a new challenge. Tokens are single use, so call it after every attempt that reached the API. */
  reset(): void;
}

type Status = 'loading' | 'ready' | 'verified' | 'expired' | 'error' | 'unavailable';

/** The layout loads the Cloudflare script lazily (SRS SEC 002); this is how long a form waits for it. */
const SCRIPT_WAIT_MS = 15_000;
const SCRIPT_POLL_MS = 200;
/** Turnstile's flexible size needs 300 px; a narrower column gets the compact widget instead of overflowing. */
const FLEXIBLE_MIN_WIDTH = 300;

const STATUS_TEXT: Record<Status, string> = {
  loading: 'Loading the security check…',
  ready: '',
  verified: 'Security check complete.',
  expired: 'The security check expired. It refreshes on its own; if it doesn’t, retry it.',
  error: 'The security check couldn’t be completed.',
  unavailable: 'The security check couldn’t load. Check your connection or any content blocker, then reload the page.',
};

interface Props {
  siteKey: string;
  /** Checked by the API against the route's own action (SRS SEC 002). */
  action: string;
  /** Receives the token, or `null` whenever there is no usable token. */
  onToken: (token: string | null) => void;
  /** Id of the field-error message, when the form has one to show. */
  errorId?: string;
  ref?: Ref<TurnstileWidgetHandle>;
}

/**
 * Cloudflare Turnstile rendered explicitly, so the form knows what the widget
 * is doing: loading, verified, expired, failed or never loaded. The implicit
 * `.cf-turnstile` markup gave the form no signal at all — a failed or expired
 * challenge only surfaced as a rejected submission, and a single-use token was
 * sent again on retry. Verification itself stays on the server.
 */
export function TurnstileWidget({ siteKey, action, onToken, errorId, ref }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const mount = () => {
      const element = container.current;
      if (cancelled || !element) return;
      const api = window.turnstile;
      if (!api) {
        if (Date.now() - startedAt >= SCRIPT_WAIT_MS) setStatus('unavailable');
        else timer = setTimeout(mount, SCRIPT_POLL_MS);
        return;
      }
      setStatus('ready');
      widgetId.current =
        api.render(element, {
          sitekey: siteKey,
          action,
          size: element.clientWidth > 0 && element.clientWidth < FLEXIBLE_MIN_WIDTH ? 'compact' : 'flexible',
          // The token is passed to the form directly; no hidden input to read back.
          'response-field': false,
          callback: (token) => {
            setStatus('verified');
            onTokenRef.current(token);
          },
          'expired-callback': () => {
            setStatus('expired');
            onTokenRef.current(null);
          },
          'timeout-callback': () => {
            setStatus('expired');
            onTokenRef.current(null);
          },
          'error-callback': () => {
            setStatus('error');
            onTokenRef.current(null);
            // Handled: the status line explains it and offers a retry.
            return true;
          },
        }) ?? null;
    };

    timer = setTimeout(mount, 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action]);

  const reset = () => {
    onTokenRef.current(null);
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      setStatus('ready');
    }
  };

  useImperativeHandle(ref, () => ({ reset }));

  const text = STATUS_TEXT[status];
  return (
    <div role="group" aria-label="Security check" aria-describedby={errorId}>
      {/* Reserves the widget's height so the button below does not jump when it appears. */}
      <div ref={container} className="min-h-[65px] w-full max-w-full overflow-hidden" />
      <div aria-live="polite" className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
        {text && (
          <p className="flex items-center gap-1.5">
            {status === 'verified' && <CheckIcon aria-hidden="true" className="size-4 text-success" />}
            {text}
          </p>
        )}
        {(status === 'expired' || status === 'error') && (
          <button type="button" onClick={reset} className="min-h-9 font-medium text-link underline underline-offset-2 hover:no-underline">
            Retry the security check
          </button>
        )}
        {status === 'unavailable' && (
          <button type="button" onClick={() => window.location.reload()} className="min-h-9 font-medium text-link underline underline-offset-2 hover:no-underline">
            Reload the page
          </button>
        )}
      </div>
    </div>
  );
}
