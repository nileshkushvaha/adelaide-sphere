'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { track } from '@/lib/track';

/** A reader's choice to load videos and maps without asking each time; this browser only. */
export const EMBED_CONSENT_KEY = 'as.consent.embeds';
const EMBED_CONSENT_EVENT = 'as:embed-consent-changed';

function readAlways(): boolean {
  try {
    return window.localStorage.getItem(EMBED_CONSENT_KEY) === 'always';
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(EMBED_CONSENT_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EMBED_CONSENT_EVENT, onChange);
  };
}

type Props = { provider: 'youtube'; videoId: string; title: string } | { provider: 'map'; src: string; title: string };

/**
 * A video or map inside an article (SRS 1.10 BLOG 004). Nothing is requested
 * from YouTube or Google until the reader chooses to load it — not even a
 * thumbnail, which would tell Google who is reading — unless they have asked
 * for videos and maps to load every time. The frame's space is reserved, so
 * loading it does not move the page.
 */
export function EmbedPlaceholder(props: Props) {
  const always = useSyncExternalStore(subscribe, readAlways, () => false);
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const requested = useRef(false);
  const show = loaded || always;
  const isVideo = props.provider === 'youtube';
  const src = isVideo ? `https://www.youtube-nocookie.com/embed/${props.videoId}` : props.src;
  const title = props.title || (isVideo ? 'Video' : 'Map');

  // Focus follows the reader's own request into the frame; an automatic load does not steal it.
  useEffect(() => {
    if (loaded && requested.current) frameRef.current?.focus();
  }, [loaded]);

  const rememberAlways = (checked: boolean) => {
    try {
      if (checked) window.localStorage.setItem(EMBED_CONSENT_KEY, 'always');
      else window.localStorage.removeItem(EMBED_CONSENT_KEY);
    } catch {
      // The choice still applies to this page.
    }
    window.dispatchEvent(new Event(EMBED_CONSENT_EVENT));
  };

  return (
    <figure className={`as-embed-frame ${isVideo ? 'as-embed-frame--video' : 'as-embed-frame--map'}`}>
      <div className="as-embed-frame__box">
        {show ? (
          <iframe
            ref={frameRef}
            src={src}
            title={title}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow={isVideo ? 'encrypted-media; picture-in-picture; fullscreen' : 'fullscreen'}
            allowFullScreen
          />
        ) : (
          <div className="as-embed-placeholder" role="group" aria-label={title}>
            <p className="as-embed-placeholder__title">{title}</p>
            <p className="as-embed-placeholder__note">
              {isVideo ? 'Playing this video loads it from YouTube (Google), which may set cookies.' : 'Showing this map loads it from Google, which may set cookies.'}
            </p>
            <button
              type="button"
              className="as-primary-action inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-white"
              onClick={() => {
                requested.current = true;
                setLoaded(true);
                track('embed_load', { provider: props.provider });
              }}
            >
              {isVideo ? 'Play video' : 'Show map'}
            </button>
            <label className="as-embed-placeholder__always">
              <input type="checkbox" onChange={(event) => rememberAlways(event.target.checked)} /> Always load videos and maps on this site
            </label>
          </div>
        )}
      </div>
      <figcaption className="mt-2 text-sm text-text-muted">
        {title}
        {isVideo && (
          <>
            {' · '}
            <a href={`https://www.youtube.com/watch?v=${props.videoId}`} target="_blank" rel="noopener noreferrer" className="as-text-link">
              Watch on YouTube<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </>
        )}
      </figcaption>
    </figure>
  );
}
