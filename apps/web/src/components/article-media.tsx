'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { PostCard } from '@/lib/api';
import { editorialGradient } from '@/lib/category-visuals';
import { BrandMark } from './brand-mark';

/** Published renditions of a cover, smallest first; empty when there is none. */
type Renditions = PostCard['cover'];

/**
 * Reserved shape of an article picture. Editorial covers are re-encoded at
 * their source aspect ratio (`packages/domain/src/media.ts`), so the frame
 * decides the shape and `object-fit` does the rest — which is what keeps a grid
 * of covers even and stops a portrait photograph from making one card twice as
 * tall as its neighbours.
 */
export type MediaRatio = '16/9' | '3/2' | '4/3';

const RATIOS: Record<MediaRatio, string> = {
  '16/9': 'aspect-[16/9]',
  '3/2': 'aspect-[3/2]',
  '4/3': 'aspect-[4/3]',
};

/**
 * Picks the rendition to request. `card` is 800px wide and `hero` 1600px, so
 * asking for the wrong one either sends a megabyte to a thumbnail or upscales an
 * 800px file across a desktop hero. Falls back to the nearest processed size
 * rather than nothing, because a cover that only part-processed is still better
 * than the fallback panel.
 */
function rendition(cover: Renditions, prefer: 'card' | 'hero') {
  return cover.find((variant) => variant.kind === prefer) ?? (prefer === 'hero' ? cover.at(-1) : cover[0]) ?? null;
}

interface FallbackProps {
  /** Chooses the gradient, so one category always looks the same. */
  categorySlug: string;
  /** `sm` shrinks the mark, for a frame shorter than about 200px. */
  size?: 'sm' | 'md';
}

/**
 * The panel an article gets when it legitimately has no cover, or when the one
 * it has cannot be loaded. Deliberately a brand graphic and never a photograph:
 * the Adelaide Sphere mark on a navy-to-blue gradient chosen from the category
 * slug, so nothing here can be mistaken for a picture of Adelaide.
 *
 * It carries no words. The category and the headline are both stated beside it —
 * printing the category here as well gave a card without a cover the same term
 * twice, which is the repetition this redesign set out to remove. It is
 * `aria-hidden` for the same reason: there is nothing in it a reader is missing.
 */
export function ArticleMediaFallback({ categorySlug, size = 'md' }: FallbackProps) {
  return (
    <div aria-hidden="true" className="grid size-full place-items-center px-4" style={{ background: editorialGradient(categorySlug) }}>
      <BrandMark className={size === 'sm' ? 'size-8 opacity-85' : 'size-12 opacity-85'} />
    </div>
  );
}

interface Props {
  cover: Renditions;
  /** The editor's alternative text. Empty or missing means the picture is treated as decorative. */
  coverAlt: string | null;
  /** Chooses the fallback gradient when there is no usable cover. */
  categorySlug: string;
  ratio: MediaRatio;
  /** `sizes` for the layout this picture sits in; wrong values are what makes a card download a hero. */
  sizes: string;
  prefer?: 'card' | 'hero';
  /** Only for the one picture that is genuinely the largest thing above the fold. */
  priority?: boolean;
  /** Subtle zoom on hover of the surrounding card. Ignored by `prefers-reduced-motion`. */
  zoom?: boolean;
  className?: string;
}

/**
 * An article's picture, with the space it will occupy reserved before it loads
 * and one honest fallback for both of the ways it can be absent.
 *
 * A cover only reaches the public API once the worker has processed it
 * (`renditions()` in `apps/api/src/blog/blog-public.service.ts` publishes
 * nothing for an asset that is not `ready`), so "no renditions" is the ordinary
 * case for a just-uploaded image as well as for an article that never had one.
 * A rendition that 404s — a stale object key, a bucket that is not public — used
 * to leave the frame's navy background showing with nothing on it, which looked
 * identical to having no cover and gave nobody a way to tell the two apart.
 * Now the failure swaps in the same public fallback *and* records the URL in
 * the browser console, so a broken media origin is diagnosable without ever
 * showing a reader an error or a broken-image glyph.
 */
export function ArticleMedia({ cover, coverAlt, categorySlug, ratio, sizes, prefer = 'card', priority = false, zoom = false, className = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const chosen = failed ? null : rendition(cover, prefer);

  return (
    <div className={`relative overflow-hidden bg-navy-900 ${RATIOS[ratio]} ${className}`}>
      {chosen ? (
        <Image
          src={chosen.url}
          alt={coverAlt ?? ''}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          className={`object-cover${zoom ? ' transition-transform duration-500 motion-reduce:transition-none group-hover:scale-[1.03]' : ''}`}
          onError={() => {
            // Public readers get the fallback; whoever is looking at the
            // console gets the address that failed.
            console.warn(`[article-media] cover rendition failed to load: ${chosen.url}`);
            setFailed(true);
          }}
        />
      ) : (
        <ArticleMediaFallback categorySlug={categorySlug} size={ratio === '4/3' ? 'sm' : 'md'} />
      )}
    </div>
  );
}
