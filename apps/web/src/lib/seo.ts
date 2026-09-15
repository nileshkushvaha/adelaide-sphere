import 'server-only';

import type { Metadata } from 'next';
import { fetchSiteSettings } from './api';
import { siteNoindex } from './site';

/**
 * One way to describe a public page for search and sharing (SRS SEO 001).
 *
 * Every indexable route builds its metadata here, so each carries the same
 * complete set: a title, a description trimmed to what search results show,
 * keywords, a canonical URL, Open Graph (with the site name and locale — a page
 * that sets `openGraph` replaces the root layout's object rather than merging
 * with it) and the matching X card.
 *
 * The share image is chosen in one order everywhere: the page's own picture,
 * then the default share image an administrator set in general settings
 * (CFG 001), then a card generated for this page by `/og/[kind]/[key]`, so a
 * shared link always has an image in a format every platform accepts.
 */

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
/** Search results show roughly 155–160 characters of a description. */
export const DESCRIPTION_LIMIT = 160;
const KEYWORD_LIMIT = 12;

export type OgTarget =
  | { kind: 'route'; key: string }
  | { kind: 'business' | 'post' | 'business-category' | 'area' | 'blog-category' | 'tag' | 'page'; key: string };

export interface ShareImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string | null;
}

export interface PageSeo {
  /** A string takes the site's title template; `{ absolute }` is used as written (the home page). */
  title: string | { absolute: string };
  description?: string | null;
  /** The page's own address, used for the canonical URL and `og:url` unless `canonical` is given. */
  path: string;
  canonical?: string;
  keywords?: readonly (string | null | undefined)[];
  image?: ShareImage | null;
  /** Which generated card to use when neither the page nor the settings supply an image. */
  og: OgTarget;
  robots?: Metadata['robots'];
  article?: { publishedTime?: string; modifiedTime?: string; authors?: string[]; section?: string; tags?: string[] };
}

/** Plain text of at most `limit` characters, cut at a word boundary. */
export function summarise(text: string | null | undefined, limit: number = DESCRIPTION_LIMIT): string {
  const plain = (text ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= limit) return plain;
  const cut = plain.slice(0, limit - 1);
  const boundary = cut.lastIndexOf(' ');
  return `${(boundary > limit * 0.6 ? cut.slice(0, boundary) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

/** Trimmed, de-duplicated (case-insensitively) and capped, in the order given. */
export function keywordList(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values.flatMap((entry) => (entry ?? '').split(','))) {
    const word = value.trim().replace(/\s+/g, ' ');
    if (!word || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    out.push(word);
    if (out.length === KEYWORD_LIMIT) break;
  }
  return out;
}

export function ogImagePath(target: OgTarget): string {
  return `/og/${target.kind}/${encodeURIComponent(target.key)}`;
}

export async function pageMetadata(input: PageSeo): Promise<Metadata> {
  const settings = await fetchSiteSettings();
  const titleText = typeof input.title === 'string' ? input.title : input.title.absolute;
  const description = summarise(input.description ?? settings.metaDescription) || undefined;
  const keywords = keywordList(input.keywords ?? []);
  const url = input.canonical ?? input.path;
  const fallback = settings.branding.shareImage;
  const image: ShareImage = input.image ?? (fallback ? { ...fallback } : { url: ogImagePath(input.og), ...OG_IMAGE_SIZE });
  const images = [{ url: image.url, ...(image.width && image.height ? { width: image.width, height: image.height } : {}), alt: summarise(image.alt || titleText, 125) }];
  const common = { url, siteName: settings.name, locale: 'en_AU', title: titleText, description, images };

  return {
    title: input.title,
    description,
    ...(keywords.length > 0 ? { keywords } : {}),
    // Every page points feed readers at the blog feed (SRS 1.10 BLOG 005).
    alternates: { canonical: url, types: { 'application/rss+xml': [{ url: '/blog/feed.xml', title: `${settings.name} blog` }] } },
    // A staging copy is never indexable, whatever a page asks for.
    ...(siteNoindex() ? { robots: { index: false, follow: false } } : input.robots ? { robots: input.robots } : {}),
    openGraph: input.article
      ? { ...common, type: 'article', ...input.article }
      : { ...common, type: 'website' },
    twitter: {
      card: settings.seo?.twitterCard === 'summary' ? 'summary' : 'summary_large_image',
      title: titleText,
      description,
      images: images.map(({ url: imageUrl, alt }) => ({ url: imageUrl, alt })),
    },
  };
}
