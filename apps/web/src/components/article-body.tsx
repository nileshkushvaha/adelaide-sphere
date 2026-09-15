import Link from 'next/link';
import { isMapEmbedSrc, isRecordId, isYoutubeId } from '@adelaide-sphere/domain/embeds';
import type { PostDetail } from '@/lib/api';
import { EmbedPlaceholder } from './embed-placeholder';

export type BodySegment =
  | { kind: 'html'; html: string }
  | { kind: 'youtube'; id: string; title: string }
  | { kind: 'map'; src: string; title: string }
  | { kind: 'business'; businessId: string; title: string };

const MARKER = /<div\b([^>]*\bdata-embed="(?:youtube|map|business)"[^>]*)>[\s\S]*?<\/div>/g;

const decode = (value: string) => value.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes);
  return match ? decode(match[1]!) : null;
}

/**
 * Splits a sanitised article body into ordinary HTML and the embed markers the
 * API stored (SRS 1.10 BLOG 004). The API already validated every marker; the
 * shapes are checked again here, with the same rules (`@adelaide-sphere/domain/embeds`), so a marker that is not exactly right is shown
 * as nothing rather than as a frame.
 */
export function splitArticleBody(html: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let last = 0;
  for (const match of html.matchAll(MARKER)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ kind: 'html', html: html.slice(last, index) });
    last = index + match[0].length;
    const attributes = match[1]!;
    const provider = attribute(attributes, 'data-embed');
    const title = attribute(attributes, 'data-embed-title') ?? '';
    const id = attribute(attributes, 'data-embed-id');
    const src = attribute(attributes, 'data-embed-src');
    const businessId = attribute(attributes, 'data-business-id');
    if (provider === 'youtube' && isYoutubeId(id)) segments.push({ kind: 'youtube', id, title });
    else if (provider === 'map' && isMapEmbedSrc(src)) segments.push({ kind: 'map', src, title });
    else if (provider === 'business' && isRecordId(businessId)) segments.push({ kind: 'business', businessId, title });
  }
  if (last < html.length) segments.push({ kind: 'html', html: html.slice(last) });
  return segments.filter((segment) => segment.kind !== 'html' || segment.html.trim() !== '');
}

/**
 * An article's body (SRS BLOG 004): the sanitised HTML, with videos and maps
 * shown as click-to-load placeholders and businesses as cards. A card for a
 * business that is no longer published is simply left out.
 */
export function ArticleBody({ post, body = post.body }: { post: PostDetail; body?: string }) {
  const businesses = new Map((post.businesses ?? []).map((business) => [business.id, business]));
  return (
    <div className="ms-prose ms-prose-article">
      {splitArticleBody(body).map((segment, index) => {
        switch (segment.kind) {
          case 'html':
            // Sanitised by the API with an allowlist before it was stored (SRS SEC 001).
            return <div key={index} className="ms-prose-html" dangerouslySetInnerHTML={{ __html: segment.html }} />;
          case 'youtube':
            return <EmbedPlaceholder key={index} provider="youtube" videoId={segment.id} title={segment.title} />;
          case 'map':
            return <EmbedPlaceholder key={index} provider="map" src={segment.src} title={segment.title} />;
          case 'business': {
            const business = businesses.get(segment.businessId);
            if (!business) return null;
            return (
              <aside key={index} aria-label={`Business: ${business.name}`} data-track="business_card_click" className="ms-business-embed not-prose rounded-card border border-border bg-surface-raised p-5 shadow-sm">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-sky-700">Business in this article</p>
                <p className="font-display mt-2 text-xl tracking-tight">{business.name}</p>
                {(business.categoryName || business.areaName) && <p className="mt-1 text-sm text-text-muted">{[business.categoryName, business.areaName].filter(Boolean).join(' · ')}</p>}
                <Link href={`/business/${business.slug}`} className="ms-text-link mt-3 inline-flex min-h-11 items-center text-sm">
                  View the listing
                </Link>
              </aside>
            );
          }
        }
      })}
    </div>
  );
}
