import { ImageResponse } from 'next/og';
import { SEO_ROUTES } from '@adelaide-sphere/domain';
import { fetchAreas, fetchBlogTerms, fetchBusiness, fetchCategories, fetchPost, fetchSiteSettings, fetchStaticPage, flattenCategories, type SiteSettings } from '@/lib/api';
import { OG_IMAGE_SIZE, summarise } from '@/lib/seo';
import { SITE_TAGLINE, siteOrigin } from '@/lib/site';

/**
 * Generated share cards (SRS SEO 001) for pages with no picture of their own
 * and no default share image configured.
 *
 * The request names a kind and a slug, never text: the title is looked up
 * from the published record, so this route cannot be used to put arbitrary
 * words into an image on the site's domain, and an unknown or unpublished
 * record answers 404 exactly like its page. Images are cached publicly and
 * kept out of the index.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

interface Card {
  kicker: string;
  title: string;
  subtitle?: string | null;
}

async function resolve(kind: string, key: string, settings: SiteSettings): Promise<Card | null> {
  switch (kind) {
    case 'route': {
      const route = SEO_ROUTES.find((entry) => entry.key === key);
      if (!route) return null;
      const titles: Record<string, string> = {
        home: settings.tagline ?? SITE_TAGLINE,
        directory: 'Businesses across Adelaide',
        blog: 'Guides and local stories',
        faqs: 'Frequently asked questions',
        about: `About ${settings.name}`,
        contact: `Contact ${settings.name}`,
      };
      return { kicker: settings.name, title: titles[route.key] ?? route.label, subtitle: route.key === 'home' ? settings.metaDescription : null };
    }
    case 'business': {
      const business = await fetchBusiness(key);
      return business ? { kicker: `${business.primaryCategory.name} · ${business.localArea.name}`, title: business.name, subtitle: business.description } : null;
    }
    case 'post': {
      const post = await fetchPost(key);
      return post ? { kicker: post.category.name, title: post.title, subtitle: post.excerpt } : null;
    }
    case 'business-category': {
      const category = flattenCategories(await fetchCategories()).find((entry) => entry.slug === key);
      return category ? { kicker: 'Businesses in Adelaide', title: category.name, subtitle: category.description } : null;
    }
    case 'area': {
      const area = (await fetchAreas()).find((entry) => entry.slug === key);
      return area ? { kicker: 'Local area · Adelaide', title: area.name, subtitle: area.editorialIntro } : null;
    }
    case 'blog-category': {
      const term = (await fetchBlogTerms('blog-categories')).find((entry) => entry.slug === key);
      return term ? { kicker: `${settings.name} blog`, title: term.name } : null;
    }
    case 'tag': {
      const term = (await fetchBlogTerms('tags')).find((entry) => entry.slug === key);
      return term ? { kicker: 'Articles tagged', title: term.name } : null;
    }
    case 'page': {
      const page = await fetchStaticPage(key);
      return page ? { kicker: settings.name, title: page.title, subtitle: page.seoDescription } : null;
    }
    default:
      return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await params;
  if (!SLUG.test(key)) return new Response('Not found', { status: 404 });

  const settings = await fetchSiteSettings();
  let card: Card | null;
  try {
    card = await resolve(kind, key, settings);
  } catch {
    // The API is unreachable: say so to the crawler rather than cache a card
    // that describes nothing.
    return new Response('Temporarily unavailable', { status: 503, headers: { 'Retry-After': '120' } });
  }
  if (!card) return new Response('Not found', { status: 404 });

  const title = summarise(card.title, 90);
  const subtitle = card.subtitle ? summarise(card.subtitle, 130) : null;
  const host = new URL(siteOrigin()).host;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          color: '#ffffff',
          backgroundColor: '#000f36',
          backgroundImage: 'radial-gradient(circle at 88% 12%, rgba(228,0,43,0.30), rgba(228,0,43,0) 42%), linear-gradient(135deg, #000f36 0%, #012169 58%, #0b3aa4 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', width: 52, height: 52, borderRadius: 26, border: '3px solid #ff5a72', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', width: 22, height: 22, borderRadius: 11, backgroundColor: '#ff5a72' }} />
          </div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>{settings.name}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1000 }}>
          <div style={{ display: 'flex', fontSize: 24, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: '#ff5a72' }}>{summarise(card.kicker, 60)}</div>
          <div style={{ display: 'flex', fontSize: title.length > 48 ? 58 : 72, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5 }}>{title}</div>
          {subtitle && <div style={{ display: 'flex', fontSize: 28, lineHeight: 1.4, color: '#c8d3ec' }}>{subtitle}</div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 22, color: '#c8d3ec' }}>
          <div style={{ display: 'flex' }}>Adelaide, South Australia</div>
          <div style={{ display: 'flex' }}>{host}</div>
        </div>
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        'X-Robots-Tag': 'noindex',
      },
    },
  );
}
