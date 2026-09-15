import type { HeroSlide } from '@/components/hero-banner';

/**
 * Licensed Adelaide photography shipped with the site (SRS HERO 001).
 *
 * These are the fallback slides: whenever an administrator configures banner
 * images in site settings, those replace this set entirely. They exist so the
 * homepage is never a flat colour panel while the client's own photography is
 * being commissioned, and they are stored locally (never hot-linked) as
 * pre-cropped 2560×1440 WebP with EXIF stripped.
 *
 * Both are Creative Commons *Attribution-ShareAlike* images: the required credit
 * and licence are rendered with the banner, and the cropped files are shared
 * under the same licence. Sources and licences are
 * recorded in `docs/content/hero-photography.md`.
 */
export const DEFAULT_HERO_SLIDES: HeroSlide[] = [
  {
    url: '/hero/adelaide-river-torrens.webp',
    previewUrl: '/hero/adelaide-river-torrens.webp',
    alt: 'The Adelaide city skyline and Festival Centre reflected in the River Torrens on a clear afternoon',
    caption: 'River Torrens · photo Yu Chu Chin, CC BY-SA 4.0',
    focalX: 0.45,
    focalY: 0.45,
    width: 2560,
    height: 1440,
  },
  {
    url: '/hero/adelaide-oval-footbridge.webp',
    previewUrl: '/hero/adelaide-oval-footbridge.webp',
    alt: 'The Adelaide Oval footbridge lit at night over the River Torrens, with the Oval glowing behind',
    caption: 'Adelaide Oval footbridge · photo Luke Anderson, CC BY-SA 2.0',
    focalX: 0.55,
    focalY: 0.55,
    width: 2560,
    height: 1440,
  },
];

/** Admin-configured banners win; the licensed defaults fill in until then. */
export function heroSlides(configured: HeroSlide[] | undefined): HeroSlide[] {
  return configured && configured.length > 0 ? configured : DEFAULT_HERO_SLIDES;
}
